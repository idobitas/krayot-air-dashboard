/* "Now" guidance: pure logic (no DOM, no globals except AQStd). Loaded after standards.js, before app.js.
   One answer for the decision card, the station pills and the collapsed pollutant bars, in both modes
   ("תקן חוקי" = env, "יעד בריאותי" = target). Live inputs (detector, forecast, wind risk) come in via ctx. */
(function (root) {
  'use strict';
  const S = root.AQStd || (typeof require === 'function' ? require('./standards.js') : null);
  const isNum = v => v != null && v !== '' && !isNaN(v);

  // worst pollutant in the LAST HOUR relative to its "now" band
  function stationWorst(st, mode) {
    let best = null;
    Object.entries(S.nowBands(mode)).forEach(([k, b]) => {
      const v = (st.metrics || {})[k] ? st.metrics[k].hourly : null;
      if (!isNum(v)) return;
      const r = v / b[0];
      if (!best || r > best.r) best = { key: k, code: k === 'C6H6' ? 'בנזן' : (S.POLLUTANT_STANDARDS[k] || {}).formula || k, value: v, r, lvl: S.nowLevel(mode, k, v) };
    });
    return best;
  }

  // collapsed accordion row + "עכשיו:" badge: same bands and words as the card
  const BAR_WORDS = {
    none: ['אין נתון', 'text-slate-400', 'bg-slate-600'],
    indicative: ['אינדיקטיבי', 'text-slate-300', 'bg-slate-500'],
    2: ['חריגה', 'text-rose-300', 'bg-rose-500'],
    1: ['בינוני', 'text-orange-300', 'bg-orange-400'],
    0: ['תקין', 'text-emerald-300', 'bg-emerald-400']
  };
  function barStatus(key, hourly, mode) {
    const lvl = S.nowLevel(mode, key, hourly);
    const indicative = key === 'C6H6' && !lvl; // benzene: no short-term limit, neutral unless clearly high
    const band = S.nowBands(mode)[key];
    const pct = (lvl == null || !band) ? 0 : Math.round((hourly / band[1]) * 100);
    const w = lvl == null ? BAR_WORDS.none : indicative ? BAR_WORDS.indicative : BAR_WORDS[lvl];
    return { lvl, indicative, pct, width: indicative ? 0 : Math.min(100, pct), word: w[0], txtCls: w[1], barCls: w[2] };
  }

  // 24-h means above WHO (information only, never changes the advice)
  function whoExceedances(stations) {
    const out = [];
    (stations || []).filter(st => st.group === 'krayot').forEach(st => {
      Object.entries(S.DAILY_WHO_VS_LEGAL).forEach(([k, L]) => {
        const m = (st.metrics || {})[k];
        const daily = m ? (m.daily ?? null) : null;
        if (isNum(daily) && daily > L.who) out.push({ label: L.label, station: st.shortName, stationId: st.id, value: +Number(daily).toFixed(1), limit: L.who,
          basis: 'ממוצע 24 שעות', legal: daily > L.legal });
      });
    });
    return out.sort((a, b) => b.value / b.limit - a.value / a.limit);
  }

  // ctx: { mode, sig (station detector result), live (network detector .latest or null), nameOf(id),
  //        who24 (whoExceedances for this station), forecast (hourly wind slots), riskOf(slot) -> {level, score}, now (Date) }
  function computeGuidance(st, ctx = {}) {
    if (!st || !Object.keys(st.metrics || {}).length) return null;
    const mode = ctx.mode;
    const sig = ctx.sig || { level: 'none', isMineralDust: false };
    const v = ctx.live || null, kind = v ? v.kind : 'clear';
    const nameOf = ctx.nameOf || (id => id);
    const forecast = ctx.forecast || [];
    const riskOf = ctx.riskOf || (() => ({ level: 'med', score: 0 }));
    const pm25 = st.metrics?.PM25 ? (st.metrics.PM25.hourly ?? null) : null;
    const c6 = st.metrics?.C6H6 ? (st.metrics.C6H6.hourly ?? null) : null;
    const isDust = !!(sig.isMineralDust || sig.level === 'dust');
    // station level: last-hour bands + this station's live detector
    const worst = stationWorst(st, mode);
    let stationLvl = worst ? worst.lvl : 0;
    if (sig.level === 'high') stationLvl = 2;
    else if (sig.level === 'watch' || isDust) stationLvl = Math.max(stationLvl, 1);
    // card level = the SELECTED station only. Events elsewhere in the network become a separate area note.
    const lvl = stationLvl;
    const smoke = sig.level === 'high' ? 'high' : (sig.level === 'watch' ? 'watch' : null);
    const others = v ? (v.stations || []).filter(x => x.id !== st.id) : [];
    const hiElse = others.filter(x => x.level === 'high').map(x => nameOf(x.id));
    const waElse = others.filter(x => x.level === 'watch').map(x => nameOf(x.id));
    const area = hiElse.length ? '🚨 באזור: סבירות גבוהה לעשן ב' + hiElse.join(', ')
      : waElse.length ? '💨 באזור: ייתכן עשן ב' + waElse.join(', ')
      : (!smoke && !isDust && kind === 'dust') ? '🏜️ באזור: אבק / אובך בכמה תחנות בקריות'
      : (!smoke && kind === 'regional') ? '🌁 באזור: אוויר עומד (משוער) – החלקיקים עולים יחד בכל הקריות'
      : '';
    let because = '';
    if (stationLvl > 0) {
      because = smoke ? `בגלל: ${smoke === 'high' ? '🚨 סבירות גבוהה מאוד לריח חריף' : '💨 ייתכן ריח חריף'} / עשן ב${st.shortName}`
        : isDust ? 'בגלל: אבק / אובך ב' + st.shortName
        : worst.key === 'O3' ? `בגלל: אוזון (ממוצע 8 שעות) ב${st.shortName}`
        : `בגלל: ${S.PLAIN_NAMES[worst.key] || worst.code} (${worst.code}) בשעה האחרונה ב${st.shortName}`;
    }
    // the smoke label itself is the card title, so the reason line doesn't repeat it
    const reason = smoke ? 'סימני עשן בתחנה בשעה האחרונה.'
      : isDust ? 'יש אבק / אובך באוויר (לא עשן שריפה).'
      : lvl > 0 ? 'רמת המזהמים בשעה האחרונה גבוהה.'
      : 'האוויר בשעה האחרונה תקין.';
    const w24 = ctx.who24 || [];
    // WHO 24 h note only when the health target is the active benchmark
    const avg24 = mode === 'target' && w24.length ? 'הממוצע של 24 השעות האחרונות עדיין גבוה: ' +
      w24.slice(0, 2).map(x => `${x.label} ${x.value} µg/m³ (יעד WHO ליממה ${x.limit})`).join(', ') + ' ב' + st.shortName : '';
    let goodWindow = null;
    if (lvl > 0 && forecast.length) {
      // the forecast starts at the hour already running (e.g. 15:00 at 15:40): only recommend future hours
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', hourCycle: 'h23' })
        .formatToParts(ctx.now || new Date()).map(x => [x.type, x.value]));
      const nowKey = `${p.month}${p.day}${p.hour}`;
      const keyOf = x => (x.date || '').slice(3, 5) + (x.date || '').slice(0, 2) + (x.time || '').slice(0, 2);
      goodWindow = forecast.filter(x => keyOf(x) > nowKey || (p.month === '12' && keyOf(x).startsWith('01')))
        .map(x => ({ ...x, risk: riskOf(x) })).find(e => e.risk.level === 'low') || null;
    }
    // trapped air: same rule as the guide tab (next 3 forecast hours mostly weak dispersion)
    const trapped = !!(forecast.length && Math.max(...forecast.slice(0, 3).map(x => riskOf(x).score)) >= 70);
    // gentle note: particles a little above the WHO daily guideline but still in the "fine" band
    const soft = [['PM25', 15, 'PM2.5'], ['PM10', 45, 'PM10']].map(([k, who, code]) => {
      const hv = st.metrics?.[k]?.hourly;
      return isNum(hv) && hv > who && S.nowLevel(mode, k, hv) === 0 ? `${code} ${Number(hv).toFixed(1)} µg/m³` : null;
    }).filter(Boolean);
    const softNote = lvl === 0 && soft.length ? 'מעט מעל יעד WHO בשעה האחרונה: ' + soft.join(', ') : '';
    // light-hearted neighbour wink, only on smoke alerts (🚨 / 💨); titles stay factual
    const wink = smoke ? '🪟 רמז מהאוויר: נראה שזה הזמן לסגור חלונות 😉' : '';
    return { sig, pm25, c6, isDust, kind, worst, stationLvl, lvl, smoke, area, because, reason, avg24, softNote, goodWindow, trapped, wink,
      highRisk: lvl === 2, modRisk: lvl === 1 };
  }

  const api = { stationWorst, barStatus, whoExceedances, computeGuidance };
  root.AQGuidance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
