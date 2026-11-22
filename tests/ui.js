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
  const issues = { overflow: null, clipped: [], overlap: [], rtl: [], banned: [] };
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
  const TOKEN = /PM2\.5|µg\/m³|NO₂|O₃|\bppb\b/;
  ['#decisionCard', '#stationPillsStrip', '#stationInspectorCard', '#pollutantCardsGrid', '#stationAdvanced'].forEach(sel => {
    const root = document.querySelector(sel); if (!root || !visible(root)) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!TOKEN.test(n.nodeValue) || !n.parentElement || !visible(n.parentElement)) continue;
      if (!n.parentElement.closest('bdi, [dir="ltr"]')) issues.rtl.push(`${sel}: "${n.nodeValue.trim().slice(0, 50)}"`);
    }
  });
  const text = document.body.innerText;
  banned.forEach(b => { if (text.includes(b)) issues.banned.push(b); });
  return issues;
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

  ok(!errors.length, 'zero console/page errors → ' + errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log(`ui: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
