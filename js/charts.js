/* Chart rendering (Chart.js). app.js prepares the data and calls these; nothing here reads app state.
   Loaded after chart.js (CDN) and before app.js. Exposes window.AQCharts. */
(function (root) {
  'use strict';
  // axis / grid / legend colours follow the resolved theme (html[data-theme]) at draw time
  const isLight = () => !!(root.document && root.document.documentElement && root.document.documentElement.dataset.theme === 'light');
  const T = () => isLight()
    ? { legend: '#1e293b', tick: '#334155', grid: 'rgba(100,116,139,0.25)', grid2: '#cbd5e1' }
    : { legend: '#cbd5e1', tick: '#94a3b8', grid: 'rgba(51,65,85,0.3)', grid2: '#1e293b' };
  const legend = () => ({ labels: { color: T().legend, font: { family: 'Assistant', size: 11 } } });
  const C = { line: '#38bdf8', fill: 'rgba(56,189,248,0.12)', high: '#ef4444', watch: '#f59e0b', legal: '#a855f7', border: '#0f172a' };

  // one chart per canvas: always destroy whatever is attached before drawing again
  function draw(canvas, config) {
    if (!canvas || typeof root.Chart === 'undefined') return null;
    const old = root.Chart.getChart(canvas); if (old) old.destroy();
    return new root.Chart(canvas, config);
  }
  const flat = (data, color, dash) => ({ data, borderColor: color, borderDash: dash || [], borderWidth: 1.5, pointRadius: 0, fill: false });

  // trend chart (24 h / 30 days / 12 months) of one pollutant against the active limit
  // o: { labels, series, threshold, seriesLabel, thresholdLabel, mode: 'env' | 'target' }
  function renderTrend(canvas, o) {
    const target = o.mode === 'target';
    return draw(canvas, {
      type: 'line',
      data: {
        labels: o.labels,
        datasets: [
          {
            label: o.seriesLabel, data: o.series, borderColor: C.line, backgroundColor: 'rgba(56, 189, 248, 0.16)', fill: true, tension: 0.35,
            pointRadius: o.series.map(v => v > o.threshold ? 5 : 3.5),
            pointBackgroundColor: o.series.map(v => v > o.threshold ? C.high : (v >= o.threshold * 0.8 ? C.watch : C.line)),
            pointBorderColor: C.border
          },
          { ...flat(o.labels.map(() => o.threshold), target ? C.high : C.legal, target ? [] : [6, 4]), label: o.thresholdLabel, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: legend() },
        scales: {
          x: { ticks: { color: T().tick, font: { size: 10 } }, grid: { color: T().grid } },
          y: { beginAtZero: true, ticks: { color: T().tick, font: { size: 10 } }, grid: { color: T().grid } }
        }
      }
    });
  }

  const timelineOptions = extraX => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: legend() },
    scales: {
      x: { ticks: { color: T().tick, maxRotation: 35, font: { size: 10 }, ...(extraX || {}) }, grid: { color: T().grid2 } },
      y: { ticks: { color: T().tick }, grid: { color: T().grid2 } }
    }
  });

  // pasted / sample history scan: PM2.5 with WHO 15 and legal 37.5 lines; rows: [{ dt, pm25, level }]
  function renderHistoryTimeline(canvas, rows) {
    return draw(canvas, {
      type: 'line',
      data: {
        labels: rows.map(r => r.dt),
        datasets: [
          {
            label: 'PM2.5 (µg/m³)', data: rows.map(r => r.pm25), borderColor: C.line, backgroundColor: C.fill, fill: true, tension: 0.25,
            pointRadius: rows.map(r => r.level === 'high' ? 6 : (r.level === 'watch' ? 5 : 2.5)),
            pointBackgroundColor: rows.map(r => r.level === 'high' ? C.high : (r.level === 'watch' ? C.watch : C.line)),
            pointBorderColor: C.border
          },
          { ...flat(rows.map(() => 15), C.high), label: 'יעד בריאותי WHO (15 µg/m³)' },
          { ...flat(rows.map(() => 37.5), C.legal, [6, 4]), label: 'ערך סביבה חוקי (37.5 µg/m³)' }
        ]
      },
      options: timelineOptions()
    });
  }

  // real archive scan (v2b): PM2.5 with dots on smoke hours; o: { labels, pm25, levels: ['high'|'watch'|'none'] }
  function renderV2BScan(canvas, o) {
    return draw(canvas, {
      type: 'line',
      data: {
        labels: o.labels,
        datasets: [{
          label: 'PM2.5 (µg/m³)', data: o.pm25, borderColor: C.line, backgroundColor: C.fill, fill: true, tension: 0.25, spanGaps: true,
          pointRadius: o.levels.map(l => l === 'high' ? 5 : (l === 'watch' ? 4 : 0)),
          pointBackgroundColor: o.levels.map(l => l === 'high' ? C.high : C.watch)
        }]
      },
      options: timelineOptions({ maxTicksLimit: 15 })
    });
  }

  root.AQCharts = { renderTrend, renderHistoryTimeline, renderV2BScan };
})(typeof window !== 'undefined' ? window : globalThis);
