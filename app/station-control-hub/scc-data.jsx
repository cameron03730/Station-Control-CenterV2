// ===== Station Control Center presentation constants =====
const AREA_BY_PREFIX = {
  TW: 'Frame Fab', TT: 'Boom Fab', PT: 'Paint', TF: 'Main Line',
  TB: 'Boom Sub', TC: 'Cab Sub', TE: 'Engine Sub', TX: 'Outrigger Sub', LL: 'Legacy'
};
const AREA_ORDER = ['Frame Fab','Boom Fab','Paint','Pre-Assembly','Main Line','Legacy','Boom Sub','Cab Sub','Engine Sub','Outrigger Sub'];
const STATUS = {
  0: { label: 'SCRAPPED', color: '#5B6675' },
  1: { label: 'SCHEDULED', color: '#E8920C' },
  2: { label: 'WIP', color: '#E87722' },
  3: { label: 'COMPLETE', color: '#2F9E44' },
  4: { label: 'ABORT', color: '#E03131' },
  5: { label: 'NON-CONFORMANCE', color: '#E03131' },
  7: { label: 'ASSOCIATED', color: '#5B6675' }
};

function areaOf(station = '') {
  return AREA_BY_PREFIX[station.slice(0, 2)] || 'Main Line';
}

Object.assign(window, { AREA_BY_PREFIX, AREA_ORDER, STATUS, areaOf });
