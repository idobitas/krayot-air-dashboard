// Synthetic 6-day history for the fire_v2b invariant checks (tests/check.js). Pure, no I/O.
'use strict';
const T0 = Date.parse('2026-11-01T00:00:00+02:00');
const H = 3600000;
const iso = ms => new Date(ms + 2 * H).toISOString().slice(0, 19) + '+02:00';
const IDS = ['kiryat_motzkin_z2', 'kiryat_yam_z1', 'kiryat_bialik_z4', 'kiryat_binyamin', 'kiryat_haim_regavim'];
const HAS_BZ = { kiryat_motzkin_z2: true, kiryat_binyamin: true };
const HOURS = 6 * 24;
// event hours (index = hours since 01/11 00:00, local +02:00); all at night with east wind
const EV = {
  smoke: 3 * 24 + 22,     // bialik 380: 2 strong hours (sanity: reaches HIGH) ...
  dust: 3 * 24 + 22,      // ... haim 499: same hours, but coarse dust (PM2.5/PM10 ≈ 0.15)
  afterNull: 4 * 24 + 23, // bialik 380: missing hour, then one strong hour
  yam: 5 * 24 + 1         // yam 92: 2 strong hours while Motzkin 382 has no rows
};

function build() {
  const st = {};
  IDS.forEach((id, k) => {
    const rows = [];
    for (let i = 0; i < HOURS; i++) {
      const wobble = Math.sin((i + k * 5) / 3) * 1.5;
      let pm = 10 + wobble, p10 = 25 + wobble * 2, bz = 0.5;
      const strong = { PM25: 60, PM10: 75 };
      if (id === 'kiryat_bialik_z4' && (i === EV.smoke || i === EV.smoke + 1)) ({ PM25: pm, PM10: p10 } = strong);
      if (id === 'kiryat_haim_regavim' && (i === EV.dust || i === EV.dust + 1)) { pm = 60; p10 = 400; }
      if (id === 'kiryat_bialik_z4' && i === EV.afterNull - 1) continue;           // missing hour
      if (id === 'kiryat_bialik_z4' && i === EV.afterNull) ({ PM25: pm, PM10: p10 } = strong);
      if (id === 'kiryat_motzkin_z2' && (i === EV.yam || i === EV.yam + 1)) continue; // 382 missing
      if (id === 'kiryat_yam_z1' && (i === EV.yam || i === EV.yam + 1)) pm = 60;
      const r = { t: iso(T0 + i * H), PM25: +pm.toFixed(1), NOX: 20, windDir: 90, windSpeed: 1.2 };
      if (id !== 'kiryat_yam_z1') r.PM10 = +p10.toFixed(1); // Yam has no PM10 (ratio from neighbours)
      if (HAS_BZ[id]) r.C6H6 = bz;
      rows.push(r);
    }
    st[id] = { rows };
  });
  return st;
}

module.exports = { build, EV };
