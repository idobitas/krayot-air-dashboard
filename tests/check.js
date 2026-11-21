// Zero-dependency checks for js/standards.js + js/guidance.js.  Run: node tests/check.js
'use strict';
const S = require('../js/standards.js');
const G = require('../js/guidance.js');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL:', msg); } }
const MODES = ['env', 'target'];
const station = (id, shortName, metrics) => ({ id, shortName, group: 'krayot', metrics });
const hourly = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { hourly: v, daily: null }]));
const clearCtx = mode => ({ mode, sig: { level: 'none', isMineralDust: false }, live: null, forecast: [] });

// the three surfaces: hero card (computeGuidance.lvl), station button (stationLvl), collapsed bars (barStatus)
function surfaces(st, mode) {
  const g = G.computeGuidance(st, clearCtx(mode));
  const bars = Object.keys(st.metrics).map(k => G.barStatus(k, st.metrics[k].hourly, mode)).filter(b => b.lvl != null);
  return { card: g.lvl, button: g.stationLvl, bars: bars.length ? Math.max(...bars.map(b => b.lvl)) : 0, g };
}

// 1. card / button / bar parity across modes on a grid of values around every band edge
const edges = [];
Object.values(S.NOW_BANDS_BY_MODE).forEach(bands => Object.entries(bands).forEach(([k, [a, b]]) =>
  [0, a - 0.1, a, a + 0.1, (a + b) / 2, b - 0.1, b, b + 0.1, b * 2].forEach(v => edges.push([k, +v.toFixed(2)]))));
MODES.forEach(mode => edges.forEach(([k, v]) => {
  const s = surfaces(station('x', 'בדיקה', hourly({ [k]: v })), mode);
  ok(s.card === s.button && s.button === s.bars, `parity ${mode} ${k}=${v}: card ${s.card} button ${s.button} bars ${s.bars}`);
}));
// mixed station: the worst bar drives card and button
MODES.forEach(mode => {
  const s = surfaces(station('mix', 'מעורב', hourly({ PM25: 12, PM10: 70, NO2: 40, O3: 60, SO2: 5, C6H6: 0.8 })), mode);
  ok(s.card === s.button && s.button === s.bars, `parity mixed ${mode}: ${s.card}/${s.button}/${s.bars}`);
});

// 2. Motzkin PM2.5 22.6: never green under the WHO (health) target — and moderate under legal too (MoEP yellow)
const motzkin = station('kiryat_motzkin_z2', 'קריית מוצקין', hourly({ PM25: 22.6, PM10: 40 }));
const mzT = surfaces(motzkin, 'target'), mzE = surfaces(motzkin, 'env');
ok(mzT.card !== 0 && mzT.button !== 0 && mzT.bars !== 0, `Motzkin 22.6 WHO mode not green (${mzT.card}/${mzT.button}/${mzT.bars})`);
ok(G.barStatus('PM25', 22.6, 'target').word === 'בינוני', 'Motzkin 22.6 WHO bar word = בינוני');
ok(mzE.card === 1, 'Motzkin 22.6 legal = MoEP yellow (moderate)');

// 3. Kiryat Haim PM2.5 26.6 in legal mode: all three surfaces agree (moderate: 50%–100% of 37.5)
const haim = station('kiryat_haim_regavim', 'קריית חיים', hourly({ PM25: 26.6, PM10: 50 }));
const kh = surfaces(haim, 'env');
ok(kh.card === 1 && kh.button === 1 && kh.bars === 1, `Kiryat Haim 26.6 legal consistent = 1 (${kh.card}/${kh.button}/${kh.bars})`);
ok(G.barStatus('PM25', 26.6, 'env').word === 'בינוני', 'Kiryat Haim 26.6 legal bar word = בינוני');
ok(/PM2\.5/.test(kh.g.because), 'Kiryat Haim "because" names PM2.5');
// band edges: legal yellow starts above 50% of the limit, red at the limit
ok(S.nowLevel('env', 'PM25', 18.5) === 0 && S.nowLevel('env', 'PM25', 18.6) === 1 && S.nowLevel('env', 'PM25', 37.5) === 2, 'PM2.5 legal edges 18.5/18.6/37.5');
ok(S.nowLevel('target', 'PM25', 15) === 0 && S.nowLevel('target', 'PM25', 15.1) === 1, 'PM2.5 WHO edge 15');
ok(S.nowLevel('target', 'PM10', 45) === 0 && S.nowLevel('target', 'PM10', 46) === 1 && S.nowLevel('env', 'PM10', 46) === 0, 'PM10 WHO 45 vs legal 65');

// 4. ppb applies to gases only
['PM25', 'PM10', 'BaP'].forEach(k => {
  ok(S.unitLabel(k, 'ppb') === 'µg/m³', `${k} unit stays µg/m³ in ppb mode`);
  ok(S.formatGas(20, k, 'ppb', 1) === '20.0', `${k} value not converted in ppb mode`);
  ok(S.convertLabel('תקן יממתי: 37.5', k, 'ppb') === 'תקן יממתי: 37.5', `${k} label not converted`);
});
['NO2', 'O3', 'SO2', 'C6H6'].forEach(k => {
  ok(S.unitLabel(k, 'ppb') === 'ppb' && S.unitLabel(k, 'ug') === 'µg/m³', `${k} unit label follows mode`);
  ok(Math.abs(parseFloat(S.formatGas(S.GAS_CONVERSION[k] * 10, k, 'ppb', 2)) - 10) < 0.01, `${k} µg→ppb conversion`);
});
ok(S.convertLabel('תקן יממתי: 80 (יעד WHO: 25)', 'NO2', 'ppb') === 'תקן יממתי: 42.5 ppb (יעד WHO: 13.3 ppb)', 'NO2 label converted to ppb');
ok(S.formatGas(null, 'NO2', 'ppb') === '—' && S.formatGas(NaN, 'PM25', 'ug') === '—', 'missing value -> dash');

// 5. station 517 (Kishon: benzene only) — no NaN anywhere
const hasNaN = o => /NaN|undefined/.test(JSON.stringify(o, (k, v) => (typeof v === 'number' && isNaN(v) ? 'NaN' : v === undefined ? 'undefined' : v)));
[[0.6], [3.1], [7], [null]].forEach(([c6]) => MODES.forEach(mode => {
  const kishon = station('kishon_mobile5', 'קישון', { C6H6: { hourly: c6, daily: null, monthly: null } });
  const g = G.computeGuidance(kishon, clearCtx(mode));
  ok(g && !hasNaN(g) && [0, 1, 2].includes(g.lvl), `517 guidance no NaN (C6H6=${c6}, ${mode})`);
  ['C6H6', 'PM25', 'NO2'].forEach(k => {
    const b = G.barStatus(k, k === 'C6H6' ? c6 : undefined, mode);
    ok(!hasNaN(b) && isFinite(b.pct) && isFinite(b.width), `517 bar ${k} no NaN (C6H6=${c6}, ${mode})`);
  });
}));
ok(G.barStatus('C6H6', 0.6, 'env').word === 'אינדיקטיבי', 'benzene low = indicative');
ok(G.barStatus('C6H6', 7, 'env').word === 'חריגה', 'benzene 7 = high');

// 6. detector / network events still override the bands
const fireCtx = { ...clearCtx('env'), live: { kind: 'fire', stations: [{ id: 'kiryat_bialik_z4', level: 'high' }] }, nameOf: () => 'ביאליק' };
ok(G.computeGuidance(station('a', 'א', hourly({ PM25: 5 })), fireCtx).lvl === 2, 'network fire -> card red');
ok(G.computeGuidance(station('a', 'א', hourly({ PM25: 5 })), fireCtx).stationLvl === 0, 'network fire leaves the station button on its own bands');
ok(G.computeGuidance({ metrics: {} }, clearCtx('env')) === null, 'no metrics -> null');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
