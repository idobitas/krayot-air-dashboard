/* Air-quality standards: pure data + helpers (no DOM). Loaded before app.js; also require()-able by tests.
   All concentrations in µg/m³ unless stated. */
(function (root) {
  'use strict';
  // µg/m³ per ppb at 25 °C. Only these keys may be shown in ppb; particles always stay in µg/m³.
  const GAS_CONVERSION = {
    C6H6: 3.195, CH2O: 1.228, H2S: 1.394, NO2: 1.882, NOX: 1.882, O3: 1.963, SO2: 2.620
  };

  // legal (env) / WHO-health (target) limits per averaging window + row labels
  const POLLUTANT_STANDARDS = {
    C6H6: { name: 'בנזן', formula: 'C₆H₆', isGas: true, hEnv: 12.0, hTarget: 3.9, dEnv: 3.9, dTarget: 3.9, mEnv: 1.3, mTarget: 1.3, noHourlyStd: true, hLabel: 'אינדיקטיבי – אין תקן שעתי', dLabel: 'תקן יממתי: 3.9', mLabel: 'תקן שנתי/חודשי: 1.3' },
    PM25: { name: 'חלקיקים עדינים', formula: 'PM2.5', isGas: false, hEnv: 37.5, hTarget: 15.0, dEnv: 37.5, dTarget: 15.0, mEnv: 25.0, mTarget: 5.0, noHourlyStd: true, hLabel: 'אינדיקטיבי – אין תקן שעתי', dLabel: 'תקן יממתי: 37.5 (יעד WHO: 15)', mLabel: 'תקן שנתי: 25 (יעד WHO: 5)' },
    PM10: { name: 'חלקיקים נשימים', formula: 'PM10', isGas: false, hEnv: 130.0, hTarget: 45.0, dEnv: 130.0, dTarget: 45.0, mEnv: 50.0, mTarget: 15.0, noHourlyStd: true, hLabel: 'אינדיקטיבי – אין תקן שעתי', dLabel: 'תקן יממתי: 130 (יעד WHO: 45)', mLabel: 'תקן שנתי: 50 (יעד WHO: 15)' },
    NO2:  { name: 'חנקן דו-חמצני', formula: 'NO₂', isGas: true, hEnv: 200.0, hTarget: 200.0, dEnv: 80.0, dTarget: 25.0, mEnv: 40.0, mTarget: 10.0, hLabel: 'תקן שעתי: 200', dLabel: 'יעד יממתי WHO: 25', mLabel: 'תקן שנתי: 40 (יעד WHO: 10)' },
    O3:   { name: 'אוזון', formula: 'O₃', isGas: true, hEnv: 140.0, hTarget: 100.0, dEnv: 140.0, dTarget: 100.0, mEnv: 100.0, mTarget: 60.0, hLabel: 'ממוצע 8 שעות אחרונות • תקן 140 (יעד WHO 100)', dLabel: 'שיא ממוצע 8 שעות ביממה', mLabel: 'ממוצע (יעד עונת שיא: 60)' },
    SO2:  { name: 'גופרית דו-חמצנית', formula: 'SO₂', isGas: true, hEnv: 350.0, hTarget: 125.0, dEnv: 50.0, dTarget: 40.0, mEnv: 20.0, mTarget: 20.0, hLabel: 'תקן שעתי: 350', dLabel: 'תקן יממתי: 50 (יעד: 40)', mLabel: 'תקן שנתי: 20' },
    CH2O: { name: 'פורמאלדהיד', formula: 'CH₂O', isGas: true, hEnv: 15.0, hTarget: 10.0, dEnv: 3.3, dTarget: 0.8, mEnv: 3.3, mTarget: 0.8, hLabel: 'תקן שעתי: 15', dLabel: 'יעד יממתי: 0.8', mLabel: 'תקן שנתי: 3.3 (יעד 0.8)' },
    H2S:  { name: 'מימן גופרי (ריח)', formula: 'H₂S', isGas: true, hEnv: 45.0, hTarget: 7.0, dEnv: 15.0, dTarget: 7.0, mEnv: 1.0, mTarget: 1.0, hLabel: 'סביבה ח"ש: 45 (יעד 7)', dLabel: 'תקן יממתי: 15', mLabel: 'יעד שנתי: 1.0' },
    BaP:  { name: 'בנזו-א-פירן', formula: 'BaP', isGas: false, hEnv: 0.001, hTarget: 0.00011, dEnv: 0.001, dTarget: 0.00011, mEnv: 0.001, mTarget: 0.00011, hLabel: 'הערכה שעתית', dLabel: 'יעד יממתי: 0.00011', mLabel: 'סביבה שנתי: 0.001' }
  };

  // plain-language names shown next to the professional ones (never instead of them)
  const PLAIN_NAMES = { PM25: 'חלקיקים עדינים/עשן', PM10: 'אבק וחלקיקים', NO2: 'גזי פליטה', C6H6: 'חומר מסרטן', SO2: 'גז תעשייתי', O3: 'אוזון קרקעי' };

  // 24-h means: WHO 2021 guideline vs. Israeli legal limit (used for the "24 h still high" note)
  const DAILY_WHO_VS_LEGAL = { PM25: { label: 'PM2.5', who: 15, legal: 37.5 }, PM10: { label: 'PM10', who: 45, legal: 130 }, NO2: { label: 'NO₂', who: 25, legal: 80 } };

  // "Now" bands for the last hour (O3: 8-h mean): [moderate-from (exclusive), high-from (inclusive)].
  // env  = "תקן חוקי": MoEP index yellow band = 50%–100% of the legal limit (PM2.5 18.6–37.4,
  //        PM10 66–129, NO2 >100, SO2 >175), red at the legal limit. O3 (8-h mean) turns yellow only
  //        above the WHO guideline (100) in both modes, red at the legal limit (140).
  // target = "יעד בריאותי": same, but particles turn yellow at the WHO 2021 guideline (PM2.5 >15, PM10 >45).
  // Benzene has no short-term limit: 2 / 5 are indicative thresholds only.
  const NOW_BANDS_BY_MODE = {
    env:    { PM25: [18.5, 37.5], PM10: [65, 130], NO2: [100, 200], O3: [100, 140], SO2: [175, 350], C6H6: [2, 5] },
    target: { PM25: [15, 37.5],   PM10: [45, 130], NO2: [100, 200], O3: [100, 140], SO2: [175, 350], C6H6: [2, 5] }
  };

  const modeKey = mode => (mode === 'target' ? 'target' : 'env');
  const isNum = v => v != null && v !== '' && Number.isFinite(Number(v)); // NaN / ±Infinity are not values
  function nowBands(mode) { return NOW_BANDS_BY_MODE[modeKey(mode)]; }
  // 0 fine, 1 moderate (yellow/orange), 2 high (red); null when there is no band or no value
  function nowLevel(mode, key, v) {
    const b = nowBands(mode)[key];
    if (!b || !isNum(v)) return null;
    return v >= b[1] ? 2 : (v > b[0] ? 1 : 0);
  }
  const isPpbCapable = key => !!GAS_CONVERSION[key];
  // value for display; ppb only for gases with a conversion factor
  function formatGas(ugVal, key, unitMode, decimals = 2) {
    if (!isNum(ugVal)) return '—';
    if (unitMode !== 'ppb' || !isPpbCapable(key)) return Number(ugVal).toFixed(decimals);
    return (Number(ugVal) / GAS_CONVERSION[key]).toFixed(decimals);
  }
  function unitLabel(key, unitMode) { return unitMode === 'ppb' && isPpbCapable(key) ? 'ppb' : 'µg/m³'; }
  // limits written inside a row label ("תקן יממתי: 80 (יעד WHO: 25)") follow the unit, gases only
  // limit(key, 'h'|'d'|'m', 'env'|'target'): the one place app.js reads numeric limits from
  function limit(key, tf, mode) {
    const s = POLLUTANT_STANDARDS[key]; if (!s) return null;
    const v = s[tf + (mode === 'target' ? 'Target' : 'Env')];
    return Number.isFinite(v) ? v : null;
  }

  function convertLabel(label, key, unitMode) {
    if (!label || unitMode !== 'ppb' || !isPpbCapable(key)) return label;
    return label.replace(/((?:תקן|יעד|סביבה)[^\d()•]*?)(\d+(?:\.\d+)?)/g, (_, pre, num) => pre + formatGas(parseFloat(num), key, unitMode, 1) + ' ppb');
  }

  const api = { GAS_CONVERSION, POLLUTANT_STANDARDS, PLAIN_NAMES, DAILY_WHO_VS_LEGAL, NOW_BANDS_BY_MODE,
    nowBands, nowLevel, isPpbCapable, formatGas, unitLabel, convertLabel, limit };
  root.AQStd = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
