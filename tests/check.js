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

// health mode is never more lenient than legal mode, for every pollutant
Object.keys(S.NOW_BANDS_BY_MODE.env).forEach(k => {
  const t = S.NOW_BANDS_BY_MODE.target[k], e = S.NOW_BANDS_BY_MODE.env[k];
  ok(t && t[0] <= e[0] && t[1] <= e[1], `bands ${k}: target ${t} <= env ${e}`);
});
// O3 (8-h mean): yellow only above WHO 100, red at legal 140 (Motzkin O3 86 stays fine)
MODES.forEach(mode => {
  ok(S.nowLevel(mode, 'O3', 86) === 0 && S.nowLevel(mode, 'O3', 100) === 0, `O3 86/100 fine in ${mode}`);
  ok(S.nowLevel(mode, 'O3', 101) === 1 && S.nowLevel(mode, 'O3', 140) === 2, `O3 101 moderate / 140 high in ${mode}`);
});

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

// 6b. neutral factual wording: status labels, no behavioural advice, disclaimer on every tab
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
['איכות אוויר טובה', 'רמת מזהמים מוגברת', 'רמת זיהום גבוהה', '🌬️ צפוי פיזור טוב יותר החל מ-'].forEach(t =>
  ok(appSrc.includes(t), `decision card uses "${t}"`));
['אפשר לפתוח חלונות', 'עדיף לא לפתוח חלון', 'כדאי לסגור חלונות', 'שעת אוורור מומלצת', '🏃', 'מומלץ לסגור חלונות.'].forEach(t =>
  ok(!appSrc.includes(t), `decision card no longer says "${t}"`));
ok(!/לסגור חלונות|מאמץ בחוץ|מפעילות גופנית בחוץ/.test(appSrc + htmlSrc), 'no window / exercise advice anywhere on the site');
// the only allowed window line is the smoke-alert wink from guidance.js
const WINK = '🪟 רמז מהאוויר: נראה שזה הזמן לסגור חלונות 😉';
ok(G.computeGuidance(station('w', 'בדיקה', hourly({ PM25: 5 })), clearCtx('env')).wink === '', 'no wink on clean air');
ok(G.computeGuidance(station('w', 'בדיקה', hourly({ PM25: 30 })), clearCtx('env')).wink === '', 'no wink on plain moderate PM (no smoke)');
ok(G.computeGuidance(station('w', 'בדיקה', hourly({ PM25: 5 })), { ...clearCtx('env'), live: { kind: 'smoke', stations: [] } }).wink === WINK, 'wink on network 💨');
ok(G.computeGuidance(station('w', 'בדיקה', hourly({ PM25: 5 })), { ...clearCtx('env'), sig: { level: 'high' } }).wink === WINK, 'wink on station 🚨');
ok(G.computeGuidance(station('w', 'בדיקה', hourly({ PM25: 5 })), { ...clearCtx('env'), live: { kind: 'dust', stations: [] } }).wink === '', 'no wink on dust');
const soft = G.computeGuidance(station('s', 'בדיקה', hourly({ PM25: 17 })), clearCtx('env'));
ok(soft.softNote && !/חלונות/.test(soft.softNote), 'soft WHO note carries no window advice');
const footer = htmlSrc.indexOf('<footer'), mainEnd = htmlSrc.indexOf('</main>');
ok(footer > mainEnd && htmlSrc.includes('הבהרה: המידע באתר מבוסס על נתוני ניטור ציבוריים'), 'disclaimer footer sits outside the tabs (all tabs)');

// 6c. report buttons: *6911 = plain tel link; MoEP form = real link in a new tab, honest summary, label resets
ok(appSrc.includes('href="tel:%2A6911"') && !appSrc.includes('call6911'), '*6911 is a plain tel: link');
ok(/<a href="\$\{SVIVA_FORM_URL\}" target="_blank" rel="noopener noreferrer" onclick="copySvivaSummary\(this\)"/.test(appSrc), 'MoEP form opens as <a target=_blank>');
ok(!/window\.open\(SVIVA_FORM_URL/.test(appSrc) && !/location\.href = SVIVA_FORM_URL/.test(appSrc), 'MoEP form never navigates the dashboard away');
ok(/setTimeout\(\(\) => \{ link\.textContent = label; \}, 3000\)/.test(appSrc), 'form button label resets after 3 s');
['לפי דיווח התושב', '(שעה אחרונה)', '(ממוצע יומי)', 'נמדד בקריית אתא'].forEach(t => ok(appSrc.includes(t), `summary labels "${t}"`));
ok(!appSrc.includes('report6911Text') && appSrc.includes('function reportSummaryText()'), 'summary builder renamed to reportSummaryText');

// 6d. SemVer: footer version == README "גרסה נוכחית"
const readmeSrc = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
const vFooter = (htmlSrc.match(/id="appVersion"[^>]*>[^<]*?v(\d+\.\d+\.\d+)</) || [])[1];
const vReadme = (readmeSrc.match(/גרסה נוכחית: v(\d+\.\d+\.\d+)/) || [])[1];
ok(vFooter && vFooter === vReadme, `version in footer (${vFooter}) matches README (${vReadme})`);

// 7. fire_v2b.js invariants (engine frozen: these lock its safety rules on a synthetic fixture)
const FireV2B = require('../js/fire_v2b.js');
const FX = require('./fire_fixture.js');
const R = FireV2B.compute(FX.build());
ok(R && R.S, 'fire_v2b computes on the fixture');
if (R && R.S) {
  const bia = R.S.kiryat_bialik_z4, haim = R.S.kiryat_haim_regavim, yam = R.S.kiryat_yam_z1, mot = R.S.kiryat_motzkin_z2;
  const E = FX.EV;
  ok(bia.S[E.smoke + 1] >= FireV2B.HIGH, `sanity: 2 strong hours reach HIGH (${bia.S[E.smoke + 1]})`);
  // (a) dust kill-switch: a low PM2.5/PM10 ratio zeroes the hour, whatever the other signals
  ok(haim.flags[E.dust].dust && haim.T[E.dust] === 0 && haim.S[E.dust + 1] === 0, 'dust kill-switch: dust hour score = 0');
  FireV2B.IDS.forEach(id => R.S[id].T.forEach((t, i) => {
    if (R.S[id].flags[i].dust && t !== null) ok(t === 0, `dust kill-switch ${id} hour ${i}: ${t}`);
  }));
  // (b) a single strong hour after a missing hour never exceeds 69 (fire needs 2 real hours)
  ok(bia.T[E.afterNull - 1] === null && bia.T[E.afterNull] >= FireV2B.HIGH, 'fixture: strong hour right after a missing hour');
  ok(bia.S[E.afterNull] <= 69, `single hour after null <= 69 (${bia.S[E.afterNull]})`);
  FireV2B.IDS.forEach(id => R.S[id].S.forEach((s, i) => {
    if (i > 0 && R.S[id].T[i - 1] === null && s !== null) ok(s <= 69, `after-null cap ${id} hour ${i}: ${s}`);
  }));
  // (c) Yam (92) can't raise fire on its own: capped at 59 while Motzkin (382) is missing
  ok(mot.S[E.yam + 1] === null && yam.T[E.yam + 1] > 59, 'fixture: Yam strong while Motzkin missing');
  ok(yam.S[E.yam + 1] !== null && yam.S[E.yam + 1] <= 59, `station 92 blocked when 382 missing (${yam.S[E.yam + 1]})`);
  yam.S.forEach((s, i) => { if (mot.S[i] === null && s !== null) ok(s <= 59, `Yam cap hour ${i}: ${s}`); });
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
