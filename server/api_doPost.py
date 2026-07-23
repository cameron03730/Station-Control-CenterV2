# =============================================================================
# SCC WebDev API — dynamic dispatcher (with CORS)
# =============================================================================
# Paste EACH function below into the matching tab of a WebDev *Python* resource named "api"
# on the FE gateway that hosts FactoryControl (e.g. james-jef-tst):
#     doPost tab     -> doPost()   + the helpers/classes above it
#     doOptions tab  -> doOptions()   (REQUIRED for cross-origin — answers the browser preflight)
#     doGet tab      -> doGet()       (optional; replaces the "hello world" placeholder)
# The `StationControl.SCC` script must also be in the gateway's script library, or the
# dispatcher will error (that's the module this file dispatches to).
#
# Contract (matches src/api.js):
#   Request  (JSON body):  { "action": "<StationControl.SCC function>", "args": { ...kwargs... } }
#   Response (JSON):       reads   -> { "ok": true, "data": <any> }
#                          commits -> { "ok": true, "message": "...", ... }  (function's own dict)
#                          errors  -> HTTP 4xx/5xx + { "ok": false, "message": "..." }
#
# WHY CORS: the UI is served from a different gateway/host than this API, so the browser sends a
# preflight OPTIONS before the POST. Without CORS headers + a doOptions handler the preflight fails
# and the app sees "Failed to fetch". _applyCors echoes the caller's Origin (so it works WITH
# credentials, auth on or off) and doOptions answers the preflight.
#
# NOTE ON AUTH: with "Require Authentication" ON, the browser's *preflight* OPTIONS (sent with no
# cookie) can be rejected by Ignition before it reaches doOptions. For this POC auth is OFF, so
# OPTIONS reaches doOptions and this works. When you re-enable auth, allow anonymous OPTIONS on
# this resource (or the preflight will 401 and the app will again "Failed to fetch").
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


# ---- CORS: echo the caller's Origin so a credentialed cross-origin fetch is allowed ----
def _applyCors(request):
    try:
        servletResp = request.get('servletResponse')
        if servletResp is None:
            return
        origin = None
        servletReq = request.get('servletRequest')
        if servletReq is not None:
            origin = servletReq.getHeader('Origin')
        servletResp.setHeader('Access-Control-Allow-Origin', origin if origin else '*')
        servletResp.setHeader('Access-Control-Allow-Credentials', 'true')
        servletResp.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        servletResp.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        servletResp.setHeader('Access-Control-Max-Age', '600')
        servletResp.setHeader('Vary', 'Origin')
    except Exception:
        pass


# Preflight: the browser sends OPTIONS before the JSON POST. Answer it with the CORS headers.
def doOptions(request, session):
    _applyCors(request)
    return {'json': {}}


# Optional: a GET returns a small status blob instead of a placeholder, and carries CORS headers.
def doGet(request, session):
    _applyCors(request)
    return {'json': {'ok': True, 'service': 'SCC api', 'hint': 'POST {\"action\": <fn>, \"args\": {...}}'}}


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


def _readBody(request):
    # WebDev puts the POSTed body in request['postData'] — a parsed dict when Content-Type is
    # application/json (per the WebDev docs). request['data'] is the RAW text/bytes, not parsed.
    # Read postData first; fall back to data and json-decode it so this works across Ignition versions.
    body = request.get('postData')
    if body is None:
        body = request.get('data')
    if isinstance(body, basestring):
        try:
            body = system.util.jsonDecode(body)
        except Exception:
            body = {}
    if not isinstance(body, dict):
        body = {}
    return body


def _resolveAuditUser(request, session):
    # With "Require Authentication" on, the servlet exposes the logged-in user. Try the reliable
    # sources in order; never trust a username from the request body. (Auth is OFF in POC -> 'scc-web'.)
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
    return 'scc-web'   # fallback only; expected while auth is off


def doPost(request, session):
    _applyCors(request)
    try:
        body = _readBody(request)
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

    except Exception, e:   # Jython 2.x syntax
        logger.error('doPost failed for action=%s: %s' % (str(locals().get('action', '?')), str(e)))
        return {'status': 500, 'json': {'ok': False, 'message': str(e)}}


# NOTE: a remote backend failure arrives as a java.lang.Exception, which the bare `except Exception`
# above will NOT catch. The SCC functions already catch (java.lang.Exception, Exception) internally
# and return a friendly {'ok': False, 'message': ...}, so it normally never propagates here.
