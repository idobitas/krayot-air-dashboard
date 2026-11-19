/* Fire / smoke detector v2b for the Krayot network.
 * Input: data/history_90d.json "stations" object (hourly rows, timestamps in fixed +02:00).
 * Calibrated on 90 days of history; see docs/fire-detector-analysis.md.
 * Exposes window.FireV2B = { compute, HIGH, WATCH, REGIONAL, STATIONS }.
 */
(function (root) {
  'use strict';

  var HIGH = 70, WATCH = 55, REGIONAL = 8;
  // dashboard id -> role. wind: whose wind to use. ratioFrom: neighbours whose ratio anomaly is averaged (no PM10).
  var STATIONS = {
    kiryat_motzkin_z2: { api: 382, wind: 'kiryat_binyamin' },
    kiryat_yam_z1: { api: 92, ratioFrom: ['kiryat_bialik_z4', 'kiryat_binyamin', 'kiryat_haim_regavim'] },
    kiryat_bialik_z4: { api: 380 },
    kiryat_binyamin: { api: 97 },
    kiryat_haim_regavim: { api: 499 }
  };
  var IDS = Object.keys(STATIONS);
  var W = { lvl: 10, anom: 14, rise: 12, ratio: 16, nox: 10, bz: 10, east: 8, lx: 20 };
  // reference stations (history ids written by scripts/fetch_sviva.py) and Open-Meteo wind series
  var REF_IDS = ['ref_neve_shaanan', 'ref_tivon', 'ref_nesher'], REF_REGIONAL = 5;
  var OM = { kiryat_bialik_z4: 'om_kiryat_bialik_z4', kiryat_haim_regavim: 'om_kiryat_haim_regavim' };
  var STUCK_OM_WS = 2.5, WIND_BACKUP = 'kiryat_binyamin';
  var SINGLE_HOUR_WATCH = 65; // one hour alone >= this -> immediate watch (fire still needs 2h)
  // hard bounds (µg/m³) for the P90 / P99 normalisation scales, and the minimum P99-P90 span
  var BOUNDS = {
    anom: { p90: [8, 16], p99: [20, 35], span: 8 },
    lx: { p90: [3, 10], p99: [10, 25], span: 5 }
  };
  function clampScale(p90, p99, b) {
    var lo = Math.max(b.p90[0], Math.min(b.p90[1], p90 === null ? b.p90[0] : p90));
    var hi = Math.max(b.p99[0], Math.min(b.p99[1], p99 === null ? b.p99[1] : p99));
    return [lo, Math.max(hi, lo + b.span)];
  }

  var hourFmt = null;
  function localHour(ms) {
    try {
      if (!hourFmt) hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' });
      return parseInt(hourFmt.format(new Date(ms)), 10) % 24;
    } catch (e) { return new Date(ms).getHours(); }
  }
  function num(v) { return (v === null || v === undefined || isNaN(v)) ? null : Number(v); }
  function clip01(v) { return v === null ? null : Math.max(0, Math.min(1, v)); }
  function median(a) {
    var b = a.filter(function (x) { return x !== null; }).sort(function (x, y) { return x - y; });
    if (!b.length) return null;
    var m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  function quantile(a, q) { // linear interpolation, like pandas
    var b = a.filter(function (x) { return x !== null; }).sort(function (x, y) { return x - y; });
    if (!b.length) return null;
    var pos = (b.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return b[lo] + (b[hi] - b[lo]) * (pos - lo);
  }
  function mean(a) {
    var b = a.filter(function (x) { return x !== null; });
    return b.length ? b.reduce(function (s, x) { return s + x; }, 0) / b.length : null;
  }
  function win(arr, i, from, to, minN) { // values arr[i-from .. i-to] (from >= to), median if >= minN present
    var v = [];
    for (var j = i - from; j <= i - to; j++) if (j >= 0) v.push(arr[j]);
    return v.filter(function (x) { return x !== null; }).length >= minN ? median(v) : null;
  }

  function compute(histStations) {
    if (!histStations) return null;
    // 1. hourly time axis
    var tset = {};
    IDS.forEach(function (id) {
      ((histStations[id] || {}).rows || []).forEach(function (r) { tset[Date.parse(r.t)] = r.t; });
    });
    var times = Object.keys(tset).map(Number).sort(function (a, b) { return a - b; });
    if (times.length < 48) return null;
    var start = times[0], end = times[times.length - 1];
    var axis = [];
    for (var t = start; t <= end; t += 3600000) axis.push(t);
    var N = axis.length, pos = {};
    axis.forEach(function (t, i) { pos[t] = i; });
    var hours = axis.map(localHour);
    function aligned(hid, key) { // one channel of an auxiliary history series on the Krayot axis
      var a = [];
      for (var i = 0; i < N; i++) a.push(null);
      ((histStations[hid] || {}).rows || []).forEach(function (r) {
        var i = pos[Date.parse(r.t)];
        if (i !== undefined) a[i] = num(r[key]);
      });
      return a;
    }

    // 2. aligned, cleaned channels
    var S = {};
    IDS.forEach(function (id) {
      var ch = { PM25: [], PM10: [], NOX: [], C6H6: [], WD: [], WS: [] };
      Object.keys(ch).forEach(function (k) { for (var i = 0; i < N; i++) ch[k].push(null); });
      ((histStations[id] || {}).rows || []).forEach(function (r) {
        var i = pos[Date.parse(r.t)];
        if (i === undefined) return;
        var pm = num(r.PM25), p10 = num(r.PM10);
        ch.PM25[i] = pm !== null && pm > 0 ? pm : null;   // zeros are sensor gaps
        ch.PM10[i] = p10 !== null && p10 > 0 ? p10 : null;
        ch.NOX[i] = num(r.NOX); ch.C6H6[i] = num(r.C6H6);
        ch.WD[i] = num(r.windDir); ch.WS[i] = num(r.windSpeed);
      });
      // windSpeed == 0 for >= 3 h: with Open-Meteo >= 2.5 m/s it is a stuck sensor (direction taken
      // from 97, else Open-Meteo); below that it is real calm (speed 0, direction undefined).
      // Without Open-Meteo data both are unknown (previous behaviour).
      var omWS = OM[id] ? aligned(OM[id], 'windSpeed') : null;
      ch.omWD = OM[id] ? aligned(OM[id], 'windDir') : null;
      ch.stuck = [];
      var i0 = 0;
      while (i0 < N) {
        var j = i0;
        while (j + 1 < N && ch.WS[j + 1] !== null && ch.WS[j + 1] === ch.WS[i0]) j++;
        if (ch.WS[i0] === 0 && j - i0 + 1 >= 3) for (var k = i0; k <= j; k++) {
          ch.WD[k] = null;
          if (omWS && omWS[k] !== null && omWS[k] >= STUCK_OM_WS) { ch.WS[k] = null; ch.stuck.push(k); }
          else if (!(omWS && omWS[k] !== null)) ch.WS[k] = null;
        }
        i0 = j + 1;
      }
      S[id] = ch;
    });
    IDS.forEach(function (id) {
      var ch = S[id], backup = S[WIND_BACKUP];
      ch.stuck.forEach(function (k) {
        ch.WD[k] = backup.WD[k] !== null ? backup.WD[k] : (ch.omWD ? ch.omWD[k] : null);
      });
    });

    // 3. per-station baselines and anomalies
    IDS.forEach(function (id) {
      var ch = S[id], byHour = [];
      for (var h = 0; h < 24; h++) byHour.push([]);
      for (var i = 0; i < N; i++) if (ch.PM25[i] !== null) byHour[hours[i]].push(ch.PM25[i]);
      var hourMed = byHour.map(median);
      ch.A = ch.PM25.map(function (v, i) { return v === null || hourMed[hours[i]] === null ? null : v - hourMed[hours[i]]; });
      var ratio = ch.PM25.map(function (v, i) { return v !== null && ch.PM10[i] !== null ? v / ch.PM10[i] : null; });
      var rmed = median(ratio);
      ch.ra = ratio.map(function (v) { return v === null || rmed === null ? null : v - rmed; });
    });
    IDS.forEach(function (id) {
      var from = STATIONS[id].ratioFrom;
      if (from) S[id].ra = axis.map(function (_, i) { return mean(from.map(function (n) { return S[n].ra[i]; })); });
    });
    var netmed = axis.map(function (_, i) { return median(IDS.map(function (id) { return S[id].A[i]; })); });
    // reference stations outside the Krayot line (PM2.5 hour-of-day anomaly); refmed needs >= 2 of 3
    var refA = REF_IDS.map(function (rid) {
      var pm = aligned(rid, 'PM25').map(function (v) { return v !== null && v > 0 ? v : null; }), byHour = [];
      for (var h = 0; h < 24; h++) byHour.push([]);
      for (var i = 0; i < N; i++) if (pm[i] !== null) byHour[hours[i]].push(pm[i]);
      var hm = byHour.map(median);
      return pm.map(function (v, i) { return v === null || hm[hours[i]] === null ? null : v - hm[hours[i]]; });
    });
    var refmed = axis.map(function (_, i) {
      var v = refA.map(function (a) { return a[i]; }).filter(function (x) { return x !== null; });
      return v.length >= 2 ? median(v) : null;
    });
    IDS.forEach(function (id) {
      var ch = S[id];
      // local excess vs. the median of the OTHER Krayot stations (never the station itself), so a fire
      // doesn't dilute its own excess. References are not mixed in here: during inversions they rise
      // less than the Krayot and would inflate LX (backtest, variant A); they only gate "regional".
      var others = IDS.filter(function (o) { return o !== id; });
      ch.LX = ch.A.map(function (v, i) {
        if (v === null) return null;
        var base = median(others.map(function (o) { return S[o].A[i]; }));
        return base === null ? null : v - base;
      });
      // P90/P99 scales clamped to physical bounds (µg/m³) so a fire-heavy month can't blind the
      // detector and a very clean month can't amplify noise. Current 90-day values sit inside these.
      var a = clampScale(quantile(ch.A, 0.90), quantile(ch.A, 0.99), BOUNDS.anom);
      var l = clampScale(quantile(ch.LX, 0.90), quantile(ch.LX, 0.99), BOUNDS.lx);
      ch.a90 = a[0]; ch.a99 = a[1]; ch.lx90 = l[0]; ch.lx99 = l[1];
    });

    // 4. raw hourly score
    IDS.forEach(function (id) {
      var ch = S[id], wsrc = S[STATIONS[id].wind || id];
      ch.pm10p90 = quantile(ch.PM10, 0.9);
      ch.T = []; ch.parts = []; ch.flags = [];
      for (var i = 0; i < N; i++) {
        var pm = ch.PM25[i];
        var base = win(ch.PM25, i, 6, 3, 2);
        var noxPrev = win(ch.NOX, i, 3, 1, 2);
        var bzPrev = win(ch.C6H6, i, 6, 1, 3);
        var noxd = ch.NOX[i] !== null && noxPrev ? ch.NOX[i] / noxPrev : null;
        var bzx = ch.C6H6[i] !== null && bzPrev !== null ? ch.C6H6[i] / Math.max(0.2, bzPrev) : null;
        var wd = wsrc.WD[i], h = hours[i];
        var night = h >= 20 || h <= 6;
        var c = {
          lvl: pm === null ? null : clip01((pm - 20) / 20),
          anom: ch.A[i] === null ? null : clip01((ch.A[i] - ch.a90) / (ch.a99 - ch.a90)),
          rise: pm === null || base === null ? null : clip01((pm - base) / 15),
          ratio: ch.ra[i] === null ? null : clip01((ch.ra[i] - 0.05) / 0.2),
          nox: noxd === null ? 0.5 : (noxd <= 1.15 ? 1 : (noxd <= 1.5 ? 0.47 : 0)),
          bz: bzx === null ? 0 : clip01((bzx - 1.5) / 1.5),
          east: wd !== null && wd >= 30 && wd <= 150 && night ? 1 : 0,
          lx: ch.LX[i] === null ? null : clip01((ch.LX[i] - ch.lx90) / (ch.lx99 - ch.lx90))
        };
        var tot = 0, missing = false;
        Object.keys(W).forEach(function (k) { if (c[k] === null) missing = true; else tot += c[k] * W[k]; });
        var prev = i > 0 ? ch.PM25[i - 1] : null;
        var dust = ch.ra[i] !== null && ch.ra[i] <= -0.08;
        var spike = pm !== null && prev ? (pm / prev >= 2.5 && c.bz < 0.3 && (c.ratio === null || c.ratio < 0.3)) : false;
        var floor = pm !== null && pm >= 20;
        var T = missing ? null : ((dust || spike || !floor) ? 0 : tot);
        ch.T.push(T); ch.parts.push(c);
        // dustEvent: low ratio AND elevated PM10 (a real dust/haze episode, not just clean air)
        var dustEvent = dust && ch.PM10[i] !== null && ch.pm10p90 !== null && ch.PM10[i] >= ch.pm10p90;
        ch.flags.push({ dust: dust, dustEvent: dustEvent, spike: spike, east: c.east === 1, bz: c.bz >= 0.3, wd: wd, pm: pm, pm10: ch.PM10[i] });
      }
    });

    // 5. persistence (two consecutive hours) + single-hour watch + Yam cap
    IDS.forEach(function (id) {
      var ch = S[id];
      ch.S = ch.T.map(function (v, i) {
        if (v === null) return null; // a missing hour never inherits the previous score
        // missing previous hour counts as 0: a lone hour can reach watch (via the rule below), never high
        var p = i > 0 && ch.T[i - 1] !== null ? ch.T[i - 1] : 0;
        var s = Math.min(v, p);
        // blind-hour fix: a strong single hour raises watch now, but stays below HIGH until it persists
        if (v >= SINGLE_HOUR_WATCH && s < v) s = Math.max(s, Math.min(v, HIGH - 1));
        return s;
      });
    });
    var yam = S.kiryat_yam_z1, mot = S.kiryat_motzkin_z2;
    yam.S = yam.S.map(function (v, i) {
      return v !== null && (mot.S[i] === null || mot.S[i] < 50) ? Math.min(v, 59) : v; // Motzkin missing -> Yam can't raise fire alone
    });

    // 6. levels + network verdict per hour
    function level(v) { return v === null ? 'none' : (v >= HIGH ? 'high' : (v >= WATCH ? 'watch' : 'none')); }
    var verdicts = axis.map(function (t, i) {
      var st = IDS.map(function (id) { return { id: id, score: S[id].S[i], level: level(S[id].S[i]), flags: S[id].flags[i] }; });
      var hi = st.filter(function (x) { return x.level === 'high'; });
      var wa = st.filter(function (x) { return x.level === 'watch'; });
      var dustSt = IDS.filter(function (id) { return S[id].flags[i].dustEvent; });
      // inversion only when the references rise too (Krayot >= 8 and references >= 5); without
      // reference data for that hour, the Krayot-only rule applies
      var regional = netmed[i] !== null && netmed[i] >= REGIONAL &&
        (refmed[i] === null || refmed[i] >= REF_REGIONAL);
      var kind = hi.length ? 'fire' : (wa.length ? 'smoke' : (dustSt.length >= 2 ? 'dust' : (regional ? 'regional' : 'clear')));
      return { t: t, kind: kind, regional: regional, netmed: netmed[i], stations: st, dustStations: dustSt };
    });

    // latest hour that has a PM2.5 reading in at least 3 stations
    var li = N - 1;
    while (li > 0 && IDS.filter(function (id) { return S[id].PM25[li] !== null; }).length < 3) li--;

    return {
      axis: axis, hours: hours, S: S, netmed: netmed, refmed: refmed, verdicts: verdicts, latestIndex: li, latest: verdicts[li],
      level: level, stationScore: function (id, i) { return S[id] ? S[id].S[i === undefined ? li : i] : null; }
    };
  }

  // merge consecutive flagged hours (gap <= 1h) into episodes for one station or the network
  function episodes(res, id, minLevel) {
    var thr = minLevel === 'high' ? HIGH : WATCH, out = [], cur = null;
    var arr = id ? res.S[id].S : res.axis.map(function (_, i) {
      return Math.max.apply(null, IDS.map(function (s) { return res.S[s].S[i] === null ? -1 : res.S[s].S[i]; }));
    });
    for (var i = 0; i < arr.length; i++) {
      var on = arr[i] !== null && arr[i] >= thr;
      if (on) {
        if (cur && i - cur.end <= 2) { cur.end = i; cur.peak = Math.max(cur.peak, arr[i]); }
        else { cur = { start: i, end: i, peak: arr[i] }; out.push(cur); }
      }
    }
    return out;
  }

  root.FireV2B = { compute: compute, episodes: episodes, HIGH: HIGH, WATCH: WATCH, REGIONAL: REGIONAL, STATIONS: STATIONS, IDS: IDS };
  if (typeof module !== 'undefined') module.exports = root.FireV2B;
})(typeof window !== 'undefined' ? window : globalThis);
