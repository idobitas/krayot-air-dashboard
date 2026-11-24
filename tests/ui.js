// Headless UI check at 390px (Playwright Chromium). Run: node tests/ui.js
// Serves the repo locally, visits all 3 tabs in both benchmark modes and asserts:
// no console/page errors, no horizontal overflow / clipped / overlapping controls,
// LTR isolation of units & formulas, no banned text on the default view.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..'), SHOTS = path.join(__dirname, 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error('FAIL: ' + msg); } };

// runs inside the page: layout + RTL + banned-text audit of the visible tab
function audit({ banned }) {
  const issues = { overflow: null, clipped: [], overlap: [], rtl: [], nested: [], small: [], contrast: [], banned: [] };
  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw) issues.overflow = `${document.documentElement.scrollWidth} > ${vw}`;
  // Chrome keeps boxes for content of a CLOSED <details>; anything outside its <summary> is not visible
  const inClosedDetails = el => { for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { if (!d.open && !d.querySelector(':scope > summary')?.contains(el)) return true; } return false; };
  const visible = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.offsetParent !== null && !inClosedDetails(el); };
  const fixedish = el => { for (let e = el; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const inHScroll = el => { for (let e = el.parentElement; e; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth) return true; } return false; };
  const label = el => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const panel = document.querySelector('.tab-panel:not(.hidden)');
  const controls = [...document.querySelectorAll('button, a[href], summary, .rounded-full')].filter(el => visible(el) && !fixedish(el) && (panel ? panel.contains(el) || el.closest('#decisionCard') : true));
  controls.forEach(el => {
    const r = el.getBoundingClientRect();
    const truncated = el.closest('.truncate') || el.querySelector('.truncate');
    if (!truncated && el.scrollWidth > el.clientWidth + 1) issues.clipped.push(`${label(el)} (content ${el.scrollWidth} > box ${el.clientWidth})`);
    if (!inHScroll(el) && (r.right > vw + 1 || r.left < -1)) issues.clipped.push(`${label(el)} (off-screen ${Math.round(r.left)}..${Math.round(r.right)})`);
  });
  const boxes = controls.filter(el => el.matches('button, a[href], summary') && !inHScroll(el)).map(el => ({ el, r: el.getBoundingClientRect() }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 2 && h > 2) issues.overlap.push(`"${label(a.el)}" × "${label(b.el)}"`);
  }
  // RTL: units / formulas in dynamic station content must sit inside dir="ltr" or <bdi>
  const TOKEN = /PM2\.5|µg\/m³|NO₂|O₃|\bppb\b|WHO|IARC|\d°|m\/s/;
  ['#decisionCard', '#stationPillsStrip', '#stationInspectorCard', '#pollutantCardsGrid', '#stationAdvanced', '#trendChartSummary', '#paramCardsGrid'].forEach(sel => {
    const root = document.querySelector(sel); if (!root || !visible(root)) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!TOKEN.test(n.nodeValue) || !n.parentElement || !visible(n.parentElement)) continue;
      if (!n.parentElement.closest('bdi, [dir="ltr"]')) issues.rtl.push(`${sel}: "${n.nodeValue.trim().slice(0, 50)}"`);
    }
  });
  // no nested parentheses in a standards sub-note, e.g. "(תקן: 37.5 (יעד WHO: 15))"
  document.querySelectorAll('#pollutantCardsGrid span').forEach(el => { if (visible(el) && /\([^()]*\(/.test(el.textContent)) issues.nested.push(label(el)); });
  // touch targets: every visible button / summary in header, card and tab is >= 40px tall (the ⚙️ also wide)
  [document.querySelector('header'), document.getElementById('decisionCard'), panel].filter(Boolean).forEach(root => root.querySelectorAll('button, summary').forEach(el => {
    if (!visible(el)) return; const r = el.getBoundingClientRect();
    if (r.height < 39.5 || r.width < 39.5) issues.small.push(`${label(el) || el.id} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }));
  // WCAG AA text contrast (4.5:1, 3:1 for large text) incl. inherited opacity
  const rgb = c => (c.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number);
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mix = (t, b) => { const a = t[3] == null ? 1 : t[3]; return [0, 1, 2].map(i => t[i] * a + b[i] * (1 - a)); };
  const bgOf = el => { const st = []; for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 4 && c[3] === 0) continue; st.push(c); if (c.length === 3 || c[3] === 1) break; }
    let base = rgb(getComputedStyle(document.body).backgroundColor).slice(0, 3); for (let i = st.length - 1; i >= 0; i--) base = mix(st[i], base); return base; };
  [document.querySelector('header'), document.getElementById('decisionCard'), panel, document.querySelector('footer')].filter(Boolean).forEach(root => root.querySelectorAll('*').forEach(el => {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()) || !visible(el)) return;
    const cs = getComputedStyle(el), bg = bgOf(el); let fg = rgb(cs.color); if (fg.length === 4) fg = mix(fg, bg);
    let op = 1; for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity); if (op < 1) fg = mix([...fg, op], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), need = (size >= 24 || (parseInt(cs.fontWeight) >= 700 && size >= 18.66)) ? 3 : 4.5;
    if (ratio < need) issues.contrast.push(`${label(el)} ${ratio.toFixed(2)}`);
  }));
  const text = document.body.innerText;
  banned.forEach(b => { if (text.includes(b)) issues.banned.push(b); });
  return issues;
}

// runs inside the page: readable + consistent font sizes on the visible tab (footer excluded)
function fontAudit() {
  const out = { small: [], big: [], mismatch: [] };
  const inClosed = el => { for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { if (!d.open && !d.querySelector(':scope > summary')?.contains(el)) return true; } return false; };
  const shown = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.offsetParent !== null && !inClosed(el); };
  const fs = el => parseFloat(getComputedStyle(el).fontSize);
  const label = el => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const panel = document.querySelector('.tab-panel:not(.hidden)');
  const scope = [document.querySelector('header'), document.getElementById('decisionCard'), panel].filter(Boolean);
  const texty = el => [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
  const STRICT = '.station-pill, #stationInspectorCard, button, a[href].rounded-full, #pollutantCardsGrid summary';
  scope.forEach(root => root.querySelectorAll('*').forEach(el => {
    if (!texty(el) || !shown(el) || el.closest('footer, script, style, svg, canvas')) return;
    const f = fs(el);
    if (f < 12) out.small.push(`${label(el)} (${f}px)`);
    else if (el.closest(STRICT) && f < 13) out.big.push(`${label(el)} (${f}px)`);
  }));
  // consistency between siblings of the same kind
  const same = (name, els) => { const v = [...new Set(els.filter(shown).map(fs))]; if (v.length > 1) out.mismatch.push(`${name}: ${v.join(' / ')}px`); };
  same('station buttons (name)', [...document.querySelectorAll('.station-pill')].map(p => p.querySelector('.font-extrabold')).filter(Boolean));
  same('accordion row titles', [...document.querySelectorAll('#pollutantCardsGrid > details > summary > span:first-child > span:first-child')]);
  same('accordion row status', [...document.querySelectorAll('#pollutantCardsGrid > details > summary > span:nth-child(2)')]);
  same('report buttons', [...document.querySelectorAll('#decisionCard .mt-2 > .flex > a, #decisionCard .mt-2 > .flex > button')]);
  if (panel) same('section headers', [...panel.querySelectorAll('h2')].filter(h => !h.closest('#stationInspectorCard')));
  return out;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })).newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('.station-pill').length > 0 && !/טוען/.test(document.getElementById('decisionCard').textContent), null, { timeout: 30000 });

  // open accordion rows survive mode / unit toggles, without a scroll jump
  await page.evaluate(() => { const d = document.querySelector('#pollutantCardsGrid details[data-pol]'); d.open = true; d.scrollIntoView({ block: 'center' }); });
  const keep = await page.evaluate(async () => {
    const key = document.querySelector('#pollutantCardsGrid details[data-pol][open]').dataset.pol, out = {};
    const row = () => document.querySelector(`#pollutantCardsGrid details[data-pol="${key}"]`);
    const top0 = row().getBoundingClientRect().top, shift = () => Math.round(Math.abs(row().getBoundingClientRect().top - top0));
    document.getElementById('btnBenchTarget').click(); out.mode = !!row()?.open; out.dyMode = shift();
    document.getElementById('btnUnitPpb').click(); out.unit = !!row()?.open; out.dyUnit = shift();
    document.getElementById('btnUnitUg').click(); document.getElementById('btnBenchEnv').click(); out.back = !!row()?.open; out.dyBack = shift();
    return out;
  });
  ok(keep.mode && keep.unit && keep.back, `open row stays open across mode/unit toggles (${JSON.stringify(keep)})`);
  ok(keep.dyMode < 2 && keep.dyUnit < 2 && keep.dyBack < 2, `open row does not move on screen (${keep.dyMode}/${keep.dyUnit}/${keep.dyBack}px)`);
  await page.evaluate(() => { document.querySelectorAll('#pollutantCardsGrid details[open]').forEach(d => d.open = false); window.scrollTo(0, 0); });

  // at the top of the page the toggles never drift the page down (with or without an open row)
  const top = await page.evaluate(async () => {
    const out = {}, tick = () => new Promise(r => requestAnimationFrame(() => r()));
    const run = async () => { const ys = []; for (const id of ['btnBenchTarget', 'btnUnitPpb', 'btnUnitUg', 'btnBenchEnv']) { document.getElementById(id).click(); await tick(); ys.push(Math.round(window.scrollY)); } return ys; };
    window.scrollTo(0, 0); await tick(); out.closed = await run();
    document.querySelector('#pollutantCardsGrid details[data-pol]').open = true; window.scrollTo(0, 0); await tick(); out.open = await run();
    document.querySelectorAll('#pollutantCardsGrid details[open]').forEach(d => d.open = false);
    const y = 400; window.scrollTo(0, y); await tick(); out.scrolledNoRow = await run(); out.y = y;
    window.scrollTo(0, 0);
    return out;
  });
  ok(top.closed.every(v => v === 0) && top.open.every(v => v === 0), `toggles at the top keep scrollY 0 (${JSON.stringify(top)})`);
  ok(top.scrolledNoRow.every(v => Math.abs(v - top.y) <= 1), `toggles with no open row keep scrollY (${top.scrolledNoRow})`);

  // Now tab: no smoke jump button (the "מגמות ואירועים" tab covers it); explanation stays in "מקרא סימונים" (🚨)
  const smoke = await page.evaluate(() => {
    const p = document.getElementById('pirateFireIntelPanel'), ex = document.querySelector('details .smoke-explainer');
    const nowTab = document.querySelector('.tab-panel:not(.hidden)');
    return { empty: !p || (p.innerHTML.trim() === '' && p.classList.contains('hidden')),
      jump: [...(nowTab ? nowTab.querySelectorAll('button') : [])].some(x => x.textContent.includes('מתי היו סימני עשן')),
      ex: !!ex && ex.textContent.startsWith('🚨'), fire: /🔥 שריפות גזם/.test(document.body.innerHTML) };
  });
  ok(smoke.empty && !smoke.jump, `Now tab has no smoke jump button (${JSON.stringify(smoke)})`);
  ok(smoke.ex && !smoke.fire, 'smoke explanation sits in the legend with 🚨');
  // expanded pollutant rows: no inner header / "עכשיו:" pill; PM hourly row names the daily threshold; 💡 tips = 3 short lines
  const acc = await page.evaluate(() => {
    const out = { pills: document.querySelectorAll('#pollutantCardsGrid .now-badge').length, inner: [], pm: {}, tips: {} };
    const st = STATIONS_DATA.find(o => o.id === APP_STATE.selectedStationId), mode0 = APP_STATE.benchmarkMode;
    document.querySelectorAll('#pollutantCardsGrid details[data-pol]').forEach(d => {
      const name = d.querySelector(':scope > summary .font-extrabold').textContent.trim();
      const body = [...d.children].filter(x => x.tagName !== 'SUMMARY').map(x => x.textContent).join(' ');
      const hdr = [...d.querySelectorAll(':scope > div span.font-extrabold')].some(x => x.textContent.trim() === name);
      if (hdr || body.includes('עכשיו:')) out.inner.push(d.dataset.pol);
      const tip = d.querySelector('details[data-pol-tip] .tip-lines');
      if (tip) out.tips[d.dataset.pol] = [...tip.querySelectorAll('p')].map(p => p.textContent.replace(/\s+/g, ' ').trim());
    });
    // force a last-hour value so the check never depends on a live sensor gap
    const kept = {}; ['PM25', 'PM10'].forEach(k => { if (st.metrics[k]) { kept[k] = st.metrics[k].hourly; st.metrics[k].hourly = 20; } });
    for (const mode of ['env', 'target']) {
      APP_STATE.benchmarkMode = mode; renderMatrix();
      ['PM25', 'PM10'].forEach(k => { const d = document.querySelector(`#pollutantCardsGrid details[data-pol="${k}"]`); if (d) out.pm[mode + k] = d.textContent.replace(/\s+/g, ' '); });
    }
    Object.entries(kept).forEach(([k, v]) => { st.metrics[k].hourly = v; });
    APP_STATE.benchmarkMode = mode0; renderMatrix();
    return out;
  });
  ok(acc.pills === 0 && !acc.inner.length, `no inner header or "עכשיו:" pill in expanded rows (${acc.pills} / ${acc.inner})`);
  const pmOk = (txt, lim) => !txt || (txt.includes('שעה אחרונה') && txt.includes('ללא תקן שעתי • מושווה לסף יממתי: ' + lim));
  ok(pmOk(acc.pm.envPM25, 37.5) && pmOk(acc.pm.targetPM25, 15) && pmOk(acc.pm.envPM10, 130) && pmOk(acc.pm.targetPM10, 45), 'PM hourly row shows the active daily threshold');
  const tipKeys = Object.keys(acc.tips);
  ok(tipKeys.length > 0 && tipKeys.every(k => acc.tips[k].length === 3 && acc.tips[k][0].startsWith('🏭 מה זה ומאיפה:') && acc.tips[k][1].startsWith('📈 מתי עולה אצלנו:') && /^📏 מדרגות הייחוס: .*(תקן חוקי|יעד WHO)/.test(acc.tips[k][2])),
    `💡 tips are 3 lines (${JSON.stringify(acc.tips).slice(0, 300)})`);
  ok(!acc.tips.PM25 || acc.tips.PM25[2] === '📏 מדרגות הייחוס: יעד WHO: 15 (שנתי 5) • תקן חוקי: 37.5 (שנתי 25)', 'PM2.5 reference line: ' + (acc.tips.PM25 || [])[2]);

  // formula pill in every collapsed accordion header; no "אינוורסיה" on the page text
  const pill = await page.evaluate(() => { const rows = [...document.querySelectorAll('#pollutantCardsGrid > details > summary')];
    return { rows: rows.length, pills: rows.filter(r => { const p = r.querySelector('.formula-pill'); return p && getComputedStyle(p).borderTopWidth !== '0px' && p.textContent.trim(); }).length,
      inv: /אינוורסי|אינברסי/.test(document.body.innerText) }; });
  ok(pill.rows > 0 && pill.pills === pill.rows, `formula pill in each accordion header (${pill.pills}/${pill.rows})`);
  ok(!pill.inv, 'no "אינוורסיה" in visible text');

  // lagging / missing data: last-reading time only where data is missing; never on live readings
  const lag = await page.evaluate(() => {
    const st = STATIONS_DATA.find(o => o.id === APP_STATE.selectedStationId), out = {};
    if (!st.metrics.PM25) return null;
    const keep = { h: st.metrics.PM25.hourly, hist: st.history24h, stale: st.stale, live: st.live };
    const t0 = '2026-11-24T14:30:00+02:00';
    st.history24h = [{ t: '2026-11-24T14:00:00+02:00', PM25: 5 }, { t: t0, PM25: 4 }, { t: '2026-11-24T15:00:00+02:00' }];
    st.metrics.PM25.hourly = null; renderMatrix();
    const row = document.querySelector('#pollutantCardsGrid details[data-pol="PM25"]');
    out.head = row.querySelector(':scope > summary').textContent.replace(/\s+/g, ' ');
    out.body = row.textContent.replace(/\s+/g, ' ');
    out.fmt = fmtLastAt(t0); out.ltr = row.querySelectorAll('bdi[dir="ltr"]').length;
    out.font = Math.min(...[...row.querySelectorAll('.last-at')].map(e => parseFloat(getComputedStyle(e).fontSize)));
    st.metrics.PM25.hourly = 12; renderMatrix();
    out.liveClean = !document.querySelector('#pollutantCardsGrid details[data-pol="PM25"] > summary .last-at');
    st.stale = true; st.live = Object.assign({}, st.live, { measuredAt: t0 }); renderMatrix();
    out.pill = (document.querySelector(`.station-pill[data-station-id="${st.id}"] .stale-at`) || {}).textContent;
    Object.assign(st.metrics.PM25, { hourly: keep.h }); st.history24h = keep.hist; st.stale = keep.stale; st.live = keep.live; renderMatrix();
    return out;
  });
  ok(!lag || (lag.head.includes('(אחרון: ' + lag.fmt + ')') && lag.body.includes('אין נתון (אחרון: ' + lag.fmt + ')') && lag.ltr >= 2 && lag.font >= 12),
    `missing last hour shows the last reading time (${JSON.stringify(lag)})`);
  ok(!lag || lag.liveClean, 'no timestamp on a live reading');
  ok(!lag || lag.pill === 'נתון מ-' + lag.fmt, `stale station pill shows "נתון מ-" (${lag && lag.pill})`);

  // one "last hour": card / buttons / MOEP summary read rolling.hourly, same as the detector
  const roll = await page.evaluate(() => { const bad = []; let n = 0;
    STATIONS_DATA.forEach(st => { const h = st.live && st.live.rolling && st.live.rolling.hourly; if (!h) return;
      Object.keys(st.metrics || {}).forEach(k => { if (k === 'O3' || h[k] == null || !Number.isFinite(Number(h[k]))) return; n++; if (Number(st.metrics[k].hourly) !== Number(h[k])) bad.push(`${st.id}/${k} ${st.metrics[k].hourly}≠${h[k]}`); }); });
    return { n, bad }; });
  ok(roll.n > 0 && !roll.bad.length, `metrics.hourly follows rolling.hourly (${roll.n} values) → ${roll.bad.slice(0, 4).join(' | ')}`);
  // a cached wind forecast must not re-render the card (transient state survives)
  const late = await page.evaluate(async () => {
    const card = document.getElementById('decisionCard'), marker = card.firstElementChild; marker.dataset.uiMark = '1';
    const before = window.__windFcRenders || 0;
    await fetchWindForecast(); await fetchWindForecast(); await new Promise(r => setTimeout(r, 300));
    return { kept: card.firstElementChild === marker && marker.dataset.uiMark === '1', renders: (window.__windFcRenders || 0) - before };
  });
  ok(late.kept && late.renders === 0, `cached forecast keeps the card as is (${JSON.stringify(late)})`);

  // default view: banned strings
  const d = await page.evaluate(audit, { banned: ['NaN', 'undefined', 'HBUA', 'py-air-sviva-api', 'סף חשד'] });
  ok(!d.banned.length, 'default view free of banned text: ' + d.banned.join(', '));

  fs.mkdirSync(SHOTS, { recursive: true });
  for (const mode of ['env', 'target']) {
    await page.click(mode === 'env' ? '#btnBenchEnv' : '#btnBenchTarget');
    for (const tab of ['matrix', 'trends', 'guide']) {
      const navBtn = page.locator(`nav[aria-label="ניווט מובייל"] [data-tab="${tab}"]`);
      if (await navBtn.count()) await navBtn.first().click(); else await page.evaluate(t => switchTab(t), tab);
      await page.waitForTimeout(600);
      const where = `${mode}/${tab}`;
      const r = await page.evaluate(audit, { banned: [] });
      ok(!r.overflow, `${where}: no horizontal overflow ${r.overflow || ''}`);
      ok(!r.clipped.length, `${where}: no clipped controls → ${r.clipped.slice(0, 6).join(' | ')}`);
      ok(!r.overlap.length, `${where}: no overlapping controls → ${r.overlap.slice(0, 6).join(' | ')}`);
      ok(!r.rtl.length, `${where}: units/formulas LTR-isolated → ${r.rtl.slice(0, 8).join(' | ')}`);
      ok(!r.nested.length, `${where}: no nested parentheses → ${r.nested.slice(0, 4).join(' | ')}`);
      ok(!r.small.length, `${where}: touch targets >= 40px → ${r.small.slice(0, 8).join(' | ')}`);
      ok(!r.contrast.length, `${where}: text contrast >= AA → ${r.contrast.slice(0, 8).join(' | ')}`);
      { const c = await page.evaluate(() => { const a = document.getElementById('contactLink'), r = a && a.getBoundingClientRect(), cap = document.querySelector('#decisionCard .smell-caption'), smell = [...document.querySelectorAll('#decisionCard a')].find(x => x.textContent.includes('יומן ריח קהילתי'));
        return { ok: !!a && r.height >= 40 && r.width > 0 && getComputedStyle(a).display !== 'none' && a.target === '_blank' && /noopener/.test(a.rel) && /noreferrer/.test(a.rel) && a.href === 'https://forms.gle/xFaUqyk5zSPzRLgy9',
          cap: !!cap && !!smell && cap.getBoundingClientRect().bottom <= smell.getBoundingClientRect().top + 1 && cap.textContent.includes('לא עובר לרשויות'), h: r && Math.round(r.height) }; });
        ok(c.ok, `${where}: footer "צור קשר" link visible, >= 40px, new tab, noopener (${c.h}px)`);
        ok(c.cap, `${where}: smell-log caption sits above the community log button`); }
      const f = await page.evaluate(fontAudit);
      ok(!f.small.length, `${where}: text >= 12px → ${f.small.slice(0, 8).join(' | ')}`);
      ok(!f.big.length, `${where}: cards/buttons/accordion labels >= 13px → ${f.big.slice(0, 8).join(' | ')}`);
      ok(!f.mismatch.length, `${where}: consistent font sizes → ${f.mismatch.join(' | ')}`);
      if (r.overflow || r.clipped.length || r.overlap.length || r.rtl.length) await page.screenshot({ path: path.join(SHOTS, `${mode}-${tab}.png`), fullPage: true });
    }
  }
  // ---- light theme pass: phone in light mode -> "auto" resolves to the daylight palette ----
  const lctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: 'light' });
  const lp = await lctx.newPage();
  lp.on('console', m => { if (m.type() === 'error') errors.push('light console: ' + m.text()); });
  lp.on('pageerror', e => errors.push('light pageerror: ' + e.message));
  await lp.goto(base, { waitUntil: 'networkidle' });
  await lp.waitForFunction(() => document.querySelectorAll('.station-pill').length > 0, null, { timeout: 30000 });
  const lum = await lp.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return { theme: document.documentElement.dataset.theme, pref: document.documentElement.dataset.themePref, bg: (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 };
  });
  ok(lum.pref === 'auto' && lum.theme === 'light', `auto follows the phone (light) → ${lum.pref}/${lum.theme}`);
  ok(lum.bg > 0.85, `light background (luminance ${lum.bg.toFixed(2)})`);
  for (const tab of ['matrix', 'trends', 'guide']) {
    const navBtn = lp.locator(`nav[aria-label="ניווט מובייל"] [data-tab="${tab}"]`);
    if (await navBtn.count()) await navBtn.first().click(); else await lp.evaluate(t => switchTab(t), tab);
    await lp.waitForTimeout(600);
    const r = await lp.evaluate(audit, { banned: [] });
    ok(!r.overflow, `light/${tab}: no horizontal overflow ${r.overflow || ''}`);
    ok(!r.clipped.length, `light/${tab}: no clipped controls → ${r.clipped.slice(0, 6).join(' | ')}`);
    ok(!r.overlap.length, `light/${tab}: no overlapping controls → ${r.overlap.slice(0, 6).join(' | ')}`);
    ok(!r.rtl.length, `light/${tab}: units/formulas LTR-isolated → ${r.rtl.slice(0, 8).join(' | ')}`);
    ok(!r.nested.length, `${'light/' + tab}: no nested parentheses → ${r.nested.slice(0, 4).join(' | ')}`);
    ok(!r.small.length, `${'light/' + tab}: touch targets >= 40px → ${r.small.slice(0, 8).join(' | ')}`);
    ok(!r.contrast.length, `${'light/' + tab}: text contrast >= AA → ${r.contrast.slice(0, 8).join(' | ')}`);
    { const c = await lp.evaluate(() => { const a = document.getElementById('contactLink'), r = a && a.getBoundingClientRect(), cap = document.querySelector('#decisionCard .smell-caption'), smell = [...document.querySelectorAll('#decisionCard a')].find(x => x.textContent.includes('יומן ריח קהילתי'));
        return { ok: !!a && r.height >= 40 && r.width > 0 && getComputedStyle(a).display !== 'none' && a.target === '_blank' && /noopener/.test(a.rel) && /noreferrer/.test(a.rel) && a.href === 'https://forms.gle/xFaUqyk5zSPzRLgy9',
          cap: !!cap && !!smell && cap.getBoundingClientRect().bottom <= smell.getBoundingClientRect().top + 1 && cap.textContent.includes('לא עובר לרשויות'), h: r && Math.round(r.height) }; });
      ok(c.ok, `${'light/' + tab}: footer "צור קשר" link visible, >= 40px, new tab, noopener (${c.h}px)`);
      ok(c.cap, `${'light/' + tab}: smell-log caption sits above the community log button`); }
    if (r.overflow || r.clipped.length || r.overlap.length) await lp.screenshot({ path: path.join(SHOTS, `light-${tab}.png`), fullPage: true });
  }
  // ⚙️ closes on an outside tap; unit buttons fill the row like the theme buttons
  await lp.click('details[data-gear] > summary');
  const fill = await lp.evaluate(() => { const row = document.getElementById('btnUnitUg').parentElement, a = document.getElementById('btnUnitUg').getBoundingClientRect(), b = document.getElementById('btnUnitPpb').getBoundingClientRect(); return (a.width + b.width) / (row.clientWidth - 4); });
  ok(fill > 0.95, `unit buttons fill their row (${fill.toFixed(2)})`);
  await lp.mouse.click(200, 600);
  ok(await lp.evaluate(() => !document.querySelector('details[data-gear]').open), '⚙️ closes on a tap outside');
  // manual choice wins over the phone and survives a reload
  await lp.click('details[data-gear] > summary');
  await lp.click('[data-theme-choice="dark"]');
  await lp.reload({ waitUntil: 'networkidle' });
  ok(await lp.evaluate(() => document.documentElement.dataset.theme === 'dark' && localStorage.getItem('krayot.theme') === 'dark'), 'manual "לילה" persists over a light phone');
  await lp.click('details[data-gear] > summary');
  await lp.click('[data-theme-choice="auto"]');
  ok(await lp.evaluate(() => document.documentElement.dataset.theme === 'light'), 'back to auto -> light again');
  await lctx.close();

  // ?dev=1 JSON import: imported text is shown as text, never parsed as HTML
  { const dctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
    const dp = await dctx.newPage();
    await dp.goto(base + '?dev=1', { waitUntil: 'networkidle' });
    await dp.waitForFunction(() => document.querySelectorAll('.station-pill').length > 0, null, { timeout: 30000 });
    const x = await dp.evaluate(async () => {
      const bad = '<img src=x onerror="window.__xss=1">';
      document.getElementById('jsonImportTextarea').value = JSON.stringify({ name: bad, shortName: bad, code: bad, location: bad, sensors: { 'PM2.5_ugm3': 12 } });
      document.getElementById('btnParseJson').click();
      await new Promise(r => setTimeout(r, 800));
      const st = STATIONS_DATA.find(o => o.id === APP_STATE.selectedStationId);
      return { xss: !!window.__xss, img: !!document.querySelector('img[src="x"]'), escaped: /&lt;img/.test(st.shortName), status: document.getElementById('jsonImportStatus').textContent };
    });
    ok(!x.xss && !x.img && x.escaped, `dev JSON import escapes imported text (${JSON.stringify(x)})`);
    await dctx.close(); }

  ok(!errors.length, 'zero console/page errors → ' + errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log(`ui: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
