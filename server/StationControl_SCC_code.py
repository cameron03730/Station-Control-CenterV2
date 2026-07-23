'''
Station Control Center (SCC) orchestration script library.

Namespace: StationControl.SCC.<function>   (project: FactoryControl)
Scope:     Application + Gateway

This module backs the Station Control Center Perspective views. Every function is a THIN
wrapper over an EXISTING named query or backend script -- no business logic is reimplemented
and no bindings poll (data refreshes on demand: view mount, selection, or after a commit).

===============================================================================
TERMINOLOGY
===============================================================================
leaf -- the LAST segment of a tag path: which specific tag under a component's folder a
        function reads or writes. A station and an AMR each carry TWO component-id tags
        side by side (a primary and a secondary), so one function serves both instead of
        being duplicated -- `leaf` picks which one:

            .../TW0700/control/fromIGN/componentID      <- leaf = 'componentID'   (default)
            .../TW0700/control/fromIGN/componentID_2     <- leaf = 'componentID_2'
            .../AMR_002/machineInfo/componentID          <- leaf = 'componentID'   (default)
            .../AMR_002/machineInfo/componentID2         <- leaf = 'componentID2'  (AMR has no underscore)

        Analogy: a tag path is a folder tree; `leaf` is the file at the end of the branch.
        Used by: readStationComponentId, setStationComponentId, amrComponentIdTagPath,
        readAmrComponentId, setAmrComponentId.

idText -- a value that is EITHER a ComponentID (an NWG -- non-whole-good -- always starts
        with 'M', e.g. 'M12345') OR a WG (whole-good) Serial Number (e.g. '0160153042').
        Several functions (getScheduleEntries, lookupComponent, getMachineFlow,
        nwgManipulationBlocked) branch on the 'M' prefix to decide whether to treat the
        input as a Fabrication component or an Assembly serial.

BE1 / BE2 -- the two backend gateways. BE1 owns Frame Fab, Boom Fab, Paint (station prefixes
        TW/TT/PT); BE2 owns everything else (Main Line, Subs, Legacy, Navithor fleet). Which
        one a call routes to is decided by station prefix -- see backend().

===============================================================================
HOW THE VIEWS CALL THIS MODULE
===============================================================================
Two call patterns, depending on whether the view is reading data or committing a change:

1. READS -- called directly from a view binding, transform, or onStartup script, on demand
   only (view mount, selection change, manual refresh -- never a poll):
       getStationRows(), getAmrFleet(), readAmrComponentId(...), amrComponentIdTagPath(...),
       stationComponentMismatch(...), machineTypeByProductCode(), lookupComponent(...),
       getScheduleEntries(...), getMachineFlow(...)

2. COMMITS -- every write/action funnels through ONE choke point. A view opens the
   'scc-action-progress' popup with an actionKey + actionArgs dict, e.g.:

       system.perspective.openPopup('sccProgress', '.../scc-action-progress',
           {'actionKey': 'setStationComponentId',
            'actionArgs': {'station': 'TF0010', 'newId': '0160153042', 'reason': '...'}})

   The popup calls StationControl.SCC.runAction(actionKey, actionArgs, self.session), which
   dispatches to the matching commit function (setStationComponentId, setAmrComponentId,
   scheduleForAssembly, verifySerials, scheduleSerials, markScheduleComplete, markScheduleWip,
   scheduleNwgPrePaint, scheduleNwgPreAssembly, pullNextWorkOrder). Every commit function
   requires a `reason` and ends by writing one row to SupervisorOverrideLog via logOverride.

Do NOT rename any function in list 1, or any runAction dispatch-key string in list 2, without
updating the matching view JSON -- both are called by exact name/string from the views.

Backend calls (BE1/BE2) funnel through beExec / beQuery so every remote call is routed and
logged the same way; the audit trail always funnels through logOverride.
'''
import sys
import traceback
import java.lang.Exception as JavaError

logger = system.util.getLogger('STATION CONTROL CENTER')

# Schedule/WIP status codes shared by Fabrication_*WIP and WIPWorkOrders_Assembly.
STATUS_LABELS = {0: 'Scrapped', 1: 'Scheduled', 2: 'WIP', 3: 'Complete', 4: 'Abort', 5: 'Non-Conformance', 7: 'Associated'}
ACTIVE_SCHEDULE_STATUSES = (1, 2, 7)          # in the schedule and not finished/voided
STATION_OCCUPIED_STATUSES = (1, 2, 3, 7)      # live OR finished at a station -> scheduling it again is a duplicate

# Prepaint WIP stations and the pre-assembly inventory station (all live in Fabrication_Frame/BoomWIP).
PREPAINT_STATIONS = ('TW0700', 'TT170A', 'TT170B')
PREASSEMBLY_STATION = 'TF000X'

# SupervisorOverrideLog column widths. StationName is nvarchar(6), so it carries a SHORT station and the
# full context goes in overrideDetails; longer values truncate-crash the insert otherwise.
OVERRIDE_COLUMN_MAX = {'stationName': 6, 'overrideType': 50, 'overrideDetails': 250, 'reason': 250, 'overrideUser': 50}

# Machine Overview swimlane order.
FLOW_LANE_ORDER = ['Frame Fab', 'Boom Fab', 'Paint', 'Pre-Assembly', 'Main Line', 'Legacy', 'Boom Sub', 'Cab Sub', 'Engine Sub', 'Outrigger Sub', 'Other']


# ---------------------------------------------------------------------------
# SHARED HELPERS
# ---------------------------------------------------------------------------
def getOverrideUser(session):
	'''
	Returns the authenticated Perspective username for the audit trail.

	Called from:
		Every commit function in this module, passed into logOverride as the OverrideUser.

	Example:
		getOverrideUser(session)   # -> 'jsmith'

	Args:
		session: The Perspective session object (self.session in a view event).

	Returns:
		str: The logged-in user's userName (session.props.auth.user.userName).
	'''
	return session.props.auth.user.userName


def logOverride(stationName, overrideType, overrideDetails, reason, overrideUser):
	'''
	Writes one audit row to SupervisorOverrideLog for a committed action. Never raises.

	Called from:
		Every commit function in this module (setStationComponentId, setAmrComponentId,
		scheduleForAssembly, markNwgComplete, markSerialComplete, ...) after the action succeeds.

	Example:
		logOverride('TF0010', 'Station ComponentID Set',
		            'ComponentID: (blank) -> 0160153042', 'Wrong ID from AMR', 'jsmith')

	What it does:
		Caps each value to its SupervisorOverrideLog column width (OVERRIDE_COLUMN_MAX) so an
		over-length value can't truncate-crash the insert, then runs the existing audit insert
		query. Logging is secondary to the action that already committed, so any failure is
		logged and swallowed rather than raised.

	Args:
		stationName (str): Short station/id the action applied to (nvarchar(6) column).
		overrideType (str): Category label, e.g. 'Station ComponentID Set'.
		overrideDetails (str): Human 'before -> after' description.
		reason (str): User-entered reason for the override.
		overrideUser (str): Authenticated username (from getOverrideUser(session)).

	Returns:
		bool: True if the audit row was written, False if the insert failed (already logged).
	'''
	def cap(value, width):
		return ('' if value is None else str(value))[:width]
	rawFields = {'stationName': stationName, 'overrideType': overrideType, 'overrideDetails': overrideDetails, 'reason': reason, 'overrideUser': overrideUser}
	params = {field: cap(value, OVERRIDE_COLUMN_MAX[field]) for field, value in rawFields.items()}
	try:
		system.db.runNamedQuery(project = 'FactoryControl', path = 'station-control/Supervisor Overrides/insert/insertEntrySupervisorOverrideLog', parameters = params)
		return True
	except (JavaError, Exception):
		logger.error('logOverride FAILED (audit row NOT written) params={}\n{}'.format(params, traceback.format_exc()))
		return False


def backend(stationName = None):
	'''
	Returns the owning backend gateway address for a station.

	Called from:
		beExec (to pick the remote server for every backend call).

	Example:
		backend('TW0700')   # -> BE1 address   (Frame/Boom/Paint)
		backend('TF0010')   # -> BE2 address   (everything else)
		backend()           # -> BE2 address   (no station)

	What it does:
		Frame/Boom/Paint stations (prefix TW/TT/PT) are owned by BE1; every other station, and
		the no-station case, routes to BE2.

	Args:
		stationName (str, optional): Full station name; only the 2-char prefix is used.

	Returns:
		The BE1 or BE2 gateway address from GatewayConfig.getBackEnd_1/2().
	'''
	prefix = (stationName or '')[:2].upper()
	if prefix in ('TW', 'TT', 'PT'):
		return GatewayConfig.getBackEnd_1()
	return GatewayConfig.getBackEnd_2()


def beExec(functionPath, params, stationName = None):
	'''
	Runs a FactoryGatewayEvents script function on the owning backend. All backend calls funnel here.

	Called from:
		beQuery and every function that fires a backend script (setAmrComponentId, pullNextWorkOrder,
		lookupComponent, markNwgComplete, markScheduleWip, nwgManipulationBlocked, ...).

	Example:
		beExec('AMR.Commands.updateAMRPayload', {'AMRID': 2})
		beExec('RunSchedule.getNextWorkOrder.getOrder', {'stationName': 'TT2000'}, stationName='TT2000')

	What it does:
		Resolves the target backend from stationName (see backend), logs the call, then invokes the
		'executeFunction' message handler on that gateway via system.util.sendRequest.

	Args:
		functionPath (str): Dotted script path resolved on the backend, e.g. 'AMR.Commands.updateAMRPayload'.
		params (dict): Keyword payload forwarded to the backend function.
		stationName (str, optional): Station used to pick BE1 vs BE2 (None -> BE2).

	Returns:
		Whatever the backend function returns (varies per function).

	Raises:
		Re-raises any remote failure after logging the full traceback (a remote error arrives as a
		java.lang.Exception, which a bare 'except Exception' would miss).
	'''
	targetBackend = str(backend(stationName))
	logger.info('beExec {} | station={!r} | backend={} | params={}'.format(functionPath, stationName, targetBackend, params))
	try:
		return system.util.sendRequest('FactoryGatewayEvents', 'executeFunction', payload = {'function': functionPath, 'params': params}, remoteServer = targetBackend)
	except (JavaError, Exception):
		# A remote failure returns as a java.lang.Exception, which a plain except won't catch. Log the full trace here (the toast is truncated).
		logger.error('beExec FAILED {} | station={!r} | params={}\n{}'.format(functionPath, stationName, params, traceback.format_exc()))
		raise


def beQuery(queryPath, queryParams, stationName = None):
	'''
	Runs a FactoryGatewayEvents named query on a backend (the FE does not host that project locally).

	Called from:
		Functions that read/write FactoryGatewayEvents tables (checkSerialForAssembly, fabStatusAtStation,
		scheduleNwgPrePaint, scheduleNwgPreAssembly, markSerialComplete, markScheduleWip).

	Example:
		beQuery('RunSchedule/Assembly/Select/CheckScheduledStatusBySerial', {'serialNumber': '0160153042'})

	What it does:
		Delegates to the backend 'JcCommonOperations.dynamicQuery' function (via beExec), which runs the
		named query on that gateway and returns the result.

	Args:
		queryPath (str): FactoryGatewayEvents named-query path.
		queryParams (dict): Query parameters.
		stationName (str, optional): Station used to pick BE1 vs BE2 (None -> BE2).

	Returns:
		The query result as returned by the backend dynamicQuery function (scalar or dataset).
	'''
	return beExec('JcCommonOperations.dynamicQuery', {'queryPath': queryPath, 'queryParams': queryParams}, stationName = stationName)


def readTagValue(path):
	'''
	One-shot tag read (no polling), returned as a string.

	Called from:
		readStationComponentId, readAmrComponentId.

	Example:
		readTagValue('[TAGIO2].../AMR_002/machineInfo/componentID')   # -> '0160153042' | ''

	What it does:
		A plain readBlocking(path)[0].value read -- matches the plant's standard tag-read idiom
		(no quality gating). Returns '' when the tag value is null; otherwise returns str(value).

	Args:
		path (str): Fully-qualified tag path.

	Returns:
		str: The value as a string ('' when the tag holds null).
		None: When path is empty.
	'''
	if not path:
		return None
	value = system.tag.readBlocking([path])[0].value
	return '' if value is None else str(value)


def statusLabel(status):
	'''
	Returns the human label for a raw schedule/WIP status code.

	Called from:
		User-facing messages in scheduleForAssembly, scheduleNwgPrePaint, scheduleNwgPreAssembly.

	Example:
		statusLabel(2)    # -> 'WIP'
		statusLabel(9)    # -> 'Status 9'   (unmapped)
		statusLabel('')   # -> 'unknown'

	Args:
		status (int|str): Raw status value (see STATUS_LABELS).

	Returns:
		str: Mapped label; 'Status N' for an unmapped int; 'unknown' if blank/None/unparseable.
	'''
	if status is None or status == '':
		return 'unknown'
	try:
		return STATUS_LABELS.get(int(status), 'Status {}'.format(int(status)))
	except:
		return 'unknown'


def scheduleEntriesSafe(idText):
	'''
	Calls getScheduleEntries but never raises -- returns [] and logs on failure.

	Called from:
		Anywhere the schedule rows are advisory rather than critical (nwgManipulationBlocked,
		scheduleEntryAtStations, scheduleNwgPreAssembly, markNwgComplete, markSerialComplete, getMachineFlow).

	Example:
		scheduleEntriesSafe('M12345')   # -> [ {schedule row}, ... ]  or  []

	Args:
		idText (str): ComponentID (M-prefix) or WG serial.

	Returns:
		list[dict]: Schedule rows (see getScheduleEntries), or [] if the lookup failed.
	'''
	try:
		return getScheduleEntries(idText)
	except:
		logger.warn('scheduleEntriesSafe: getScheduleEntries failed for {}'.format(idText))
		return []


def scheduleEntryAtStations(idText, stations = None, rows = None, statuses = STATION_OCCUPIED_STATUSES):
	'''
	Returns the first schedule row whose Status is in `statuses`, optionally limited to `stations`.

	Called from:
		Duplicate-guard checks in scheduleForAssembly, scheduleNwgPrePaint, scheduleNwgPreAssembly.

	Example:
		scheduleEntryAtStations('0160153042', statuses=ACTIVE_SCHEDULE_STATUSES)   # any active entry
		scheduleEntryAtStations('M12345', ('TW0700',))                              # entry at TW0700 only

	What it does:
		Scans the schedule rows (fetched via scheduleEntriesSafe unless `rows` is supplied) and returns
		the first one matching the station filter and status filter.

	Args:
		idText (str): ComponentID or serial to look up.
		stations (tuple|list, optional): Station names to restrict to (case-insensitive). None = any station.
		rows (list[dict], optional): Pre-fetched schedule rows to reuse instead of querying again.
		statuses (tuple): Statuses that count as "occupied" (default STATION_OCCUPIED_STATUSES).

	Returns:
		dict: {'station': str, 'status': int} for the first match.
		None: If no row matches.
	'''
	rows = rows if rows is not None else scheduleEntriesSafe(idText)
	targetStations = set(str(s).upper() for s in stations) if stations else None
	for row in rows:
		station = str(row.get('Station') or '')
		if targetStations is not None and station.upper() not in targetStations:
			continue
		try:
			status = int(row.get('Status'))
		except:
			continue
		if status in statuses:
			return {'station': station, 'status': status}
	return None


# ---------------------------------------------------------------------------
# STATION COMPONENTID RECTIFICATION
# ---------------------------------------------------------------------------
def readStationComponentId(stationName, leaf = 'componentID'):
	'''
	One-shot read of a station's fromIGN componentID / componentID_2.

	Called from:
		checkStationGuards, setStationComponentId, stationComponentMismatch.

	Example:
		readStationComponentId('TF0010')                    # -> '0160153042' | '' | None
		readStationComponentId('TF0010', 'componentID_2')

	Args:
		stationName (str): Full station name.
		leaf (str): 'componentID' (default) or 'componentID_2'.

	Returns:
		str: Current value ('' when the tag is null).
		None: If the station's tag folder can't be resolved.
	'''
	folder = StationControl.DynamicView.getTagFolder(stationName)
	if not folder:
		logger.warn('readStationComponentId: no tag folder for {}'.format(stationName))
		return None
	return readTagValue('{}/{}/control/fromIGN/{}'.format(folder, stationName, leaf))


def activeWipCount(stationName):
	'''
	Returns the active assembly WIP row count for a station (the boundary-check guard).

	Called from:
		checkStationGuards, setStationComponentId.

	Example:
		activeWipCount('TF0010')   # -> 0 (safe to edit) | 1+ (station actively building)

	What it does:
		Runs the getActiveStations scalar query (COUNT of WIPWorkOrders_Assembly rows at Status 2 with
		no CompletedTimestamp). Fail-safe: if that query isn't installed, returns 0 so the edit is not
		blocked purely by a missing query (the AMR-bound path still guards the high-risk case elsewhere).

	Args:
		stationName (str): Full station name.

	Returns:
		int: Count of active WIP rows (0 on query failure).
	'''
	try:
		return int(system.db.runNamedQuery(project = 'FactoryControl', path = 'station-control-center/getActiveStations', parameters = {'StationName': stationName}))
	except:
		logger.warn('activeWipCount: getActiveStations failed; returning 0 (fail-safe).')
		return 0


def checkStationGuards(stationName, newComponentID):
	'''
	Read-only boundary checks for the Station Rectification tab; mirrors the hard guards in setStationComponentId.

	Called from:
		Available to the station-componentid-rectify tab as a pre-commit checklist preview
		(setStationComponentId re-enforces every one of these before writing).

	Example:
		checkStationGuards('TF0010', '0160153042')
		# -> {'checks': [{'label': ..., 'passed': True, 'detail': 'OK'}, ...], 'allPassed': True}

	What it does:
		Builds three advisory checks: (1) station is not actively building (no Status-2 WIP row),
		(2) the new ComponentID exists in MachineConfig (skipped when clearing), and (3) the value
		actually changes. None of these write anything.

	Args:
		stationName (str): Full station name.
		newComponentID (str): Proposed new component id ('' means clear).

	Returns:
		dict: {'checks': list[{'label','passed','detail'}], 'allPassed': bool}.
	'''
	newValue = (newComponentID or '').strip()
	isClear = (newValue == '')
	checks = []

	activeCount = activeWipCount(stationName)
	checks.append({'label': 'Not actively building (no WIP row, status 2)', 'passed': activeCount == 0, 'detail': 'OK' if activeCount == 0 else '{} active WIP row(s)'.format(activeCount)})

	if isClear:
		checks.append({'label': 'New ComponentID exists in MachineConfig', 'passed': True, 'detail': 'N/A - clearing'})
	else:
		machineConfig = JcCommonOperations.getMachineConfigInfo(newValue, ['Product Code', 'ItemName'])
		exists = (machineConfig is not None and len(machineConfig) > 0)
		checks.append({'label': 'New ComponentID exists in MachineConfig', 'passed': exists, 'detail': 'OK' if exists else 'not found'})

	current = readStationComponentId(stationName)
	changed = (current is not None) and (str(current).strip() != newValue)
	checks.append({'label': 'Value actually changes', 'passed': changed, 'detail': 'OK' if changed else 'no change'})

	return {'checks': checks, 'allPassed': all(check['passed'] for check in checks)}


def getStationRows():
	'''
	Returns the station roster plus each station's live componentID / componentID_2, in one batched read.

	Called from:
		station-componentid-rectify view onStartup -> self.custom.stationRows = StationControl.SCC.getStationRows()

	Example:
		getStationRows()
		# -> [{'StationName': 'TF0010', 'Area': 'Main Line', 'ComponentID': '0160153042',
		#      'ComponentID_2': '', '__card': '', ...}, ...]

	What it does:
		1. Runs the existing Work Station Assignment roster query.
		2. Drops any station with a blank batchRecipeClass (nothing to component-ID rectify against).
		3. Resolves each station's fromIGN tag folder and does ONE batched readBlocking of both
		   component leaves, writing the values back onto the matching rows (no polling).

	Returns:
		list[dict]: One dict per station (roster columns + 'ComponentID', 'ComponentID_2', '__card').
	'''
	stationDataSet = system.dataset.toPyDataSet(system.db.runNamedQuery(project = 'FactoryControl', path = 'station-control/Work Station Assignment/getWorkStationAssignmentTable', parameters = {}))
	columns = list(stationDataSet.getColumnNames())
	rows = []
	for sourceRow in stationDataSet:
		row = {column: sourceRow[column] for column in columns}
		recipeClass = row.get('batchRecipeClass')
		if recipeClass is None or str(recipeClass).strip() == '':          # no recipe -> not rectifiable, skip
			continue
		row['ComponentID'] = ''
		row['ComponentID_2'] = ''
		row['__card'] = ''
		rows.append(row)

	# Build one flat list of tag paths + where each value lands, then read them all in a single call.
	tagPaths = []
	readTargets = []                                                       # (rowIndex, columnKey) parallel to tagPaths
	for rowIndex, row in enumerate(rows):
		stationName = row.get('StationName')
		if not stationName:
			continue
		try:
			tagFolder = StationControl.DynamicView.getTagFolder(stationName)
		except:
			tagFolder = None
		if not tagFolder:
			continue
		fromIgnPrefix = '{}/{}/control/fromIGN/'.format(tagFolder, stationName)
		tagPaths.append(fromIgnPrefix + 'componentID');   readTargets.append((rowIndex, 'ComponentID'))
		tagPaths.append(fromIgnPrefix + 'componentID_2'); readTargets.append((rowIndex, 'ComponentID_2'))
	if tagPaths:
		readValues = system.tag.readBlocking(tagPaths)
		for (rowIndex, columnKey), qualifiedValue in zip(readTargets, readValues):
			if qualifiedValue is not None and qualifiedValue.value is not None:
				rows[rowIndex][columnKey] = str(qualifiedValue.value)
	return rows


def setStationComponentId(stationName, newComponentID, reason, session, leaf = 'componentID'):
	'''
	Sets or clears a station's fromIGN componentID (blank clears), gated by boundary checks + audit.

	Called from:
		scc-action-progress popup via runAction('setStationComponentId', ...), fired by the Commit
		buttons on the station-componentid-rectify tab.

	Example:
		setStationComponentId('TF0010', '0160153042', 'Wrong ID from AMR', session)
		setStationComponentId('TW0700', '', 'Clearing stuck ID', session, leaf='componentID_2')

	What it does:
		1. Requires a reason; resolves the tag path (aborts if the station folder won't resolve).
		2. Reads the current value (aborts if unreadable).
		3. Boundary check: refuses if the station has an active WIP order (Status 2). No PLC / AMR gate.
		4. When setting (not clearing), requires the new id to exist in MachineConfig.
		5. Refuses a no-op (new value already matches).
		6. Writes the tag (None clears it), then records a SupervisorOverrideLog row.

	Args:
		stationName (str): Full station name.
		newComponentID (str): New component id; '' clears the tag.
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).
		leaf (str): 'componentID' (default) or 'componentID_2'.

	Returns:
		dict: {'ok': bool, 'message': str} -- message is surfaced in the toast.
	'''
	slot = 'ComponentID_2' if leaf == 'componentID_2' else 'ComponentID'
	newValue = (newComponentID or '').strip()
	reason = (reason or '').strip()
	if not reason:
		return {'ok': False, 'message': 'A reason is required.'}

	tagFolder = StationControl.DynamicView.getTagFolder(stationName)
	if not tagFolder:
		return {'ok': False, 'message': 'Could not resolve a tag path for {}.'.format(stationName)}
	tagPath = '{}/{}/control/fromIGN/{}'.format(tagFolder, stationName, leaf)
	before = readStationComponentId(stationName, leaf)
	if before is None:
		return {'ok': False, 'message': 'Could not read current {} value; aborting.'.format(slot)}

	# Boundary check: active assembly WIP status only (no PLC, no AMR-bound gate).
	if activeWipCount(stationName) > 0:
		return {'ok': False, 'message': 'Station has an active WIP order (status 2); edit blocked.'}
	if newValue != '':
		machineConfig = JcCommonOperations.getMachineConfigInfo(newValue, ['Product Code', 'ItemName'])
		if machineConfig is None or len(machineConfig) == 0:
			return {'ok': False, 'message': "'{}' not found in MachineConfig.".format(newValue)}
	if str(before).strip() == newValue:
		return {'ok': False, 'message': '{} already matches; no change.'.format(slot)}

	writeResult = system.tag.writeBlocking([tagPath], [None if newValue == '' else newValue])[0]
	if not writeResult.isGood():
		return {'ok': False, 'message': 'Tag write returned bad quality.'}

	isClear = (newValue == '')
	details = '{}: {} -> {}'.format(slot, '(blank)' if before == '' else before, '(blank)' if isClear else newValue)
	logOverride(stationName, 'Station {} Clear'.format(slot) if isClear else 'Station {} Set'.format(slot), details, reason, getOverrideUser(session))
	return {'ok': True, 'message': 'Committed: {} {}'.format(stationName, details)}


def stationComponentMismatch(stationName):
	'''
	Advisory (non-blocking) check: does the station's manual componentID differ from the run schedule's next one?

	Called from:
		station-componentid-rectify view, as a binding transform on the selected station
		-> StationControl.SCC.stationComponentMismatch(value).

	Example:
		stationComponentMismatch('TF0010')
		# -> {'current': '0160153042', 'expected': '0160153099', 'mismatched': True}

	What it does:
		Compares the station's current fromIGN componentID against the runSchedule/nextComponentID tag.
		nextComponentID may be a single id OR a list of acceptable ids; General.autoCast turns the tag
		value into a real list/scalar, then membership is tested (a component that IS in the list is NOT
		a mismatch). Returns blanks (mismatched False) if the folder or next-id can't be read.

	Args:
		stationName (str): Full station name.

	Returns:
		dict: {'current': str, 'expected': str, 'mismatched': bool}. `expected` is comma-joined when
		      several ids are accepted.
	'''
	current = (readStationComponentId(stationName) or '').strip()
	folder = StationControl.DynamicView.getTagFolder(stationName)
	expected = ''
	mismatched = False
	if folder:
		# nextComponentID lives in the 'Station Control/runSchedule' UDT (used by workOrderClaim/workComplete).
		nextTagValue = system.tag.readBlocking(['{}/{}/runSchedule/nextComponentID'.format(folder, stationName)])[0].value
		if nextTagValue is not None:
			nextValue = General.autoCast(nextTagValue)          # list when the schedule holds several accepted ids, else a scalar
			if isinstance(nextValue, (list, tuple)):
				acceptedIds = [str(candidate).strip() for candidate in nextValue if str(candidate).strip()]
				expected = ', '.join(acceptedIds)
				mismatched = bool(current) and len(acceptedIds) > 0 and current not in acceptedIds
			else:
				expected = str(nextValue).strip()
				mismatched = bool(current) and bool(expected) and current != expected
	return {'current': current, 'expected': expected, 'mismatched': mismatched}


# ---------------------------------------------------------------------------
# AMR COMPONENTID RECTIFICATION
# ---------------------------------------------------------------------------
def getAmrFleet():
	'''
	Returns the AMR fleet with both component ids, via one folder browse + one batched read (no polling).

	Called from:
		amr-componentid-rectify view mount and its refresh handler (sccAmrDone)
		-> self.view.custom.amrRows = StationControl.SCC.getAmrFleet().

	Example:
		getAmrFleet()
		# -> [{'AMR': '002', 'ComponentID': '0160153042', 'ComponentID2': ''}, ...]

	What it does:
		Browses the Fleet/AMR Data folder for AMR_xxx instances, then batches one readBlocking of both
		componentID leaves for every AMR and maps the values onto rows.

	Returns:
		list[dict]: One dict per AMR: {'AMR': str (3-digit, no prefix), 'ComponentID': str, 'ComponentID2': str}.
	'''
	fleetFolder = '[TAGIO2]JLG/Jefferson City/Fleet/AMR Data'
	# AMR_xxx are UdtInstances, so do NOT filter the browse by tagType='Folder' (that returns nothing).
	amrNames = sorted(str(browseResult['name']) for browseResult in system.tag.browse(fleetFolder).getResults() if str(browseResult['name']).startswith('AMR_'))
	if not amrNames:
		return []
	componentLeaves = [('ComponentID', 'machineInfo/componentID'), ('ComponentID2', 'machineInfo/componentID2')]
	tagPaths = ['{}/{}/{}'.format(fleetFolder, amrName, leaf) for amrName in amrNames for columnKey, leaf in componentLeaves]
	readValues = system.tag.readBlocking(tagPaths)
	rows = []
	valueIndex = 0
	for amrName in amrNames:
		row = {'AMR': amrName.replace('AMR_', '')}
		for columnKey, leaf in componentLeaves:
			value = readValues[valueIndex].value
			valueIndex += 1
			row[columnKey] = str(value) if value is not None else ''
		rows.append(row)
	return rows


def amrComponentIdTagPath(amrId, leaf = 'componentID'):
	'''
	Builds an AMR's machineInfo component-id tag path.

	Called from:
		amr-componentid-rectify view (tag-path display binding) and readAmrComponentId / setAmrComponentId.

	Example:
		amrComponentIdTagPath(2)                  # -> '.../AMR_002/machineInfo/componentID'
		amrComponentIdTagPath(2, 'componentID2')  # -> '.../AMR_002/machineInfo/componentID2'

	Args:
		amrId (int|str): AMR number; zero-padded to 3 digits (AMR_002).
		leaf (str): 'componentID' (default) or 'componentID2'.

	Returns:
		str: The tag path.
	'''
	leaf = 'componentID2' if leaf == 'componentID2' else 'componentID'
	return '[TAGIO2]JLG/Jefferson City/Fleet/AMR Data/AMR_{}/machineInfo/{}'.format(str(amrId).zfill(3), leaf)


def readAmrComponentId(amrId, leaf = 'componentID'):
	'''
	One-shot read of an AMR's machineInfo componentID / componentID2.

	Called from:
		amr-componentid-rectify view (display bindings) -> StationControl.SCC.readAmrComponentId(value[, 'componentID2']).

	Example:
		readAmrComponentId(2)                  # -> '0160153042' | '' | None
		readAmrComponentId(2, 'componentID2')

	Args:
		amrId (int|str): AMR number.
		leaf (str): 'componentID' (default) or 'componentID2'.

	Returns:
		str: Current value ('' when null); None on bad quality.
	'''
	return readTagValue(amrComponentIdTagPath(amrId, leaf))


def setAmrComponentId(amrId, newComponentID, reason, session, leaf = 'componentID'):
	'''
	Sets or clears an AMR's machineInfo componentID (blank clears), with audit + payload refresh.

	Called from:
		scc-action-progress popup via runAction('setAmrComponentId', ...), fired by the Set/Unassign
		buttons on the amr-componentid-rectify tab.

	Example:
		setAmrComponentId(2, '0160153042', 'Reassigning AMR', session)
		setAmrComponentId(2, '', 'Unassigning AMR', session, leaf='componentID2')

	What it does:
		1. Requires a reason; reads the current value (aborts if the AMR can't be read).
		2. Refuses a no-op (new value already matches).
		3. Writes the tag (None clears it), then records a SupervisorOverrideLog row.
		4. Fires AMR.Commands.updateAMRPayload on EVERY change (set or clear) so Navithor/ACU get the
		   current profile -- the same refresh the machineInfo valueChanged script and AMRPowerCycle use.
		   This is best-effort: the tag write already committed, so a payload failure only adds a warning.

	Args:
		amrId (int|str): AMR number.
		newComponentID (str): New component id; '' clears the tag.
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).
		leaf (str): 'componentID' (default) or 'componentID2'.

	Returns:
		dict: {'ok': bool, 'message': str}. On success the message notes whether the payload refresh ran.
	'''
	newValue = (newComponentID or '').strip()
	reason = (reason or '').strip()
	if not reason:
		return {'ok': False, 'message': 'A reason is required.'}
	slot = 'ComponentID 2' if leaf == 'componentID2' else 'ComponentID'
	before = readAmrComponentId(amrId, leaf)
	if before is None:
		return {'ok': False, 'message': 'Could not read AMR_{}; aborting.'.format(str(amrId).zfill(3))}
	if str(before).strip() == newValue:
		return {'ok': False, 'message': 'New value matches current {}.'.format(slot)}

	writeResult = system.tag.writeBlocking([amrComponentIdTagPath(amrId, leaf)], [None if newValue == '' else newValue])[0]
	if not writeResult.isGood():
		return {'ok': False, 'message': 'Tag write returned bad quality.'}

	isClear = (newValue == '')
	details = 'AMR_{} {}: {} -> {}'.format(str(amrId).zfill(3), slot, '(blank)' if before == '' else before, '(blank)' if isClear else newValue)
	# StationName is nvarchar(6): 'AMR002' fits, 'AMR_002' (7) would truncate-crash; full identity is in details.
	logOverride('AMR{}'.format(str(amrId).zfill(3)), ('AMR {} Unassign' if isClear else 'AMR {} Set').format(slot), details, reason, getOverrideUser(session))

	# Run updateAMRPayload on EVERY componentID change (set or clear) so Navithor/ACU get the current profile
	# -- the same function the machineInfo valueChanged script and AMRPowerCycle fire. Best-effort: the tag write already committed.
	payloadNote = ''
	try:
		beExec('AMR.Commands.updateAMRPayload', {'AMRID': amrId})
		payloadNote = ' New payload sent to AMR.'
	except:
		payloadNote = ' (WARNING: payload refresh failed - verify the AMR payload manually.)'
	return {'ok': True, 'message': 'Committed: {}{}'.format(details, payloadNote)}


# ---------------------------------------------------------------------------
# RUN SCHEDULE REFRESH
# ---------------------------------------------------------------------------
def pullNextWorkOrder(stationName, reason, session):
	'''
	Re-fires getNextWorkOrder on a station's owning backend to pull its next work order.

	Called from:
		scc-action-progress popup via runAction('pullNextWorkOrder', ...) from the station-componentid-rectify
		tab, and internally by refireNextWorkOrder after a manual mark.

	Example:
		pullNextWorkOrder('TT2000', 'Station stuck with no order', session)

	What it does:
		Requires a station and a reason, then calls RunSchedule.getNextWorkOrder.getOrder on the owning
		backend. getOrder calls updateRunSchedules() first, so one fire is enough. The FULL station name is
		passed through because getOrder's prefix checks rely on it (e.g. TT2000 vs TT1900). Logs an audit row.

	Args:
		stationName (str): Full station name.
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).

	Returns:
		dict: {'ok': bool, 'message': str}. On backend failure, ok is False with a message noting it is a
		      back-end issue (not the station change) plus a short detail.
	'''
	stationName = (stationName or '').strip()
	if not stationName:
		return {'ok': False, 'message': 'No station provided; select a station first.'}
	reason = (reason or '').strip()
	if not reason:
		return {'ok': False, 'message': 'A reason is required.'}

	# Pass the FULL station name through (getOrder's prefix checks rely on it, e.g. TT2000/TT1900).
	try:
		beExec('RunSchedule.getNextWorkOrder.getOrder', {'stationName': stationName}, stationName = stationName)
	except (JavaError, Exception):
		logger.error('pullNextWorkOrder: backend getNextWorkOrder failed for {}\n{}'.format(stationName, traceback.format_exc()))
		return {'ok': False, 'message': "Could not refresh the next work order for {} - the backend getNextWorkOrder routine errored (this is a back-end issue, not the station change). Detail: {}".format(stationName, str(sys.exc_info()[1])[:300])}

	logOverride(stationName, 'Run Schedule Refresh', 'Refired getNextWorkOrder', reason, getOverrideUser(session))
	return {'ok': True, 'message': 'Refresh fired for {}.'.format(stationName)}


def refireNextWorkOrder(station, session, why):
	'''
	Best-effort getNextWorkOrder re-fire after a manual mark. Never raises.

	Called from:
		markScheduleWip and markScheduleComplete, to nudge the station's schedule after a manual change.

	Example:
		refireNextWorkOrder('TF0010', session, 'Auto-refire after manual Mark WIP')   # -> '' or a warning note

	What it does:
		Calls pullNextWorkOrder for the station. The preceding mark already committed, so any problem here
		is downgraded to a message suffix telling the user to use "Refresh Next Work Order" manually --
		it never raises and never blocks the caller's success.

	Args:
		station (str): Full station name ('' short-circuits to no-op).
		session: Perspective session.
		why (str): Reason passed through to pullNextWorkOrder's audit row.

	Returns:
		str: '' on success (or empty station); otherwise a human-readable note to append to the caller's message.
	'''
	station = (station or '').strip()
	if not station:
		return ''
	fallbackNote = ' (Auto next-work-order refresh did not run - use "Refresh Next Work Order" on the Station Rectification tab if {} did not update.)'.format(station)
	try:
		result = pullNextWorkOrder(station, why, session)
		if result.get('ok'):
			return ''
		logger.warn('refireNextWorkOrder: did not refire for {}: {}'.format(station, result.get('message', '')))
		return fallbackNote
	except (JavaError, Exception):
		logger.warn('refireNextWorkOrder: errored for {}\n{}'.format(station, traceback.format_exc()))
		return fallbackNote


def nwgManipulationBlocked(componentID):
	'''
	Returns a reason string when an NWG componentID must NOT be manually manipulated, else None.

	Called from:
		runAction, as a gate before the NWG actions (markScheduleComplete, markScheduleWip,
		scheduleNwgPrePaint, scheduleNwgPreAssembly).

	Example:
		nwgManipulationBlocked('M12345')   # -> 'M12345 is non-conformanced at TW0300 - ...'  or  None
		nwgManipulationBlocked('0160153042')  # -> None   (non-NWG ids are never blocked here)

	What it does:
		For M-prefixed ids only, blocks manual changes when the component is Abort(4)/Non-Conformance(5)
		in Frame/Boom WIP, OR still active (status 0-2) in the NonConformance table (the plant's
		getAllNwgNonConformance returns {componentID: status}). Non-NWG ids return None immediately.

	Args:
		componentID (str): ComponentID or serial.

	Returns:
		str: A blocking reason to surface to the user.
		None: If manipulation is allowed (or the id is not an NWG).
	'''
	componentID = (componentID or '').strip()
	if not componentID.upper().startswith('M'):
		return None
	# Abort(4) / Non-Conformance(5) in Frame or Boom WIP.
	for fabRow in scheduleEntriesSafe(componentID):
		try:
			status = int(fabRow.get('Status'))
		except:
			continue
		if status in (4, 5):
			return '{} is non-conformanced at {} - manual changes are blocked until it is resolved.'.format(componentID, fabRow.get('Station') or 'a fab station')
	# Still active in the NonConformance table (plant's getAllNwgNonConformance returns {componentID: status 0-2}).
	try:
		activeNonConformances = beExec('JcCommonOperations.getAllNwgNonConformance', {})
		if activeNonConformances and componentID in activeNonConformances:
			return '{} has an active non-conformance - manual changes are blocked until it is resolved.'.format(componentID)
	except (JavaError, Exception):
		logger.warn('nwgManipulationBlocked: getAllNwgNonConformance failed for {}'.format(componentID))
	return None


def runAction(key, args, session):
	'''
	Single dispatch entry point for every committed SCC action, fired from the scc-action-progress popup.

	Called from:
		scc-action-progress view -> StationControl.SCC.runAction(actionKey, actionArgs, self.session).
		The popup is opened with an actionKey + actionArgs by the Commit buttons across every SCC tab.

	Example:
		runAction('setStationComponentId', {'station': 'TF0010', 'newId': '0160153042', 'reason': 'fix'}, session)
		runAction('refresh', {}, session)   # deliberate no-op that just re-mounts the table

	What it does:
		Routes `key` to the matching action function, passing the values out of `args`. 'refresh' is a
		deliberate no-op used to drive a table re-mount. Before any NWG action it runs nwgManipulationBlocked
		and refuses if the component is aborted/non-conforming. Unknown keys return an error dict.

	Args:
		key (str): Action key (see the dispatch below; matches the view's actionKey).
		args (dict): Action arguments (view's actionArgs). Keys vary per action.
		session: Perspective session (forwarded to the action for the audit username).

	Returns:
		dict: The chosen action's result ({'ok': bool, 'message': str, ...}), or an error dict for an unknown key.
	'''
	args = dict(args) if args else {}
	logger.info('runAction {} | args={}'.format(key, args))
	if key == 'refresh':
		return {'ok': True, 'message': ''}
	# Block manual NWG manipulations on an aborted/non-conforming component (fab Abort/Non-Conf, or active non-conformance).
	if key in ('markScheduleComplete', 'markScheduleWip', 'scheduleNwgPrePaint', 'scheduleNwgPreAssembly'):
		nwgBlock = nwgManipulationBlocked(args.get('componentID') or args.get('idText') or '')
		if nwgBlock:
			return {'ok': False, 'message': nwgBlock}
	if key == 'setStationComponentId':
		return setStationComponentId(args.get('station'), args.get('newId', ''), args.get('reason', ''), session, args.get('leaf', 'componentID'))
	if key == 'setAmrComponentId':
		return setAmrComponentId(args.get('amrId'), args.get('newId', ''), args.get('reason', ''), session, args.get('leaf', 'componentID'))
	if key == 'scheduleForAssembly':
		return scheduleForAssembly(args.get('serial'), args.get('legacy', False), args.get('reason', ''), session)
	if key == 'verifySerials':
		return verifySerials(args.get('serials'))
	if key == 'scheduleSerials':
		return scheduleSerials(args.get('serials'), args.get('legacy', False), args.get('reason', ''), session)
	if key == 'markScheduleComplete':
		return markScheduleComplete(args.get('idText'), args.get('item'), args.get('station'), args.get('reason', ''), session)
	if key == 'markScheduleWip':
		return markScheduleWip(args.get('idText'), args.get('item'), args.get('station'), args.get('reason', ''), session)
	if key == 'scheduleNwgPrePaint':
		return scheduleNwgPrePaint(args.get('componentID'), args.get('itemName'), args.get('reason', ''), session)
	if key == 'scheduleNwgPreAssembly':
		return scheduleNwgPreAssembly(args.get('componentID'), args.get('reason', ''), session)
	if key == 'pullNextWorkOrder':
		return pullNextWorkOrder(args.get('station'), args.get('reason', ''), session)
	if key == 'resendAmrPayload':
		return resendAmrPayload(args.get('amrId'), args.get('reason', ''), session)
	return {'ok': False, 'message': 'Unknown action: ' + str(key)}


# ---------------------------------------------------------------------------
# MANUAL ASSEMBLY SCHEDULING
# ---------------------------------------------------------------------------
def checkSerialForAssembly(serialNumber):
	'''
	Validates a WG serial for assembly scheduling (MachineConfig existence, then already-scheduled check).

	Called from:
		verifySerials (dry-run) and scheduleForAssembly (pre-commit), on the manual-assembly-schedule tab.

	Example:
		checkSerialForAssembly('0160153042')
		# -> {'serial': '0160153042', 'ok': True, 'messages': [...], 'alreadyScheduled': False,
		#     'priorNonConform': False, 'reason': 'Validated - ready to schedule.'}

	What it does:
		Rejects blank serials and M-numbers (NWG components can't go to Assembly). Then requires the serial
		to exist in MachineConfig and to NOT already be scheduled in Assembly (CheckScheduledStatusBySerial).

	Args:
		serialNumber (str): WG serial.

	Returns:
		dict: {'serial', 'ok', 'messages' (list of step notes), 'alreadyScheduled', 'priorNonConform', 'reason'}.
		      'reason' is the single line the UI surfaces; 'ok' True only when it may be scheduled.
	'''
	serial = (serialNumber or '').strip()
	result = {'serial': serial, 'ok': False, 'messages': [], 'alreadyScheduled': False, 'priorNonConform': False, 'reason': ''}
	if not serial:
		result['messages'].append('Enter a serial.')
		result['reason'] = 'Enter a serial number.'
		return result
	if serial.upper().startswith('M'):                  # M-numbers are NWG components, never assembly
		result['messages'].append('M-number (non-whole-good component).')
		result['reason'] = 'M-numbers cannot be scheduled in Assembly.'
		return result

	machineConfig = JcCommonOperations.getMachineConfigInfo(serial, ['Product Code', 'ItemName'])
	if machineConfig is None or len(machineConfig) == 0:
		result['messages'].append('Not found in MachineConfig.')
		result['reason'] = '{} is not in the MachineConfig table.'.format(serial)
		return result
	result['messages'].append('Exists in MachineConfig.')

	if int(beQuery('RunSchedule/Assembly/Select/CheckScheduledStatusBySerial', {'serialNumber': serial})) > 0:
		result['alreadyScheduled'] = True
		result['messages'].append('Already scheduled in Assembly.')
		result['reason'] = '{} is already scheduled in Assembly.'.format(serial)
		return result
	result['messages'].append('Not already scheduled in Assembly.')
	result['reason'] = 'Validated - ready to schedule.'
	result['ok'] = True
	return result


def scheduleForAssembly(serialNumber, legacy, reason, session):
	'''
	Schedules a WG serial for assembly via the existing createAssemblyOrder (BE2).

	Called from:
		scheduleSerials (batch loop) and runAction('scheduleForAssembly', ...), on the manual-assembly-schedule tab.

	Example:
		scheduleForAssembly('0160153042', False, 'Manual add for hot order', session)
		scheduleForAssembly('0160153042', True, 'Legacy build', session)

	What it does:
		Rejects blanks, M-numbers, and a missing reason. Server-side duplicate guard: refuses if the serial
		already has an ACTIVE (Scheduled/WIP/Associated) entry. Then calls createAssemblyOrder on BE2 (beExec
		with no stationName routes to BE2). Audits against the assembly ENTRY station (TF0010, or LL0010 for
		legacy) because a 10-digit serial won't fit the StationName column -- the serial goes in details.

	Args:
		serialNumber (str): WG serial.
		legacy (bool): True to schedule on the legacy line (LL0010), else the main line (TF0010).
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).

	Returns:
		dict: {'ok': bool, 'message': str}.
	'''
	serial = (serialNumber or '').strip()
	reason = (reason or '').strip()
	if not serial:
		return {'ok': False, 'message': 'No serial supplied.'}
	if serial.upper().startswith('M'):
		return {'ok': False, 'message': 'M-numbers cannot be scheduled in Assembly.'}
	if not reason:
		return {'ok': False, 'message': 'A reason is required.'}

	# Server-side duplicate guard: refuse if the serial already has an ACTIVE (Scheduled/WIP/Associated) entry.
	activeEntry = scheduleEntryAtStations(serial, statuses = ACTIVE_SCHEDULE_STATUSES)
	if activeEntry is not None:
		return {'ok': False, 'message': 'Serial {} is already scheduled (Status: {}) at {} - cannot schedule again.'.format(serial, statusLabel(activeEntry['status']), activeEntry['station'] or 'unknown station')}

	# createAssemblyOrder is BE2-resident; beExec with no stationName routes to BE2.
	if beExec('RunSchedule.Assembly.Assembly.createAssemblyOrder', {'serialNumber': serial, 'legacy': bool(legacy)}) is False:
		return {'ok': False, 'message': 'Backend declined to schedule {} for Assembly.'.format(serial)}

	# Audit against the assembly ENTRY station (a 10-digit serial won't fit StationName); serial goes in details.
	entryStation = 'LL0010' if bool(legacy) else 'TF0010'
	logOverride(entryStation, 'Manual Assembly Schedule', 'Serial {} scheduled for Assembly (legacy={})'.format(serial, bool(legacy)), reason, getOverrideUser(session))
	return {'ok': True, 'message': 'Scheduled {} for Assembly.'.format(serial)}


def cleanSerialList(serials):
	'''
	Trims, drops blanks, and de-dups (first wins) the flex-repeater serial list.

	Called from:
		verifySerials and scheduleSerials, before iterating the batch.

	Example:
		cleanSerialList([' 016...042 ', '016...042', '', '016...099'])   # -> ['016...042', '016...099']

	Args:
		serials (list): Raw serial strings from the manual-assembly flex repeater.

	Returns:
		list[str]: Trimmed, non-blank, order-preserving unique serials.
	'''
	cleanedSerials = []
	seen = set()
	for serial in (serials or []):
		serial = str(serial).strip()
		if serial and serial not in seen:
			seen.add(serial)
			cleanedSerials.append(serial)
	return cleanedSerials


def verifySerials(serials):
	'''
	Dry-run validation of a serial LIST; per-serial VALID/INVALID for the UI (writes nothing).

	Called from:
		scc-action-progress popup via runAction('verifySerials', ...), fired by the Verify button on the
		manual-assembly-schedule tab.

	Example:
		verifySerials(['0160153042', '0160153099'])
		# -> {'ok': True, 'message': '2 of 2 machine(s) verified OK.',
		#     'results': [{'serial': '0160153042', 'ok': True, 'reason': 'Validated - ready to schedule.'}, ...]}

	What it does:
		Cleans the list, then runs checkSerialForAssembly on each serial and collects a per-serial pass/fail.

	Args:
		serials (list): Serial strings.

	Returns:
		dict: {'ok': bool (True only if ALL passed), 'message': str, 'results': list[{'serial','ok','reason'}]}.
	'''
	cleanedSerials = cleanSerialList(serials)
	if not cleanedSerials:
		return {'ok': False, 'message': 'No machines to verify.', 'results': []}
	results = []
	validCount = 0
	for serial in cleanedSerials:
		check = checkSerialForAssembly(serial)
		if check['ok']:
			validCount += 1
		results.append({'serial': serial, 'ok': bool(check['ok']), 'reason': check.get('reason', '')})
	return {'ok': validCount == len(cleanedSerials), 'message': '{} of {} machine(s) verified OK.'.format(validCount, len(cleanedSerials)), 'results': results}


def scheduleSerials(serials, legacy, reason, session):
	'''
	Schedules a serial LIST for assembly; validates each and skips invalid ones with a reason.

	Called from:
		scc-action-progress popup via runAction('scheduleSerials', ...), fired by the Schedule button on the
		manual-assembly-schedule tab.

	Example:
		scheduleSerials(['0160153042', '0160153099'], False, 'Batch add', session)
		# -> {'ok': True, 'message': 'Scheduled 2 of 2 machine(s).', 'scheduled': [...], 'skipped': []}

	What it does:
		Requires a reason, cleans the list, then per serial: validates with checkSerialForAssembly (skips
		with a reason if invalid) and otherwise calls scheduleForAssembly. Builds a summary message that
		previews up to 5 skipped serials.

	Args:
		serials (list): Serial strings.
		legacy (bool): Passed through to scheduleForAssembly (legacy line vs main line).
		reason (str): Required audit reason (applied to every scheduled serial).
		session: Perspective session (for the audit username).

	Returns:
		dict: {'ok': bool (True if at least one scheduled), 'message': str, 'scheduled': list[str],
		      'skipped': list[{'serial','reason'}]}.
	'''
	reason = (reason or '').strip()
	if not reason:
		return {'ok': False, 'message': 'A reason is required.', 'scheduled': [], 'skipped': []}
	cleanedSerials = cleanSerialList(serials)
	if not cleanedSerials:
		return {'ok': False, 'message': 'No machines to schedule.', 'scheduled': [], 'skipped': []}

	scheduled = []
	skipped = []
	for serial in cleanedSerials:
		check = checkSerialForAssembly(serial)
		if not check['ok']:
			skipped.append({'serial': serial, 'reason': check.get('reason', 'validation failed')})
			continue
		result = scheduleForAssembly(serial, legacy, reason, session)
		if result.get('ok'):
			scheduled.append(serial)
		else:
			skipped.append({'serial': serial, 'reason': result.get('message', 'schedule failed')})

	message = 'Scheduled {} of {} machine(s).'.format(len(scheduled), len(cleanedSerials))
	if skipped:
		skippedPreview = '; '.join('{} ({})'.format(entry['serial'], entry['reason']) for entry in skipped[:5])
		message += ' Skipped {}: {}'.format(len(skipped), skippedPreview)
		if len(skipped) > 5:
			message += '; +{} more'.format(len(skipped) - 5)
	return {'ok': len(scheduled) > 0, 'message': message, 'scheduled': scheduled, 'skipped': skipped}


def machineTypeByProductCode():
	'''
	Returns a {ProductCode: MachineType} map for tagging the scheduled-serials grid.

	Called from:
		manual-assembly-schedule view, as a transform on the scheduled-serials grid
		-> StationControl.SCC.machineTypeByProductCode().

	Example:
		machineTypeByProductCode()   # -> {'ABC': 'Boom Lift', 'DEF': 'Scissor Lift', ...}

	Returns:
		dict: ProductCode -> MachineType, from getAllMachineTypesAndProductCodes.
	'''
	productDataSet = system.db.runNamedQuery(project = 'FactoryControl', path = 'Run Schedule/Assembly/manualAssemblyScheduling/select/getAllMachineTypesAndProductCodes', parameters = {})
	return {row['ProductCode']: row['MachineType'] for row in system.dataset.toPyDataSet(productDataSet)}


# ---------------------------------------------------------------------------
# WORK ORDER RECONCILIATION
# ---------------------------------------------------------------------------
def getScheduleEntries(idText):
	'''
	Returns every WIP/schedule row for a componentID (Fabrication) or serial (Assembly), unified columns.

	Called from:
		work-order-reconciliation view (search/load) -> StationControl.SCC.getScheduleEntries(sid).
		Also the internal basis for scheduleEntriesSafe, getMachineFlow and the schedule guards.

	Example:
		getScheduleEntries('M12345')       # Fabrication rows (M-prefix)
		getScheduleEntries('0160153042')   # Assembly rows (serial)

	What it does:
		M-prefixed ids query getFabricationScheduleByComponent; everything else queries
		getAssemblyScheduleBySerial. Both are normalized to the same column set.

	Args:
		idText (str): ComponentID (M-prefix) or WG serial.

	Returns:
		list[dict]: Rows with columns Station, Status, Item, ScheduledTimestamp, WIPTimestamp,
		            CompletedTimestamp. Empty list for blank input.
	'''
	idText = (idText or '').strip()
	if not idText:
		return []
	if idText.upper().startswith('M'):
		dataset = system.db.runNamedQuery(project = 'FactoryControl', path = 'station-control-center/getFabricationScheduleByComponent', parameters = {'componentID': idText})
	else:
		dataset = system.db.runNamedQuery(project = 'FactoryControl', path = 'station-control-center/getAssemblyScheduleBySerial', parameters = {'serialNumber': idText})
	scheduleDataSet = system.dataset.toPyDataSet(dataset)
	columns = list(scheduleDataSet.getColumnNames())
	return [{column: sourceRow[column] for column in columns} for sourceRow in scheduleDataSet]


def lookupComponent(idText):
	'''
	Classifies and locates a componentID/serial for the Work Order Reconciliation UI.

	Called from:
		work-order-reconciliation view (search button) -> self.view.custom.componentInfo = StationControl.SCC.lookupComponent(sid).

	Example:
		lookupComponent('M12345')       # NWG -> resolves the serial it is associated to
		lookupComponent('0160153042')   # serial -> resolves its associated NWGs

	What it does:
		Looks up ItemName / FinishedItemNumber in MachineConfig. For an NWG (M-prefix) it resolves the WG
		serial it is associated to (backend findSerialNumber). For a serial it resolves the associated NWGs
		(backend getNwgAssociatedItems). Both backend calls are routed to the BE copy on purpose -- the FE
		copies target a project without the RunSchedule tree.

	Args:
		idText (str): ComponentID (M-prefix) or WG serial.

	Returns:
		dict: {'input', 'isNWG', 'found', 'itemName', 'itemNumber', 'associations', 'serial'}.
		      'associations' is a list of {'ItemName','ComponentID'} for a serial; 'serial' is set for an NWG.
		      Adds 'messages' = 'Not found in MachineConfig.' when the id is unknown.
	'''
	idText = (idText or '').strip()
	result = {'input': idText, 'isNWG': idText.upper().startswith('M'), 'found': False, 'itemName': None, 'itemNumber': None, 'associations': None, 'serial': None}
	if not idText:
		return result

	machineConfig = JcCommonOperations.getMachineConfigInfo(idText, ['Product Code', 'ItemName', 'FinishedItemNumber'])
	if machineConfig is None or len(machineConfig) == 0:
		result['messages'] = 'Not found in MachineConfig.'
		return result
	result['found'] = True
	for row in machineConfig:
		if row['Description'] == 'ItemName':
			result['itemName'] = row['Value']
		elif row['Description'] == 'FinishedItemNumber':
			result['itemNumber'] = row['Value']

	if result['isNWG']:
		# NWG -> the serial it is associated to (findSerialNumber is BE-only, returns the FinalSerialNumber string).
		result['serial'] = beExec('StationControl.findSerialNumber.findSerialNumber', {'NWGComponentID': idText})
	else:
		# serial -> its NWGs. Routed to the BE copy; the FE copy targets a project without the RunSchedule tree and returns {}.
		associations = beExec('JcCommonOperations.getNwgAssociatedItems', {'serialNumber': idText})
		result['associations'] = [{'ItemName': itemName, 'ComponentID': componentID} for itemName, componentID in (associations or {}).items()]
	return result


def fabStatusAtStation(componentID, stnType, stationLike):
	'''
	Returns the TOP-1 fabrication status for a component at a station via the existing selectStatus query.

	Called from:
		markNwgComplete (to detect a live WIP row before completing it).

	Example:
		fabStatusAtStation('M12345', 'Boom', 'TT170A')   # -> 2 (WIP) | 1 | 3 | None

	Args:
		componentID (str): NWG component id.
		stnType (str): 'Frame' or 'Boom' (selects Fabrication_Frame/BoomWIP).
		stationLike (str): Station name / LIKE pattern for the query.

	Returns:
		int: The status code.
		None: When the query returns blank.
	'''
	rawStatus = beQuery('RunSchedule/Fabrication/Select/selectStatus', {'componentID': componentID, 'stn': stationLike, 'stnType': stnType}, stationName = stationLike)
	return None if (rawStatus is None or rawStatus == '') else int(rawStatus)


def prePaintStationForItem(itemName):
	'''
	Returns the prepaint station for an NWG section.

	Called from:
		scheduleNwgPrePaint (to route the component to the right prepaint WIP station).

	Example:
		prePaintStationForItem('Frame')      # -> 'TW0700'
		prePaintStationForItem('Base')       # -> 'TT170B'
		prePaintStationForItem('Fly')        # -> 'TT170A'
		prePaintStationForItem('Widget')     # -> ''

	Args:
		itemName (str): NWG section name (Frame / Base / Fly / InnerMid / OuterMid).

	Returns:
		str: The prepaint station, or '' if the section is unrecognized.
	'''
	itemName = (itemName or '').strip()
	if itemName == 'Frame':
		return 'TW0700'
	if itemName == 'Base':
		return 'TT170B'
	if itemName in ('Fly', 'InnerMid', 'OuterMid'):
		return 'TT170A'
	return ''


def scheduleNwgPrePaint(componentID, itemName, reason, session):
	'''
	Schedules an NWG into pre-paint by INSERTing a Status-1 fab WIP row at its section station.

	Called from:
		scc-action-progress popup via runAction('scheduleNwgPrePaint', ...), fired from the work-order-reconciliation tab.

	Example:
		scheduleNwgPrePaint('M12345', 'Base', 'Re-route to prepaint', session)

	What it does:
		1. Requires a component and reason.
		2. Reads ItemName (routing) + FinishedItemNumber (the WIP row's ItemNumber) from MachineConfig;
		   the itemName arg is only a UI hint and is overridden by MachineConfig when present.
		3. Resolves the prepaint station from the section (prePaintStationForItem); aborts if unroutable
		   or if there is no FinishedItemNumber.
		4. Blocks if a row already exists at that station in any live-or-finished status
		   (Scheduled/WIP/Complete/Associated) -- only a voided row frees it.
		5. INSERTs a Status-1 row via the plant's insertToWIP query (the query behind runQueryHelper's
		   "InsertToWIPWorkOrders" label -- no carrier group). {stnType} picks Frame vs Boom WIP; TW/TT -> BE1.
		6. Audits against the short prepaint station.

	Args:
		componentID (str): NWG component id.
		itemName (str): UI hint for the section (overridden by MachineConfig ItemName when available).
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).

	Returns:
		dict: {'ok': bool, 'message': str}.
	'''
	componentID = (componentID or '').strip()
	reason = (reason or '').strip()
	if not componentID:
		return {'ok': False, 'message': 'No ComponentID supplied; search a valid ComponentID first.'}
	if not reason:
		return {'ok': False, 'message': 'A reason is required.'}

	# ItemName (routing) + FinishedItemNumber (the WIP row's ItemNumber) come from MachineConfig; the arg is only a UI hint.
	itemName = (itemName or '').strip()
	itemNumber = None
	for row in (JcCommonOperations.getMachineConfigInfo(componentID, ['ItemName', 'FinishedItemNumber']) or []):
		if row['Description'] == 'ItemName' and not itemName:
			itemName = str(row['Value'] or '').strip()
		elif row['Description'] == 'FinishedItemNumber':
			itemNumber = str(row['Value'] or '').strip()

	prepaintStation = prePaintStationForItem(itemName)
	if not prepaintStation:
		return {'ok': False, 'message': "Cannot route '{}' to pre-paint - expected a boom section (Fly/InnerMid/OuterMid/Base) or Frame.".format(itemName)}
	if not itemNumber:
		return {'ok': False, 'message': '{} was not scheduled - no FinishedItemNumber in MachineConfig.'.format(componentID)}

	# Never schedule the same station twice -- even after it completed there.
	blocked = scheduleEntryAtStations(componentID, (prepaintStation,))
	if blocked is not None:
		return {'ok': False, 'message': '{} already has a {} row at {}; cannot schedule the same pre-paint station twice.'.format(componentID, statusLabel(blocked['status']), blocked['station'])}

	# insertToWIP: {stnType} QueryString picks Fabrication_Frame/BoomWIP; INSERTs Status 1 at :stn. TW/TT -> BE1.
	stnType = 'Boom' if prepaintStation.startswith('TT') else 'Frame'
	beQuery('RunSchedule/Fabrication/Select/insertToWIP', {'component': componentID, 'item': itemNumber, 'stn': prepaintStation, 'stn5': prepaintStation[:5], 'stnType': stnType}, stationName = prepaintStation)

	# Audit against the short station; the long componentID goes in details (StationName is nvarchar(6)).
	logOverride(prepaintStation, 'NWG Schedule PrePaint', '{} -> pre-paint {} ({})'.format(componentID, prepaintStation, itemName), reason, getOverrideUser(session))
	return {'ok': True, 'message': '{} scheduled to pre-paint at {}.'.format(componentID, prepaintStation)}


def scheduleNwgPreAssembly(componentID, reason, session):
	'''
	Schedules an NWG into pre-assembly (TF000X, Status 1) and clears any active prepaint rows.

	Called from:
		scc-action-progress popup via runAction('scheduleNwgPreAssembly', ...), fired from the work-order-reconciliation tab.

	Example:
		scheduleNwgPreAssembly('M12345', 'Move to pre-assembly', session)

	What it does:
		1. Requires a component and reason.
		2. One schedule fetch feeds both the duplicate check and the prepaint-clear loop.
		3. Blocks a duplicate at TF000X (Scheduled/WIP/Complete/Associated). Prepaint rows do NOT block.
		4. INSERTs the Status-1 pre-assembly row via insertFabricationToPreAssemblyInventory.
		5. Marks complete any ACTIVE (Scheduled/WIP/Associated) prepaint row (via markNwgComplete,
		   warnIfWip=False) so the component moves cleanly prepaint -> pre-assembly.
		6. Audits against TF000X, listing which prepaint stations were cleared.

	Args:
		componentID (str): NWG component id.
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).

	Returns:
		dict: {'ok': bool, 'message': str}. The message notes any prepaint stations that were closed out.
	'''
	componentID = (componentID or '').strip()
	reason = (reason or '').strip()
	if not componentID:
		return {'ok': False, 'message': 'No ComponentID supplied; search a valid ComponentID first.'}
	if not reason:
		return {'ok': False, 'message': 'A reason is required.'}

	# One fetch feeds both the TF000X duplicate check and the prepaint-clear loop.
	rows = scheduleEntriesSafe(componentID)
	# Block a duplicate at TF000X (Scheduled/WIP/Complete/Associated). Prepaint rows do NOT block -- they're cleared below.
	blocked = scheduleEntryAtStations(componentID, (PREASSEMBLY_STATION,), rows = rows)
	if blocked is not None:
		return {'ok': False, 'message': '{} already has a {} entry at pre-assembly (TF000X); not scheduling a duplicate.'.format(componentID, statusLabel(blocked['status']))}

	beQuery('RunSchedule/PaintUnload/insert/insertFabricationToPreAssemblyInventory', {'componentID': componentID, 'status': 1})

	# Mark complete any ACTIVE (Scheduled/WIP/Associated) prepaint row so the component moves cleanly prepaint -> pre-assembly.
	cleared = []
	for row in rows:
		station = str(row.get('Station') or '')
		try:
			status = int(row.get('Status'))
		except:
			continue
		if status in ACTIVE_SCHEDULE_STATUSES and station.upper() in PREPAINT_STATIONS:
			try:
				markNwgComplete(componentID, row.get('Item'), station, reason, session, warnIfWip = False)
				cleared.append(station)
			except:
				logger.warn('scheduleNwgPreAssembly: could not clear prepaint at {} for {}'.format(station, componentID))

	message = '{} scheduled to pre-assembly (TF000X).'.format(componentID)
	if cleared:
		message += ' Marked complete out of prepaint at ' + ', '.join(cleared) + '.'
	logOverride(PREASSEMBLY_STATION, 'NWG Schedule PreAssembly', '{} -> TF000X (status 1); prepaint cleared: {}'.format(componentID, ', '.join(cleared) or 'none'), reason, getOverrideUser(session))
	return {'ok': True, 'message': message}


def markNwgComplete(componentID, itemNumber, station, reason, session, warnIfWip = True):
	'''
	Marks an NWG fabrication row complete at a station, backfilling the WIP timestamp first if needed.

	Called from:
		markScheduleComplete (M-prefix branch), scheduleNwgPreAssembly (prepaint clear-out), and
		runAction('markScheduleComplete', ...) indirectly.

	Example:
		markNwgComplete('M12345', '12345-001', 'TT170A', 'Manual complete', session)
		markNwgComplete('M12345', '12345-001', 'TW0700', 'Prepaint clear', session, warnIfWip=False)

	What it does:
		1. Requires a reason. Derives stnType from the station prefix (TT -> Boom, else Frame).
		2. If warnIfWip and the row is currently WIP (status 2), returns needsConfirm=True instead of completing.
		3. Backfills the WIP timestamp ONLY when this row's WIPTimestamp is empty (updateWIPTimestamp has no
		   null-guard, so firing it on an already-WIP row would overwrite the real timestamp).
		4. Fires UpdateWIPCompletedTimestamp (a thin alias over updateCompleteTimestamp; no next-station
		   cascade, unlike workComplete) with status 3, then audits.

	Args:
		componentID (str): NWG component id.
		itemNumber (str): The fab row's item number (matched when backfilling WIP).
		station (str): Fabrication station.
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).
		warnIfWip (bool): When True (default), prompt for confirmation on a live WIP row instead of completing.

	Returns:
		dict: {'ok': bool, 'message': str, 'needsConfirm': bool}. needsConfirm=True means the caller must
		      re-invoke with warnIfWip=False after the user confirms.
	'''
	reason = (reason or '').strip()
	if not reason:
		return {'ok': False, 'message': 'A reason is required.', 'needsConfirm': False}

	stnType = 'Boom' if station.startswith('TT') else 'Frame'      # matches the BE runQueryHelper convention
	if warnIfWip and fabStatusAtStation(componentID, stnType, station) == 2:
		return {'ok': False, 'needsConfirm': True, 'message': '{} is currently WIP (status 2) at {}. Confirm to mark complete.'.format(componentID, station)}

	# Backfill WIP only when this row's WIP timestamp is empty -- updateWIPTimestamp has no null-guard, so firing
	# it on an already-WIP row would overwrite the real timestamp.
	wipEmpty = False
	for row in scheduleEntriesSafe(componentID):
		if str(row.get('Station') or '').upper() != station.upper():
			continue
		if itemNumber and str(row.get('Item') or '') != str(itemNumber):
			continue
		wipEmpty = not row.get('WIPTimestamp')
		break
	if wipEmpty:
		beExec('RunSchedule.Fabrication.UpdateWorkStatus.runQueryHelper', {'queryName': 'UpdateWIPTimestamp', 'componentID': componentID, 'itemNumber': itemNumber, 'station': station}, stationName = station)

	# UpdateWIPCompletedTimestamp is a thin alias over updateCompleteTimestamp (no next-station cascade, unlike workComplete).
	beExec('RunSchedule.Fabrication.UpdateWorkStatus.runQueryHelper', {'queryName': 'UpdateWIPCompletedTimestamp', 'componentID': componentID, 'itemNumber': itemNumber, 'station': station, 'status': 3}, stationName = station)
	logOverride(station, 'NWG Mark Complete', '{} complete at {}'.format(componentID, station), reason, getOverrideUser(session))
	return {'ok': True, 'message': '{} marked complete at {}.'.format(componentID, station), 'needsConfirm': False}


def markSerialComplete(serialNumber, station, reason, session):
	'''
	Marks a WG serial complete at an assembly station and runs the line/area completion cascade.

	Called from:
		markScheduleComplete (non-M branch).

	Example:
		markSerialComplete('0160153042', 'TF0300', 'Manual complete', session)

	What it does:
		1. Requires a reason.
		2. Fires WorkOrderClaim first (self-guards WIPTimestamp IS NULL) so a row completed straight from
		   Scheduled gets both timestamps, then WorkOrderComplete (status 3). TB (boom sub) completes with
		   no boundary -- the association guard was stripped 2026-07-01 (see archive/association-TB/).
		3. Line/area cascade: closes EVERY line the serial has entries in (not just the completed station's
		   line), because SetAreaStatus_Complete requires BOTH the TB and TF/LL lines at LineStatus 3. Per
		   line: mark in-progress, mark non-conformance-complete, then close LineStatus -> 3 if all its
		   stations are complete. Finally close AreaStatus -> 3 once all required lines are done.
		4. Audits.

	Args:
		serialNumber (str): WG serial.
		station (str): Assembly station the completion is applied at.
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).

	Returns:
		dict: {'ok': bool, 'message': str, 'needsConfirm': bool}.
	'''
	reason = (reason or '').strip()
	if not reason:
		return {'ok': False, 'message': 'A reason is required.', 'needsConfirm': False}
	# TB (boom sub) completes with no boundary -- the association guard was stripped 2026-07-01 (see archive/association-TB/).
	beQuery('RunSchedule/Assembly/Update/WorkOrderClaim', {'StationName': station, 'SerialNumber': serialNumber}, stationName = station)
	beQuery('RunSchedule/Assembly/Update/WorkOrderComplete', {'StationName': station, 'SerialNumber': serialNumber, 'Status': 3}, stationName = station)

	# Line/area completion cascade. Close EVERY line the serial has entries in (not just the completed station's
	# line): SetAreaStatus_Complete requires BOTH the TB (boom sub) and TF/LL lines at LineStatus 3, so a sub
	# whose stations are Complete but whose LineStatus was never closed (completed by a path that skipped the
	# cascade) would otherwise keep the area at 2. Per line: mark in-progress, then close LineStatus -> 3 if all
	# its stations are complete. Then close AreaStatus -> 3 once all required lines are done.
	linePrefixes = set([station[:2].upper()])
	for row in scheduleEntriesSafe(serialNumber):
		entryStation = str(row.get('Station') or '')
		if len(entryStation) >= 2:
			linePrefixes.add(entryStation[:2].upper())
	for linePrefix in linePrefixes:
		stationLookup = linePrefix + '%'
		beQuery('RunSchedule/Assembly/Update/SetLineStatus', {'SerialNumber': serialNumber, 'StationNameLookup': stationLookup}, stationName = station)
		beQuery('RunSchedule/Assembly/Update/UpdateLineStatus_NonConformanceComplete', {'SerialNumber': serialNumber, 'StationNameLookup': stationLookup}, stationName = station)
		beQuery('RunSchedule/Assembly/Update/SetLineStatus_Complete', {'SerialNumber': serialNumber, 'StationNameLookup': stationLookup}, stationName = station)
	beQuery('RunSchedule/Assembly/Update/SetAreaStatus_Complete', {'serialNumber': serialNumber}, stationName = station)

	logOverride(station, 'Serial Mark Complete', '{} complete at {}'.format(serialNumber, station), reason, getOverrideUser(session))
	return {'ok': True, 'message': '{} marked complete at {}.'.format(serialNumber, station), 'needsConfirm': False}


def markScheduleWip(idText, item, station, reason, session):
	'''
	Marks a station WIP (Status 2 + WIPTimestamp) for an NWG or a WG serial.

	Called from:
		scc-action-progress popup via runAction('markScheduleWip', ...), fired by the Mark WIP button on the
		scc-node-action popup (work order reconciliation flow).

	Example:
		markScheduleWip('M12345', '12345-001', 'TT170A', 'Manual WIP', session)   # NWG
		markScheduleWip('0160153042', None, 'TF0300', 'Manual WIP', session)       # WG serial

	What it does:
		Requires a component/serial, a station, and a reason. Server-side backstop: never marks WIP once
		this station's entry is Complete (status 3). NWG ('M') fires the fab runQueryHelper UpdateWIPTimestamp;
		a WG serial fires WorkOrderClaim. Audits, then best-effort re-fires getNextWorkOrder for the station.

	Args:
		idText (str): ComponentID (M-prefix) or WG serial.
		item (str): Item number (used for the NWG fab query; may be None for a serial).
		station (str): Station to mark WIP.
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).

	Returns:
		dict: {'ok': bool, 'message': str}. On success the message may include a next-work-order refresh note.
	'''
	reason = (reason or '').strip()
	idText = (idText or '').strip()
	station = (station or '').strip()
	if not reason:
		return {'ok': False, 'message': 'A reason is required.'}
	if not idText or not station:
		return {'ok': False, 'message': 'Component/serial and station are required.'}

	# Server-side backstop (view also guards): never mark WIP once this station's entry is Complete.
	for row in getScheduleEntries(idText):
		if str(row.get('Station') or '').strip().upper() == station.upper():
			try:
				if int(row.get('Status')) == 3:
					return {'ok': False, 'message': '{} is already marked Complete at {}; cannot mark WIP.'.format(idText, station)}
			except:
				pass
			break

	if idText.upper().startswith('M'):
		beExec('RunSchedule.Fabrication.UpdateWorkStatus.runQueryHelper', {'queryName': 'UpdateWIPTimestamp', 'componentID': idText, 'itemNumber': item, 'station': station}, stationName = station)
	else:
		beQuery('RunSchedule/Assembly/Update/WorkOrderClaim', {'StationName': station, 'SerialNumber': idText}, stationName = station)
	logOverride(station, 'Mark WIP', '{} -> WIP at {}'.format(idText, station), reason, getOverrideUser(session))
	return {'ok': True, 'message': '{} marked WIP at {}.'.format(idText, station) + refireNextWorkOrder(station, session, 'Auto-refire after manual Mark WIP')}


def markScheduleComplete(idText, item, station, reason, session):
	'''
	Routes 'Mark Complete at Station' to the fabrication or assembly completion path, then re-fires getNextWorkOrder.

	Called from:
		scc-action-progress popup via runAction('markScheduleComplete', ...), fired by the Mark Complete
		buttons on the scc-node-action popup and the work-order-reconciliation tab.

	Example:
		markScheduleComplete('M12345', '12345-001', 'TT170A', 'Manual complete', session)   # -> markNwgComplete
		markScheduleComplete('0160153042', None, 'TF0300', 'Manual complete', session)       # -> markSerialComplete

	What it does:
		M-prefix ids route to markNwgComplete (fab); everything else routes to markSerialComplete (assembly).
		warnIfWip is off here because the user picked the entry from the table, so its status is already
		visible. On success it appends a best-effort getNextWorkOrder refresh note.

	Args:
		idText (str): ComponentID (M-prefix) or WG serial.
		item (str): Item number (used by the NWG path; may be None for a serial).
		station (str): Station the completion is applied at.
		reason (str): Required audit reason.
		session: Perspective session (for the audit username).

	Returns:
		dict: {'ok': bool, 'message': str, 'needsConfirm': bool} from the chosen completion function.
	'''
	# warnIfWip is off: the user picked the entry from the table, so its status is already visible.
	if (idText or '').strip().upper().startswith('M'):
		result = markNwgComplete(idText, item, station, reason, session, warnIfWip = False)
	else:
		result = markSerialComplete(idText, station, reason, session)
	if result.get('ok'):
		result['message'] = result.get('message', '') + refireNextWorkOrder(station, session, 'Auto-refire after manual Mark Complete')
	return result


# ---------------------------------------------------------------------------
# MACHINE OVERVIEW
# ---------------------------------------------------------------------------
def stationArea(station):
	'''
	Returns the swimlane area for a station (prefix-based; TF000X is a special case).

	Called from:
		getMachineFlow (to annotate each schedule row with a lane).

	Example:
		stationArea('TW0300')   # -> 'Frame Fab'
		stationArea('TF000X')   # -> 'Pre-Assembly'
		stationArea('ZZ0000')   # -> 'Other'

	Args:
		station (str): Full station name.

	Returns:
		str: One of the FLOW_LANE_ORDER lanes ('Other' if the prefix is unrecognized).
	'''
	upperStation = (station or '').upper()
	if upperStation == 'TF000X':
		return 'Pre-Assembly'
	prefixAreas = [('TW', 'Frame Fab'), ('TT', 'Boom Fab'), ('PT', 'Paint'), ('TF', 'Main Line'), ('LL', 'Legacy'), ('TB', 'Boom Sub'), ('TC', 'Cab Sub'), ('TE', 'Engine Sub'), ('TX', 'Outrigger Sub')]
	for prefix, area in prefixAreas:
		if upperStation.startswith(prefix):
			return area
	return 'Other'


def getMachineFlow(idText):
	'''
	Returns the machine's actual journey for the Machine Overview: every schedule row, annotated + ordered by lane.

	Called from:
		scc-flow-canvas view, as a transform -> StationControl.SCC.getMachineFlow(val).

	Example:
		getMachineFlow('0160153042')
		# -> [{'Station': 'TW0300', 'Status': 3, 'Area': 'Frame Fab', ...},
		#     {'Station': 'TF0010', 'Status': 2, 'Area': 'Main Line', ...}, ...]

	What it does:
		Fetches every schedule row for the id (scheduleEntriesSafe), annotates each with a swimlane Area
		(stationArea), and sorts by lane order (FLOW_LANE_ORDER) then station. Sort failures are swallowed
		so a bad row can't blank the whole overview.

	Args:
		idText (str): ComponentID (M-prefix) or WG serial.

	Returns:
		list[dict]: Schedule rows each with an added 'Area' key, ordered by lane then station. Empty for blank input.
	'''
	idText = (idText or '').strip()
	if not idText:
		return []
	flowRows = []
	for row in scheduleEntriesSafe(idText):
		annotatedRow = dict(row)
		annotatedRow['Area'] = stationArea(annotatedRow.get('Station'))
		flowRows.append(annotatedRow)
	def laneKey(flowRow):
		area = flowRow.get('Area')
		return (FLOW_LANE_ORDER.index(area) if area in FLOW_LANE_ORDER else len(FLOW_LANE_ORDER), str(flowRow.get('Station') or ''))
	try:
		flowRows.sort(key = laneKey)
	except:
		pass
	return flowRows


# ---------------------------------------------------------------------------
# WEB-UI ADDITIONS (SCC v2 WebDev front end)
# Two thin helpers the HTML/JS UI needs. Both only compose EXISTING queries/functions -- no new
# named query is introduced. getScheduledAssembly is a READ (dynamic-dispatched directly);
# resendAmrPayload is a COMMIT (routed through runAction above, so it audits like every other write).
# ---------------------------------------------------------------------------
def getScheduledAssembly():
	'''
	Returns the assembly scheduled-serials grid for the Manual Assembly tab.

	Called from:
		SCC web UI (Manual Assembly tab) via the WebDev doPost dynamic dispatcher.

	What it does:
		Runs the EXISTING FactoryControl named query getAllScheduledSerialsInAssembly and returns its rows
		as JSON-safe dicts (java.util.Date timestamps stringified so the doPost serializes cleanly).

	Returns:
		list[dict]: SerialNumber, ProductCode, OrderNumber, ScheduledTimestamp, CurrentStation, Status,
		            Associated, Traditional (one row per scheduled serial).
	'''
	dataset = system.db.runNamedQuery(project = 'FactoryControl', path = 'Run Schedule/Assembly/manualAssemblyScheduling/select/getAllScheduledSerialsInAssembly', parameters = {})
	pyDataSet = system.dataset.toPyDataSet(dataset)
	columns = list(pyDataSet.getColumnNames())
	rows = []
	for sourceRow in pyDataSet:
		row = {}
		for column in columns:
			value = sourceRow[column]
			row[column] = None if value is None else (value if isinstance(value, (int, long, float, bool)) else str(value))
		rows.append(row)
	return rows


def resendAmrPayload(amrId, reason, session):
	'''
	Re-sends an AMR's Navithor payload without changing a component id (audited).

	Called from:
		scc-action dispatch: runAction('resendAmrPayload', ...), fired by the AMR tab's "Send Payload" button.

	What it does:
		Requires a reason, fires AMR.Commands.updateAMRPayload on BE2 (the same refresh setAmrComponentId
		runs after a change), then records a SupervisorOverrideLog row. Fails cleanly if the backend call errors.

	Args:
		amrId (int|str): AMR number.
		reason (str): Required audit reason.
		session: Perspective/auth session (for the audit username).

	Returns:
		dict: {'ok': bool, 'message': str}.
	'''
	reason = (reason or '').strip()
	if not reason:
		return {'ok': False, 'message': 'A reason is required.'}
	if amrId is None or str(amrId).strip() == '':
		return {'ok': False, 'message': 'No AMR supplied.'}
	try:
		beExec('AMR.Commands.updateAMRPayload', {'AMRID': amrId})
	except (JavaError, Exception):
		logger.error('resendAmrPayload FAILED for AMR {}\n{}'.format(amrId, traceback.format_exc()))
		return {'ok': False, 'message': 'Payload resend failed for AMR_{} - see gateway logs.'.format(str(amrId).zfill(3))}
	logOverride('AMR{}'.format(str(amrId).zfill(3)), 'AMR Payload Resend', 'Manual Navithor payload resend for AMR_{}'.format(str(amrId).zfill(3)), reason, getOverrideUser(session))
	return {'ok': True, 'message': 'Payload re-sent to AMR_{}.'.format(str(amrId).zfill(3))}
