# =============================================================================
# SCC WebDev API — dynamic dispatcher
# =============================================================================
# Paste this into the doPost tab of a WebDev *Python* resource named "api" on the FRONT-END
# gateway (FE1/FE2), as a SIBLING of the mounted HTML folder (NOT inside it). On the resource's
# Security tab enable "Require Authentication" and restrict to roles Engineering / Supervisor /
# Scheduler, so only a logged-in, authorized Ignition user can reach it.
#
# Contract (matches app/station-control-hub/scc-api.jsx):
#   Request  (JSON body):  { "action": "<StationControl.SCC function>", "args": { ...kwargs... } }
#   Response (JSON):       reads   -> { "ok": true, "data": <any> }
#                          commits -> { "ok": true, "message": "...", ... }  (function's own dict)
#                          errors  -> HTTP 4xx/5xx + { "ok": false, "message": "..." }
#
# The dispatcher runs *whatever function the request names* — but ONLY on the StationControl.SCC
# module, and never a _private name. That module boundary + the resource's auth are the whole
# safety story; this is deliberately NOT eval / arbitrary gateway code.
# =============================================================================

SCC = StationControl.SCC   # the one SCC script (project library); referenced directly, no import needed

# Write actions funnel through runAction() so the required reason, the NWG abort/non-conformance
# block, and the SupervisorOverrideLog audit row are enforced in one place.
COMMIT_KEYS = set([
    'setStationComponentId', 'setAmrComponentId', 'scheduleForAssembly', 'verifySerials',
    'scheduleSerials', 'markScheduleComplete', 'markScheduleWip', 'scheduleNwgPrePaint',
    'scheduleNwgPreAssembly', 'pullNextWorkOrder', 'resendAmrPayload', 'refresh',
])

logger = system.util.getLogger('SCC WEBDEV API')


# ---- audit identity: resolve the authenticated user, then wrap it so the SCC ----
# ---- commit functions can read session.props.auth.user.userName unchanged.    ----
class _User(object):
    def __init__(self, name): self.userName = name
class _Auth(object):
    def __init__(self, name): self.user = _User(name)
class _Props(object):
    def __init__(self, name): self.auth = _Auth(name)
class _SessionShim(object):
    def __init__(self, name): self.props = _Props(name)


def _resolveAuditUser(request, session):
    # With "Require Authentication" on, the servlet exposes the logged-in user. Try the reliable
    # sources in order; never trust a username from the request body.
    try:
        servlet = request.get('servletRequest')
        if servlet is not None:
            u = servlet.getRemoteUser()
            if u:
                return str(u)
            principal = servlet.getUserPrincipal()
            if principal is not None and principal.getName():
                return str(principal.getName())
    except Exception:
        pass
    try:
        if session and session.get('user'):
            return str(session.get('user'))
    except Exception:
        pass
    return 'scc-web'   # fallback only; if you see this in the audit log, auth is not configured


def doPost(request, session):
    try:
        body = request.get('data') or {}
        action = body.get('action', '')
        args = body.get('args', {}) or {}

        auditSession = _SessionShim(_resolveAuditUser(request, session))

        # ---- commits: dynamic by key, through the single choke point ----
        if action in COMMIT_KEYS:
            result = SCC.runAction(action, args, auditSession)
            return {'json': result}

        # ---- reads: dynamically resolve the function by name on StationControl.SCC ----
        if not action or action.startswith('_') or not hasattr(SCC, action):
            return {'status': 400, 'json': {'ok': False, 'message': 'Unknown action: ' + str(action)}}
        fn = getattr(SCC, action)
        if not callable(fn):
            return {'status': 400, 'json': {'ok': False, 'message': 'Not callable: ' + str(action)}}

        data = fn(**args) if args else fn()
        return {'json': {'ok': True, 'data': data}}

    except Exception, e:   # Jython 2.x syntax; also catches nothing Java-side (see note)
        logger.error('doPost failed for action=%s: %s' % (str(locals().get('action', '?')), str(e)))
        return {'status': 500, 'json': {'ok': False, 'message': str(e)}}


# NOTE: a remote backend failure arrives as a java.lang.Exception, which the bare `except Exception`
# above will NOT catch. The SCC functions already catch (java.lang.Exception, Exception) internally
# and return a friendly {'ok': False, 'message': ...}, so it normally never propagates here. If you
# want belt-and-suspenders, wrap the dispatch in:
#     import java.lang.Exception as JavaError
#     try: ... except (JavaError, Exception), e: ...
