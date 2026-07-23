// ===== Station Control Center — mock data & shared helpers (DEMO fallback + constants) =====
export const AREA_BY_PREFIX = {
  TW: 'Frame Fab', TT: 'Boom Fab', PT: 'Paint', TF: 'Main Line',
  TB: 'Boom Sub', TC: 'Cab Sub', TE: 'Engine Sub', TX: 'Outrigger Sub', LL: 'Legacy'
};
export const AREA_ORDER = ['Frame Fab', 'Boom Fab', 'Paint', 'Pre-Assembly', 'Main Line', 'Legacy', 'Boom Sub', 'Cab Sub', 'Engine Sub', 'Outrigger Sub'];

// Status code legend: 0 Scrapped,1 Scheduled,2 WIP,3 Complete,4 Abort,5 Non-Conformance,7 Associated
export const STATUS = {
  0: { label: 'SCRAPPED', color: '#5B6675' },
  1: { label: 'SCHEDULED', color: '#E8920C' },
  2: { label: 'WIP', color: '#E87722' },
  3: { label: 'COMPLETE', color: '#2F9E44' },
  4: { label: 'ABORT', color: '#E03131' },
  5: { label: 'NON-CONFORMANCE', color: '#6741D9' },
  7: { label: 'ASSOCIATED', color: '#0C8599' }
};

export const areaOf = (station) => AREA_BY_PREFIX[station.slice(0, 2)] || 'Main Line';

export function nowStamp(offsetMin = 0) {
  const d = new Date(Date.now() - offsetMin * 60000);
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

// Station run-schedule mock generator
const RS_LIB = [
  { comp: 'M171550', desc: 'PNT, ORANGE JLG3360020 JLG ORANGE', op: 'BOOM, BASE WELD' },
  { comp: 'M290430', desc: 'PNT, BLACK JLG3360023 JLG BLACK GLOSS', op: 'BOOM, MID WELD' },
  { comp: 'M181080', desc: 'PNT, BLACK JLG3360023 JLG BLACK GLOSS', op: 'BOOM, MID WELD' },
  { comp: 'M179050', desc: 'PNT, ORANGE JLG3360020 JLG ORANGE', op: 'BOOM, BASE WELD' },
  { comp: 'M282832', desc: 'PNT, ORANGE JLG3360020 JLG ORANGE', op: 'FRAME, TURNTABLE WELD' },
  { comp: 'M950470', desc: 'PNT, BLACK JLG3360023 JLG BLACK GLOSS', op: 'BOOM, FLY WELD' }
];
const RS_SERIALS = ['0160153042', '0160153099', '0160136118', '0160140773', '0160155501', '0160155502'];
function makeRunSchedule(seed, wip) {
  const n = 3 + (seed % 3);
  return Array.from({ length: n }, (_, i) => {
    const lib = RS_LIB[(seed + i) % RS_LIB.length];
    const day = 22 + i;
    return {
      tag: `${lib.comp}202607${String(day).padStart(2, '0')}`,
      comp: lib.comp, serial: RS_SERIALS[(seed * 2 + i) % RS_SERIALS.length],
      desc: lib.desc, op: lib.op,
      start: `Jul ${day}, 2026 12:00 AM`,
      status: i === 0 ? (wip ? 2 : 1) : 1
    };
  });
}

export const seedStations = () => ([
  { station: 'TW0700', c1: 'M282832', c2: '', status: 2 },
  { station: 'TT170A', c1: '0160153099', c2: 'M95047', status: 2 },
  { station: 'PT0100', c1: '', c2: '', status: 1 },
  { station: 'TF0010', c1: '0160153042', c2: '', status: 2 },
  { station: 'TF0300', c1: '', c2: '', status: 1 },
  { station: 'TB0100', c1: 'M12345', c2: '', status: 3 },
  { station: 'TC0200', c1: '', c2: '', status: 1 },
  { station: 'TE0100', c1: '0160136118', c2: '', status: 2 },
  { station: 'LL0010', c1: '', c2: '', status: 1 }
].map((s, i) => ({ ...s, area: areaOf(s.station), runSchedule: makeRunSchedule(i, s.status === 2) })));

export const seedAmrs = () => ([
  { amr: '001', c1: '0160153042', c2: '', state: 'Auto', batt: 54 },
  { amr: '002', c1: '0160153099', c2: '0160136118', state: 'Auto', batt: 99 },
  { amr: '003', c1: '', c2: '', state: 'StandBy', batt: 47 },
  { amr: '004', c1: '0160136118', c2: '', state: 'Auto', batt: 97 },
  { amr: '005', c1: '', c2: '', state: 'Offline', batt: 12 },
  { amr: '006', c1: '0160153042', c2: '', state: 'Auto', batt: 88 },
  { amr: '007', c1: '', c2: '', state: 'StandBy', batt: 64 },
  { amr: '008', c1: '0160153099', c2: '', state: 'Auto', batt: 76 },
  { amr: '009', c1: '', c2: '', state: 'Offline', batt: 31 },
  { amr: '010', c1: '', c2: '', state: 'StandBy', batt: 58 }
]);

export const seedScheduled = () => ([
  { serial: '0160153042', product: 'ES1932', machine: 'Scissor Lift', status: 2, wo: 'WG-104582', ts: nowStamp(42) },
  { serial: '0160153099', product: '600AJ', machine: 'Boom Lift', status: 1, wo: 'WG-104588', ts: nowStamp(15) },
  { serial: '0160136118', product: '1930ES', machine: 'Scissor Lift', status: 3, wo: 'WG-104501', ts: nowStamp(310) },
  { serial: '0160140773', product: '450AJ', machine: 'Boom Lift', status: 7, wo: 'WG-104477', ts: nowStamp(520) }
]);

export const seedPlanned = () => ([
  { serial: '0160155501', product: 'ES1932', machine: 'Scissor Lift', date: 'Jul 23' },
  { serial: '0160155502', product: '600AJ', machine: 'Boom Lift', date: 'Jul 23' },
  { serial: '0160155510', product: '1930ES', machine: 'Scissor Lift', date: 'Jul 24' },
  { serial: '0160155511', product: '450AJ', machine: 'Boom Lift', date: 'Jul 24' },
  { serial: '0160155498', product: '3394RT', machine: 'Telehandler', date: 'Jul 25' },
  { serial: '0160155524', product: 'X26J', machine: 'Scissor Lift', date: 'Jul 25' }
]);

// Reconciliation: schedule entries per machine keyed by lookup value
export const RECON_DB = {
  '0160153042': {
    kind: 'WG', product: 'ES1932', machine: 'Scissor Lift', wo: 'WG-104582',
    rows: [
      { station: 'TW0700', status: 3, item: 'Frame Weldment', sched: nowStamp(900), wip: nowStamp(880), done: nowStamp(760) },
      { station: 'PT0100', status: 3, item: 'Frame Paint', sched: nowStamp(750), wip: nowStamp(700), done: nowStamp(600) },
      { station: 'TF0010', status: 2, item: 'Chassis Build', sched: nowStamp(120), wip: nowStamp(42), done: '' },
      { station: 'TF0300', status: 1, item: 'Final Assembly', sched: nowStamp(120), wip: '', done: '' }
    ],
    components: [
      { section: 'Fly', id: 'M12345' }, { section: 'InnerMid', id: 'M282832' },
      { section: 'OuterMid', id: 'M95047' }, { section: 'Base', id: 'M40021' }
    ]
  },
  '0160153099': {
    kind: 'WG', product: '600AJ', machine: 'Boom Lift', wo: 'WG-104588',
    rows: [
      { station: 'TW0700', status: 3, item: 'Frame Weldment', sched: nowStamp(1200), wip: nowStamp(1180), done: nowStamp(1050) },
      { station: 'TT170A', status: 2, item: 'Boom Weldment', sched: nowStamp(300), wip: nowStamp(60), done: '' },
      { station: 'PT0100', status: 1, item: 'Boom Paint', sched: nowStamp(300), wip: '', done: '' },
      { station: 'TF0010', status: 1, item: 'Chassis Build', sched: nowStamp(300), wip: '', done: '' }
    ],
    components: [
      { section: 'Fly', id: 'M77120' }, { section: 'InnerMid', id: 'M77121' },
      { section: 'OuterMid', id: 'M77122' }, { section: 'Base', id: 'M77123' }
    ]
  },
  '0160136118': {
    kind: 'WG', product: '1930ES', machine: 'Scissor Lift', wo: 'WG-104501',
    rows: [
      { station: 'TW0700', status: 3, item: 'Frame Weldment', sched: nowStamp(2000), wip: nowStamp(1950), done: nowStamp(1800) },
      { station: 'PT0100', status: 3, item: 'Frame Paint', sched: nowStamp(1700), wip: nowStamp(1650), done: nowStamp(1500) },
      { station: 'TF0010', status: 3, item: 'Chassis Build', sched: nowStamp(1400), wip: nowStamp(1350), done: nowStamp(1200) },
      { station: 'TF0300', status: 3, item: 'Final Assembly', sched: nowStamp(1100), wip: nowStamp(1050), done: nowStamp(310) }
    ],
    components: [
      { section: 'Fly', id: 'M22001' }, { section: 'InnerMid', id: 'M22002' },
      { section: 'OuterMid', id: 'M22003' }, { section: 'Base', id: 'M22004' }
    ]
  },
  'M12345': {
    kind: 'NWG', product: 'Fly Boom Section', machine: 'Boom Assembly', wo: 'WG-104582',
    rows: [
      { station: 'TT170A', status: 2, item: 'Boom Weldment', sched: nowStamp(200), wip: nowStamp(48), done: '' },
      { station: 'PT0100', status: 1, item: 'Boom Paint', sched: nowStamp(200), wip: '', done: '' },
      { station: 'TB0100', status: 1, item: 'Boom Sub-Assembly', sched: nowStamp(200), wip: '', done: '' }
    ],
    components: []
  },
  'M282832': {
    kind: 'NWG', product: 'InnerMid Boom Section', machine: 'Boom Assembly', wo: 'WG-104582',
    rows: [
      { station: 'TT170A', status: 3, item: 'Boom Weldment', sched: nowStamp(600), wip: nowStamp(560), done: nowStamp(420) },
      { station: 'PT0100', status: 2, item: 'Boom Paint', sched: nowStamp(300), wip: nowStamp(30), done: '' },
      { station: 'TB0100', status: 1, item: 'Boom Sub-Assembly', sched: nowStamp(300), wip: '', done: '' }
    ],
    components: []
  },
  'M95047': {
    kind: 'NWG', product: 'OuterMid Boom Section', machine: 'Boom Assembly', wo: 'WG-104588',
    rows: [
      { station: 'TT170A', status: 1, item: 'Boom Weldment', sched: nowStamp(90), wip: '', done: '' },
      { station: 'TB0100', status: 1, item: 'Boom Sub-Assembly', sched: nowStamp(90), wip: '', done: '' }
    ],
    components: []
  }
};

// Validation for Manual Assembly serials (DEMO)
export function validateSerial(serial, existing) {
  const s = serial.trim();
  if (/^M/i.test(s)) return { status: 'INVALID', reason: "M-numbers can't be scheduled" };
  if (!/^\d{10}$/.test(s)) return { status: 'INVALID', reason: 'must be a 10-digit serial' };
  if (existing.includes(s)) return { status: 'INVALID', reason: 'already scheduled' };
  return { status: 'VERIFIED', reason: '' };
}

export function classifyLookup(q) {
  const s = q.trim();
  if (/^M\d+/i.test(s)) return 'NWG';
  if (/^\d{10}$/.test(s)) return 'WG';
  return null;
}
