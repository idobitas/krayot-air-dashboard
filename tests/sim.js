// Zero-dependency simulation + fuzz for the pure modules (fire_v2b, standards, guidance, charts).
// Run: node tests/sim.js   (does not load app.js)
'use strict';
const charts = [];
globalThis.Chart = class { constructor(c, cfg) { charts.push(cfg); } static getChart() { return null; } };
const F = require('../js/fire_v2b.js');
const S = require('../js/standards.js');
const G = require('../js/guidance.js');
require('../js/charts.js');
const C = globalThis.AQCharts;

let fails = 0, passes = 0, current = '';
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error(`FAIL [${current}]: ${msg}`); } };
const H = 3600000, IDS = F.IDS, REFS = ['ref_neve_shaanan', 'ref_tivon', 'ref_nesher'];
const BAD = [null, 0, -5, NaN, Infinity];

// Mulberry32 (seeded PRNG)
function mulberry32(a) { return function () {
  a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 72 h clean baseline (+ refs + Open-Meteo), then per-hour overrides: mod(id, i, row) mutates a row
function makeScenario({ start = '2026-11-10T00:00:00Z', hours = 72, mod = null, noOM = false } = {}) {
  const t0 = Date.parse(start), st = {};
  [...IDS, ...REFS].forEach((id, k) => {
    const rows = [];
    for (let i = 0; i < hours; i++) {
      const w = Math.sin((i + k * 3) / 4);
      const r = { t: new Date(t0 + i * H).toISOString(), PM25: +(10 + w * 1.5).toFixed(1), NOX: 18, windDir: 270, windSpeed: 3 };
      if (id !== 'kiryat_yam_z1') r.PM10 = +(25 + w * 3).toFixed(1);
      if (id === 'kiryat_motzkin_z2' || id === 'kiryat_binyamin') r.C6H6 = 0.5;
      if (mod && mod(id, i, r) === false) continue; // false = drop the row (station down)
      rows.push(r);
    }
    st[id] = { rows };
  });
  if (!noOM) ['om_kiryat_bialik_z4', 'om_kiryat_haim_regavim'].forEach(id => {
    st[id] = { rows: Array.from({ length: hours }, (_, i) => ({ t: new Date(t0 + i * H).toISOString(), windDir: 270, windSpeed: 3 })) };
  });
  return st;
}

const NAMES = { kiryat_motzkin_z2: 'קריית מוצקין', kiryat_yam_z1: 'קריית ים', kiryat_bialik_z4: 'קריית ביאליק', kiryat_binyamin: 'קריית אתא', kiryat_haim_regavim: 'קריית חיים', kishon_mobile5: 'קישון' };
const bad = v => typeof v === 'number' && !Number.isFinite(v);
const dirty = o => /NaN|undefined|Infinity/.test(JSON.stringify(o, (k, v) => bad(v) ? 'NaN' : (v === undefined ? 'undefined' : v)));

// station objects for guidance from the last row of a scenario
function stationsFrom(hist) {
  return IDS.map(id => {
    const rows = (hist[id] || {}).rows || [], last = rows[rows.length - 1] || {};
    const day = rows.slice(-24), mean = k => { const v = day.map(r => r[k]).filter(x => typeof x === 'number' && Number.isFinite(x) && x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const metrics = {};
    ['PM25', 'PM10', 'NOX', 'C6H6'].forEach(k => { if (k in last || mean(k) != null) metrics[k === 'NOX' ? 'NO2' : k] = { hourly: last[k] ?? null, daily: mean(k) }; });
    return { id, shortName: NAMES[id], group: 'krayot', metrics };
  });
}

// invariants checked on every run
function invariants(hist, R, label) {
  current = label;
  if (R) {
    IDS.forEach(id => {
      const ch = R.S[id];
      ch.S.forEach((s, i) => {
        ok(s === null || Number.isFinite(s), `${id} score finite at ${i} (${s})`);
        if (i > 0 && ch.T[i - 1] === null && s !== null) ok(s < F.HIGH, `${id} single hour after null is not 🚨 (${s} at ${i})`);
      });
    });
    ok(!dirty(R.latest), 'latest verdict has no NaN/undefined');
  }
  const stations = stationsFrom(hist);
  const who24All = G.whoExceedances(stations);
  ok(!dirty(who24All), 'whoExceedances clean');
  stations.forEach(st => {
    const i = R ? R.latestIndex : -1;
    const sc = R && R.S[st.id] ? R.S[st.id].S[i] : null;
    const sig = { level: R ? R.level(sc) : 'none', isMineralDust: !!(R && R.S[st.id] && R.S[st.id].flags[i] && R.S[st.id].flags[i].dustEvent) };
    const ctx = mode => ({ mode, sig, live: R ? R.latest : null, nameOf: id => NAMES[id] || id, who24: who24All.filter(x => x.stationId === st.id), forecast: [] });
    const env = G.computeGuidance(st, ctx('env')), tgt = G.computeGuidance(st, ctx('target'));
    if (!env) return;
    ok(!dirty(env) && !dirty(tgt), `${st.id} guidance strings clean`);
    ok(tgt.lvl >= env.lvl, `${st.id} health severity ${tgt.lvl} >= legal ${env.lvl}`);
    ok(env.avg24 === '', `${st.id} no WHO 24 h note in legal mode`);
    Object.entries(st.metrics).forEach(([k, m]) => {
      const be = G.barStatus(k, m.hourly, 'env'), bt = G.barStatus(k, m.hourly, 'target');
      ok(!dirty(be) && !dirty(bt), `${st.id} ${k} bar clean`);
      if (be.lvl != null && bt.lvl != null) ok(bt.lvl >= be.lvl, `${st.id} ${k} bar health >= legal`);
      // ppb: only gas numbers change; colour inputs are always µg/m³
      const ug = S.formatGas(m.hourly, k, 'ug', 2), ppb = S.formatGas(m.hourly, k, 'ppb', 2);
      ok(!/NaN|undefined|Infinity/.test(ug + ppb), `${st.id} ${k} formatted value clean (${ug} / ${ppb})`);
      if (!S.isPpbCapable(k)) ok(ug === ppb && S.unitLabel(k, 'ppb') === 'µg/m³', `${st.id} ${k} particles unchanged in ppb`);
    });
    // charts: arrays must not carry NaN/Infinity
    charts.length = 0;
    const rows = (hist[st.id] || {}).rows || [];
    const series = rows.slice(-24).map(r => (typeof r.PM25 === 'number' && Number.isFinite(r.PM25)) ? r.PM25 : null);
    C.renderTrend({}, { labels: series.map((_, j) => String(j)), series, threshold: 37.5, seriesLabel: 'PM2.5', thresholdLabel: 'סף', mode: 'env' });
    if (R && R.S[st.id]) C.renderV2BScan({}, { labels: R.axis.map(String), pm25: R.S[st.id].PM25, levels: R.S[st.id].S.map(R.level) });
    ok(charts.length && !dirty(charts.map(c => c.data)), `${st.id} chart arrays clean`);
  });
}

// the detector only ever sees JSON (history_90d.json / live_krayot.json), where NaN / Infinity become null
const viaJSON = h => JSON.parse(JSON.stringify(h));
const run = (label, hist) => { let R = null; current = label; try { R = F.compute(viaJSON(hist)); } catch (e) { ok(false, 'detector threw: ' + e.message); } invariants(hist, R, label); return R; };
const lastLv = (R, id) => R.level(R.S[id].S[R.latestIndex]);

// ---- extremes ----
{ // heavy dust at Bialik for the last 4 h: never fire, never green
  const R = run('heavy dust', makeScenario({ mod: (id, i, r) => { if (id === 'kiryat_bialik_z4' && i >= 68) { r.PM25 = 60; r.PM10 = 400; } } }));
  ok(lastLv(R, 'kiryat_bialik_z4') !== 'high' && lastLv(R, 'kiryat_bialik_z4') !== 'watch', 'dust is not smoke');
  const bi = stationsFrom(makeScenario({ mod: (id, i, r) => { if (id === 'kiryat_bialik_z4' && i >= 68) { r.PM25 = 60; r.PM10 = 400; } } })).find(s => s.id === 'kiryat_bialik_z4');
  ok(G.computeGuidance(bi, { mode: 'env', sig: { level: 'dust', isMineralDust: true } }).lvl > 0, 'dust card is not green');
}
{ // single-station smoke at night with east wind: Bialik 🚨, Motzkin clean with an area note
  const night = (i) => { const h = (i % 24); return h >= 20 || h <= 4; };
  const hist = makeScenario({ mod: (id, i, r) => { r.windDir = night(i) ? 90 : 270; if (id === 'kiryat_bialik_z4' && i >= 68 && i <= 70) { r.PM25 = 70; r.PM10 = 85; } } });
  // last hour = 23:00 UTC = 01:00 Israel (night); smoke at hours 68–70 (20:00–22:00 UTC)
  const R = run('single-station smoke', hist);
  const peak = Math.max(...R.S.kiryat_bialik_z4.S.slice(68, 71).map(x => x ?? 0));
  ok(peak >= F.HIGH, `Bialik reaches 🚨 (${peak})`);
  ok(R.S.kiryat_motzkin_z2.S.slice(68, 71).every(x => (x ?? 0) < F.WATCH), 'clean neighbour stays clean');
  const live = { kind: 'fire', stations: [{ id: 'kiryat_bialik_z4', level: 'high' }] };
  const mz = stationsFrom(hist).find(s => s.id === 'kiryat_motzkin_z2');
  const g = G.computeGuidance(mz, { mode: 'env', sig: { level: 'none' }, live, nameOf: id => NAMES[id] });
  ok(g.lvl === 0 && /^🚨 באזור: .*ביאליק/.test(g.area), 'Motzkin card stays green with an area note');
}
{ // deep inversion: every Krayot station AND the references rise together -> no fire
  const R = run('deep inversion', makeScenario({ mod: (id, i, r) => { r.windSpeed = 0.4; if (i >= 60) { r.PM25 = +(r.PM25 + (i - 59) * 3).toFixed(1); if (r.PM10) r.PM10 = +(r.PM10 + (i - 59) * 5).toFixed(1); } } }));
  ok(IDS.every(id => R.S[id].S.slice(60).every(x => (x ?? 0) < F.HIGH)), 'inversion never 🚨');
}

// ---- corrupt / edge data ----
BAD.forEach(v => run(`corrupt value ${v}`, makeScenario({ mod: (id, i, r) => { if (i % 7 === 3) { r.PM25 = v; r.PM10 = v; r.NOX = v; r.windDir = v; } } })));
{ const R = run('382 down while 92 spikes', makeScenario({ mod: (id, i, r) => { if (id === 'kiryat_motzkin_z2' && i >= 66) return false; if (id === 'kiryat_yam_z1' && i >= 68) r.PM25 = 90; } }));
  ok(R.S.kiryat_yam_z1.S.slice(66).every(x => x === null || x <= 59), 'Yam capped at 59 while 382 is down'); }
{ current = 'station 517 (benzene only)';
  const k = { id: 'kishon_mobile5', shortName: 'קישון', group: 'krayot', metrics: { C6H6: { hourly: 1.2, daily: 0.9 } } };
  ['env', 'target'].forEach(mode => { const g = G.computeGuidance(k, { mode }); ok(g && !dirty(g), `517 guidance clean (${mode})`); ok(!dirty(G.barStatus('PM25', undefined, mode)), '517 missing PM bar clean'); }); }
run('missing Open-Meteo', makeScenario({ noOM: true, mod: (id, i, r) => { r.windSpeed = 0; } }));
run('23 h DST day (IL spring forward)', makeScenario({ start: '2027-03-24T00:00:00Z', hours: 96 }));
run('25 h DST day (IL fall back)', makeScenario({ start: '2026-10-23T00:00:00Z', hours: 96 }));
{ current = 'missing forecast'; const st = stationsFrom(makeScenario())[0];
  const g = G.computeGuidance(st, { mode: 'env', forecast: undefined }); ok(g && g.goodWindow === null && g.trapped === false, 'no forecast -> no window, not trapped'); }

// ---- 250 seeded fuzz runs ----
for (let n = 0; n < 250; n++) {
  const seed = 0x9E3779B9 ^ (n * 2654435761 >>> 0), rnd = mulberry32(seed);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const input = { hours: 48 + Math.floor(rnd() * 48), spikeAt: Math.floor(rnd() * 48), spike: +(rnd() * 120).toFixed(1), ratio: +(0.1 + rnd() * 0.9).toFixed(2), bad: pick(BAD), badEvery: 2 + Math.floor(rnd() * 9), wd: Math.floor(rnd() * 360), drop: pick([null, ...IDS]) };
  const before = fails;
  run(`fuzz seed ${seed >>> 0}`, makeScenario({ hours: input.hours, mod: (id, i, r) => {
    r.windDir = input.wd;
    if (id === input.drop && i > input.hours - 6) return false;
    if (i >= input.spikeAt && i < input.spikeAt + 3 && rnd() < 0.6) { r.PM25 = input.spike; if (r.PM10 != null) r.PM10 = +(input.spike / input.ratio).toFixed(1); }
    if (i % input.badEvery === 0 && rnd() < 0.3) r[pick(['PM25', 'PM10', 'NOX', 'windDir', 'windSpeed'])] = input.bad;
  } }));
  if (fails > before) console.error('  input:', JSON.stringify(input));
}

// ---- v3.5.13: evaluateLive window alignment (no weight / threshold changes) ----
{
  const FX = require('./fire_fixture.js');
  const hist = JSON.parse(JSON.stringify(FX.build()));
  const base = F.compute(hist);
  const lastArch = base.axis[base.axis.length - 1], H = 3600000;
  const iso = ms => new Date(ms + 2 * H).toISOString().slice(0, 19) + '+02:00';
  const win = v => ({ PM25: v, PM10: v * 2, NOX: 10, windDir: 270, windSpeed: 2, n: { PM25: 12 } });
  const doc = (ends, opts = {}) => ({ stations: Object.entries(ends).map(([id, t]) => ({ id, stale: false,
    rolling: { latest: iso(t), hourly: opts.noPm && opts.noPm.includes(id) ? { NOX: 10 } : win(12), prevHourly: win(11) } })) });
  const ids = F.IDS;
  const allAt = t => Object.fromEntries(ids.map(id => [id, t]));
  const ok2 = (c, m) => { if (c) passes++; else { fails++; console.error('FAIL: ' + m); } };
  const strictly = ax => ax.every((t, i) => i === 0 || t > ax[i - 1]);

  // 1) live window that the archive already covers -> no live result, explicit status (no "11:00, 11:00")
  const b1 = F.compute(hist), r1 = F.evaluateLive(b1, doc(allAt(lastArch + H)));
  ok2(r1 === null && b1.liveStatus && b1.liveStatus.mode === 'archive', 'live window inside the archive -> archive status: ' + JSON.stringify(b1.liveStatus && b1.liveStatus.mode));
  // 2) 20 min past the archive's last hour -> ONE new slot, axis strictly increasing, no duplicate hour
  const r2 = F.evaluateLive(F.compute(hist), doc(allAt(lastArch + H + 20 * 60000)));
  ok2(r2 && r2.liveSlots === 1 && strictly(r2.axis) && r2.axis.length === base.axis.length + 1, 'one live slot after the archive, strictly increasing axis');
  // 3) the previous rolling hour is used only when it lies fully after the archive
  const r3 = F.evaluateLive(F.compute(hist), doc(allAt(lastArch + 2 * H + 30 * 60000)));
  ok2(r3 && r3.liveSlots === 2 && strictly(r3.axis), 'two live slots when both windows are new');
  // 4) stations ending at different times are not mixed: majority end wins, the others are flagged
  const mixed = allAt(lastArch + H + 20 * 60000); mixed[ids[0]] = lastArch + H + 10 * 60000;
  const r4 = F.evaluateLive(F.compute(hist), doc(mixed));
  ok2(r4 && r4.liveStatus.included.length === ids.length - 1 && r4.liveStatus.excluded.some(e => e.id === ids[0] && e.reason === 'misaligned'), 'misaligned station excluded and flagged');
  ok2(r4 && r4.S[ids[0]].PM25[r4.axis.length - 1] === null, 'misaligned station has no value in the live slot');
  // 5) fewer than 3 live PM2.5 stations -> explicit partial / archive-fallback flag, never silent
  const r5 = F.evaluateLive(F.compute(hist), doc(allAt(lastArch + H + 20 * 60000), { noPm: ids.slice(0, ids.length - 2) }));
  ok2(r5 && r5.liveStatus && (r5.liveStatus.partial || r5.liveStatus.fallback) && r5.liveStatus.mode !== 'live', 'under 3 live PM2.5 stations is flagged: ' + JSON.stringify(r5 && r5.liveStatus && r5.liveStatus.mode));
  // 6) archive scores are untouched by live evaluation
  ok2(JSON.stringify(r2.S[ids[2]].S.slice(0, base.axis.length)) === JSON.stringify(base.S[ids[2]].S), 'archive hours score the same with or without live');
}

console.log(`sim: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
