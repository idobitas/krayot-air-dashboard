/* Main dashboard script (moved out of index.html; load order: after fire_v2b.js in <head>). */
    // =========================================================================
    // 1. STATE & CONSTANTS
    // =========================================================================
    // developer tools (scanner, uploads, raw codes, calculators) only with ?dev=1
    const DEV_MODE = new URLSearchParams(location.search).get('dev') === '1';
    document.documentElement.classList.toggle('dev', DEV_MODE);
    const APP_STATE = {
      activeTab: 'matrix',
      benchmarkMode: 'env', // 'env' or 'target'
      unitMode: 'ug',       // 'ug' or 'ppb'
      selectedStationId: (() => { try { return localStorage.getItem('krayot.station') || 'kiryat_motzkin_z2'; } catch (e) { return 'kiryat_motzkin_z2'; } })(),
      paramCategory: 'live',
      paramSearch: '',
      aqiInputs: { PM25: 24.4, PM10: 34.5, O3: 36.1, SO2: 0.8, NO2: 2.4, NOX: 38.0, CO: 0.3 }
    };


    // standards + "now" logic live in js/standards.js and js/guidance.js (pure, unit-tested in tests/check.js)
    const { GAS_CONVERSION, POLLUTANT_STANDARDS, PLAIN_NAMES } = window.AQStd;

    // Intuitive explanations shown directly inside each pollutant card on mobile & desktop
    const INTUITIVE_GUIDE = {
      C6H6: {
        short: 'גז מסרטן ודאי (לוקמיה) מדלקים ובז"ן',
        simple: 'חומר כימי נדיף שמגיע מבתי הזיקוק (בז"ן), חוות המכלים (תש"ן) ורכבים. אין לו ריח חזק ברמות נמוכות, אבל חשיפה אליו פוגעת במח העצם ומעלה סיכון לסרטן הדם.',
        action: 'מעל 3.9 µg/m³ (יממתי): חריגה מתקן הסביבה. ריכוזים גבוהים נמדדים בעיקר כשהרוח מגיעה מכיוון המפרץ.'
      },
      PM25: {
        short: 'אבק זעיר שחודר עמוק לריאות ולדם',
        simple: 'חלקיקים מיקרוסקופיים (קטנים פי 30 משערה) מפליטות דיזל, ארובות ואובך. בגלל גודלם הם לא נעצרים באף אלא נכנסים לריאות ולמחזור הדם.',
        action: 'מעל 15 (יעד WHO 2021 יומי; שנתי 5) / 37.5 (תקן יומי): רגישים ואסתמטיים צריכים להפחית מאמץ גופני בחוץ.'
      },
      PM10: {
        short: 'אבק נשימתי מאובך, רסס ים וכבישים',
        simple: 'חלקיקי אבק גסים יותר (עד 10 מיקרון) שמגיעים מסופות חול, מלח מהים התיכון ושחיקת כבישים. גורמים לגירוי בגרון, שיעול והחמרת אסתמה.',
        action: 'מעל 45 (יעד WHO 2021 יומי; שנתי 15) / 130 (תקן יומי): יום אובך – מומלץ להפעיל מזגן במצב סירקולציה פנימית.'
      },
      CH2O: {
        short: 'גז מגרה ומסרטן מפליטות ושמש',
        simple: 'גז חריף שגורם לצריבה בעיניים ובגרון, ונפלט מתעשייה או נוצר באוויר מפירוק של גזים אחרים בשמש. בישראל הוחמר התקן השעתי שלו ל-15 µg/m³.',
        action: 'מעל 0.8 (יעד יומי) / 15 (תקן שעתי): אוורור מופחת בשעות הצהריים החמות.'
      },
      NO2: {
        short: 'גז חום-אדמדם ממנועי רכבים ואוטובוסים',
        simple: 'המדד הכי מדויק לזיהום מתחבורה (כביש 4, עכו-חיפה, משאיות דיזל). גורם לדלקות בסימפונות ומחמיר התקפי אסתמה בילדים.',
        action: 'מעל 40 (שנתי) / 200 (שעתי): להימנע מהליכה או ריצה צמוד לצירים ראשיים בשעות העומס.'
      },
      O3: {
        short: 'אוזון בגובה הקרקע – "כוויה" לריאות בשמש',
        simple: 'נוצר רק כשיש שמש חזקה שמבשלת גזי פליטה. הוא צורב את רקמת הריאה כמו כווייה קלה ומקשה על נשימה עמוקה, במיוחד אחה"צ.',
        action: 'מעל 100 (יעד) / 140 (תקן 8-שעתי): להעביר פעילות ספורטיבית לשעות הבוקר המוקדמות או הערב.'
      },
      SO2: {
        short: 'גז צורב משריפת דלקים גופריתיים במפרץ',
        simple: 'נפלט משריפת מזוט ודלקים כבדים בתעשייה ובאוניות. גורם להתכווצות מהירה של דרכי הנשימה אצל חולי אסתמה.',
        action: 'מעל 40 (יעד WHO 2021 יומי; שנתי 20) / 50 (תקן יומי) / 350 (שעתי): להישאר במבנה סגור בזמן גל ריח.'
      },
      H2S: {
        short: 'גז "ביצים סרוחות" ממפעלים וביוב',
        simple: 'הגורם המרכזי למפגעי ריח חריפים בקריות ובנשר. גם בריכוז נמוך הוא גורם לכאבי ראש, בחילות ותחושת חנק.',
        action: 'מעל 7 (יעד חצי-שעתי) / 15 (תקן יומי): לדווח למוקד איגוד ערים (*6911 / envihaifa).'
      },
      BaP: {
        short: 'חומר מסרטן שנדבק לחלקיקי פיח ודיזל',
        simple: 'נפלט ממנועי דיזל כבדים, שריפות ומפעלים ונצמד לאבק שאנחנו נושמים. מוגדר כמסרטן ודאי לאדם.',
        action: 'כל עלייה מעל 0.00011 µg/m³ היא חריגה מערך היעד הבריאותי.'
      }
    };

    // Stations Data enriched with Hourly (שעתי), Daily (יומי), and Monthly (חודשי) metrics
    const STATIONS_DATA = [
      {
        id: 'kiryat_motzkin_z2',
        name: 'קריית מוצקין (תחנת Z2)',
        shortName: 'קריית מוצקין',
        code: 'HBUA-Z2',
        group: 'krayot',
        location: 'קריית מוצקין (32°50′21″N, 35°04′59″E)',
        type: 'מגורים עירונית',
        owner: 'איגוד ערים מפרץ חיפה (envihaifa.net)',
        status: 'exceed_target',
        statusText: 'תקין חוקית • חריגה מיעד בריאותי (חלקיקים)',
        aqiIndex: 47,
        wind: 'בוקר: 270° | אחה"צ: חגה ל-315° צפ\'-מע\' | תורן 19 מ\'',
        c6h6_max24h: 1.65, c6h6_exceedDays: 0, c6h6_annual: 0.38,
        ch2o_max1h: 8.8, ch2o_exceed1h: 0, ch2o_max24h: 2.3,
        bap_exceedDays: 2, bap_annual: 0.00008,
        h2s_max24h: 1.15, h2s_annual: 0.40,
        no2_annual: 17.9, nox_max24h: 126.0, nox_exceed30m: 0,
        pm25_annual: 15.9, pm25_max24h: 33.5,
        pm10_annual: 36.2, pm10_max24h: 92.0,
        o3_annual: 69.0, so2_max24h: 14.0, so2_annual: 2.1,
        metrics: {
          C6H6: { hourly: 2.1, daily: 1.65, monthly: 0.45 },
          PM25: { hourly: 20.2, daily: 33.5, monthly: 16.5 },
          PM10: { hourly: 45.0, daily: 92.0, monthly: 37.0 },
          NO2:  { hourly: 33.0, daily: 22.8, monthly: 18.2 },
          O3:   { hourly: 91.0, daily: 76.0, monthly: 69.0 },
          SO2:  { hourly: 16.5, daily: 14.0, monthly: 2.3 },
          CH2O: { hourly: 8.8, daily: 2.3, monthly: 1.2 },
          H2S:  { hourly: 2.8, daily: 1.15, monthly: 0.42 },
          BaP:  { hourly: 0.00012, daily: 0.00011, monthly: 0.00008 }
        },
        metals_meteo: 'גובה 10 מ\' ASL, תורן 19 מ\' | אי-יציבות קונבקטיבית טובה ביום',
        notes: 'תחנת קריית מוצקין (Z2) מודדת רוח וטורבולנציה בגובה 19 מ\'. בשעות 14:00–22:00 הרוח חגה ל-315°, וביום קיים ערבול אנכי טוב שמפזר מזהמים, אך החלקיקים העדינים (PM2.5) עדיין חורגים מערך היעד של ארגון הבריאות העולמי.'
      },
      {
        id: 'kiryat_yam_z1',
        name: 'קריית ים / צפון הקריות',
        shortName: 'קריית ים',
        code: 'HBUA-Z1',
        group: 'krayot',
        location: 'צפון הקריות / קריית ים (32°51′08″N, 35°04′46″E)',
        type: 'מגורים חופית',
        owner: 'איגוד ערים מפרץ חיפה (envihaifa.net)',
        status: 'exceed_target',
        statusText: 'תקין חוקית • חריגה מיעד בריאותי (אוזון וחלקיקים)',
        aqiIndex: 53,
        wind: 'גובה 27 מ\' ASL, תורן 12 מ\' | רוח ים מערבית נקייה יחסית',
        c6h6_max24h: 1.35, c6h6_exceedDays: 0, c6h6_annual: 0.32,
        ch2o_max1h: 7.5, ch2o_exceed1h: 0, ch2o_max24h: 2.0,
        bap_exceedDays: 1, bap_annual: 0.00007,
        h2s_max24h: 0.90, h2s_annual: 0.35,
        no2_annual: 15.2, nox_max24h: 105.0, nox_exceed30m: 0,
        pm25_annual: 14.9, pm25_max24h: 31.2,
        pm10_annual: 36.8, pm10_max24h: 89.0,
        o3_annual: 71.0, so2_max24h: 12.0, so2_annual: 1.9,
        metrics: {
          C6H6: { hourly: 1.8, daily: 1.35, monthly: 0.36 },
          PM25: { hourly: 18.0, daily: 31.2, monthly: 15.4 },
          PM10: { hourly: 43.0, daily: 89.0, monthly: 37.5 },
          NO2:  { hourly: 28.0, daily: 19.5, monthly: 15.5 },
          O3:   { hourly: 94.0, daily: 78.0, monthly: 71.0 },
          SO2:  { hourly: 14.0, daily: 12.0, monthly: 2.0 },
          CH2O: { hourly: 7.5, daily: 2.0, monthly: 1.1 },
          H2S:  { hourly: 2.1, daily: 0.90, monthly: 0.35 },
          BaP:  { hourly: 0.00010, daily: 0.00009, monthly: 0.00007 }
        },
        metals_meteo: 'גובה 27 מ\' ASL, תורן 12 מ\' | תחנת צפון הקריות',
        notes: 'תחנת צפון הקריות (Z1): נהנית מרוח ים מערבית ישירה ולכן ריכוזי הבנזן והתחמוצות חנקן בה נמוכים יותר משאר הקריות, אך בשעות אחה"צ נמדדים ערכי אוזון גבוהים וחלקיקי מלח ים ב-PM10.'
      },
      {
        id: 'kiryat_bialik_z4',
        name: 'קריית ביאליק (תחנת Z4)',
        shortName: 'קריית ביאליק',
        code: 'HBUA-Z4',
        group: 'krayot',
        location: 'קריית ביאליק – לב העיר (32°48′52″N, 35°04′42″E)',
        type: 'מגורים עירונית',
        owner: 'איגוד ערים מפרץ חיפה (envihaifa.net)',
        status: 'exceed_target',
        statusText: 'תקין חוקית • חריגה מיעד בריאותי (חלקיקים)',
        aqiIndex: 44,
        wind: 'יום: 270° מערבית (3–6 m/s) | לילה: 112.5° חלשה (0.5–2 m/s)',
        c6h6_max24h: 1.85, c6h6_exceedDays: 0, c6h6_annual: 0.41,
        ch2o_max1h: 9.4, ch2o_exceed1h: 0, ch2o_max24h: 2.6,
        bap_exceedDays: 2, bap_annual: 0.00009,
        h2s_max24h: 1.25, h2s_annual: 0.45,
        no2_annual: 18.8, nox_max24h: 135.0, nox_exceed30m: 0,
        pm25_annual: 16.4, pm25_max24h: 34.8,
        pm10_annual: 37.5, pm10_max24h: 95.0,
        o3_annual: 68.5, so2_max24h: 15.5, so2_annual: 2.4,
        metrics: {
          C6H6: { hourly: 2.4, daily: 1.85, monthly: 0.52 },
          PM25: { hourly: 21.5, daily: 34.8, monthly: 17.8 },
          PM10: { hourly: 48.0, daily: 95.0, monthly: 39.2 },
          NO2:  { hourly: 36.0, daily: 24.5, monthly: 19.4 },
          O3:   { hourly: 88.0, daily: 74.0, monthly: 68.5 },
          SO2:  { hourly: 19.0, daily: 15.5, monthly: 2.8 },
          CH2O: { hourly: 9.4, daily: 2.6, monthly: 1.4 },
          H2S:  { hourly: 3.1, daily: 1.25, monthly: 0.48 },
          BaP:  { hourly: 0.00014, daily: 0.00012, monthly: 0.00009 }
        },
        metals_meteo: 'גובה 4 מ\' ASL, תורן 10 מ\' | רוח 270° ביום, 112.5° בלילה',
        notes: 'תחנת קריית ביאליק (Z4) נמצאת באזור מגורים בעמק זבולון. בשעות היום הרוח המערבית (270°) מביאה אוויר מהים ומאזור המפרץ; בלילה הרוח נחלשת מאוד (0.5–2 m/s), מה שעלול לכלוא מזהמים קרוב לקרקע. ריכוזי החלקיקים PM2.5 ו-PM10 עומדים בחוק אך עוברים את היעד הבריאותי.'
      },
      {
        id: 'kiryat_binyamin',
        name: 'קריית אתא – קריית בנימין',
        shortName: 'קריית אתא (בנימין)',
        code: 'HBUA-KB',
        group: 'krayot',
        location: 'שכונת קריית בנימין, קריית אתא (סמוך לבז"ן)',
        type: 'מגורים סמוך לתעשייה',
        owner: 'איגוד ערים מפרץ חיפה + מנ"א',
        status: 'exceed_env',
        statusText: 'חריגה מתקן חוקי! (בנזן + פורמאלדהיד)',
        aqiIndex: 31,
        wind: 'במורד הרוח המערבית/צפ\'-מע\' ממתחם בז"ן',
        c6h6_max24h: 7.22, c6h6_exceedDays: 3, c6h6_annual: 0.66,
        ch2o_max1h: 15.4, ch2o_exceed1h: 1, ch2o_max24h: 4.5,
        bap_exceedDays: 7, bap_annual: 0.00021,
        h2s_max24h: 2.10, h2s_annual: 0.85,
        no2_annual: 22.0, nox_max24h: 165.0, nox_exceed30m: 0,
        pm25_annual: 16.8, pm25_max24h: 36.0,
        pm10_annual: 38.0, pm10_max24h: 98.0,
        o3_annual: 66.0, so2_max24h: 24.0, so2_annual: 3.9,
        metrics: {
          C6H6: { hourly: 11.4, daily: 7.22, monthly: 0.95 },
          PM25: { hourly: 26.0, daily: 36.0, monthly: 18.2 },
          PM10: { hourly: 54.0, daily: 98.0, monthly: 40.5 },
          NO2:  { hourly: 44.0, daily: 28.0, monthly: 23.0 },
          O3:   { hourly: 85.0, daily: 71.0, monthly: 66.0 },
          SO2:  { hourly: 32.0, daily: 24.0, monthly: 4.2 },
          CH2O: { hourly: 15.4, daily: 4.5, monthly: 2.1 },
          H2S:  { hourly: 7.8, daily: 2.10, monthly: 0.92 },
          BaP:  { hourly: 0.00035, daily: 0.00028, monthly: 0.00021 }
        },
        metals_meteo: '7 חריגות BaP | חריגת H₂S חצי-שעתי (>7 µg/m³)',
        notes: 'שכונת המגורים הקרובה ביותר למתחם בתי הזיקוק במפרץ: נמדד שיא יממתי של 7.22 µg/m³ בבנזן (185% מהתקן החוקי!), 3 ימי עלייה מעל התקן, עלייה שעתית בפורמאלדהיד (15.4 µg/m³), 7 ימי חריגה ביעד של בנזו-א-פירן וחריגת ריח/יעד ב-H₂S.'
      },
      {
        id: 'kiryat_haim_regavim',
        name: 'קריית חיים – רגבים / מתנ"ס',
        shortName: 'קריית חיים',
        code: 'HBUA-KH / Z3',
        group: 'krayot',
        location: 'קריית חיים (32°49′51″N, 35°03′15″E), סמוך לחוות המכלים תש"ן',
        type: 'מגורים סמוך לחוות מכלים',
        owner: 'איגוד ערים מפרץ חיפה (envihaifa.net)',
        status: 'exceed_env',
        statusText: 'חריגה מתקן חוקי! (בנזן + CH₂O + שיא ניקל)',
        aqiIndex: 28,
        wind: 'צמוד לחוות המכלים תש"ן (רוח חופית)',
        c6h6_max24h: 4.46, c6h6_exceedDays: 1, c6h6_annual: 0.60,
        ch2o_max1h: 16.1, ch2o_exceed1h: 2, ch2o_max24h: 4.2,
        bap_exceedDays: 6, bap_annual: 0.00024,
        h2s_max24h: 1.95, h2s_annual: 0.78,
        no2_annual: 24.5, nox_max24h: 180.0, nox_exceed30m: 0,
        pm25_annual: 17.2, pm25_max24h: 37.8,
        pm10_annual: 39.5, pm10_max24h: 110.0,
        o3_annual: 64.0, so2_max24h: 22.0, so2_annual: 3.5,
        metrics: {
          C6H6: { hourly: 7.8, daily: 4.46, monthly: 0.84 },
          PM25: { hourly: 28.5, daily: 37.8, monthly: 18.8 },
          PM10: { hourly: 59.0, daily: 110.0, monthly: 42.0 },
          NO2:  { hourly: 48.0, daily: 31.0, monthly: 25.2 },
          O3:   { hourly: 81.0, daily: 69.0, monthly: 64.0 },
          SO2:  { hourly: 28.0, daily: 22.0, monthly: 3.8 },
          CH2O: { hourly: 16.1, daily: 4.2, monthly: 1.9 },
          H2S:  { hourly: 6.4, daily: 1.95, monthly: 0.82 },
          BaP:  { hourly: 0.00038, daily: 0.00031, monthly: 0.00024 }
        },
        metals_meteo: 'שיא ניקל (Ni) בארץ: 0.022 µg/m³ (110% מיעד EU!)',
        notes: 'שכונה המושפעת מחוות המכלים תש"ן: נמדדו חריגה יממתית בבנזן (4.46 µg/m³ – 114% מהתקן), חריגה קלה מערך הסביבה היממתי של PM2.5 (37.8 מול 37.5), 2 עליות שעתיות בפורמאלדהיד מעל 15 µg/m³, ושיא ארצי בניקל (0.022 µg/m³).'
      },
      {
        id: 'kishon_mobile5',
        name: 'גדר בז"ן / נחל הקישון (ניידת 5 – עוטף קריות)',
        shortName: 'גדר בז"ן / קישון',
        code: 'MOB-5',
        group: 'krayot',
        location: 'אתר השיקום נחל הקישון, צמוד למתחם בז"ן מדרום לקריות',
        type: 'מוקד תעשייה חם (Hotspot)',
        owner: 'המשרד להגנת הסביבה / מנ"א',
        status: 'exceed_env',
        statusText: 'הפרה חוקית! 13 ימי חריגת בנזן (275% מהתקן)',
        aqiIndex: 18,
        wind: 'צמוד למתחם הפטרוכימי (צו סעיף 45)',
        c6h6_max24h: 10.72, c6h6_exceedDays: 13, c6h6_annual: 1.18,
        ch2o_max1h: 15.8, ch2o_exceed1h: 1, ch2o_max24h: 4.8,
        bap_exceedDays: 5, bap_annual: 0.00028,
        h2s_max24h: 2.78, h2s_annual: 1.35,
        no2_annual: 29.0, nox_max24h: 245.0, nox_exceed30m: 0,
        pm25_annual: 18.5, pm25_max24h: 42.0,
        pm10_annual: 41.0, pm10_max24h: 118.0,
        o3_annual: 58.0, so2_max24h: 34.0, so2_annual: 5.8,
        metrics: {
          C6H6: { hourly: 18.5, daily: 10.72, monthly: 1.65 },
          PM25: { hourly: 31.0, daily: 42.0, monthly: 20.1 },
          PM10: { hourly: 68.0, daily: 118.0, monthly: 44.0 },
          NO2:  { hourly: 58.0, daily: 36.0, monthly: 29.5 },
          O3:   { hourly: 72.0, daily: 61.0, monthly: 58.0 },
          SO2:  { hourly: 45.0, daily: 34.0, monthly: 6.4 },
          CH2O: { hourly: 15.8, daily: 4.8, monthly: 2.4 },
          H2S:  { hourly: 9.2, daily: 2.78, monthly: 1.35 },
          BaP:  { hourly: 0.00044, daily: 0.00035, monthly: 0.00028 }
        },
        metals_meteo: '13 יממות חריגה בבנזן (מעל 7 המותרות בחוק) | H₂S שנתי > 1.0',
        notes: 'נקודת הניטור על גדר מתחם בתי הזיקוק (קישון): נרשמו 13 ימי חריגה חוקית בבנזן (שיא 10.72 µg/m³ – פי 2.75 מהתקן!), חריגת PM2.5 יממתי (42.0 מול 37.5), חריגה מערך היעד השנתי של H₂S ו-5 ימי חריגה ב-BaP.'
      },
      {
        id: 'haifa_atzmaut',
        name: 'חיפה – עצמאות (עיר תחתית)',
        shortName: 'חיפה עצמאות',
        code: 'MOEP-ATZ',
        group: 'carmel',
        location: 'דרך העצמאות, חיפה',
        type: 'תחבורתית (Traffic)',
        owner: 'מנ"א',
        status: 'exceed_env',
        statusText: 'חריגה חוקית ב-NO₂ שנתי וב-NOx',
        aqiIndex: 22,
        wind: 'עורק תחבורה ראשי ונמל',
        c6h6_max24h: 3.36, c6h6_exceedDays: 0, c6h6_annual: 0.74,
        ch2o_max1h: 11.2, ch2o_exceed1h: 0, ch2o_max24h: 3.5,
        bap_exceedDays: 4, bap_annual: 0.00015,
        h2s_max24h: 1.40, h2s_annual: 0.55,
        no2_annual: 41.0, nox_max24h: 318.0, nox_exceed30m: 2,
        pm25_annual: 19.4, pm25_max24h: 41.5,
        pm10_annual: 44.0, pm10_max24h: 124.0,
        o3_annual: 46.0, so2_max24h: 28.0, so2_annual: 4.6,
        metrics: {
          C6H6: { hourly: 4.8, daily: 3.36, monthly: 0.85 },
          PM25: { hourly: 33.0, daily: 41.5, monthly: 20.5 },
          PM10: { hourly: 72.0, daily: 124.0, monthly: 46.0 },
          NO2:  { hourly: 115.0, daily: 54.0, monthly: 41.0 },
          O3:   { hourly: 54.0, daily: 49.0, monthly: 46.0 },
          SO2:  { hourly: 36.0, daily: 28.0, monthly: 4.8 },
          CH2O: { hourly: 11.2, daily: 3.5, monthly: 1.8 },
          H2S:  { hourly: 3.5, daily: 1.40, monthly: 0.55 },
          BaP:  { hourly: 0.00025, daily: 0.00019, monthly: 0.00015 }
        },
        metals_meteo: 'בנזן שנתי 0.74 | NO₂ שנתי 41 (חריגה) | 2 חריגות NOx ח"ש (>940)',
        notes: 'תחנה תחבורתית בעיר התחתית חיפה עם חריגה שנתית ב-NO₂ (41 מול תקן 40) ושתי חריגות חצי-שעתיות ב-NOx.'
      },
      {
        id: 'haifa_igud',
        name: 'חיפה – איגוד (צ\'ק פוסט)',
        shortName: 'חיפה איגוד',
        code: 'HBUA-IGD',
        group: 'industrial',
        location: 'צ\'ק פוסט / מפרץ חיפה',
        type: 'תעשייתית / מסחרית',
        owner: 'איגוד ערים מפרץ חיפה',
        status: 'exceed_env',
        statusText: 'עלייה בפורמאלדהיד + H₂S ו-SO₂',
        aqiIndex: 38,
        wind: 'אזור מסחר ותעשייה מפרץ חיפה',
        c6h6_max24h: 1.73, c6h6_exceedDays: 0, c6h6_annual: 0.47,
        ch2o_max1h: 15.2, ch2o_exceed1h: 1, ch2o_max24h: 4.1,
        bap_exceedDays: 4, bap_annual: 0.00014,
        h2s_max24h: 2.30, h2s_annual: 1.15,
        no2_annual: 26.0, nox_max24h: 210.0, nox_exceed30m: 0,
        pm25_annual: 17.5, pm25_max24h: 38.2,
        pm10_annual: 40.2, pm10_max24h: 115.0,
        o3_annual: 62.0, so2_max24h: 29.5, so2_annual: 5.4,
        metrics: {
          C6H6: { hourly: 2.6, daily: 1.73, monthly: 0.55 },
          PM25: { hourly: 27.0, daily: 38.2, monthly: 18.6 },
          PM10: { hourly: 58.0, daily: 115.0, monthly: 41.5 },
          NO2:  { hourly: 51.0, daily: 32.0, monthly: 26.0 },
          O3:   { hourly: 79.0, daily: 66.0, monthly: 62.0 },
          SO2:  { hourly: 38.0, daily: 29.5, monthly: 5.8 },
          CH2O: { hourly: 15.2, daily: 4.1, monthly: 1.9 },
          H2S:  { hourly: 6.8, daily: 2.30, monthly: 1.15 },
          BaP:  { hourly: 0.00024, daily: 0.00018, monthly: 0.00014 }
        },
        metals_meteo: 'SO₂ יממתי 29.5 (>יעד 20) | H₂S שנתי 1.15 (>יעד 1.0)',
        notes: 'תחנת מרכז הבקרה של איגוד ערים בצ\'ק פוסט.'
      },
      {
        id: 'nesher',
        name: 'נשר (מורד הרוח)',
        shortName: 'נשר',
        code: 'HBUA-Z5',
        group: 'carmel',
        location: 'נשר (32°48′43″N, 35°06′47″E)',
        type: 'מגורים במורד הרוח',
        owner: 'איגוד ערים מפרץ חיפה',
        status: 'exceed_env',
        statusText: 'שיא פורמאלדהיד וכספית + אוזון',
        aqiIndex: 34,
        wind: 'גובה 65 מ\' ASL, תורן 20 מ\'',
        c6h6_max24h: 2.15, c6h6_exceedDays: 0, c6h6_annual: 0.42,
        ch2o_max1h: 15.6, ch2o_exceed1h: 1, ch2o_max24h: 9.8,
        bap_exceedDays: 2, bap_annual: 0.00010,
        h2s_max24h: 2.05, h2s_annual: 0.82,
        no2_annual: 19.5, nox_max24h: 140.0, nox_exceed30m: 0,
        pm25_annual: 16.2, pm25_max24h: 35.5,
        pm10_annual: 37.0, pm10_max24h: 105.0,
        o3_annual: 74.0, so2_max24h: 21.0, so2_annual: 3.2,
        metrics: {
          C6H6: { hourly: 3.1, daily: 2.15, monthly: 0.48 },
          PM25: { hourly: 23.0, daily: 35.5, monthly: 17.0 },
          PM10: { hourly: 51.0, daily: 105.0, monthly: 38.5 },
          NO2:  { hourly: 38.0, daily: 24.0, monthly: 19.5 },
          O3:   { hourly: 98.0, daily: 82.0, monthly: 74.0 },
          SO2:  { hourly: 26.0, daily: 21.0, monthly: 3.4 },
          CH2O: { hourly: 15.6, daily: 9.8, monthly: 2.8 },
          H2S:  { hourly: 7.4, daily: 2.05, monthly: 0.85 },
          BaP:  { hourly: 0.00018, daily: 0.00013, monthly: 0.00010 }
        },
        metals_meteo: 'שיא כספית (Hg) בארץ: 0.446 µg/m³ | שיא פורמאלדהיד יומי: 9.8',
        notes: 'תחנת נשר במורד הרוח ממפרץ חיפה: שיא ארצי בכספית (0.446) ושיא חיפאי בפורמאלדהיד יומי.'
      },
      {
        id: 'haifa_neve_shaanan',
        name: 'חיפה – נווה שאנן',
        shortName: 'נווה שאנן',
        code: 'HBUA-C9',
        group: 'carmel',
        location: 'נווה שאנן (32°47′15″N, 35°01′17″E)',
        type: 'מגורים על רכס הכרמל',
        owner: 'איגוד ערים מפרץ חיפה',
        status: 'exceed_env',
        statusText: '2 עליות CH₂O + אוזון גבוה',
        aqiIndex: 39,
        wind: 'גובה 200 מ\' ASL, תורן 28 מ\'',
        c6h6_max24h: 1.95, c6h6_exceedDays: 0, c6h6_annual: 0.39,
        ch2o_max1h: 15.9, ch2o_exceed1h: 2, ch2o_max24h: 4.4,
        bap_exceedDays: 4, bap_annual: 0.00011,
        h2s_max24h: 1.85, h2s_annual: 0.72,
        no2_annual: 18.0, nox_max24h: 128.0, nox_exceed30m: 0,
        pm25_annual: 15.8, pm25_max24h: 34.0,
        pm10_annual: 35.5, pm10_max24h: 96.0,
        o3_annual: 75.5, so2_max24h: 22.5, so2_annual: 3.4,
        metrics: {
          C6H6: { hourly: 2.8, daily: 1.95, monthly: 0.44 },
          PM25: { hourly: 21.0, daily: 34.0, monthly: 16.2 },
          PM10: { hourly: 46.0, daily: 96.0, monthly: 36.5 },
          NO2:  { hourly: 32.0, daily: 22.0, monthly: 18.0 },
          O3:   { hourly: 102.0, daily: 84.0, monthly: 75.5 },
          SO2:  { hourly: 27.0, daily: 22.5, monthly: 3.5 },
          CH2O: { hourly: 15.9, daily: 4.4, monthly: 1.9 },
          H2S:  { hourly: 7.2, daily: 1.85, monthly: 0.72 },
          BaP:  { hourly: 0.00019, daily: 0.00014, monthly: 0.00011 }
        },
        metals_meteo: 'אוזון שנתי > 75 | 2 עליות CH₂O שעתיות',
        notes: 'תחנה על רכס הכרמל המזרחי.'
      },
      {
        id: 'haifa_halisa',
        name: 'חיפה – שכונת חליסה',
        shortName: 'חליסה',
        code: 'HBUA-HLS',
        group: 'carmel',
        location: 'חליסה, חיפה',
        type: 'מגורים עירונית',
        owner: 'איגוד ערים מפרץ חיפה',
        status: 'exceed_env',
        statusText: 'עלייה ב-CH₂O + 5 יממות BaP',
        aqiIndex: 41,
        wind: 'מורדות מזרחיים מול המפרץ',
        c6h6_max24h: 2.25, c6h6_exceedDays: 0, c6h6_annual: 0.45,
        ch2o_max1h: 15.3, ch2o_exceed1h: 1, ch2o_max24h: 4.3,
        bap_exceedDays: 5, bap_annual: 0.00013,
        h2s_max24h: 2.15, h2s_annual: 0.88,
        no2_annual: 23.0, nox_max24h: 172.0, nox_exceed30m: 0,
        pm25_annual: 17.0, pm25_max24h: 36.5,
        pm10_annual: 38.8, pm10_max24h: 104.0,
        o3_annual: 63.0, so2_max24h: 20.5, so2_annual: 3.1,
        metrics: {
          C6H6: { hourly: 3.2, daily: 2.25, monthly: 0.49 },
          PM25: { hourly: 24.5, daily: 36.5, monthly: 17.8 },
          PM10: { hourly: 52.0, daily: 104.0, monthly: 40.0 },
          NO2:  { hourly: 42.0, daily: 27.5, monthly: 23.0 },
          O3:   { hourly: 80.0, daily: 68.0, monthly: 63.0 },
          SO2:  { hourly: 24.0, daily: 20.5, monthly: 3.2 },
          CH2O: { hourly: 15.3, daily: 4.3, monthly: 1.8 },
          H2S:  { hourly: 7.5, daily: 2.15, monthly: 0.88 },
          BaP:  { hourly: 0.00022, daily: 0.00016, monthly: 0.00013 }
        },
        metals_meteo: 'H₂S ח"ש ≥ 7 | 5 יממות BaP > יעד',
        notes: 'שכונת חליסה במורדות המזרחיים של חיפה.'
      },
      {
        id: 'haifa_shprintzak',
        name: 'חיפה – שפרינצק / כרמל מערבי',
        shortName: 'שפרינצק',
        code: 'HBUA-C4',
        group: 'carmel',
        location: 'מערב חיפה (32°47′52″N, 34°58′26″E)',
        type: 'מגורים חופית',
        owner: 'איגוד ערים מפרץ חיפה',
        status: 'exceed_target',
        statusText: 'אוזון גבוה + רסס מלח ים',
        aqiIndex: 55,
        wind: 'חופית – בריזת ים מערבית',
        c6h6_max24h: 1.20, c6h6_exceedDays: 0, c6h6_annual: 0.31,
        ch2o_max1h: 7.2, ch2o_exceed1h: 0, ch2o_max24h: 1.9,
        bap_exceedDays: 1, bap_annual: 0.00007,
        h2s_max24h: 0.85, h2s_annual: 0.30,
        no2_annual: 14.5, nox_max24h: 95.0, nox_exceed30m: 0,
        pm25_annual: 14.8, pm25_max24h: 31.0,
          pm10_annual: 38.0, pm10_max24h: 88.0,
        o3_annual: 76.0, so2_max24h: 11.5, so2_annual: 1.8,
        metrics: {
          C6H6: { hourly: 1.6, daily: 1.20, monthly: 0.32 },
          PM25: { hourly: 17.5, daily: 31.0, monthly: 15.0 },
          PM10: { hourly: 44.0, daily: 88.0, monthly: 38.5 },
          NO2:  { hourly: 26.0, daily: 18.0, monthly: 14.5 },
          O3:   { hourly: 104.0, daily: 85.0, monthly: 76.0 },
          SO2:  { hourly: 13.0, daily: 11.5, monthly: 1.9 },
          CH2O: { hourly: 7.2, daily: 1.9, monthly: 1.0 },
          H2S:  { hourly: 1.9, daily: 0.85, monthly: 0.30 },
          BaP:  { hourly: 0.00009, daily: 0.00008, monthly: 0.00007 }
        },
        metals_meteo: 'אוזון שנתי ~76 | מלח ים ב-PM10',
        notes: 'שכונה חופית במערב חיפה.'
      }
    ];

    // Standards config per pollutant and timeframe (Hourly, Daily, Monthly/Annual)
    // Only stations with a real feed (scripts/fetch_sviva.py) are shown. The 2017 demo values that
    // shipped with the original page are wiped before the first render; every number shown after
    // loadLiveData() comes from live_krayot.json (only pollutants the station actually measures).
    const LIVE_STATION_IDS = ['kiryat_motzkin_z2', 'kiryat_yam_z1', 'kiryat_bialik_z4', 'kiryat_binyamin', 'kiryat_haim_regavim', 'kishon_mobile5'];
    const DEMO_FIELDS = ['c6h6_max24h', 'c6h6_exceedDays', 'c6h6_annual', 'ch2o_max1h', 'ch2o_exceed1h', 'ch2o_max24h', 'bap_exceedDays', 'bap_annual',
      'h2s_max24h', 'h2s_annual', 'no2_annual', 'nox_max24h', 'nox_exceed30m', 'pm25_annual', 'pm25_max24h', 'pm10_annual', 'pm10_max24h', 'o3_annual', 'so2_max24h', 'so2_annual'];
    for (let i = STATIONS_DATA.length - 1; i >= 0; i--) if (!LIVE_STATION_IDS.includes(STATIONS_DATA[i].id)) STATIONS_DATA.splice(i, 1);
    STATIONS_DATA.forEach(st => {
      DEMO_FIELDS.forEach(f => { st[f] = null; });
      st.metrics = {};
      st.status = 'unknown'; st.statusText = 'ממתין לנתוני אמת…'; st.aqiIndex = null;
      st.wind = ''; st.notes = ''; st.metals_meteo = '';
    });

    // summary fields recomputed from real data only (30-day daily means + real 30-day averages)
    function deriveRealSummary(st) {
      const m = st.metrics || {}, days = st.daily30d || [];
      const dmax = k => { const v = days.map(d => d[k]).filter(x => x != null); return v.length ? +Math.max(...v).toFixed(2) : null; };
      const dcount = (k, thr) => days.filter(d => d[k] != null && d[k] > thr).length;
      const mon = k => (m[k] && m[k].monthlyReal) ? m[k].monthly : null;
      if (m.C6H6) { st.c6h6_max24h = dmax('C6H6'); st.c6h6_exceedDays = dcount('C6H6', AQStd.limit('C6H6', 'd', 'env')); st.c6h6_annual = mon('C6H6'); }
      if (m.PM25) { st.pm25_max24h = dmax('PM25'); st.pm25_annual = mon('PM25'); }
      if (m.PM10) { st.pm10_max24h = dmax('PM10'); st.pm10_annual = mon('PM10'); }
      if (m.NO2) st.no2_annual = mon('NO2');
      if (m.O3) st.o3_annual = mon('O3');
      if (m.SO2) { st.so2_max24h = dmax('SO2'); st.so2_annual = mon('SO2'); }
      if (m.H2S) st.h2s_annual = mon('H2S');
      const legal = [], health = [];
      if (st.c6h6_exceedDays > 0) legal.push((st.c6h6_exceedDays === 1 ? 'יום חריגה אחד' : st.c6h6_exceedDays + ' ימי חריגה') + ' בבנזן ב-30 הימים האחרונים');
      if (st.pm25_max24h > AQStd.limit('PM25', 'd', 'env')) legal.push('PM2.5: יממה מעל התקן ב-30 הימים האחרונים');
      if (st.pm10_max24h > AQStd.limit('PM10', 'd', 'env')) legal.push('PM10: יממה מעל התקן ב-30 הימים האחרונים');
      if (st.no2_annual > AQStd.limit('NO2', 'm', 'env')) legal.push('NO₂: ממוצע 30 יום מעל התקן השנתי');
      if (st.pm25_annual > AQStd.limit('PM25', 'm', 'target')) health.push('PM2.5');
      if (st.pm10_annual > AQStd.limit('PM10', 'm', 'target')) health.push('PM10');
      if (st.no2_annual > AQStd.limit('NO2', 'm', 'target')) health.push('NO₂');
      st.status = legal.length ? 'exceed_env' : (health.length ? 'exceed_target' : 'ok');
      st.statusText = (legal.length ? legal.join('; ')
        : (health.length ? 'תקין חוקית • מעל יעד WHO 2021: <bdi dir="ltr">' + health.join(', ') + '</bdi>' : 'תקין (30 יום אחרונים)')) + (st.stale ? ' • נתון ישן' : '');
      const w = st.last30m || {};
      st.wind = (w.windDir != null) ? ('עכשיו ' + Math.round(w.windDir) + '°' + (w.windSpeed != null ? ' • ' + Number(w.windSpeed).toFixed(1) + ' מ/ש' : ''))
        : (st.id === 'kiryat_motzkin_z2' ? 'אין מד רוח בתחנה (הגלאי משתמש ברוח מקריית בנימין)' : 'אין מד רוח בתחנה');
      const measured = Object.keys(m).filter(k => POLLUTANT_STANDARDS[k]).map(k => POLLUTANT_STANDARDS[k].formula);
      // Latin lists wrapped LTR and Hebrew gershayim (no ASCII quotes / "=") so RTL lines wrap cleanly
      st.notes = 'מקור: <bdi dir="ltr">air.sviva.gov.il</bdi><br>נמדד בתחנה: <bdi dir="ltr">' + (measured.join(', ') || '—') + '</bdi><br>״30 יום״ הוא ממוצע אמיתי של 30 הימים האחרונים.';
    }


    // Complete 35 Parameters Encyclopedia (Retained & Enhanced with Intuitive Summary)
    const PARAMETERS_DATA = [
      { id: 'C6H6', nameHe: 'בנזן (מוקד המעקב בקריות)', nameEn: 'Benzene', formula: 'C₆H₆', category: 'voc', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³ / ppb', averaging: 'יממתי ושנתי',
        intuitive: 'גז מסרטן שמגיע מדלקים ובתי זיקוק (בז"ן ותש"ן). כשאין רוח בלילה או כשהרוח באה מהמפרץ, הוא מצטבר בשכונות הקריות.',
        standards: [{ period: 'יממה', target: '3.9 µg/m³', env: '3.9 µg/m³ (עד 7/שנה)', alert: '—' }, { period: 'שנה', target: '1.3 µg/m³', env: '1.3 µg/m³', alert: '—' }],
        whatIsIt: 'ממס אורגני נדיף וחסר צבע המוגדר כמסרטן ודאי לאדם.', sources: 'בתי הזיקוק (בז"ן), חוות המכלים תש"ן בקריית חיים, תחנות דלק ותחבורה.', health: 'גורם ללוקמיה (סרטן הדם) ופגיעה במח העצם.', haifaContext: 'שיאים יממתיים מעל 3.9 נמדדו בגדר בז"ן (10.72), בקריית בנימין (7.22) ובקריית חיים (4.46).' },
      { id: 'PM25', nameHe: 'חלקיקים נשימים עדינים (<2.5 µm)', nameEn: 'Fine Particulate Matter', formula: 'PM2.5', category: 'criteria', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'אבק זעיר כל כך (1/30 מקוטר שערה) שהוא חודר דרך הריאות ישר למחזור הדם. מגיע מרכבי דיזל, תעשייה ואובך.',
        standards: [{ period: 'יממה', target: '15 µg/m³ (WHO 2021)', env: '37.5 µg/m³ (סופות אבק: 18)', alert: '130 µg/m³' }, { period: 'שנה', target: '5 µg/m³ (WHO 2021)', env: '25 µg/m³', alert: '—' }],
        whatIsIt: 'מוצקים וטיפונות מיקרוסקופיות המרחפות באוויר.', sources: 'שריפת דלקים, תחבורה (דיזל), אבק מדברי וזיהום חוצה גבולות.', health: 'מחלות לב וכלי דם, סרטן ריאה, אסתמה ולידה מוקדמת.', haifaContext: 'בקריות הממוצע השנתי סביב 15–17 µg/m³ (מתחת לתקן החוקי 25, אך פי 3 מהיעד הבריאותי של WHO 2021, 5).' },
      { id: 'PM10', nameHe: 'חלקיקים נשימים (<10 µm)', nameEn: 'Respirable Particulate Matter', formula: 'PM10', category: 'criteria', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'אבק נשימתי מאובך מדברי, מלח מהים התיכון ושחיקת צמיגים וכבישים. גורם לשיעול ולגירוי בדרכי הנשימה.',
        standards: [{ period: 'יממה', target: '45 µg/m³ (WHO 2021)', env: '130 µg/m³ (סופות אבק: 18)', alert: '300 µg/m³' }, { period: 'שנה', target: '15 µg/m³ (WHO 2021)', env: '50 µg/m³', alert: '—' }],
        whatIsIt: 'חלקיקים בקוטר קטן מ-10 מיקרון.', sources: 'סופות אבק, רסס ים (~11 µg/m³ במפרץ), בנייה ותחבורה.', health: 'מחלות נשימה, אסתמה וסרטן ריאה.', haifaContext: 'הממוצע בקריות נע סביב 36–40 µg/m³ (עומד בתקן 50 אך יותר מפי 2 מהיעד של WHO 2021, 15).' },
      { id: 'NO2', nameHe: 'חנקן דו-חמצני', nameEn: 'Nitrogen Dioxide', formula: 'NO₂', category: 'criteria', iarc: 'סמן תחבורה ראשי', isCarcinogen: false, unit: 'µg/m³ / ppb', averaging: 'שעתי ושנתי',
        intuitive: 'גז ממנועי מכוניות, אוטובוסים ומשאיות. איפה שיש פקקים (דרך עכו, צ\'ק פוסט, עצמאות) – הוא עולה מיד.',
        standards: [{ period: 'שעה / יממה', target: '200 שעתי | 25 יממתי', env: '200 שעתי (עד 8/שנה)', alert: '400 µg/m³' }, { period: 'שנה', target: '10 µg/m³ (WHO 2021)', env: '40 µg/m³', alert: '—' }],
        whatIsIt: 'גז חום-אדמדם רעיל.', sources: 'תחבורה כבישית, תחנות כוח וכבשנים.', health: 'דלקת בדרכי הנשימה, התקפי אסתמה וסיכון לעובר.', haifaContext: 'בחריגה שנתית בעצמאות חיפה (41 מול 40); בקריות 15–25 µg/m³.' },
      { id: 'O3', nameHe: 'אוזון', nameEn: 'Ozone', formula: 'O₃', category: 'criteria', iarc: 'מחמצן חריף', isCarcinogen: false, unit: 'µg/m³ / ppb', averaging: '8-שעתי',
        intuitive: 'נוצר בשמש חזקה כשקרינה "מבשלת" גזי פליטה. בגובה הקרקע הוא צורב את הריאות כמו כווייה קלה בשעות אחה"צ.',
        standards: [{ period: '8 שעות / עונת שיא', target: '100 (8ש\') | 60 (עונת שיא)', env: '140 µg/m³ (עד 10/שנה)', alert: '240 µg/m³ (שעתי)' }],
        whatIsIt: 'מזהם פוטוכימי שניוני.', sources: 'תגובה כימית בשמש בין NOx ל-VOCs.', health: 'כאבים בחזה, שיעול, ירידה בתפקודי ריאה והחמרת אסתמה.', haifaContext: 'גבוה בקריות הים (ק. ים) ובכרמל/נשר (>70 µg/m³ שנתי).' },
      { id: 'SO2', nameHe: 'גופרית דו-חמצנית', nameEn: 'Sulfur Dioxide', formula: 'SO₂', category: 'criteria', iarc: 'Group 3', isCarcinogen: false, unit: 'µg/m³ / ppb', averaging: 'שעתי, יממתי ושנתי',
        intuitive: 'גז חריף שנפלט משריפת דלקים כבדים ומזוט בארובות ובאוניות. גורם לצריבה והתכווצות סימפונות אצל אסתמטיים.',
        standards: [{ period: 'שעה', target: '500 (10 דק\')', env: '350 µg/m³ (עד 8/שנה)', alert: '500 µg/m³' }, { period: 'יממה / שנה', target: '40 יממתי | 20 שנתי', env: '50 יממתי | 20 שנתי', alert: '—' }],
        whatIsIt: 'גז בעל ריח חריף וצורב.', sources: 'בתי זיקוק, תחנות כוח ואוניות.', health: 'גירוי סימפונות וקוצר נשימה מיידי באסתמה.', haifaContext: 'ירד משמעותית במעבר לגז טבעי, אך עדיין נמדדות יממות מעל 20 µg/m³.' },
      { id: 'NOX', nameHe: 'כלל תחמוצות חנקן', nameEn: 'Nitrogen Oxides', formula: 'NOx', category: 'criteria', iarc: 'מועמד לביטול', isCarcinogen: false, unit: 'µg/m³ / ppb', averaging: 'חצי-שעתי ויממתי',
        intuitive: 'הסכום של NO (שאינו רעיל ישירות) ושל NO₂ (שהוא הרעיל). משמש בעיקר לבקרה על פליטות רכבים וארובות.',
        standards: [{ period: 'חצי שעה', target: '—', env: '940 µg/m³', alert: '—' }, { period: 'יממה', target: '—', env: '560 µg/m³', alert: '—' }],
        whatIsIt: 'תערובת NO ו-NO₂.', sources: 'תחנות כוח (53%), תחבורה (14%), תעשייה (13%).', health: 'ההשפעה הבריאותית מיוחסת ל-NO₂.', haifaContext: 'חריגות חצי-שעתיות בציר עצמאות חיפה.' },
      { id: 'CO', nameHe: 'פחמן חד-חמצני', nameEn: 'Carbon Monoxide', formula: 'CO', category: 'criteria', iarc: 'רעלן המוגלובין', isCarcinogen: false, unit: 'mg/m³ / ppm', averaging: 'חצי-שעתי ו-8-שעתי',
        intuitive: 'גז חסר ריח משריפה לא שלמה שמונע מהדם להוביל חמצן. באוויר הפתוח בקריות הוא נמוך מאוד ולא מהווה בעיה.',
        standards: [{ period: '8 שעות', target: '10 mg/m³', env: '10 mg/m³', alert: '20 mg/m³' }],
        whatIsIt: 'גז רעיל מבעירה חלקית.', sources: 'כלי רכב ותנורים.', health: 'חוסם קשירת חמצן להמוגלובין.', haifaContext: 'נמוך מאוד בכל תחנות המפרץ והקריות.' },
      { id: 'CH2O', nameHe: 'פורמאלדהיד', nameEn: 'Formaldehyde', formula: 'CH₂O', category: 'voc', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³', averaging: 'שעתי, יממתי ושנתי',
        intuitive: 'גז צורב שגורם לדמעות וגירוי בגרון, ונפוץ באזורי תעשייה ובקיץ. כל תחנות הקריות וחיפה עוברות את היעד היומי שלו (0.8).',
        standards: [{ period: 'שעה', target: '—', env: '15 µg/m³', alert: '—' }, { period: 'יממה/שנה', target: '0.8 µg/m³', env: '3.3 µg/m³ (שנתי)', alert: '—' }],
        whatIsIt: 'אלדהיד נדיף ומסרטן ודאי.', sources: 'תעשייה, בעירה ופירוק פוטוכימי בשמש.', health: 'סרטן אף ולוע, גירוי עיניים ודרכי נשימה.', haifaContext: 'עליות שעתיות >15 בקריית חיים, קריית בנימין, נשר ונווה שאנן.' },
      { id: 'H2S', nameHe: 'מימן גופרי (ריח)', nameEn: 'Hydrogen Sulfide', formula: 'H₂S', category: 'voc', iarc: 'מטרד ריח ורעלן', isCarcinogen: false, unit: 'µg/m³', averaging: 'חצי-שעתי, יממתי ושנתי',
        intuitive: 'גז "ביצים סרוחות" – האחראי המרכזי לריחות רעים בלילות בקריות ובנשר. גם בכמות זעירה הוא גורם לכאבי ראש ובחילות.',
        standards: [{ period: 'חצי שעה', target: '7 µg/m³', env: '45 µg/m³', alert: '—' }, { period: 'יממה', target: '—', env: '15 µg/m³', alert: '—' }],
        whatIsIt: 'גז גופריתי מסריח.', sources: 'בתי זיקוק (בז"ן), מכוני טיהור שפכים וביוב.', health: 'כאבי ראש, בחילות וגירוי נשימתי.', haifaContext: 'חריגות מערך היעד השנתי (1.0) בקישון ובצ\'ק פוסט.' },
      { id: 'BaP', nameHe: 'בנזו-א-פירן', nameEn: 'Benzo(a)pyrene', formula: 'BaP', category: 'voc', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'חומר מסרטן חזק שנצמד לפיח של מנועי דיזל וארובות. עומד בחוק, אבל חורג מערך היעד הבריאותי כמעט בכל התחנות.',
        standards: [{ period: 'יממה/שנה', target: '0.00011 µg/m³', env: '0.001 µg/m³ (שנתי)', alert: '—' }],
        whatIsIt: 'פחמימן פוליארומטי (PAH).', sources: 'דיזל, תעשייה כבדה ושריפת גזם.', health: 'סרטן ריאות ופגיעה גנטית.', haifaContext: '7 ימי חריגה בקריית בנימין ו-6 בקריית חיים.' },
      { id: 'C4H6', nameHe: '1,3-בוטאדיאן', nameEn: '1,3-Butadiene', formula: 'C₄H₆', category: 'voc', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'גז מתעשיית הפלסטיק והגומי ורכבים. מוגדר מסרטן ודאי לאדם.',
        standards: [{ period: 'יממה/שנה', target: '0.3 µg/m³', env: '0.3 µg/m³', alert: '—' }],
        whatIsIt: 'גז פטרוכימי נדיף.', sources: 'פטרוכימיה ותחבורה.', health: 'סרטן הדם והלימפה.', haifaContext: 'במפרץ חיפה הממוצעים מתחת לתקן (0.3).' },
      { id: 'C7H8', nameHe: 'טולואן', nameEn: 'Toluene', formula: 'C₇H₈', category: 'voc', iarc: 'Group 3', isCarcinogen: false, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'ממס תעשייתי ממשפחת הבנזן (ריח של טינר/דלק). באוויר בקריות הוא נמוך מאוד מתחת לתקן.',
        standards: [{ period: 'יממה', target: '1,000 µg/m³', env: '1,000 µg/m³', alert: '—' }, { period: 'שנה', target: '260 µg/m³', env: '260 µg/m³', alert: '—' }],
        whatIsIt: 'פחמימן ארומטי נדיף.', sources: 'דלקים, צבעים וכימיה.', health: 'כאבי ראש וסחרחורות בריכוזים גבוהים.', haifaContext: 'נמוך מאוד מתחת לתקן.' },
      { id: 'C8H8', nameHe: 'סטירן', nameEn: 'Styrene', formula: 'C₈H₈', category: 'voc', iarc: 'Group 2A', isCarcinogen: false, unit: 'µg/m³', averaging: 'חצי-שעתי ושנתי',
        intuitive: 'חומר גלם לפלסטיק ושיש סינתטי בעל ריח מתקתק-חריף.',
        standards: [{ period: 'חצי שעה / שנה', target: '70 µg/m³', env: '100 µg/m³ (חצי שעה)', alert: '—' }],
        whatIsIt: 'מונומר אורגני נדיף.', sources: 'תעשיית פלסטיק ופוליסטירן.', health: 'גירוי נשימתי ופגיעה עצבית.', haifaContext: 'תקין בתחנות הניטור.' },
      { id: 'C2Cl4', nameHe: 'טטרהכלורואתילן (PCE)', nameEn: 'Tetrachloroethylene', formula: 'C₂Cl₄', category: 'voc', iarc: 'Group 2A/2B', isCarcinogen: false, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'ממס ניקוי יבש ומתכות. נמדד בריכוזים מזעריים בלבד.',
        standards: [{ period: 'יממה/שנה', target: '63 / 21 µg/m³', env: '21 µg/m³ (שנתי)', alert: '—' }],
        whatIsIt: 'ממס מוכלר.', sources: 'ניקוי יבש ומתכת.', health: 'פגיעה בכבד ובמערכת העצבים.', haifaContext: 'תקין (< 2 µg/m³).' },
      { id: 'C2HCl3', nameHe: 'טריכלורואתילן (TCE)', nameEn: 'Trichloroethylene', formula: 'C₂HCl₃', category: 'voc', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'ממס מתכות מסרטן שהתקן שלו הוחמר פי 500 ל-2 µg/m³. עומד בתקן.',
        standards: [{ period: 'יממה/שנה', target: '2.0 µg/m³', env: '2.0 µg/m³', alert: '—' }],
        whatIsIt: 'ממס תעשייתי הלוגני.', sources: 'מפעלי מתכת וכימיה.', health: 'סרטן כליות וכבד.', haifaContext: 'מתחת ל-0.9 µg/m³.' },
      { id: 'C2H4Cl2', nameHe: '1,2-דיכלורואתאן', nameEn: '1,2-Dichloroethane', formula: 'C₂H₄Cl₂', category: 'voc', iarc: 'Group 2B', isCarcinogen: false, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'חומר גלם לייצור PVC. נמדד מתחת לתקן.',
        standards: [{ period: 'יממה/שנה', target: '1.14 / 0.38 µg/m³', env: '0.38 µg/m³ (שנתי)', alert: '—' }],
        whatIsIt: 'ממס אורגני מוכלר.', sources: 'פטרוכימיה ו-PVC.', health: 'חשוד כמסרטן.', haifaContext: 'מתחת לתקן.' },
      { id: 'CH2Cl2', nameHe: 'דיכלורומתאן', nameEn: 'Dichloromethane', formula: 'CH₂Cl₂', category: 'voc', iarc: 'Group 2A', isCarcinogen: false, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'ממס להסרת צבעים ותרופות. נמוך מאוד.',
        standards: [{ period: 'יממה/שנה', target: '450 µg/m³', env: '450 µg/m³', alert: '—' }],
        whatIsIt: 'ממס נדיף.', sources: 'תרופות וצבעים.', health: 'פגיעה עצבית.', haifaContext: 'תקין.' },
      { id: 'CH3CHO', nameHe: 'אצטאלדהיד ובנזאלדהיד', nameEn: 'Acetaldehyde', formula: 'CH₃CHO', category: 'voc', iarc: 'Group 2B', isCarcinogen: false, unit: 'µg/m³', averaging: 'ייחוס',
        intuitive: 'תוצרי שריפה ופירוק פחמימנים באוויר.',
        standards: [{ period: 'יממה/שנה', target: '5.0 µg/m³ (ייחוס)', env: '—', alert: '—' }],
        whatIsIt: 'אלדהידים.', sources: 'תחבורה ותעשייה.', health: 'גירוי עיניים ודרכי נשימה.', haifaContext: 'מתחת לערך הייחוס בקריות.' },
      { id: 'NH3', nameHe: 'אמוניה', nameEn: 'Ammonia', formula: 'NH₃', category: 'voc', iarc: 'גז קורוזיבי', isCarcinogen: false, unit: 'µg/m³', averaging: 'ייחוס',
        intuitive: 'גז חריף מדשנים וחקלאות שתורם ליצירת חלקיקי PM2.5 באוויר.',
        standards: [{ period: 'יממה/שנה', target: '350 / 100 µg/m³', env: '—', alert: '—' }],
        whatIsIt: 'גז בסיסי חריף.', sources: 'דשנים וקירור.', health: 'גירוי ריריות.', haifaContext: 'נמוך מערך הייחוס.' },
      { id: 'Ni', nameHe: 'ניקל', nameEn: 'Nickel', formula: 'Ni', category: 'metals', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'מתכת כבדה משריפת מזוט ומתכות. בקריית חיים נמדד שיא ארצי (0.022) שנושק לתקן הישראלי ועובר את התקן האירופי המוצע.',
        standards: [{ period: 'יממה/שנה', target: '0.020 µg/m³', env: '0.020 µg/m³ (שנתי)', alert: '—' }],
        whatIsIt: 'מתכת כבדה בחלקיקים.', sources: 'מזוט ומחזור מתכות.', health: 'סרטן ריאות ואלרגיה.', haifaContext: 'שיא ארצי בקריית חיים (0.022 µg/m³).' },
      { id: 'Cd', nameHe: 'קדמיום', nameEn: 'Cadmium', formula: 'Cd', category: 'metals', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'מתכת רעילה שמצטברת בכליות. במפרץ חיפה אין חריגות ממנה.',
        standards: [{ period: 'יממה/שנה', target: '0.005 µg/m³', env: '0.005 µg/m³', alert: '—' }],
        whatIsIt: 'מתכת כבדה.', sources: 'התכת מתכות.', health: 'פגיעה בכליות וסרטן.', haifaContext: 'תקין במפרץ חיפה.' },
      { id: 'As', nameHe: 'ארסן', nameEn: 'Arsenic', formula: 'As', category: 'metals', iarc: 'Group 1 – מסרטן ודאי', isCarcinogen: true, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'יסוד רעיל מתעשיית מתכות. תקין במפרץ חיפה.',
        standards: [{ period: 'שנה', target: '0.002 µg/m³', env: '0.006 µg/m³', alert: '—' }],
        whatIsIt: 'מתלואיד בחלקיקים.', sources: 'התכה.', health: 'סרטן ריאות ועור.', haifaContext: 'תקין.' },
      { id: 'Pb', nameHe: 'עופרת', nameEn: 'Lead', formula: 'Pb', category: 'metals', iarc: 'Group 2A', isCarcinogen: false, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'מתכת הפוגעת בהתפתחות המוח. מאז הוצאת העופרת מהדלק הריכוז זניח.',
        standards: [{ period: 'שנה', target: '0.09 µg/m³', env: '0.09 µg/m³', alert: '—' }],
        whatIsIt: 'מתכת כבדה.', sources: 'מחזור מצברים.', health: 'נוירו-טוקסי לילדים.', haifaContext: 'תקין.' },
      { id: 'V', nameHe: 'ואנדיום', nameEn: 'Vanadium', formula: 'V', category: 'metals', iarc: 'Group 2B', isCarcinogen: false, unit: 'µg/m³', averaging: 'יממתי ושנתי',
        intuitive: 'מתכת משריפת מזוט כבד. ירדה מאוד עם המעבר לגז טבעי.',
        standards: [{ period: 'יממה / שנה', target: '0.8 | 0.1 µg/m³', env: '0.8 | 0.1 µg/m³', alert: '—' }],
        whatIsIt: 'מתכת בדלקים כבדים.', sources: 'מזוט.', health: 'גירוי נשימתי.', haifaContext: 'נמוך מאוד.' },
      { id: 'Cr', nameHe: 'כרום', nameEn: 'Chromium', formula: 'Cr', category: 'metals', iarc: 'Group 1 (Cr+6)', isCarcinogen: true, unit: 'µg/m³', averaging: 'שעתי ושנתי',
        intuitive: 'מתכת ממגדלי קירור ומפעלי פלדה. הריכוזים נמוכים מאוד.',
        standards: [{ period: 'שנה', target: '1.2 µg/m³', env: '1.2 µg/m³', alert: '—' }],
        whatIsIt: 'מתכת תעשייתית.', sources: 'פלדה ומגדלי קירור.', health: 'סרטן ריאות (Cr+6).', haifaContext: 'תקין (~10% מהתקן).' },
      { id: 'Hg', nameHe: 'כספית', nameEn: 'Mercury', formula: 'Hg', category: 'metals', iarc: 'Group 3', isCarcinogen: false, unit: 'µg/m³', averaging: 'שעתי ושנתי',
        intuitive: 'אדי מתכת מתעשיית מלט ודלקים. השיא בארץ נמדד בנשר (0.446), אך מתחת לתקן (0.6).',
        standards: [{ period: 'שעה', target: '0.6 µg/m³', env: '0.6 µg/m³', alert: '—' }],
        whatIsIt: 'מתכת נדיפה.', sources: 'מלט ופחם.', health: 'פגיעה עצבית וכלייתית.', haifaContext: 'שיא ארצי בנשר (0.446).' },
      { id: 'SPM', nameHe: 'חלקיקים כלליים (SPM)', nameEn: 'Total Suspended Particulates', formula: 'SPM', category: 'metals', iarc: 'תקן היסטורי', isCarcinogen: false, unit: 'µg/m³', averaging: '3 שעות, יממתי ושנתי',
        intuitive: 'כלל החלקיקים באוויר כולל אבק גס שנעצר באף. מועמד לביטול כי PM10 ו-PM2.5 מדויקים יותר.',
        standards: [{ period: 'יממה', target: '200 µg/m³', env: '200 µg/m³', alert: '—' }],
        whatIsIt: 'חלקיקים < 30 מיקרון.', sources: 'מחצבות ונמל.', health: 'מוגבל לדרכי אוויר עליונות.', haifaContext: 'סביב נמל ומחצבות.' },
      { id: 'SO4', nameHe: 'מלחי גופרה (סולפטים)', nameEn: 'Sulfate Salts', formula: 'SO₄²⁻', category: 'metals', iarc: 'אירוסול שניוני', isCarcinogen: false, unit: 'µg/m³', averaging: 'יממתי',
        intuitive: 'חלקיקים חומציים שנוצרים מגז SO₂ מספר שעות אחרי הפליטה.',
        standards: [{ period: 'יממה', target: '25 µg/m³', env: '25 µg/m³', alert: '—' }],
        whatIsIt: 'אירוסולים ב-PM2.5.', sources: 'חמצון SO₂.', health: 'גירוי סימפונות.', haifaContext: 'מתחת לתקן.' },
      { id: 'SETTLING_DUST', nameHe: 'אבק שוקע', nameEn: 'Settling Dust', formula: 'Dust', category: 'metals', iarc: 'מטרד לכלוך', isCarcinogen: false, unit: 'טון/קמ"ר/חודש', averaging: 'חודשי',
        intuitive: 'אבק כבד ששוקע על המרפסות והרכבים. לא חודר לריאות.',
        standards: [{ period: 'חודש', target: '20 טון/קמ"ר', env: '20 טון/קמ"ר', alert: '—' }],
        whatIsIt: 'חלקיקים < 100 מיקרון.', sources: 'בנייה ומחצבות.', health: 'מטרד סביבתי.', haifaContext: 'מועמד לביטול.' },
      { id: 'WS', nameHe: 'מהירות רוח (WS)', nameEn: 'Wind Speed', formula: 'WS (m/s)', category: 'meteo', iarc: 'מטאורולוגיה', isCarcinogen: false, unit: 'm/s', averaging: '10 דקות',
        intuitive: 'כמה מהר הרוח מפזרת את הזיהום. בלילה בקריות הרוח יורדת ל-0.5–2 m/s והזיהום "נתקע" למטה; בצהריים עולה ל-3–6 m/s ומנקה.',
        standards: [{ period: 'סיווג', target: 'פיזור טוב > 2 m/s', env: 'לכידה ≤ 1 m/s', alert: '—' }],
        whatIsIt: 'זרימת אוויר אופקית.', sources: 'בריזת ים-יבשה.', health: 'קובעת פיזור מול לכידה.', haifaContext: 'נמדד בתחנות Z1–Z5.' },
      { id: 'WD', nameHe: 'כיוון רוח (WD)', nameEn: 'Wind Direction', formula: 'WD (°)', category: 'meteo', iarc: 'שיוך מקורות', isCarcinogen: false, unit: 'מעלות (0°–360°)', averaging: '10 דקות',
        intuitive: 'מאיפה מגיעה הרוח: 270° (מערב) מביא אוויר מהים; רוח דרומית/דרום-מערבית מסיעה פליטות מאזור התעשייה ישר לקריות!',
        standards: [{ period: 'קריות', target: 'יום: 270°–315°', env: 'לילה: 112.5°', alert: '—' }],
        whatIsIt: 'אזימוט מקור הרוח.', sources: 'טופוגרפיה ובריזה.', health: 'מזהה מי פלט את הזיהום.', haifaContext: 'בסיס לצו סעיף 45 לבז"ן.' },
      { id: 'STABILITY_ZL', nameHe: 'יציבות אטמוספרית (z/L)', nameEn: 'Atmospheric Stability', formula: 'z/L', category: 'meteo', iarc: 'מטאורולוגיה', isCarcinogen: false, unit: 'חסר ממד', averaging: '10 דקות',
        intuitive: 'האם האוויר מערבב את הזיהום למעלה (יום) או כולא אותו כמו מכסה סיר על הקריות (לילה / אינוורסיה)?',
        standards: [{ period: 'מצב', target: 'יום: לא יציב (פיזור)', env: 'לילה: יציב (כליאה)', alert: '—' }],
        whatIsIt: 'מדד אובוחוב.', sources: 'שמש מול קירור לילי.', health: 'חריגות בנזן בשיאן ביציבות גבוהה.', haifaContext: 'נחקר ב-Z2 ק. מוצקין ו-C9.' },
      { id: 'TURBULENCE_SIGMA', nameHe: 'טורבולנציה (σu, σv, σw)', nameEn: 'Turbulence', formula: 'σ/u*', category: 'meteo', iarc: 'מודל פיזור', isCarcinogen: false, unit: 'מנורמל', averaging: '10 דקות',
        intuitive: 'כמה "ערבולים" יש באוויר שמפזרים את עננת הזיהום לצדדים ולגובה.',
        standards: [{ period: 'קריות Z2', target: 'σu/u*=2.1 | σw/u*=1.25', env: '—', alert: '—' }],
        whatIsIt: 'תנודות מהירות הרוח.', sources: 'חיכוך במבנים.', health: 'פיזור תלת-ממדי של PM.', haifaContext: 'גובה 45 מ\' = חצי מריכוז קרקע.' },
      { id: 'TEMP_RH', nameHe: 'טמפרטורה ולחות', nameEn: 'Temp & RH', formula: '°C / %', category: 'meteo', iarc: 'פרמטר המרה', isCarcinogen: false, unit: '°C / %', averaging: 'רציף',
        intuitive: 'נמדדים בכל תחנה כדי להמיר מדידות גזים מ-ppb ליחידות התקן (µg/m³) ולהבין ייצור אוזון בקיץ.',
        standards: [{ period: 'תקן', target: 'המרת גזים', env: '—', alert: '—' }],
        whatIsIt: 'תנאי מזג אוויר מקומיים.', sources: 'אקלים ים-תיכוני.', health: 'חום מאיץ אוזון.', haifaContext: 'מדידה רציפה.' },
      { id: 'AQI_INDEX', nameHe: 'מדד איכות האוויר (100-AQI)', nameEn: 'Israeli AQI', formula: '100 − AQI', category: 'meteo', iarc: 'מדד ציבורי', isCarcinogen: false, unit: '+100..-400', averaging: 'שעתי/רציף',
        intuitive: 'הציון של התחנה: ירוק/צהוב = תקין; מתחת לאפס (אדום/חום) = חריגה מהחוק! חשוב: המדד לא כולל בנזן ופורמאלדהיד.',
        standards: [{ period: 'סולם', target: '+51..+100 טוב', env: '0 = תקן | שלילי = חריגה', alert: '-200 = התרעה' }],
        whatIsIt: 'המדד הרשמי ב-air.sviva.gov.il.', sources: 'הגרוע מבין 7 מזהמים.', health: 'הנחיה מיידית לציבור.', haifaContext: 'זמין ב-py-air-sviva-api.' }
    ];

    const AQI_BREAKPOINTS = {
      PM25: [{ icLow: 0, icHigh: 18.5, bpLow: 0, bpHigh: 49 }, { icLow: 18.6, icHigh: 37.0, bpLow: 50, bpHigh: 100 }, { icLow: 37.5, icHigh: 84.0, bpLow: 101, bpHigh: 200 }, { icLow: 84.5, icHigh: 130.0, bpLow: 201, bpHigh: 300 }, { icLow: 130.5, icHigh: 165.0, bpLow: 301, bpHigh: 400 }, { icLow: 165.5, icHigh: 200.0, bpLow: 401, bpHigh: 500 }],
      PM10: [{ icLow: 0, icHigh: 65, bpLow: 0, bpHigh: 49 }, { icLow: 66, icHigh: 129, bpLow: 50, bpHigh: 100 }, { icLow: 130, icHigh: 215, bpLow: 101, bpHigh: 200 }, { icLow: 216, icHigh: 300, bpLow: 201, bpHigh: 300 }, { icLow: 301, icHigh: 355, bpLow: 301, bpHigh: 400 }, { icLow: 356, icHigh: 430, bpLow: 401, bpHigh: 500 }],
      O3:   [{ icLow: 0, icHigh: 35, bpLow: 0, bpHigh: 49 }, { icLow: 36, icHigh: 70, bpLow: 50, bpHigh: 100 }, { icLow: 71, icHigh: 97, bpLow: 101, bpHigh: 200 }, { icLow: 98, icHigh: 117, bpLow: 201, bpHigh: 300 }, { icLow: 118, icHigh: 155, bpLow: 301, bpHigh: 400 }, { icLow: 156, icHigh: 188, bpLow: 401, bpHigh: 500 }],
      SO2:  [{ icLow: 0, icHigh: 67, bpLow: 0, bpHigh: 49 }, { icLow: 68, icHigh: 133, bpLow: 50, bpHigh: 100 }, { icLow: 134, icHigh: 163, bpLow: 101, bpHigh: 200 }, { icLow: 164, icHigh: 191, bpLow: 201, bpHigh: 300 }, { icLow: 192, icHigh: 253, bpLow: 301, bpHigh: 400 }, { icLow: 254, icHigh: 303, bpLow: 401, bpHigh: 500 }],
      NO2:  [{ icLow: 0, icHigh: 53, bpLow: 0, bpHigh: 49 }, { icLow: 54, icHigh: 105, bpLow: 50, bpHigh: 100 }, { icLow: 106, icHigh: 160, bpLow: 101, bpHigh: 200 }, { icLow: 161, icHigh: 213, bpLow: 201, bpHigh: 300 }, { icLow: 214, icHigh: 260, bpLow: 301, bpHigh: 400 }, { icLow: 261, icHigh: 316, bpLow: 401, bpHigh: 500 }],
      NOX:  [{ icLow: 0, icHigh: 250, bpLow: 0, bpHigh: 49 }, { icLow: 251, icHigh: 499, bpLow: 50, bpHigh: 100 }, { icLow: 500, icHigh: 750, bpLow: 101, bpHigh: 200 }, { icLow: 751, icHigh: 1000, bpLow: 201, bpHigh: 300 }, { icLow: 1001, icHigh: 1200, bpLow: 301, bpHigh: 400 }, { icLow: 1201, icHigh: 1400, bpLow: 401, bpHigh: 500 }],
      CO:   [{ icLow: 0, icHigh: 26, bpLow: 0, bpHigh: 49 }, { icLow: 27, icHigh: 51, bpLow: 50, bpHigh: 100 }, { icLow: 52, icHigh: 78, bpLow: 101, bpHigh: 200 }, { icLow: 79, icHigh: 104, bpLow: 201, bpHigh: 300 }, { icLow: 105, icHigh: 130, bpLow: 301, bpHigh: 400 }, { icLow: 131, icHigh: 156, bpLow: 401, bpHigh: 500 }]
    };

    const AQI_META = [
      { key: 'PM25', label: 'PM2.5 (יממתי)', unit: 'µg/m³', min: 0, max: 200, step: 0.5, envLimit: 37.5, alertLimit: 130 },
      { key: 'PM10', label: 'PM10 (יממתי)', unit: 'µg/m³', min: 0, max: 430, step: 1, envLimit: 130, alertLimit: 300 },
      { key: 'O3',   label: 'O₃ (8-שעתי)', unit: 'ppb', min: 0, max: 188, step: 0.5, envLimit: 70, alertLimit: 117 },
      { key: 'SO2',  label: 'SO₂ (שעתי)', unit: 'ppb', min: 0, max: 303, step: 0.5, envLimit: 133, alertLimit: 191 },
      { key: 'NO2',  label: 'NO₂ (שעתי)', unit: 'ppb', min: 0, max: 316, step: 0.5, envLimit: 105, alertLimit: 213 },
      { key: 'NOX',  label: 'NOx (ח"ש)', unit: 'ppb', min: 0, max: 1400, step: 1, envLimit: 499, alertLimit: 1000 },
      { key: 'CO',   label: 'CO (ח"ש)', unit: 'ppm', min: 0, max: 156, step: 0.1, envLimit: 51, alertLimit: 104 }
    ];

    // =========================================================================
    // 2. HELPERS
    // =========================================================================
    // RTL: formulas, units and the numbers attached to them become isolated LTR runs (<bdi dir="ltr">),
    // so "14.0 µg/m³" or "PM2.5" never flip inside Hebrew text. Applied to rendered station content.
    const LTR_TOKEN = /PM2\.5|PM10|µg\/m³|NO₂|O₃|SO₂|C₆H₆|ppb|WHO|IARC|\d°|m\/s/;
    const LTR_RUN = /((?:\d+(?:\.\d+)?\s?)?(?:PM2\.5|PM10|NO₂|O₃|SO₂|C₆H₆)(?:\s\d+(?:\.\d+)?)?(?:\s?(?:µg\/m³|ppb))?|\d+(?:\.\d+)?\s?(?:µg\/m³|ppb)|µg\/m³|ppb|(?:WHO|IARC)(?::?\s?\d+(?:\.\d+)?)?|\d+(?:\.\d+)?°C?|\d+(?:\.\d+)?\s?m\/s|m\/s)/g;
    function isolateLtr(root) {
      if (!root) return;
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (LTR_TOKEN.test(n.nodeValue) && n.parentElement && !n.parentElement.closest('bdi, [dir="ltr"], script, style')) nodes.push(n);
      }
      nodes.forEach(n => {
        const parts = n.nodeValue.split(LTR_RUN), frag = document.createDocumentFragment();
        parts.forEach((p, i) => {
          if (!p) return;
          if (i % 2) { const b = document.createElement('bdi'); b.dir = 'ltr'; b.textContent = p; frag.appendChild(b); }
          else frag.appendChild(document.createTextNode(p));
        });
        n.parentNode.replaceChild(frag, n);
      });
    }
    const isolateStationContent = () => ['decisionCard', 'stationPillsStrip', 'stationInspectorCard', 'pollutantCardsGrid', 'stationAdvanced']
      .forEach(id => isolateLtr(document.getElementById(id)));

    function formatGasValue(ugVal, gasKey, decimals = 2) { return AQStd.formatGas(ugVal, gasKey, APP_STATE.unitMode, decimals); }
    function getUnitLabel(gasKey) { return AQStd.unitLabel(gasKey, APP_STATE.unitMode); }

    function getCellBadgeClass(pct, isViolation = false) {
      if (isViolation || pct > 100) return 'bg-rose-950/90 text-rose-200 border border-rose-600/80 font-extrabold';
      if (pct >= 80) return 'bg-amber-950/85 text-amber-200 border border-amber-600/70 font-bold';
      return 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/50';
    }

    // great-circle distance in km (client-side only)
    function haversineKm(lat1, lon1, lat2, lon2) {
      const R = 6371, rad = d => d * Math.PI / 180;
      const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    }
    window.selectNearestStation = function (btn) {
      const info = document.getElementById('nearestInfo');
      const say = t => { if (info) info.textContent = t; };
      if (!navigator.geolocation) { say('הדפדפן לא תומך במיקום'); return; }
      say('מאתר מיקום…');
      if (btn) btn.disabled = true;
      navigator.geolocation.getCurrentPosition(pos => {
        if (btn) btn.disabled = false;
        const { latitude, longitude } = pos.coords;
        const best = getFilteredStations().filter(st => STATION_COORDS[st.id])
          .map(st => ({ st, km: haversineKm(latitude, longitude, STATION_COORDS[st.id].lat, STATION_COORDS[st.id].lon) }))
          .sort((a, b) => a.km - b.km)[0];
        if (!best) { say('לא נמצאה תחנה'); return; }
        APP_STATE.selectedStationId = best.st.id;
        renderMatrix();
        document.querySelector(`.station-pill[data-station-id="${best.st.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
        say(`📍 התחנה הקרובה אליך: ${best.st.shortName} • ~${best.km.toFixed(1)} ק"מ`);
      }, err => {
        if (btn) btn.disabled = false;
        say(err && err.code === 1 ? 'אין הרשאת מיקום – אפשר לבחור תחנה ידנית' : 'המיקום לא זמין כרגע');
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    };

    // the 6 Krayot stations are always shown (area filter and station search were removed on purpose)
    function getFilteredStations() {
      return STATIONS_DATA.filter(st => st.group === 'krayot');
    }

    // =========================================================================
    // 3. RENDER STATION PILLS, INSPECTOR, POLLUTANT CARDS (HOURLY/DAILY/MONTHLY) & CHARTS
    // =========================================================================

    function renderMatrix() {
      const filtered = getFilteredStations();
      if (filtered.length > 0 && !filtered.some(s => s.id === APP_STATE.selectedStationId)) {
        APP_STATE.selectedStationId = filtered[0].id;
      }
      try { localStorage.setItem('krayot.station', APP_STATE.selectedStationId); } catch (e) {}

      const banner = document.getElementById('matrixBenchmarkBanner');
      if (banner) {
        banner.textContent = APP_STATE.benchmarkMode === 'target'
          ? 'בסיס השוואה: יעד בריאותי מחמיר'
          : 'בסיס השוואה: תקן סביבה חוקי';
        banner.className = APP_STATE.benchmarkMode === 'target'
          ? 'text-[11px] font-bold text-rose-300'
          : 'text-[11px] font-bold text-purple-300';
      }

      // 1. Render Swipeable Station Selector Pills
      const strip = document.getElementById('stationPillsStrip');
      strip.innerHTML = filtered.map(st => {
        const active = st.id === APP_STATE.selectedStationId;
        const dotCls = { exceed_env: 'bg-purple-500 pulse-red', exceed_target: 'bg-rose-500', ok: 'bg-emerald-400' }[st.status] || 'bg-slate-500';
        const ww = stationWorst(st);
        const onlyBz = Object.keys(st.metrics || {}).every(k => k === 'C6H6' || k === 'Toluene') && Object.keys(st.metrics || {}).length > 0;
        const plbl = ww ? ww.code : 'ממתין לנתונים';
        const wl = stationLevel(st), wlv = wl == null ? null : WORD_LEVELS[wl];
        return `
          <button type="button" data-station-id="${st.id}" class="station-pill snap-start shrink-0 lg:shrink lg:flex-1 lg:min-w-0 text-right rounded-2xl p-3 min-w-[175px] sm:min-w-[195px] border transition ${
            active
              ? 'bg-sky-950/60 border-sky-400 ring-2 ring-sky-400/40 shadow-lg'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }">
            <div class="flex items-center justify-between gap-2">
              <span class="min-w-0"><span class="block text-xs sm:text-sm font-extrabold text-white truncate">${st.shortName}</span>${STATION_AREA[st.id] ? `<span class="block text-[11px] text-slate-400 truncate">${STATION_AREA[st.id]}</span>` : ''}</span>
              <div class="flex items-center gap-1 shrink-0">
                ${(() => { const s = detectPirateFireSignature(st); return (s.detected || s.level === 'dust') ? `<span title="${s.badgeText}" class="text-[10px] px-1.5 py-0.5 rounded ${s.level === 'high' ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' : (s.level === 'dust' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40')} border font-bold">${s.level === 'high' ? '🚨' : (s.level === 'dust' ? '🏜️' : '💨')}</span>` : ''; })()}
                ${wlv ? `<span class="px-1.5 py-0.5 rounded-md border text-[13px] font-extrabold ${wlv.cls}">${wlv.word}</span>` : `<span class="w-2.5 h-2.5 rounded-full ${dotCls}"></span>`}
              </div>
            </div>
            ${onlyBz ? '<div class="mt-0.5"><span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">בנזן בלבד</span></div>' : ''}${st.stale ? '<div class="text-[10px] text-amber-300 mt-0.5">נתון ישן</div>' : ''}
            <div class="mt-2 flex items-center justify-between gap-1 text-[13px]">
              <span class="text-slate-300">${plbl}:</span>
              <span dir="ltr" class="mono font-extrabold ${wlv ? wlv.txt : 'text-slate-300'}">${ww ? formatGasValue(ww.value, ww.key, ww.key === 'C6H6' ? 2 : 1) + ' ' + getUnitLabel(ww.key) : '—'}</span>
            </div>
          </button>
        `;
      }).join('');

      document.querySelectorAll('.station-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          APP_STATE.selectedStationId = btn.getAttribute('data-station-id');
          renderMatrix();
        });
      });

      // 2. Render Desktop Comparison Table
      const tbody = document.getElementById('matrixTableBody');
      const isTarget = APP_STATE.benchmarkMode === 'target';
      tbody.innerHTML = filtered.map(st => {
        // annual/30-day limits: legal (Israel) vs. WHO 2021 guideline (PM2.5 5, PM10 15, NO2 10)
        const pct = (v, lim) => v == null ? 0 : Math.round((v / lim) * 100);
        const dash = v => v == null ? '—' : v;
        const mode = isTarget ? 'target' : 'env';
        const c6Pct = pct(st.c6h6_max24h, AQStd.limit('C6H6', 'd', 'env'));
        const no2Pct = pct(st.no2_annual, AQStd.limit('NO2', 'm', mode));
        const pm25Pct = pct(st.pm25_annual, AQStd.limit('PM25', 'm', mode));
        const pm10Pct = pct(st.pm10_annual, AQStd.limit('PM10', 'm', mode));
        return `
          <tr data-station-id="${st.id}" class="station-row cursor-pointer hover:bg-slate-800/70 ${st.id === APP_STATE.selectedStationId ? 'bg-sky-950/30' : ''}">
            <td class="py-2 px-3 sticky right-0 bg-slate-900 border-l border-slate-800 font-bold text-white">${st.shortName}</td>
            ${(() => {
              const s = detectPirateFireSignature(st);
              const cls = s.level === 'high' ? 'bg-orange-500/20 text-orange-200 border border-orange-500/40' : (s.level === 'dust' ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/40' : (s.level === 'watch' ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40' : 'bg-emerald-500/15 text-emerald-300'));
              const lbl = s.level === 'high' ? '🚨 ריח חריף / עשן' : (s.level === 'dust' ? '🏜️ אובך' : (s.level === 'watch' ? '💨 ייתכן ריח / עשן' : '🟢 תקין'));
              return `<td class="py-2 px-2.5 text-center"><span class="px-2 py-0.5 rounded text-[11px] font-bold ${cls}">${lbl}</span></td>`;
            })()}
            <td class="py-2 px-2.5 text-center"><span class="px-2 py-0.5 rounded ${getCellBadgeClass(c6Pct, st.c6h6_exceedDays > 7)} mono">${formatGasValue(st.c6h6_max24h, 'C6H6')}${st.c6h6_max24h == null ? '' : ' (' + c6Pct + '%)'}</span></td>
            <td class="py-2 px-2.5 text-center"><span class="px-2 py-0.5 rounded ${getCellBadgeClass(no2Pct, st.no2_annual > AQStd.limit('NO2', 'm', 'env'))} mono">${formatGasValue(st.no2_annual, 'NO2', 1)}</span></td>
            <td class="py-2 px-2.5 text-center"><span class="px-2 py-0.5 rounded ${getCellBadgeClass(pm25Pct)} mono">${dash(st.pm25_max24h)} / ${dash(st.pm25_annual)}</span></td>
            <td class="py-2 px-2.5 text-center"><span class="px-2 py-0.5 rounded ${getCellBadgeClass(pm10Pct)} mono">${dash(st.pm10_max24h)} / ${dash(st.pm10_annual)}</span></td>
            <td class="py-2 px-2.5 text-center mono">${formatGasValue(st.o3_annual, 'O3', 1)}</td>
            <td class="py-2 px-2.5 text-center mono">${formatGasValue(st.so2_max24h, 'SO2', 1)}</td>
          </tr>
        `;
      }).join('');

      document.querySelectorAll('.station-row').forEach(row => {
        row.addEventListener('click', () => {
          APP_STATE.selectedStationId = row.getAttribute('data-station-id');
          renderMatrix();
        });
      });

      renderStationInspector();
      renderPirateFirePanel();
      if (typeof fetchWindForecast === "function") fetchWindForecast();
      renderPollutantCards();
      updateCharts();
      renderDecisionCard();
      renderAiringStrip();
      isolateStationContent();
    }

    const FIRE_MARKER_IDS = ['PM25', 'CO', 'C6H6'];

    function scaleLinear(val, minVal, maxVal, maxPts) {
      if (val <= minVal) return 0;
      if (val >= maxVal) return Number(maxPts);
      return ((val - minVal) / (maxVal - minVal)) * maxPts;
    }

    function computePercentile25(arr) {
      const nums = (arr || []).map(Number).filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
      if (!nums.length) return null;
      const idx = Math.floor((nums.length - 1) * 0.25);
      return nums[idx];
    }

    function extractRecent30mValue(readings, nowMs = Date.now()) {
      if (!Array.isArray(readings) || !readings.length) return null;
      const valid = readings
        .map(r => ({ ts: new Date(r.ts || r.datetime || r.time).getTime(), val: Number(r.val ?? r.value) }))
        .filter(r => Number.isFinite(r.ts) && Number.isFinite(r.val))
        .sort((a, b) => a.ts - b.ts);
      if (!valid.length) return null;
      const latestTs = valid[valid.length - 1].ts;
      if (nowMs - latestTs > 60 * 60 * 1000) return null;
      const win = valid.filter(r => r.ts >= latestTs - 30 * 60 * 1000);
      return +(win.reduce((s, r) => s + r.val, 0) / win.length).toFixed(2);
    }

    function resolveWindForStation(st, allStations) {
      const r30 = st.last30m || {};
      if (r30.windDir !== undefined && r30.windDir !== null) {
        return { windDir: Number(r30.windDir), windSpeed: r30.windSpeed !== undefined ? Number(r30.windSpeed) : null, source: 'station' };
      }
      if (st.windDir !== undefined && st.windDir !== null) {
        return { windDir: Number(st.windDir), windSpeed: st.windSpeed !== undefined ? Number(st.windSpeed) : null, source: 'station' };
      }
      const pool = Array.isArray(allStations) ? allStations : (typeof STATIONS_DATA !== 'undefined' ? STATIONS_DATA : []);
      const coordsMap = typeof STATION_COORDS !== 'undefined' ? STATION_COORDS : {};
      const myC = coordsMap[st.id];
      if (myC && pool.length) {
        const candidates = pool
          .filter(other => other.id !== st.id && other.group === 'krayot' && (other.last30m?.windDir !== undefined || other.windDir !== undefined))
          .map(other => {
            const oc = coordsMap[other.id];
            const dist = oc ? Math.hypot(oc.lat - myC.lat, oc.lon - myC.lon) : 999;
            return { other, dist };
          })
          .sort((a, b) => a.dist - b.dist);
        if (candidates.length) {
          const best = candidates[0].other;
          return {
            windDir: Number(best.last30m?.windDir ?? best.windDir),
            windSpeed: (best.last30m?.windSpeed ?? best.windSpeed) !== undefined ? Number(best.last30m?.windSpeed ?? best.windSpeed) : null,
            source: 'neighbor:' + best.shortName
          };
        }
      }
      if (typeof WIND_FORECAST_CACHE !== 'undefined' && Array.isArray(WIND_FORECAST_CACHE) && WIND_FORECAST_CACHE.length) {
        const f0 = WIND_FORECAST_CACHE[0];
        if (f0.wd != null) return { windDir: Number(f0.wd), windSpeed: f0.ws == null ? null : Number(f0.ws), source: 'open-meteo' };
      }
      return { windDir: null, windSpeed: null, source: 'none' };
    }

    const V2B_REASONS = { lvl: 'PM2.5 גבוה', anom: 'חריג לשעה זו', rise: 'עלייה חדה', ratio: 'חלקיקים עדינים (עשן)', nox: 'ללא תוספת תחבורה', bz: 'בנזן קפץ', east: 'רוח ממזרח בלילה', lx: 'חריגה מקומית' };
    function v2bHourLabel(ms) {
      return new Date(ms).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    function v2bSignature(st) {
      const R = (window.FIRE_LIVE || window.FIRE_V2B);
      if (!R || !st || !st.id || !window.FireV2B || !FireV2B.STATIONS[st.id]) return null;
      const i = R.latestIndex, ch = R.S[st.id];
      const score = ch.S[i], lvl = R.level(score), f = ch.flags[i], parts = ch.parts[i] || {};
      const at = v2bHourLabel(R.axis[i]);
      const matched = (lvl === 'high' || lvl === 'watch') ? Object.keys(V2B_REASONS).filter(k => parts[k] !== null && parts[k] >= 0.5).map(k => V2B_REASONS[k]) : [];
      const sc = score === null ? 0 : Math.round(score);
      const base = { score: sc, sensorCount: matched.length, lowConfidence: false, windowLabel: 'שעה אחרונה (' + at + ')', matched, engine: 'v2b', regional: R.latest.regional };
      if (lvl === 'high') return { ...base, detected: true, level: 'high', isMineralDust: false, badgeText: '🚨 סבירות גבוהה מאוד לריח חריף / עשן (' + at + ')', shortBadge: '🚨 ריח חריף / עשן', summary: 'נכון ל-' + at };
      if (lvl === 'watch') return { ...base, detected: true, level: 'watch', isMineralDust: false, badgeText: '💨 ייתכן ריח חריף / עשן (' + at + ')', shortBadge: '💨 ייתכן ריח / עשן', summary: 'נכון ל-' + at };
      if (f && f.dustEvent) return { ...base, detected: false, level: 'dust', isMineralDust: true, badgeText: '🏜️ אובך / אבק (לא שריפה)', shortBadge: '🏜️ אובך', summary: 'יחס PM2.5/PM10 נמוך • נכון ל-' + at };
      return { ...base, detected: false, level: 'none', isMineralDust: false, badgeText: R.latest.regional ? '🌁 אוויר עומד (משוער) – לא שריפה מקומית' : '🟢 ללא חתימת שריפה', shortBadge: '', summary: 'נכון ל-' + at };
    }
    function detectPirateFireSignature(st, allStations = null, opts = {}) {
      if (st && LIVE_STATION_IDS.includes(st.id) && !(st.metrics && st.metrics.PM25)) {
        return { score: 0, level: 'none', detected: false, isMineralDust: false, matched: [], sensorCount: 0, lowConfidence: true,
          badgeText: '— אין חיישן חלקיקים בתחנה (הגלאי לא רלוונטי)', shortBadge: '', summary: 'נמדד כאן: בנזן וטולואן בלבד', windowLabel: '', engine: 'none' };
      }
      return v2bSignature(st) || detectPirateFireSignatureLegacy(st, allStations, opts);
    }

    // one word per station from live values vs. WHO 2021 24 h guidelines (benzene vs. its daily limit)
    const WORD_LEVELS = [
      { word: 'טוב', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', txt: 'text-emerald-300' },
      { word: 'בינוני', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/40', txt: 'text-orange-300' },
      { word: 'גרוע', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/50', txt: 'text-rose-300' }
    ];
    function nowBands() { return AQStd.nowBands(APP_STATE.benchmarkMode); }
    function nowLevel(key, v) { return AQStd.nowLevel(APP_STATE.benchmarkMode, key, v); }
    function stationWorst(st) { return AQGuidance.stationWorst(st, APP_STATE.benchmarkMode); }
    function stationLevel(st) { // = computeGuidance(st).stationLvl (single source of truth)
      const g = computeGuidance(st);
      return g ? g.stationLvl : null;
    }

    // copy text; only report success when the clipboard accepted it, else offer a prompt to copy by hand
    async function copyTextReliable(txt, onOk) {
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard');
        await navigator.clipboard.writeText(txt);
        if (onOk) onOk();
        return true;
      } catch (e) {
        window.prompt('ההעתקה האוטומטית נחסמה. העתק ידנית:', txt);
        return false;
      }
    }
    window.copyTextReliable = copyTextReliable;

    // quick report to the Ministry of Environmental Protection hotline *6911 (copies a summary)
    // summary pasted into the MoEP online form: what was measured, labelled honestly (window, source)
    function reportSummaryText() {
      const st = STATIONS_DATA.find(s => s.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
      const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const m = st.metrics?.PM25 || null;
      const pm = !m ? 'לא נמדד בתחנה'
        : m.hourly != null ? `${Number(m.hourly).toFixed(1)} µg/m³ (שעה אחרונה)`
        : m.daily != null ? `${Number(m.daily).toFixed(1)} µg/m³ (ממוצע יומי)` : 'אין נתון';
      const own = st.last30m || {}, kb = STATIONS_DATA.find(s => s.id === 'kiryat_binyamin') || {};
      const wsrc = own.windDir != null ? [own, ''] : ((kb.last30m || {}).windDir != null ? [kb.last30m, ', נמדד בקריית אתא'] : null);
      const wind = wsrc ? `${degToCompassHe(wsrc[0].windDir)} (${Math.round(wsrc[0].windDir)}°${wsrc[1]})` : 'לא ידוע';
      return 'נושא: פנייה בנושא מפגע זיהום אוויר באזור ' + st.shortName + '\n' +
        `סוג המפגע: ריח חריף / עשן (לפי דיווח התושב) | ${now} | אזור: ${st.shortName} | PM2.5: ${pm} | רוח: ${wind}` +
        '\nמקור הנתונים: תחנות הניטור של המשרד להגנת הסביבה (air.sviva.gov.il).';
    }
    const SVIVA_FORM_URL = 'https://govforms.gov.il/mw/forms/ContactUsNew@sviva.gov.il?gbxid=0#!contactUs';
    // the link itself opens the form in a new tab; this only copies the summary and restores the label after 3 s
    window.copySvivaSummary = function (link) {
      const label = link.dataset.label || (link.dataset.label = link.textContent);
      copyTextReliable(reportSummaryText(), () => { link.textContent = '✓ התקציר הועתק – הדבק בטופס'; });
      clearTimeout(link._resetT);
      link._resetT = setTimeout(() => { link.textContent = label; }, 3000);
    };
    const SMELL_FORM_URL = 'https://forms.gle/LiJ5h1AczSw23LDr7';
    function reportButtons(prominent) {
      const b = 'inline-flex items-center min-h-[42px] px-3 rounded-full text-[13px] font-bold border transition';
      const quiet = 'bg-black/25 border-white/15 hover:bg-black/40';
      return `<div class="flex flex-wrap items-center gap-2">` +
        `<a href="tel:%2A6911" class="${b} ${prominent ? 'bg-rose-600 border-rose-400 text-white' : quiet}">📞 חיוג למוקד *6911</a>` +
        `<a href="${SVIVA_FORM_URL}" target="_blank" rel="noopener noreferrer" onclick="copySvivaSummary(this)" class="${b} ${quiet}">📝 טופס להגנ"ס</a>` +
        // community log only (our own sampling) - not sent to any authority; full-width caption sits right above it
        `<p class="smell-caption basis-full text-[12px] leading-snug mt-1">מריחים ריח? דיווח קצר עוזר לנו לדייק את הגלאי – נשמר לכיול בלבד ולא עובר לרשויות</p>` +
        `<a href="${SMELL_FORM_URL}" target="_blank" rel="noopener noreferrer" class="${b} ${quiet}">👃 יומן ריח קהילתי (לא לרשויות)</a></div>`;
    }

    // 12-hour "when to air" strip: hour, wind arrow + short direction, functional status
    function renderAiringStrip() {
      const el = document.getElementById('airingStrip');
      if (!el) return;
      if (!WIND_FORECAST_CACHE || !WIND_FORECAST_CACHE.length) return;
      const st = STATIONS_DATA.find(s => s.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
      const S = {
        low: ['פיזור טוב', 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'],
        med: ['רוח חלשה', 'bg-orange-500/15 border-orange-500/40 text-orange-200'],
        high: ['עשן מהמזרח', 'bg-rose-500/20 border-rose-500/50 text-rose-200'],
        na: ['אין נתון רוח', 'bg-slate-800 border-slate-700 text-slate-300']
      };
      // consecutive hours with the same status become one tile ("00:00–09:00 • עשן מהמזרח")
      const groups = [];
      WIND_FORECAST_CACHE.slice(0, 12).forEach(slot => {
        const r = computeCombinedHourRisk(slot, st);
        // 'smoke from the east' only when the forecast wind actually comes from the villages' sector
        const s = r.level === 'high' && !(slot.wd >= 30 && slot.wd <= 150) ? ['פיזור חלש', S.med[1]] : (S[r.level] || S.med);
        const last = groups[groups.length - 1];
        if (last && last.s[0] === s[0]) last.slots.push(slot); else groups.push({ s, slots: [slot] });
      });
      const nextHour = t => String((parseInt(t, 10) + 1) % 24).padStart(2, '0') + ':00';
      el.innerHTML = groups.map(g => {
        const a = g.slots[0], z = g.slots[g.slots.length - 1];
        const range = g.slots.length > 1 ? `${a.time}–${nextHour(z.time)}` : a.time;
        return `<div class="snap-start shrink-0 min-w-[92px] rounded-xl border px-2.5 py-1.5 text-center ${g.s[1]}">
          <div class="mono text-xs font-bold" dir="ltr">${range}</div>
          <div class="text-[13px] font-extrabold mt-0.5">${g.s[0]}</div>
          ${a.wd == null ? '' : `<div class="text-[10px]"><span style="display:inline-block;transform:rotate(${(a.wd + 180) % 360}deg)">↑</span> רוח מ${degToCompassHe(a.wd)}</div>`}
        </div>`;
      }).join('');
    }

    // SINGLE SOURCE OF TRUTH for "now" (js/guidance.js): the decision card, the station pills, the collapsed
    // pollutant bars, the guidance tab and the airing hint all read it. Here we only gather the live inputs.
    function computeGuidance(st) {
      if (!st || !Object.keys(st.metrics || {}).length) return null;
      const R = (window.FIRE_LIVE || window.FIRE_V2B);
      return AQGuidance.computeGuidance(st, {
        mode: APP_STATE.benchmarkMode,
        sig: detectPirateFireSignature(st),
        live: R && R.latest ? R.latest : null,
        nameOf: id => (STATIONS_DATA.find(s => s.id === id) || {}).shortName || id,
        who24: whoExceedances().filter(x => x.stationId === st.id),
        forecast: WIND_FORECAST_CACHE,
        riskOf: x => computeCombinedHourRisk(x, st)
      });
    }

    // the one answer a neighbour needs: open or close the window
    function renderDecisionCard() {
      const el = document.getElementById('decisionCard');
      if (!el) return;
      const st = STATIONS_DATA.find(s => s.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
      const g = computeGuidance(st);
      if (!g) { el.innerHTML = '<div class="text-sm text-slate-400">טוען נתוני אמת…</div>'; return; }
      const lvl = g.lvl, kind = g.kind;
      const L = [
        { icon: '✅', title: 'איכות אוויר טובה', cls: 'bg-emerald-950/50 border-emerald-500/60 text-emerald-50' },
        { icon: '🟠', title: 'רמת מזהמים מוגברת', cls: 'bg-orange-950/55 border-orange-500/60 text-orange-50' },
        { icon: '🔴', title: 'רמת זיהום גבוהה', cls: 'bg-rose-950/60 border-rose-500/70 text-rose-50' }
      ][lvl];
      // smoke at the selected station: the smoke label is the title (same colours as the level)
      if (g.smoke) Object.assign(L, g.smoke === 'high' ? { icon: '🚨', title: 'סבירות גבוהה מאוד לריח חריף / עשן' } : { icon: '💨', title: 'ייתכן ריח חריף / עשן' });
      // events at OTHER stations: a small separate note, never the card colour
      const areaNote = g.area ? `<div class="mt-2 text-xs sm:text-sm font-bold rounded-xl px-3 py-1.5 bg-slate-900/70 border border-amber-500/40 text-amber-200">${g.area}</div>` : '';
      const todayDM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' }).format(new Date());
      const dayWord = gw => !gw.date ? '' : (gw.date === todayDM ? 'היום' : 'מחר');
      const becauseTxt = (g.because || '').replace(/^בגלל: (?:🚨|💨) (?:ייתכן ריח חריף|סבירות גבוהה מאוד לריח חריף) \/ עשן (?:\(גלאי השעה המתגלגלת\) )?ב/, '📍 נמדד ב');
      const because = becauseTxt ? `<div class="mt-2 text-sm font-bold bg-black/25 border border-white/15 rounded-xl px-3 py-1.5">${becauseTxt}</div>` : '';
      const trapNote = lvl === 0 && g.trapped ? `<div class="mt-2 text-sm font-bold bg-black/25 border border-white/15 rounded-xl px-3 py-1.5">🌬️ רוח חלשה בשעות הקרובות – הזיהום מתפזר לאט</div>` : '';
      const winkNote = g.wink ? `<div class="mt-1.5 text-xs sm:text-sm opacity-90 italic">${g.wink}</div>` : '';
      const avg = winkNote + trapNote + (g.softNote ? `<div class="mt-2 text-xs sm:text-sm opacity-90">🌤️ ${g.softNote}</div>` : '') +
        (g.avg24 ? `<div class="mt-1.5 text-xs sm:text-sm opacity-90">ℹ️ ${g.avg24}</div>` : '');
      const when = lvl > 0 && g.goodWindow ? `<div class="text-sm mt-1">🌬️ צפוי פיזור טוב יותר החל מ-<strong>${dayWord(g.goodWindow)} בשעה <bdi class="mono">${g.goodWindow.time}</bdi></strong></div>` : '';
      // current wind: own anemometer, else Kiryat Ata (97, as the detector does for Motzkin), else the forecast
      const kb = STATIONS_DATA.find(o => o.id === 'kiryat_binyamin');
      const wSrc = (st.last30m && st.last30m.windDir != null) ? [st.last30m.windDir, st.last30m.windSpeed, '']
        : (kb && kb.last30m && kb.last30m.windDir != null) ? [kb.last30m.windDir, kb.last30m.windSpeed, ' • קריית אתא']
        : (WIND_FORECAST_CACHE && WIND_FORECAST_CACHE[0] && WIND_FORECAST_CACHE[0].wd != null) ? [WIND_FORECAST_CACHE[0].wd, WIND_FORECAST_CACHE[0].ws, ' • תחזית'] : null;
      const windTag = wSrc ? `<span class="inline-flex items-center min-h-[42px] px-3 rounded-full text-[13px] font-bold bg-black/25 border border-white/15">🧭 רוח מ${degToCompassHe(wSrc[0])} · <bdi dir="ltr">${Math.round(wSrc[0])}°</bdi>${wSrc[1] != null ? ' · <bdi dir="ltr">' + Number(wSrc[1]).toFixed(1) + '</bdi> מ/ש' : ''}${wSrc[2]}</span>` : '';
      const upd = st.live && st.live.measuredAt ? new Date(st.live.measuredAt).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) : '';
      el.className = 'rounded-3xl border-2 px-5 py-4 shadow-xl ' + L.cls;
      el.innerHTML = `<div class="flex items-center gap-3">
          <span class="text-4xl leading-none">${L.icon}</span>
          <div class="min-w-0">
            <div class="text-xl sm:text-2xl font-extrabold leading-tight">${L.title}</div>
            <div class="text-sm sm:text-base opacity-95 mt-0.5">${g.reason}</div>
            ${when}
          </div>
        </div>
        ${because}${areaNote}${avg}
        <div class="flex flex-wrap items-center gap-2 mt-2">
          ${windTag}
          <span class="text-[13px]">${upd ? 'עודכן ' + upd + ' • ' : ''}${st.shortName}</span>
        </div>
        <div class="mt-2">${reportButtons(!!g.smoke || /^(🚨|💨)/.test(g.area))}</div>
        ${window.__verdictHTML ? `<details class="mt-2 text-xs"><summary class="cursor-pointer min-h-[42px] flex items-center text-[13px] font-bold">▾ פרטים נוספים</summary><div class="mt-2 p-2.5 rounded-xl bg-black/25 border border-white/10 flex flex-wrap items-center gap-x-3 gap-y-1.5">${window.__verdictHTML}</div></details>` : ''}`;
      isolateLtr(el);
    }

    // WHO 2021 24-hour guidelines vs. 24-hour means only (the legal daily limit marks the red tone)
    function whoExceedances() { return AQGuidance.whoExceedances(STATIONS_DATA); }

    function renderPublicVerdict() {
      const el = document.getElementById('publicVerdict');
      const R = (window.FIRE_LIVE || window.FIRE_V2B);
      if (!el) return;
      if (!R) { el.classList.add('hidden'); return; }
      const v = R.latest, at = v2bHourLabel(v.t);
      const name = id => (STATIONS_DATA.find(s => s.id === id) || {}).shortName || id;
      const hot = v.stations.filter(x => x.level === 'high' || x.level === 'watch').map(x => name(x.id));
      const V = {
        fire: ['', '', 'עשן מגיע ל' + hot.join(', ') + '.', 'bg-orange-950/60 border-orange-500/60 text-orange-100'],
        smoke: ['', '', 'סימני עשן ב' + hot.join(', ') + '. כדאי לעקוב.', 'bg-amber-950/50 border-amber-500/50 text-amber-100'],
        dust: ['🏜️', 'אובך / אבק באזור', 'האוויר מאובק, לא עשן שריפה.', 'bg-yellow-950/40 border-yellow-500/50 text-yellow-100'],
        regional: ['🌁', 'אוויר עומד (משוער)', 'החלקיקים עולים יחד בכל הקריות (כנראה אינוורסיה), לא שריפה מקומית.', 'bg-slate-800/80 border-slate-500/60 text-slate-100'],
        clear: ['🟢', 'אין חריגה מיוחדת בקריות', 'לא זוהו סימני שריפה, אובך או אוויר עומד, והממוצעים היממתיים בתוך יעדי WHO.', 'bg-emerald-950/40 border-emerald-600/50 text-emerald-100']
      }[v.kind];
      // no smoke/dust but 24 h means above WHO: the card already says so (avg24 line) -> no extra sub-card
      if (v.kind === 'clear' && whoExceedances().length) {
        window.__verdictHTML = '';
        el.className = 'hidden'; el.innerHTML = '';
        renderDecisionCard();
        return;
      }
      const extra = (v.kind === 'fire' || v.kind === 'smoke') && v.regional ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 border border-slate-600 text-slate-200">🌁 גם אוויר עומד באזור</span>' : '';
      const invHelp = 'אינוורסיה: בלילות שקטים שכבת אוויר חם נמצאת מעל אוויר קר ליד הקרקע וסוגרת עליו כמו מכסה, כך שהזיהום לא מתפזר ומצטבר בכל האזור. זה לא אומר שיש שריפה.';
      const help = v.regional ? `<span class="basis-full text-[11px] sm:text-xs opacity-75">ℹ️ ${invHelp}</span>` : '';
      el.className = 'rounded-2xl border px-4 py-3 shadow-md flex flex-wrap items-center gap-x-3 gap-y-1 ' + V[3];
      el.innerHTML = `<span class="text-2xl leading-none">${V[0]}</span>
        <span class="text-base sm:text-lg font-extrabold"${v.regional ? ` title="${invHelp}"` : ''}>${V[1]}</span>
        <span class="text-xs sm:text-sm opacity-90">${V[2]}</span>${extra}
        <span class="text-[11px] opacity-70 basis-full">נכון ל-<span class="mono">${at}</span></span>${help}`;
      window.__verdictHTML = el.innerHTML;
      el.className = 'hidden'; el.innerHTML = '';
      renderDecisionCard();
    }

    // OFFLINE FALLBACK ONLY: the pre-v2b detector. Used solely when FireV2B produced no result for a
    // station (history not loaded yet / failed, or a non-PM station). The live verdict comes from fire_v2b.js.
    function detectPirateFireSignatureLegacy(st, allStations = null, opts = {}) {
      const m = st.metrics || {};
      const r30 = st.last30m || {};
      const nowMs = opts.nowMs || Date.now();

      const hasVal = (key) => {
        if (Array.isArray(r30[key + '_series'])) return extractRecent30mValue(r30[key + '_series'], nowMs) !== null;
        if (r30[key] !== undefined && r30[key] !== null) return true;
        if (m[key] && (m[key].halfHour !== undefined || m[key].hourly !== undefined)) return true;
        return false;
      };
      const get30m = (key) => {
        if (Array.isArray(r30[key + '_series'])) return extractRecent30mValue(r30[key + '_series'], nowMs) ?? 0;
        if (r30[key] !== undefined && r30[key] !== null) return Number(r30[key]);
        if (m[key] && m[key].halfHour !== undefined) return Number(m[key].halfHour);
        if (m[key] && m[key].hourly !== undefined) return Number(m[key].hourly);
        return 0;
      };

      const pm25 = hasVal('PM25') ? get30m('PM25') : 0;
      const hasPM10 = hasVal('PM10') && get30m('PM10') > 0;
      const pm10 = hasPM10 ? get30m('PM10') : 0;
      const ratio = hasPM10 ? +(pm25 / pm10).toFixed(2) : null;

      let baselinePM25 = null;
      if (Array.isArray(r30.history24h) && r30.history24h.length >= 4) {
        baselinePM25 = computePercentile25(r30.history24h);
      } else if (r30.baselinePM25 !== undefined && r30.baselinePM25 !== null) {
        baselinePM25 = Number(r30.baselinePM25);
      } else if (st.baselinePM25 !== undefined && st.baselinePM25 !== null) {
        baselinePM25 = Number(st.baselinePM25);
      }
      const delta = (baselinePM25 !== null) ? (pm25 - baselinePM25) : null;

      let corePts = 0;
      let availableCoreMax = 0;
      const matched = [];
      const coreSources = ['ליבה'];

      if (hasVal('PM25')) {
        availableCoreMax += 50;
        corePts += scaleLinear(pm25, 15, 60, 50);
        if (pm25 >= 20) matched.push(`PM2.5: ${pm25} µg/m³`);
      }
      if (delta !== null) {
        availableCoreMax += 25;
        corePts += scaleLinear(delta, 8, 30, 25);
        if (delta >= 8) matched.push(`Δ מול P25 (24ש'): +${delta.toFixed(1)}`);
      }
      if (ratio !== null) {
        availableCoreMax += 25;
        corePts += scaleLinear(ratio, 0.50, 0.72, 25);
        if (ratio >= 0.55) matched.push(`יחס PM2.5/PM10=${ratio}`);
      }

      const corePct = availableCoreMax > 0 ? (corePts / availableCoreMax) * 100.0 : 0;

      let isMineralDust = Boolean(hasPM10 && pm10 >= 50 && ratio !== null && ratio < 0.45);
      let dustSource = isMineralDust ? 'local' : null;
      if (!hasPM10 && !opts.skipNeighborDust) {
        const pool = Array.isArray(allStations) ? allStations : (typeof STATIONS_DATA !== 'undefined' ? STATIONS_DATA : []);
        const krayotNeighbors = pool.filter(other => other.id !== st.id && other.group === 'krayot');
        const dustNeighbors = krayotNeighbors.filter(other => detectPirateFireSignatureLegacy(other, pool, { ...opts, skipNeighborDust: true }).isMineralDust);
        if (dustNeighbors.length >= 2) {
          isMineralDust = true;
          dustSource = 'regional';
        }
      }
      const dustPenalty = isMineralDust ? 35.0 : 0.0;
      if (isMineralDust) matched.push(dustSource === 'regional' ? 'אובך מינרלי אזורי (2+ תחנות)' : `אובך מינרלי (יחס ${ratio})`);

      const windResolved = resolveWindForStation(st, allStations);
      const windDir = windResolved.windDir;
      const windSpeed = windResolved.windSpeed;
      const hourNow = (r30.hour !== undefined ? Number(r30.hour) : new Date(nowMs).getHours());
      const isNight = (hourNow >= 19 || hourNow <= 7);

      let boostPts = 0;
      if (!isMineralDust) {
        let windPts = 0;
        if (windDir !== null) {
          const inVillageSector = (windDir >= 30 && windDir <= 150) && (windSpeed === null || windSpeed <= 5.5);
          const isNightInversion = (windSpeed !== null && windSpeed < 2.0 && isNight);
          if (inVillageSector && isNightInversion) {
            windPts = 12;
            matched.push(`רוח כפרים ${windDir}° + אינברסיה`);
          } else if (inVillageSector) {
            windPts = 10;
            matched.push(`רוח מזרחית/צפ'-מז' ${windDir}°`);
          } else if (isNightInversion) {
            windPts = 8;
            matched.push(`רוח לילית חלשה ${windSpeed}m/s`);
          } else if (windDir >= 260 && windDir <= 340 && windSpeed !== null && windSpeed > 4.0) {
            windPts = -8;
          }
        } else if (st.wind && (st.wind.includes('112.5') || st.wind.includes('חלשה'))) {
          windPts = 6;
          matched.push('רוח לכידה לילית');
        }
        boostPts += windPts;
      }

      let coBonus = 0;
      if (r30.CO !== undefined && r30.CO !== null) {
        const co = Number(r30.CO);
        const coDelta = r30.coDelta !== undefined ? Number(r30.coDelta) : 0;
        if (co >= 0.8 || coDelta >= 0.35) {
          coBonus = Math.max(scaleLinear(co, 0.6, 1.5, 12), scaleLinear(coDelta, 0.25, 0.6, 12));
          const nox = r30.NOX !== undefined ? Number(r30.NOX) : (m.NO2 ? m.NO2.hourly * 2 : 0);
          if (nox > 50 || (r30.noxDelta && Number(r30.noxDelta) > 25)) {
            coBonus *= 0.30;
          }
          if (coBonus >= 2) {
            matched.push(`CO: ${co} ppm`);
            coreSources.push('CO');
          }
        }
      }
      boostPts += coBonus;

      let c6Bonus = 0;
      if (hasVal('C6H6')) {
        const c6 = get30m('C6H6');
        const c6Delta = r30.c6h6Delta !== undefined ? Number(r30.c6h6Delta) : 0;
        const so2 = hasVal('SO2') ? get30m('SO2') : (r30.SO2 !== undefined ? Number(r30.SO2) : 0);
        const fromBazanSector = (windDir !== null && windDir >= 170 && windDir <= 250);
        const industrialSO2 = (so2 >= 25 || (r30.so2Delta && Number(r30.so2Delta) >= 15));
        if (!fromBazanSector && !industrialSO2 && (c6 >= 3.0 || c6Delta >= 1.2)) {
          c6Bonus = scaleLinear(c6, 2.5, 5.0, 8);
          if (c6Bonus >= 1.5) {
            matched.push(`C₆H₆: ${c6} µg/m³`);
            coreSources.push('בנזן');
          }
        }
      }
      boostPts += c6Bonus;

      const cappedBoost = Math.min(25.0, boostPts);
      const rawScore = corePct + cappedBoost - dustPenalty;
      let finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

      let activeSignalsCount = 0;
      if (pm25 >= 20) activeSignalsCount++;
      if (delta !== null && delta >= 8) activeSignalsCount++;
      if (ratio !== null && ratio >= 0.55) activeSignalsCount++;
      if (coBonus >= 2) activeSignalsCount++;
      if (c6Bonus >= 1.5) activeSignalsCount++;

      let lowConfidence = false;
      if (activeSignalsCount <= 1 && pm25 < 75) {
        if (finalScore > 65) finalScore = 65;
        lowConfidence = true;
      }

      const sensorCount = (hasVal('PM25') ? 1 : 0) + (delta !== null ? 1 : 0) + (ratio !== null ? 1 : 0) + (coBonus > 0 ? 1 : 0) + (c6Bonus > 0 ? 1 : 0) + (windDir !== null ? 1 : 0);

      if (isMineralDust && finalScore < 70) {
        return {
          detected: false, level: 'dust', score: finalScore, sensorCount, lowConfidence, isMineralDust: true,
          windowLabel: "30 דקות אחרונות", badgeText: "🏜️ אובך מינרלי (לא זוהתה חתימת שריפה)", shortBadge: "🏜️ אובך",
          matched, summary: dustSource === 'regional' ? 'זוהה אובך מינרלי אזורי בתחנות סמוכות' : `זוהה אובך מינרלי (PM2.5/PM10 נמוך: ${ratio})`
        };
      }
      if (finalScore >= 70 && pm25 >= 28 && !isMineralDust && (activeSignalsCount >= 2 || pm25 >= 75)) {
        return {
          detected: true, level: 'high', score: finalScore, sensorCount, lowConfidence, isMineralDust: false,
          windowLabel: "30 דקות אחרונות", badgeText: "🚨 סבירות גבוהה מאוד לריח חריף / עשן (30 דקות אחרונות)", shortBadge: "🚨 ריח חריף / עשן (30 דקות)",
          matched, summary: `מבוסס על ${Math.max(1, sensorCount)} מדדים (${coreSources.join(' + ')})`
        };
      }
      if (finalScore >= 45 && pm25 >= 18) {
        return {
          detected: true, level: 'watch', score: finalScore, sensorCount, lowConfidence, isMineralDust: false,
          windowLabel: "30 דקות אחרונות", badgeText: "💨 ייתכן ריח חריף / עשן (30 דקות אחרונות)", shortBadge: "💨 ייתכן ריח / עשן (30 דקות)",
          matched, summary: lowConfidence ? 'ביטחון מוגבל (אות בודד בלבד)' : `מבוסס על ${Math.max(1, sensorCount)} מדדים (${coreSources.join(' + ')})`
        };
      }
      return {
        detected: false, level: 'none', score: finalScore, sensorCount, lowConfidence, isMineralDust: false,
        windowLabel: "30 דקות אחרונות", badgeText: "🟢 ללא חתימת שריפה ב-30 הדקות האחרונות", shortBadge: '',
        matched, summary: `מבוסס על ${Math.max(1, sensorCount)} מדדים`
      };
    }

    function getPastDateLabel(daysAgo) {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}`;
    }

    function getPastHourSlot(hoursAgo) {
      const d = new Date();
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() - hoursAgo);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      return { label: `${dd}/${mm} ${hh}:00`, shortLabel: `${hh}:00 (${dd}/${mm})`, hour24: d.getHours() };
    }

    function runRetrospectiveFireScan(st) {
      // real episodes from the hourly archive (js/fire_v2b.js), no synthetic profiles
      const R = window.FIRE_V2B;
      if (!R || !R.S[st.id] || !window.FireV2B) return { peakHours: [], peakDays: [], peakMonths: [] };
      const eps = FireV2B.episodes(R, st.id);
      const lastT = R.axis[R.axis.length - 1];
      const hrs = n => n === 1 ? 'שעה אחת' : n + ' שעות';
      const fmt = e => (e.peak >= FireV2B.HIGH ? '🚨 ' : '💨 ') + v2bHourLabel(R.axis[e.start]) + ' (' + hrs(v2bEpisodeHours(R, st.id, e)) + ')';
      const peakHours = eps.filter(e => lastT - R.axis[e.end] <= 86400000).map(fmt);
      if (!peakHours.length) { // no smoke score >= 55 in the last 24 h: show WHO 2021 hours and the PM2.5 peak instead
        const ch = R.S[st.id], from = Math.max(0, R.axis.length - 24);
        let n = 0, pk = -1, pkI = -1; const who = AQStd.limit('PM25', 'd', 'target');
        for (let i = from; i < R.axis.length; i++) { const v = ch.PM25[i]; if (v == null) continue; if (v > who) n++; if (v > pk) { pk = v; pkI = i; } }
        if (pkI >= 0) peakHours.push(`ℹ️ אין אירוע עשן; ${n ? hrs(n) + ` מעל יעד WHO 2021 (${who})` : 'כל השעות בתוך יעד WHO 2021'} • שיא PM2.5 ${pk.toFixed(1)} µg/m³ ב-${v2bHourLabel(R.axis[pkI])}`);
      }
      const peakDays = eps.filter(e => lastT - R.axis[e.end] <= 30 * 86400000).slice(-12).reverse().map(fmt);
      const byMonth = {};
      eps.forEach(e => {
        const k = new Date(R.axis[e.start]).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', month: '2-digit', year: 'numeric' });
        byMonth[k] = byMonth[k] || { n: 0, hi: 0 }; byMonth[k].n++; if (e.peak >= FireV2B.HIGH) byMonth[k].hi++;
      });
      const peakMonths = Object.entries(byMonth).map(([k, v]) => k + ': ' + v.n + ' אירועים' + (v.hi ? ' (' + v.hi + ' 🚨)' : ''));
      return { peakHours, peakDays, peakMonths };
    }

    function jumpToTrend(pol, horizon) {
      if (APP_STATE.activeTab !== 'trends') switchTab('trends');
      const selPol = document.getElementById('trendPollutantSelect');
      const selHor = document.getElementById('trendHorizonSelect');
      if (selPol && selHor) {
        selPol.value = pol;
        selHor.value = horizon;
        updateCharts();
        document.getElementById('chartTimeTrend')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function renderPirateFirePanel() {
      const st = STATIONS_DATA.find(s => s.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
      const panel = document.getElementById('pirateFireIntelPanel');
      const retroPanel = document.getElementById('pirateFireRetroPanel');
      if (!panel) return;

      const sig = detectPirateFireSignature(st);
      const retro = runRetrospectiveFireScan(st);

      const badgeStyle = sig.level === 'high'
        ? 'bg-orange-500/20 text-orange-200 border-orange-500/60'
        : (sig.level === 'watch' ? 'bg-amber-500/20 text-amber-200 border-amber-500/60'
          : ((sig.isMineralDust || sig.level === 'dust') ? 'bg-yellow-500/20 text-yellow-200 border-yellow-500/60' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'));

      // plain status + a 2-line explanation; the scientific details live in docs/fire-detector-analysis.md
      panel.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-1 rounded-full text-xs font-extrabold border ${badgeStyle}">${sig.badgeText}</span>
          </div>
          <button type="button" onclick="switchTab('trends'); setTimeout(() => document.getElementById('pirateFireRetroPanel')?.scrollIntoView({behavior:'smooth'}), 150)" class="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-orange-200 text-xs font-extrabold">
            מתי היו סימני עשן? ↓
          </button>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed">
          🔥 שריפות גזם ופסולת מסביב מעלות חלקיקים עדינים בתחנה אחת או שתיים, בעיקר בלילה כשהרוח מהמזרח.
          אבק, או אוויר עומד שמעלה את כל האזור יחד, לא נחשבים עשן שריפה.
        </p>
      `;

      if (retroPanel) {
        retroPanel.innerHTML = `
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 class="text-sm sm:text-base font-extrabold text-amber-300 flex items-center gap-2">
                <i data-lucide="history" class="w-4 h-4 text-amber-400"></i>
                <span>מתי היו סימני עשן ב${st.shortName}?</span>
              </h2>
              <p class="text-xs text-slate-400 mt-0.5">
                מתוך המדידות השעתיות של התחנה (רק בתחנות שמודדות חלקיקים).
              </p>
            </div>
            <button type="button" onclick="jumpToTrend('PM25','hourly')" class="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-orange-200 text-xs font-extrabold shrink-0 self-start sm:self-center transition">
              הצג בגרף המגמה ↓
            </button>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
            <div class="bg-slate-950/75 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div class="font-bold text-white">1. אירועים ב-24 השעות האחרונות:</div>
              <div class="flex flex-wrap gap-1">
                ${retro.peakHours.length ? retro.peakHours.map(h => `<button type="button" onclick="jumpToTrend('PM25','hourly')" class="px-2 py-0.5 rounded bg-orange-950/60 border border-orange-700/50 text-orange-200 mono hover:bg-orange-900/60 transition">${h}</button>`).join('') : '<span class="text-slate-400">לא זוהו אירועי עשן או שריפה.</span>'}
              </div>
            </div>
            <div class="bg-slate-950/75 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div class="font-bold text-white">2. אירועים ב-30 הימים האחרונים:</div>
              <div class="flex flex-wrap gap-1">
                ${retro.peakDays.length ? retro.peakDays.map(d => `<button type="button" onclick="jumpToTrend('PM25','daily')" class="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-700/50 text-amber-200 mono hover:bg-amber-900/60 transition">${d}</button>`).join('') : '<span class="text-slate-400">לא זוהו אירועים.</span>'}
              </div>
            </div>
            <div class="bg-slate-950/75 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div class="font-bold text-white">3. אירועים לפי חודש (90 יום):</div>
              <div class="flex flex-wrap gap-1">
                ${retro.peakMonths.length ? retro.peakMonths.map(mo => `<button type="button" onclick="jumpToTrend('PM25','monthly')" class="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-200 mono hover:bg-slate-700 transition">${mo}</button>`).join('') : '<span class="text-slate-400">לא זוהו אירועים ב-90 הימים.</span>'}
              </div>
            </div>
          </div>

          <div class="bg-slate-950/60 border border-slate-800/90 rounded-xl p-3 text-xs text-slate-300 leading-relaxed">
            <strong class="text-white">סיכום תחנה (${st.shortName}):</strong>
            שיא <span class="mono">PM2.5</span> יממתי ב-30 יום: <span class="mono text-white">${st.pm25_max24h ?? '—'} µg/m³</span> • ממוצע 30 יום: <span class="mono text-white">${st.pm25_annual ?? '—'} µg/m³</span>. האירועים מחושבים מהארכיון השעתי האמיתי בגלאי v2b (כולל סינון אובך ואינוורסיה).
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
      }
    }

    function renderStationInspector() {
      const st = STATIONS_DATA.find(s => s.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
      const container = document.getElementById('stationInspectorCard');

      const exceedances = [];
      const c6L = AQStd.limit('C6H6', 'd', 'env'), pm25D = AQStd.limit('PM25', 'd', 'env'), pm25M = AQStd.limit('PM25', 'm', 'env'), pm25W = AQStd.limit('PM25', 'm', 'target'), no2M = AQStd.limit('NO2', 'm', 'env'), pm10D = AQStd.limit('PM10', 'd', 'env'), ch2oH = AQStd.limit('CH2O', 'h', 'env'), o3M = AQStd.limit('O3', 'm', 'env');
      if (st.c6h6_max24h > c6L) exceedances.push({ color: 'purple', text: `בנזן: ${st.c6h6_exceedDays === 1 ? 'יום אחד' : st.c6h6_exceedDays + ' ימים'} מעל התקן היממתי ${c6L} ב-30 הימים האחרונים (שיא ${st.c6h6_max24h} µg/m³)` });
      if (st.pm25_max24h > pm25D) exceedances.push({ color: 'purple', text: `PM2.5: שיא יממתי ${st.pm25_max24h} µg/m³ ב-30 יום (תקן ${pm25D})` });
      else if (st.pm25_annual > pm25W) exceedances.push({ color: 'rose', text: `PM2.5 מעל יעד WHO 2021 (ממוצע 30 יום ${st.pm25_annual} מול ${pm25W}; תקן חוקי שנתי ${pm25M})` });
      if (st.ch2o_exceed1h > 0) exceedances.push({ color: 'purple', text: `פורמאלדהיד: ${st.ch2o_exceed1h} עליות שעתיות מעל ${ch2oH} µg/m³` });
      if (st.no2_annual > no2M) exceedances.push({ color: 'purple', text: `NO₂ ממוצע 30 יום ${st.no2_annual} µg/m³ (מעל התקן השנתי ${no2M})` });
      if (st.bap_exceedDays > 0) exceedances.push({ color: 'rose', text: `בנזו-א-פירן (מסרטן): ${st.bap_exceedDays} יממות מעל ערך היעד הבריאותי` });
      if (st.pm10_max24h > pm10D) exceedances.push({ color: 'purple', text: `PM10: שיא יממתי ${st.pm10_max24h} µg/m³ ב-30 יום (תקן ${pm10D})` });
      if (!exceedances.length && st.status !== 'unknown') exceedances.push({ color: 'green', text: 'אין חריגה מתקן או מיעד WHO במזהמים שנמדדים כאן (30 יום)' });
      if (st.o3_annual > o3M) exceedances.push({ color: 'rose', text: `אוזון שנתי גבוה (${st.o3_annual} µg/m³) עם עליות מעל יעד 8-שעתי` });

      container.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h2 class="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2">${st.shortName}${(() => { const wl = stationLevel(st); return wl == null ? '' : `<span class="px-2 py-0.5 rounded-md border text-xs font-extrabold ${WORD_LEVELS[wl].cls}">${WORD_LEVELS[wl].word}</span>`; })()}</h2>
            ${STATION_AREA[st.id] ? `<div class="text-xs text-slate-400 mt-0.5">📍 ${STATION_AREA[st.id]}</div>` : ''}
          </div>
          <div class="flex items-center gap-2.5 self-start sm:self-center">
          </div>
        </div>
      `;
      // advanced details sit at the bottom of the same card, below the pollutant accordions
      const adv = document.getElementById('stationAdvanced');
      if (adv) adv.innerHTML = `
        <details class="bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs">
          <summary class="cursor-pointer font-bold text-slate-300">⚙️ פרטים מתקדמים למתעניינים</summary>
          <div class="space-y-2 pt-2 text-slate-300">
            ${DEV_MODE ? `<div class="flex flex-wrap items-center gap-2"><span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-sky-500/20 text-sky-300 mono">${st.code}</span><span class="text-slate-400">${st.owner}</span></div>
            <div class="text-slate-400">${st.name} • ${st.location}</div>` : `<div class="text-slate-400">${st.owner}</div>`}
            <div class="font-bold">${st.statusText} <span class="font-normal text-slate-400">(${Object.keys(st.metrics || {}).filter(k => POLLUTANT_STANDARDS[k]).length} מזהמים נמדדים)</span></div>
            <div class="flex flex-wrap gap-1.5">
              ${exceedances.map(ex => `<span dir="rtl" class="block w-full text-right leading-relaxed px-2.5 py-1 rounded-lg font-semibold border ${ex.color === 'purple' ? 'bg-purple-950/50 border-purple-700/70 text-purple-200' : (ex.color === 'green' ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200' : 'bg-rose-950/50 border-rose-700/70 text-rose-200')}">${ex.color === 'purple' ? '🟣' : (ex.color === 'green' ? '🟢' : '🔴')} ${ex.text.replace(/;\s*/g, ' • ').replace(/([A-Za-z][A-Za-z0-9.₀-₉]*(?: \d{4})?|\d+(?:\.\d+)?)/g, '<bdi dir="ltr">$1</bdi>')}</span>`).join('')}
            </div>
            <p class="leading-relaxed text-slate-400">${st.notes}</p>
          </div>
        </details>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    function renderPollutantCards() {
      const st = STATIONS_DATA.find(s => s.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
      const grid = document.getElementById('pollutantCardsGrid');
      const isTarget = APP_STATE.benchmarkMode === 'target';

      // fixed display order: particles, gases, benzene (indicative) last
      const keys = Object.keys(POLLUTANT_STANDARDS).filter(k => st.metrics && st.metrics[k]).sort((a, b) => (a === 'C6H6') - (b === 'C6H6'));
      if (!keys.length) { grid.innerHTML = '<div class="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs">ממתין לנתוני אמת מהתחנה…</div>'; return; }
      // keep the rows (and their 💡 explainers) the user opened when only the mode / unit changes
      const sameStation = grid.dataset.station === st.id;
      const openRows = sameStation ? [...grid.querySelectorAll('details[data-pol][open]')].map(d => d.dataset.pol) : [];
      const openTips = sameStation ? [...grid.querySelectorAll('details[data-pol-tip][open]')].map(d => d.dataset.polTip) : [];
      grid.dataset.station = st.id;
      grid.innerHTML = keys.map(key => {
        const std = POLLUTANT_STANDARDS[key];
        const m = st.metrics[key];
        const guide = INTUITIVE_GUIDE[key];

        const hLimit = isTarget ? std.hTarget : std.hEnv;
        const dLimit = isTarget ? std.dTarget : std.dEnv;
        const mLimit = isTarget ? std.mTarget : std.mEnv;

        const hPct = (m.hourly == null || std.noHourlyStd) ? 0 : Math.round((m.hourly / hLimit) * 100);
        const dPct = m.daily == null ? 0 : Math.round((m.daily / dLimit) * 100);
        const mPct = (m.monthly == null || !m.monthlyReal) ? 0 : Math.round((m.monthly / mLimit) * 100);

        const maxPct = Math.max(hPct, dPct, mPct);

        // collapsed row = last hour only (8-h mean for O3): hourly limit, or the active 24-h limit for PM;
        // benzene has no short-term limit -> neutral indicative label. 24 h / 30 days stay in the expanded rows.
        const bar = AQGuidance.barStatus(key, m.hourly, APP_STATE.benchmarkMode);
        const nowLvl = bar.lvl, nowIndicative = bar.indicative;
        const borderCol = nowLvl === 2 ? (isTarget ? 'border-rose-600/80 bg-rose-950/15' : 'border-purple-600/80 bg-purple-950/15') : 'border-slate-800 bg-slate-950/70';
        const unitLbl = std.isGas ? getUnitLabel(key) : 'µg/m³';
        const dec = key === 'BaP' ? 5 : (key === 'C6H6' || key === 'H2S' ? 2 : 1);

        const renderTimeRow = (tfKey, label, val, limit, pct, subNote, targetLimit) => {
          // in ppb mode the limits written in the label are converted too, so value, limit and % share one unit
          subNote = AQStd.convertLabel(subNote, key, APP_STATE.unitMode);
          // no nested parentheses inside the "(…)" wrapper: inner "(יעד WHO: 15)" becomes "• יעד WHO: 15"
          subNote = String(subNote || '').replace(/\s*\(([^()]*)\)/g, ' • $1');
          if (val === null || val === undefined || isNaN(val)) {
            return `<div class="flex items-center justify-between text-xs"><span class="text-slate-400 font-semibold">${label}</span><span class="text-slate-400">${tfKey === 'monthly' ? 'עוד אין 30 יום מלאים' : 'אין נתון'}</span></div>`;
          }
          if (tfKey === 'hourly' && std.noHourlyStd) {
            return `<div class="flex flex-wrap items-center justify-between gap-1 text-xs"><span class="text-slate-400 font-semibold">${label} <span class="text-[10px] text-slate-400">(${subNote})</span></span><span class="mono text-slate-200 font-bold">${std.isGas ? formatGasValue(val, key, dec) : Number(val).toFixed(dec)} ${unitLbl}</span></div>`;
          }
          const barW = Math.min(100, pct);
          const barCol = pct > 100 ? (isTarget ? 'bg-rose-500' : 'bg-purple-500') : 'bg-emerald-400';
          const txtCol = pct > 100 ? (isTarget ? 'text-rose-300 font-extrabold' : 'text-purple-300 font-extrabold') : 'text-emerald-300 font-bold';
          const targetPct = targetLimit ? Math.round((val / targetLimit) * 100) : 0;
          const showHealthGap = !isTarget && pct <= 100 && targetPct > 100;
          const overLbl = pct > 100 && tfKey !== 'hourly'
            ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[10px] font-bold">${tfKey === 'daily' ? (key === 'O3' ? 'שיא יומי מעל ' : 'ממוצע יומי מעל ') : 'ממוצע 30 יום מעל '}${isTarget ? 'יעד' : 'תקן'}</span>` : '';
          return `
            <div class="space-y-1">
              <div class="flex flex-wrap items-center justify-between gap-1 text-xs">
                <span class="text-slate-400 font-semibold">${label} <span class="text-[10px] text-slate-400">(${subNote})</span></span>
                <div class="flex items-center gap-1.5">
                  ${overLbl}${showHealthGap ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[10px] font-bold mono">⚠️ ${targetPct}% מיעד בריאותי</span>` : ''}
                  <span class="mono ${txtCol}">${std.isGas ? formatGasValue(val, key, dec) : val.toFixed(dec)} ${unitLbl} <span class="text-[11px]">(${pct}%)</span></span>
                </div>
              </div>
              <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full ${barCol} rounded-full transition-all" style="width: ${barW}%"></div>
              </div>
            </div>
          `;
        };

        const accW = [bar.word, bar.txtCls, bar.barCls];
        const nowBarW = bar.width;
        return { pct: maxPct, html: `
          <details data-pol="${key}" class="rounded-2xl border ${borderCol} group">
          <summary class="list-none cursor-pointer p-3 flex items-center gap-3">
            <span class="min-w-0 flex-1">
              <span class="text-sm font-extrabold text-white">${std.name}</span>
              <span class="text-[11px] text-slate-400 ms-1">${std.formula}</span>
              <span class="block h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5"><span class="block h-full ${accW[2]} rounded-full" style="width:${nowBarW}%"></span></span>
            </span>
            <span class="text-xs font-extrabold ${accW[1]} shrink-0">${accW[0]}</span>
            <span class="text-slate-400 text-xs shrink-0 group-open:rotate-180 transition">▾</span>
          </summary>
          <div class="px-3.5 pb-3.5 flex flex-col justify-between space-y-3">
            <div class="space-y-2.5">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-sm font-extrabold text-white">${std.name}</span>
                    <span class="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 mono text-[11px] font-bold">${std.formula}</span>
                    ${detectPirateFireSignature(st).isMineralDust && key === 'PM25' ? '<span class="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 text-[10px] font-bold">🏜️ אובך מינרלי</span>' : ''}
                  </div>
                  <div class="text-[11px] text-slate-400 mt-0.5">${guide.short}</div>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 bg-black/30 border border-white/10 ${accW[1]}">עכשיו: ${accW[0]}</span>
              </div>

              <!-- Hourly / Daily / Monthly Bars -->
              <div class="space-y-2 pt-1">
                ${renderTimeRow('hourly', key === 'O3' && m.window === '8h' ? 'עכשיו (8 שעות)' : 'שעתי', m.hourly, hLimit, hPct, std.noHourlyStd ? 'ללא תקן שעתי' : std.hLabel, std.hTarget)}
                ${renderTimeRow('daily', key === 'O3' && m.window === '8h' ? 'שיא יומי (8 שעות)' : 'יומי (24ש\')', m.daily, dLimit, dPct, key === 'NO2' && !isTarget ? 'תקן יממתי: 80 (יעד WHO: 25)' : std.dLabel, std.dTarget)}
                ${renderTimeRow('monthly', 'מגמת 30 יום (מול תקן שנתי)', m.monthlyReal ? m.monthly : null, mLimit, mPct, std.mLabel, std.mTarget)}
              </div>
            </div>

            <!-- Intuitive Expandable Explanation -->
            <details data-pol-tip="${key}" class="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-xs">
              <summary class="cursor-pointer font-bold text-sky-300 flex items-center justify-between">
                <span>💡 מה זה אומר בשבילי? (הסבר פשוט)</span>
                <span class="text-[10px] text-slate-400">פתח ▾</span>
              </summary>
              <div class="mt-2 space-y-1.5 text-slate-300 leading-relaxed">
                <p>${guide.simple}</p>
                <p class="text-amber-300 font-semibold">${guide.action}</p>
              </div>
            </details>
          </div>
          </details>
        ` };
      }).map(c => c.html).join('');
      openRows.forEach(k => { const d = grid.querySelector(`details[data-pol="${k}"]`); if (d) d.open = true; });
      openTips.forEach(k => { const d = grid.querySelector(`details[data-pol-tip="${k}"]`); if (d) d.open = true; });
    }

    // "HH:00 (DD/MM)" in Israel local time (correct in summer too; archive stamps are fixed +02:00)
    function ilHourLabel(t) {
      const d = new Date(t);
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', day: '2-digit', month: '2-digit', hourCycle: 'h23' })
        .formatToParts(d).map(x => [x.type, x.value]));
      return `${p.hour}:00 (${p.day}/${p.month})`;
    }

    // length of a v2b episode in hours: flagged hours, plus the previous hour when the 2-hour
    // persistence rule used it (a lone single-hour alert is 1 hour, not 2)
    function v2bEpisodeHours(R, id, e) {
      const T = R.S[id].T;
      return e.end - e.start + 1 + (e.start > 0 && T[e.start - 1] != null && T[e.start - 1] >= FireV2B.WATCH ? 1 : 0);
    }

    // top-level so both loadLiveData and the JSON import (btnParseJson) can call it
    function updateLastUpdatedTimestamp(customLabel) {
      const el = document.getElementById('lastUpdatedBadge');
      if (!el || !customLabel) return;
      el.textContent = `נתוני אמת מיובאים (נכון ל-${customLabel}) • תחזית רוח: חיה (Open-Meteo)`;
    }

    function updateCharts() {
      // 1. Time Trend Chart (Hourly 24h / Daily 30d / Monthly 12m)
      const ctxTrend = document.getElementById('chartTimeTrend');
      if (ctxTrend) {
        const st = STATIONS_DATA.find(s => s.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
        // only pollutants this station actually measures (no zero line shown as "no exceedance")
        const polSel = document.getElementById('trendPollutantSelect');
        if (polSel) {
          [...polSel.options].forEach(o => { const ok = !!(st.metrics && st.metrics[o.value]); o.hidden = !ok; o.disabled = !ok; });
          if (polSel.selectedOptions[0] && polSel.selectedOptions[0].disabled) {
            const first = [...polSel.options].find(o => !o.disabled); if (first) polSel.value = first.value;
          }
        }
        const pol = polSel?.value || 'PM25';
        const hor = document.getElementById('trendHorizonSelect')?.value || 'hourly';
        const std = POLLUTANT_STANDARDS[pol] || POLLUTANT_STANDARDS.PM25;
        const base = (st.metrics && st.metrics[pol]) ? st.metrics[pol] : { hourly: 0, daily: 0, monthly: 0 };

        // Deterministic station offset so each station has a distinct curve
        const stIdx = Math.max(0, STATIONS_DATA.findIndex(s => s.id === st.id));
        const shift = (arr, k) => arr.map((_, i) => arr[(i + k) % arr.length]);

        const convertVal = (v) => {
          if (v == null || isNaN(v)) return null;
          if (std.isGas && APP_STATE.unitMode === 'ppb' && GAS_CONVERSION[pol]) {
            return +(v / GAS_CONVERSION[pol]).toFixed(pol === 'BaP' ? 5 : 2);
          }
          return +(Number(v).toFixed(pol === 'BaP' ? 5 : 2));
        };
        const unitLabel = std.isGas ? getUnitLabel(pol) : 'µg/m³';

        let labels = [], rawSeries = [], rawThreshold = 0;
        if (hor === 'hourly') {
          const realRows = (((window.HISTORY_90D || {})[st.id] || {}).rows || []).slice(-24).filter(r => r[pol] != null);
          const useReal = realRows.length >= 6;
          const slots = Array.from({length: 12}, (_, i) => getPastHourSlot((11 - i) * 2));
          labels = useReal
            ? realRows.map(r => ilHourLabel(r.t))
            : slots.map(s => String(s.hour24).padStart(2, "0") + ":00 (פרופיל)");
          let byHour;
          if (pol === 'O3') {
            byHour = [0.48,0.45,0.42,0.40,0.38,0.42,0.46,0.58,0.68,0.78,0.88,0.96,1.02,1.08,1.12,1.10,1.04,0.94,0.82,0.72,0.62,0.56,0.52,0.50];
          } else if (pol === 'NO2') {
            byHour = [0.72,0.68,0.65,0.63,0.62,0.70,0.82,1.04,1.18,1.08,0.96,0.84,0.74,0.70,0.68,0.72,0.78,0.95,1.12,1.06,0.98,0.90,0.82,0.76];
          } else if (pol === 'PM25' || pol === 'PM10' || pol === 'BaP' || pol === 'CH2O') {
            byHour = [1.08,1.12,1.16,1.15,1.12,1.04,0.95,0.86,0.78,0.70,0.62,0.56,0.52,0.50,0.48,0.52,0.58,0.66,0.76,0.88,0.98,1.06,1.14,1.12];
          } else {
            byHour = [0.95,1.02,1.08,1.12,1.14,1.06,0.98,0.90,0.84,0.76,0.68,0.62,0.58,0.56,0.55,0.59,0.64,0.72,0.82,0.88,0.94,1.00,1.04,1.00];
          }
          const offset = stIdx % 2 === 0 ? 0 : 1;
          rawSeries = useReal ? realRows.map(r => r[pol]) : slots.map(s => base.hourly * byHour[(s.hour24 + offset) % 24]);
          rawThreshold = APP_STATE.benchmarkMode === 'target' ? std.hTarget : std.hEnv;
        } else if (hor === 'daily') {
          const realDays = (st.daily30d || []).filter(x => x[pol] != null);
          if (realDays.length >= 5) {
            labels = realDays.map(x => x.d.slice(8, 10) + '/' + x.d.slice(5, 7));
            rawSeries = realDays.map(x => x[pol]);
          } else {
            labels = Array.from({length: 15}, (_, i) => `יום ${i * 2 + 1} (בסיס היסטורי)`);
            const baseDaily = [0.58,0.68,0.78,1.05,0.86,0.54,0.49,0.72,0.96,0.81,0.64,0.58,0.92,0.74,0.62];
            const stFactors = shift(baseDaily, stIdx);
            rawSeries = stFactors.map(f => base.daily * f);
          }
          rawThreshold = APP_STATE.benchmarkMode === 'target' ? std.dTarget : std.dEnv;
        } else {
          labels = ['ינו','פבר','מרץ','אפר','מאי','יוני','יול','אוג','ספט','אוק','נוב','דצמ'];
          const factors = pol === 'O3'
            ? [0.72,0.78,0.90,1.02,1.12,1.18,1.22,1.19,1.06,0.94,0.80,0.74]
            : [1.22,1.14,1.04,0.92,0.84,0.78,0.76,0.80,0.88,1.02,1.16,1.26];
          const mBase = Number.isFinite(base.monthly) ? base.monthly : (Number.isFinite(base.daily) ? base.daily : 0);
          rawSeries = factors.map(f => mBase * f);
          rawThreshold = APP_STATE.benchmarkMode === 'target' ? std.mTarget : std.mEnv;
        }

        const series = rawSeries.map(convertVal);
        const threshold = convertVal(rawThreshold);
        const finite = series.filter(v => v != null);
        const maxVal = finite.length ? Math.max(...finite) : 0;
        const avgVal = finite.length ? +(finite.reduce((a, b) => a + b, 0) / finite.length).toFixed(pol === 'BaP' ? 5 : 2) : 0;
        const exceedCount = series.filter(v => v > threshold).length;

        const sumEl = document.getElementById('trendChartSummary');
        if (sumEl) {
          sumEl.innerHTML = `
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-extrabold text-white">${st.shortName}</span>
              <span class="text-slate-400">•</span>
              <span class="text-sky-300 font-bold">${std.name} (${std.formula})</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 mono">
              <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">שיא: ${maxVal} ${unitLabel}</span>
              <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">ממוצע: ${avgVal} ${unitLabel}</span>
              <span class="px-2 py-0.5 rounded ${exceedCount > 0 ? 'bg-rose-500/20 border border-rose-500/50 text-rose-300 font-extrabold' : 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold'}">
                ${exceedCount > 0 ? exceedCount + ' חריגות מהסף' : 'ללא חריגות מהסף'}
              </span>
            </div>
          `;
          isolateLtr(sumEl);
        }

        AQCharts.renderTrend(ctxTrend, {
          labels, series, threshold, mode: APP_STATE.benchmarkMode,
          seriesLabel: `${std.name} (${unitLabel})`,
          thresholdLabel: `סף ${APP_STATE.benchmarkMode === 'target' ? 'יעד בריאותי (WHO)' : 'תקן סביבה חוקי'} (${threshold} ${unitLabel})`
        });
      }

    }

    // =========================================================================
    // 4. RENDER ENCYCLOPEDIA (INTUITIVE)
    // =========================================================================
    function renderEncyclopedia() {
      const grid = document.getElementById('paramCardsGrid');
      const q = APP_STATE.paramSearch.trim().toLowerCase();
      const filtered = PARAMETERS_DATA.filter(p => {
        if (APP_STATE.paramCategory === 'live' && !['PM25', 'PM10', 'NO2', 'NOX', 'O3', 'SO2', 'C6H6', 'WS', 'WD', 'AQI_INDEX'].includes(p.id)) return false;
        if (APP_STATE.paramCategory === 'carcinogen' && !p.isCarcinogen) return false;
        if (APP_STATE.paramCategory === 'fire' && !['PM25','PM10','CO','C6H6','CH2O','WD','WS','STABILITY_ZL'].includes(p.id)) return false;
        if (APP_STATE.paramCategory !== 'all' && APP_STATE.paramCategory !== 'live' && APP_STATE.paramCategory !== 'carcinogen' && APP_STATE.paramCategory !== 'fire' && p.category !== APP_STATE.paramCategory) return false;
        if (q) {
          const hay = (p.nameHe + ' ' + p.nameEn + ' ' + p.formula + ' ' + p.intuitive + ' ' + p.whatIsIt + ' ' + p.sources + ' ' + p.haifaContext).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      grid.innerHTML = filtered.map(p => `
        <article class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-lg">
          <div class="space-y-2.5">
            <div class="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
              <div>
                <div class="flex flex-wrap gap-1 mb-1">
                  ${p.isCarcinogen ? '<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-950 text-purple-300 border border-purple-600/80">מסרטן ודאי (IARC 1)</span>' : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">${p.iarc}</span>`}
                </div>
                <h3 class="text-base font-extrabold text-white">${p.nameHe}</h3>
                <div class="text-[11px] text-slate-400">${p.nameEn} • <span class="mono">${p.unit}</span></div>
              </div>
              <div class="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-700 text-sky-400 font-extrabold mono text-xs shrink-0">${p.formula}</div>
            </div>

            <!-- Intuitive Plain-Language Box -->
            <div class="bg-sky-950/35 border border-sky-800/50 rounded-xl p-2.5 text-xs text-sky-100 leading-relaxed">
              <div class="font-extrabold text-sky-300 mb-0.5">💡 במילים פשוטות:</div>
              <p>${p.intuitive}</p>
            </div>

            <!-- Standards Mini Table -->
            <div class="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden text-[11px]">
              <table class="w-full text-right">
                <thead><tr class="text-slate-400 border-b border-slate-800"><th class="py-1 px-2">זמן</th><th class="py-1 px-2 text-amber-300">יעד</th><th class="py-1 px-2 text-rose-300">תקן חוקי</th></tr></thead>
                <tbody class="divide-y divide-slate-800/60 mono">
                  ${p.standards.map(s => `<tr><td class="py-1 px-2 font-sans text-slate-200">${s.period}</td><td class="py-1 px-2 text-amber-200">${s.target}</td><td class="py-1 px-2 text-rose-200 font-bold">${s.env}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>

            <div class="text-xs text-slate-300 space-y-1">
              <div><strong class="text-emerald-300">מקור:</strong> ${p.sources}</div>
              <div><strong class="text-rose-300">בריאות:</strong> ${p.health}</div>
            </div>
          </div>
          <div class="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-amber-200">
            <strong>בקריות ובמפרץ</strong> <span class="text-[10px] text-slate-400">(מדוחות היסטוריים 2017–2023, לא מדידה חיה)</span>: ${p.haifaContext}
          </div>
        </article>
      `).join('');
      isolateLtr(grid);
    }

    // =========================================================================
    // 5. AQI CALCULATOR
    // =========================================================================
    function computePollutantAQI(key, cp) {
      const bps = AQI_BREAKPOINTS[key];
      const val = Math.max(0, Number(cp) || 0);
      for (let i = 0; i < bps.length; i++) {
        const seg = bps[i], nextSeg = bps[i + 1];
        if (val >= seg.icLow && val <= seg.icHigh) {
          const aqi = Math.round(((seg.bpHigh - seg.bpLow) * (val - seg.icLow) / (seg.icHigh - seg.icLow)) + seg.bpLow);
          return { aqi, index: 100 - aqi };
        }
        if (nextSeg && val > seg.icHigh && val < nextSeg.icLow) {
          const aqi = Math.round(((nextSeg.bpLow - seg.bpHigh) * (val - seg.icHigh) / (nextSeg.icLow - seg.icHigh)) + seg.bpHigh);
          return { aqi, index: 100 - aqi };
        }
      }
      const last = bps[bps.length - 1];
      const extraAqi = Math.min(500, Math.round(last.bpHigh + ((val - last.icHigh) / (last.icHigh - last.icLow)) * (last.bpHigh - last.bpLow)));
      return { aqi: extraAqi, index: 100 - extraAqi };
    }

    let WIND_FORECAST_CACHE = null;

    // short area subtitle shown under the station name (pills + station card)
    const STATION_AREA = {
      kiryat_motzkin_z2: 'נווה גנים',
      kiryat_yam_z1: "שכונה ד'",
      kiryat_bialik_z4: 'דרום',
      kiryat_binyamin: 'קריית בנימין',
      kiryat_haim_regavim: 'מערבית',
      kishon_mobile5: 'אזור התעשייה, גדר בז"ן'
    };
    const STATION_COORDS = {
      kiryat_bialik_z4:   { lat: 32.8144, lon: 35.0783, label: 'קריית ביאליק (Z4)' },
      kiryat_motzkin_z2:  { lat: 32.8392, lon: 35.0831, label: 'קריית מוצקין (Z2)' },
      kiryat_binyamin:    { lat: 32.7960, lon: 35.0950, label: 'קריית אתא – קריית בנימין' },
      kiryat_haim_regavim:{ lat: 32.8308, lon: 35.0542, label: 'קריית חיים – רגבים' },
      kiryat_yam_z1:      { lat: 32.8522, lon: 35.0794, label: 'קריית ים' },
      kishon_mobile5:     { lat: 32.7950, lon: 35.0450, label: 'גדר בז"ן / הקישון' },
      haifa_atzmaut:      { lat: 32.8190, lon: 35.0010, label: 'חיפה – עצמאות' },
      haifa_igud:         { lat: 32.8110, lon: 35.0350, label: 'חיפה – איגוד' },
      nesher:             { lat: 32.7710, lon: 35.0390, label: 'נשר' },
      haifa_neve_shaanan: { lat: 32.7850, lon: 35.0160, label: 'נווה שאנן' },
      haifa_halisa:       { lat: 32.8050, lon: 35.0090, label: 'חליסה' },
      haifa_shprintzak:   { lat: 32.8230, lon: 34.9670, label: 'שפרינצק / כרמל מערבי' }
    };

    function degToCompassHe(deg) {
      const dirs = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב'];
      return dirs[Math.round(((deg % 360) / 45)) % 8];
    }

    function computeCombinedHourRisk(slot, st) {
      if (!slot || slot.ws == null || slot.wd == null) return { score: 0, level: 'na', missing: true };
      // Weighted 0-100 risk score combining:
      // 1) Station current ground measurement (up to 25 pts)
      // 2) Wind direction from eastern/SE village corridor 60-165 deg (up to 30 pts)
      // 3) Weak wind trapping <= 2.5 m/s (up to 30 pts)
      // 4) Nighttime boundary-layer inversion window 20:00-06:00 (15 pts)
      const pm25 = st.metrics?.PM25?.hourly || st.pm25_max24h || 18;
      const stationPts = pm25 >= 30 ? 25 : (pm25 >= 20 ? 18 : (pm25 >= 15 ? 10 : 4));

      const dirPts = (slot.wd >= 60 && slot.wd <= 165) ? 30 : ((slot.wd >= 35 && slot.wd <= 190) ? 15 : 0);
      const speedPts = slot.ws <= 1.5 ? 30 : (slot.ws <= 2.5 ? 20 : (slot.ws <= 3.5 ? 8 : 0));
      const hourNum = Number(slot.time.slice(0, 2));
      const nightPts = (hourNum >= 20 || hourNum <= 6) ? 15 : 0;

      // Gust dispersion bonus reduces trapping slightly
      const gustBonus = slot.gust != null && slot.gust >= 6.0 ? -10 : 0;
      const score = Math.max(0, Math.min(100, stationPts + dirPts + speedPts + nightPts + gustBonus));
      const level = score >= 65 ? 'high' : (score >= 40 ? 'med' : 'low');
      return { score, level };
    }

    async function fetchWindForecast() {
      const grid = document.getElementById('windForecastGrid');
      const statusEl = document.getElementById('windForecastStatus');
      const coordsEl = document.getElementById('windForecastCoordsLabel');
      const sumEl = document.getElementById('windCombinedSummary');
      if (!grid || !statusEl) return;

      const st = STATIONS_DATA.find(s => s.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
      const coords = STATION_COORDS[st.id] || { lat: 32.8144, lon: 35.0783, label: st.shortName };
      if (coordsEl) {
        coordsEl.innerHTML = `מכויל לקואורדינטות המדויקות של <strong class="text-white">${coords.label}</strong> (<span class="mono text-sky-300">${coords.lat.toFixed(4)}°N, ${coords.lon.toFixed(4)}°E</span>) • אזור מפרץ חיפה והקריות.`;
      }

      statusEl.textContent = 'מושך תחזית לחיפה/קריות...';
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&timezone=auto&forecast_days=2`;
        const cache = (window.__windFcCache = window.__windFcCache || {});
        const hit = cache[url];
        if (!hit || Date.now() - hit.t > 15 * 60 * 1000) {
          cache[url] = { t: Date.now(), p: fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }) };
          cache[url].p.catch(() => { delete cache[url]; });
        }
        const data = await cache[url].p;
        // the user may have switched station while this request was in flight
        if ((STATIONS_DATA.find(s => s.id === APP_STATE.selectedStationId) || STATIONS_DATA[0]).id !== st.id) return;
        const h = data.hourly;
        // Open-Meteo answers in the location's zone (timezone=auto -> Asia/Jerusalem): pick "now" in Israel time,
        // not the device clock (a phone abroad or with a wrong zone would start the strip at the wrong hour)
        const ilp = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
          .formatToParts(new Date()).map(x => [x.type, x.value]));
        const nowStr = `${ilp.year}-${ilp.month}-${ilp.day}T${ilp.hour}:00`;
        let startIdx = h.time.findIndex(t => t >= nowStr);
        if (startIdx < 0) startIdx = 0;

        const num = (v, d) => (v == null || !Number.isFinite(Number(v))) ? null : +Number(v).toFixed(d);
        const slice = [];
        for (let i = startIdx; i < Math.min(h.time.length, startIdx + 12); i++) {
          slice.push({
            time: h.time[i].slice(11, 16),
            date: h.time[i].slice(8, 10) + '/' + h.time[i].slice(5, 7),
            // missing values stay null (never 0 = fake calm)
            ws: num(h.wind_speed_10m[i], 1),
            gust: num(h.wind_gusts_10m[i], 1),
            wd: num(h.wind_direction_10m[i], 0),
            temp: num(h.temperature_2m[i], 0),
            rh: num(h.relative_humidity_2m[i], 0)
          });
        }
        // re-render the card/airing strip only when the forecast actually changed (a fresh network
        // answer or another station's forecast); a cache hit with the same slots must not wipe
        // transient card state (copied label, open details).
        const changed = JSON.stringify(slice) !== JSON.stringify(WIND_FORECAST_CACHE);
        WIND_FORECAST_CACHE = slice;
        window.__windFcRenders = (window.__windFcRenders || 0) + (changed ? 1 : 0);
        if (changed) {
          renderDecisionCard();
          renderAiringStrip();
        }
        statusEl.textContent = `עודכן חי (${coords.label})`;
        statusEl.className = 'text-[11px] font-bold text-emerald-300 mono';

        const evaluated = slice.map(slot => ({ ...slot, risk: computeCombinedHourRisk(slot, st) }));
        const known = evaluated.filter(e => !e.risk.missing);
        const highHours = known.filter(e => e.risk.level === 'high').map(e => e.time);
        const bestHour = [...known].sort((a, b) => a.risk.score - b.risk.score)[0];

        if (sumEl) {
          sumEl.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong class="text-white">שקלול משולב (מדד התחנה + תחזית רוח ואינברסיה ל-12 שעות):</strong>
                ${highHours.length ? `<span class="text-orange-300 font-bold"> שעות סיכון גבוה ללכידת עשן: <span class="mono">${highHours.join(', ')}</span></span>` : '<span class="text-emerald-300 font-bold"> לא צפויות שעות לכידה חמורה ב-12 השעות הקרובות</span>'}
              </div>
              <div class="text-[11px] mono text-sky-300 font-bold">
                ${bestHour ? `שעת הפיזור הטובה ביותר: ${bestHour.time} (${bestHour.ws} m/s ${degToCompassHe(bestHour.wd)})` : 'אין נתוני רוח בתחזית'}
              </div>
            </div>
          `;
        }

        grid.innerHTML = evaluated.map(slot => {
          const r = slot.risk;
          const cardCls = r.level === 'high' ? 'border-orange-500/60 bg-orange-950/25' : (r.level === 'med' ? 'border-amber-500/40 bg-amber-950/15' : 'border-slate-800 bg-slate-950/75');
          const riskTxt = r.missing ? '— אין נתון רוח' : (r.level === 'high' ? '💨 סיכון גבוה' : (r.level === 'med' ? '🟡 זהירות' : '🟢 פיזור טוב'));
          return `
            <div class="rounded-xl border ${cardCls} p-2.5 space-y-1">
              <div class="flex items-center justify-between">
                <span class="mono font-extrabold text-white">${slot.time}</span>
                <span class="text-[10px] text-slate-400 mono">${slot.date}</span>
              </div>
              <div class="text-[11px] text-sky-300 font-bold mono">${slot.ws == null ? '—' : slot.ws + ' m/s'} (משב ${slot.gust == null ? '—' : slot.gust})</div>
              <div class="text-[11px] text-slate-300">${slot.wd == null ? '—' : `${degToCompassHe(slot.wd)} (${slot.wd}°)`}</div>
              <div class="text-[10px] text-slate-400 mono">${slot.temp}°C • ${slot.rh}% לחות</div>
              <div class="text-[10px] font-bold pt-0.5 ${r.level === 'high' ? 'text-orange-300' : (r.level === 'med' ? 'text-amber-300' : 'text-emerald-300')}">${riskTxt}</div>
            </div>
          `;
        }).join('');

      } catch (err) {
        statusEl.textContent = 'מצב לא מקוון (אין חיבור ל-Open-Meteo)';
        statusEl.className = 'text-[11px] font-bold text-amber-300';
        if (sumEl) sumEl.textContent = 'השקלול המשולב יופיע אוטומטית כאשר הדפדפן מחובר לאינטרנט.';
        grid.innerHTML = '<div class="col-span-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">לא ניתן למשוך כרגע תחזית חיה מ-Open-Meteo (ייתכן חסימת רשת בסביבה זו). בדפדפן רגיל אונליין התחזית נטענת אוטומטית לקואורדינטות חיפה והקריות.</div>';
      }
    }

    function renderCalculatorSliders() {
      const container = document.getElementById('aqiSlidersContainer');
      container.innerHTML = AQI_META.map(m => {
        const val = APP_STATE.aqiInputs[m.key];
        const res = computePollutantAQI(m.key, val);
        return `
          <div class="bg-slate-950 border ${res.index < 0 ? 'border-rose-600/80' : 'border-slate-800'} rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between">
              <label for="slider_${m.key}" class="text-xs font-bold text-slate-200">${m.label}</label>
              <span id="badge_${m.key}" class="px-2 py-0.5 rounded text-[11px] font-extrabold mono ${res.index >= 51 ? 'bg-emerald-950 text-emerald-300' : (res.index >= 0 ? 'bg-amber-950 text-amber-300' : 'bg-rose-950 text-rose-300')}">
                ${res.index > 0 ? '+' + res.index : res.index}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <input id="slider_${m.key}" data-aqi-key="${m.key}" type="range" min="${m.min}" max="${m.max}" step="${m.step}" value="${val}" class="aqi-slider w-full accent-sky-500" />
              <input id="num_${m.key}" data-aqi-key="${m.key}" type="number" min="${m.min}" max="${m.max * 2}" step="${m.step}" value="${val}" class="aqi-num w-16 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-xs mono text-white text-center" />
            </div>
          </div>
        `;
      }).join('');

      document.querySelectorAll('.aqi-slider').forEach(sl => {
        sl.addEventListener('input', e => {
          const k = e.target.getAttribute('data-aqi-key');
          APP_STATE.aqiInputs[k] = parseFloat(e.target.value) || 0;
          const nm = document.getElementById('num_' + k);
          if (nm) nm.value = APP_STATE.aqiInputs[k];
          updateCalculatorOutput();
        });
      });
      document.querySelectorAll('.aqi-num').forEach(nm => {
        nm.addEventListener('input', e => {
          const k = e.target.getAttribute('data-aqi-key');
          APP_STATE.aqiInputs[k] = parseFloat(e.target.value) || 0;
          const sl = document.getElementById('slider_' + k);
          if (sl) sl.value = APP_STATE.aqiInputs[k];
          updateCalculatorOutput();
        });
      });
      updateCalculatorOutput();
    }

    function updateCalculatorOutput() {
      let worst = null;
      const results = AQI_META.map(m => {
        const val = APP_STATE.aqiInputs[m.key];
        const res = computePollutantAQI(m.key, val);
        const badge = document.getElementById('badge_' + m.key);
        if (badge) {
          badge.textContent = res.index > 0 ? '+' + res.index : res.index;
          badge.className = `px-2 py-0.5 rounded text-[11px] font-extrabold mono ${res.index >= 51 ? 'bg-emerald-950 text-emerald-300' : (res.index >= 0 ? 'bg-amber-950 text-amber-300' : 'bg-rose-950 text-rose-300')}`;
        }
        const item = { ...m, val, ...res };
        if (!worst || item.index < worst.index) worst = item;
        return item;
      });

      const isGood = worst.index >= 51, isMod = worst.index >= 0 && worst.index < 51, isAlert = worst.index < -200;
      const bg = isGood ? 'bg-emerald-950/60 border-emerald-600/80 text-emerald-400' : (isMod ? 'bg-amber-950/60 border-amber-600/80 text-amber-400' : (isAlert ? 'bg-purple-950/80 border-purple-500 text-purple-300' : 'bg-rose-950/70 border-rose-600 text-rose-400'));
      const label = isGood ? 'איכות אוויר טובה (ירוק)' : (isMod ? 'בינונית (צהוב)' : (isAlert ? 'חריגה מערך התרעה! (חום)' : 'חריגה מתקן הסביבה! (אדום)'));

      document.getElementById('aqiResultCard').innerHTML = `
        <div class="p-4 rounded-xl border ${bg} space-y-2">
          <div class="text-xs text-slate-300 font-bold">מדד התחנה (נקבע ע"י ${worst.label}):</div>
          <div class="flex items-baseline gap-3">
            <span class="text-4xl font-extrabold mono">${worst.index > 0 ? '+' + worst.index : worst.index}</span>
            <span class="text-base font-extrabold text-white">${label}</span>
          </div>
        </div>
        <div class="grid grid-cols-4 gap-1.5">
          ${results.map(r => `<div class="p-2 rounded-lg bg-slate-950 border border-slate-800 text-center"><div class="text-[10px] text-slate-400">${r.key}</div><div class="text-xs font-extrabold mono">${r.index > 0 ? '+' + r.index : r.index}</div></div>`).join('')}
        </div>
      `;
    }

    // =========================================================================
    // 6. API TAB & NAVIGATION
    // =========================================================================
    const SAMPLE_SVIVA_JSON = {
      station_id: 357,
      name: "קריית ביאליק – ניטור חי (py-air-sviva-api)",
      shortName: "ק. ביאליק (חי)",
      code: "SVIVA-357",
      group: "krayot",
      location: "קריית ביאליק – air.sviva.gov.il",
      type: "תחנת ניטור רציף",
      owner: "py-air-sviva-api",
      sensors: { "PM2.5_ugm3": 29.8, "PM10_ugm3": 78.0, "NO2_ppb": 24.5, "NOX_ppb": 95.0, "SO2_ppb": 6.2, "O3_ppb": 42.0, "CO_ppm": 0.4, "C6H6_ugm3": 4.15, "CH2O_ugm3": 3.2, "H2S_ugm3": 1.1 }
    };

    function initApiTab() {
      const ta = document.getElementById('jsonImportTextarea');
      ta.value = JSON.stringify(SAMPLE_SVIVA_JSON, null, 2);

      document.getElementById('btnLoadSampleJson').addEventListener('click', () => {
        ta.value = JSON.stringify(SAMPLE_SVIVA_JSON, null, 2);
        document.getElementById('jsonImportStatus').textContent = 'נטענה דוגמה.';
      });

      document.getElementById('btnParseJson').addEventListener('click', () => {
        const statusEl = document.getElementById('jsonImportStatus');
        try {
          const parsed = JSON.parse(ta.value);
          const s = parsed.sensors || parsed;
          const c6h6 = Number(s.C6H6_ugm3 || 1.5);
          const pm25 = Number(s['PM2.5_ugm3'] || 18.0);
          const pm10 = Number(s['PM10_ugm3'] || 42.0);
          const no2 = (Number(s.NO2_ppb || 12) * GAS_CONVERSION.NO2);
          const o3 = (Number(s.O3_ppb || 32) * GAS_CONVERSION.O3);
          const so2 = (Number(s.SO2_ppb || 4) * GAS_CONVERSION.SO2);
          const ch2o = Number(s.CH2O_ugm3 || 5.0);
          const h2s = Number(s.H2S_ugm3 || 0.8);
          const isExceed = c6h6 > AQStd.limit('C6H6', 'd', 'env') || pm25 > AQStd.limit('PM25', 'd', 'env') || no2 > AQStd.limit('NO2', 'm', 'env');

          const newSt = {
            id: 'custom_' + Date.now(),
            name: parsed.name || 'תחנה מיובאת',
            shortName: parsed.shortName || 'תחנה חדשה',
            code: parsed.code || 'API-LIVE',
            group: 'krayot',
            location: parsed.location || 'ייבוא API',
            type: parsed.type || 'תחנת API',
            owner: parsed.owner || 'py-air-sviva-api',
            status: isExceed ? 'exceed_env' : 'exceed_target',
            statusText: isExceed ? 'חריגה מתקן סביבה (API)' : 'נטען בהצלחה מ-API',
            aqiIndex: isExceed ? -12 : 42,
            wind: 'נתוני API חיים',
            c6h6_max24h: c6h6, c6h6_exceedDays: c6h6 > AQStd.limit('C6H6', 'd', 'env') ? 1 : 0, c6h6_annual: +(c6h6*0.25).toFixed(2),
            ch2o_max1h: ch2o, ch2o_exceed1h: ch2o > AQStd.limit('CH2O', 'h', 'env') ? 1 : 0, ch2o_max24h: +(ch2o*0.4).toFixed(2),
            bap_exceedDays: 1, bap_annual: 0.00010, h2s_max24h: h2s, h2s_annual: +(h2s*0.5).toFixed(2),
            no2_annual: +no2.toFixed(1), nox_max24h: 150, nox_exceed30m: 0,
            pm25_annual: +(pm25*0.65).toFixed(1), pm25_max24h: pm25,
            pm10_annual: +(pm10*0.55).toFixed(1), pm10_max24h: pm10,
            o3_annual: +o3.toFixed(1), so2_max24h: +so2.toFixed(1), so2_annual: +(so2*0.2).toFixed(1),
            metrics: {
              C6H6: { hourly: +(c6h6*1.3).toFixed(2), daily: c6h6, monthly: +(c6h6*0.25).toFixed(2) },
              PM25: { hourly: +(pm25*0.85).toFixed(1), daily: pm25, monthly: +(pm25*0.65).toFixed(1) },
              PM10: { hourly: +(pm10*0.75).toFixed(1), daily: pm10, monthly: +(pm10*0.55).toFixed(1) },
              NO2:  { hourly: +(no2*1.4).toFixed(1), daily: +no2.toFixed(1), monthly: +(no2*0.8).toFixed(1) },
              O3:   { hourly: +o3.toFixed(1), daily: +(o3*0.9).toFixed(1), monthly: +(o3*0.85).toFixed(1) },
              SO2:  { hourly: +so2.toFixed(1), daily: +(so2*0.7).toFixed(1), monthly: +(so2*0.2).toFixed(1) },
              CH2O: { hourly: ch2o, daily: +(ch2o*0.4).toFixed(1), monthly: +(ch2o*0.25).toFixed(1) },
              H2S:  { hourly: +(h2s*2).toFixed(1), daily: h2s, monthly: +(h2s*0.5).toFixed(2) },
              BaP:  { hourly: 0.00012, daily: 0.00010, monthly: 0.00009 }
            },
            metals_meteo: 'ייבוא JSON חי',
            notes: 'תחנה שיובאה מ-py-air-sviva-api.'
          };
          STATIONS_DATA.unshift(newSt);
          APP_STATE.selectedStationId = newSt.id;
          document.getElementById('kpiTotalStations').textContent = STATIONS_DATA.length;
          statusEl.textContent = 'נוסף בהצלחה!';
          const dataTs = parsed.timestamp || parsed.datetime || parsed.date || ('יובא ידנית ב-' + new Date().toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })); updateLastUpdatedTimestamp(dataTs);
          setTimeout(() => switchTab('matrix'), 350);
        } catch (err) {
          statusEl.textContent = 'שגיאה: ' + err.message;
        }
      });

      document.getElementById('btnExportMatrixJson').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(STATIONS_DATA, null, 2));
        a.download = "krayot_air_quality.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
      });

      // Historical Time-Series Fire Scanner
      const SAMPLE_HISTORY_SERIES = [
        { datetime: "2026-11-01 14:00", PM25: 11.2, PM10: 26.0, CO: 0.3, CH2O: 3.1, C6H6: 0.9, WD: 280, WS: 4.5 },
        { datetime: "2026-11-02 23:00", PM25: 42.6, PM10: 94.0, CO: 1.5, CH2O: 12.4, C6H6: 2.6, WD: 115, WS: 0.8 },
        { datetime: "2026-11-03 02:00", PM25: 48.1, PM10: 105.0, CO: 1.7, CH2O: 14.1, C6H6: 2.9, WD: 112, WS: 0.7 },
        { datetime: "2026-11-03 13:00", PM25: 13.5, PM10: 31.0, CO: 0.4, CH2O: 3.8, C6H6: 1.0, WD: 295, WS: 5.1 },
        { datetime: "2026-11-05 22:00", PM25: 27.4, PM10: 58.0, CO: 1.1, CH2O: 8.9, C6H6: 1.8, WD: 125, WS: 1.2 },
        { datetime: "2026-11-06 15:00", PM25: 12.0, PM10: 28.0, CO: 0.3, CH2O: 3.0, C6H6: 0.8, WD: 275, WS: 4.8 },
        { datetime: "2026-11-08 01:00", PM25: 39.0, PM10: 84.0, CO: 1.4, CH2O: 10.8, C6H6: 2.4, WD: 108, WS: 0.9 },
        { datetime: "2026-11-09 14:00", PM25: 10.4, PM10: 24.0, CO: 0.3, CH2O: 2.7, C6H6: 0.7, WD: 300, WS: 5.4 },
        { datetime: "2026-11-11 03:00", PM25: 23.8, PM10: 51.0, CO: 0.9, CH2O: 8.1, C6H6: 1.5, WD: 130, WS: 1.4 },
        { datetime: "2026-11-12 12:00", PM25: 14.2, PM10: 33.0, CO: 0.4, CH2O: 3.5, C6H6: 1.1, WD: 270, WS: 4.2 },
        { datetime: "2026-11-14 23:30", PM25: 45.3, PM10: 98.0, CO: 1.6, CH2O: 13.2, C6H6: 3.1, WD: 114, WS: 0.6 },
        { datetime: "2026-11-15 14:00", PM25: 11.8, PM10: 29.0, CO: 0.3, CH2O: 3.2, C6H6: 0.9, WD: 285, WS: 4.9 },
        { datetime: "2026-11-17 01:30", PM25: 36.2, PM10: 79.0, CO: 1.3, CH2O: 10.2, C6H6: 2.2, WD: 118, WS: 1.0 },
        { datetime: "2026-11-18 13:00", PM25: 12.6, PM10: 30.0, CO: 0.4, CH2O: 3.3, C6H6: 0.9, WD: 290, WS: 4.7 }
      ];

      function parseHistoryText(raw) {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          const j = JSON.parse(trimmed);
          return Array.isArray(j) ? j : (j.records || j.data || [j]);
        }
        // Simple CSV parser
        const lines = trimmed.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) throw new Error('קובץ CSV חייב לכלול שורת כותרת ושורת נתונים');
        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).map(line => {
          const cols = line.split(',').map(c => c.trim());
          const obj = {};
          headers.forEach((h, idx) => {
            const v = cols[idx];
            obj[h] = (v !== undefined && v !== '' && !isNaN(Number(v))) ? Number(v) : v;
          });
          return obj;
        });
      }

      function evaluateHistoryRecord(rec, idx, allRows) {
        const dt = rec.datetime || rec.timestamp || rec.date || rec.time || 'ללא תאריך';
        const pm25 = Number(rec['PM2.5'] ?? rec.PM25 ?? rec['PM2.5_ugm3'] ?? rec.pm25 ?? 0);
        const pm10 = Number(rec.PM10 ?? rec['PM10_ugm3'] ?? rec.pm10 ?? 0);
        const co = rec.CO !== undefined || rec.CO_ppm !== undefined ? Number(rec.CO ?? rec.CO_ppm) : undefined;
        const ch2o = rec.CH2O !== undefined || rec.CH2O_ugm3 !== undefined ? Number(rec.CH2O ?? rec.CH2O_ugm3) : undefined;
        const c6h6 = rec.C6H6 !== undefined || rec.C6H6_ugm3 !== undefined ? Number(rec.C6H6 ?? rec.C6H6_ugm3) : undefined;
        const wd = rec.WD !== undefined ? Number(rec.WD) : undefined;
        const ws = rec.WS !== undefined ? Number(rec.WS) : undefined;

        let baselinePM25 = undefined;
        if (Array.isArray(allRows) && idx >= 4) {
          const prev24 = allRows.slice(Math.max(0, idx - 24), idx)
            .map(r => Number(r['PM2.5'] ?? r.PM25 ?? r['PM2.5_ugm3'] ?? r.pm25 ?? 0));
          baselinePM25 = computePercentile25(prev24);
        }

        const sig = detectPirateFireSignature({
          last30m: { PM25: pm25, PM10: pm10 || undefined, baselinePM25, CO: co, CH2O: ch2o, C6H6: c6h6, windDir: wd, windSpeed: ws }
        });

        return {
          dt, pm25, pm10, co, ch2o, c6h6, wd, ws,
          score: sig.score,
          level: sig.level,
          badgeText: sig.badgeText,
          reasons: sig.matched
        };
      }

      function runHistoryFireScan() {
        const ta = document.getElementById('historyJsonTextarea');
        const statusEl = document.getElementById('historyScanStatus');
        const listEl = document.getElementById('historyFireEventsList');
        if (!ta || !statusEl || !listEl) return;

        try {
          const rows = parseHistoryText(ta.value);
          const evaluated = rows.map((r, idx) => evaluateHistoryRecord(r, idx, rows));
          const flagged = evaluated.filter(r => r.level === 'high' || r.level === 'watch' || r.level === 'dust');

          statusEl.textContent = `נסרקו ${evaluated.length} רשומות • זוהו ${flagged.length} מועדי שריפה`;
          statusEl.className = flagged.length ? 'text-xs font-extrabold text-orange-300' : 'text-xs font-bold text-emerald-300';

          // Render Chart.js timeline
          const ctx = document.getElementById('chartHistoryFireTimeline');
          AQCharts.renderHistoryTimeline(ctx, evaluated);

          if (!flagged.length) {
            listEl.innerHTML = '<div class="p-3 rounded-xl bg-emerald-950/30 border border-emerald-700/40 text-emerald-300">לא זוהו חריגות התואמות שריפה פיראטית בקובץ שנטען.</div>';
          } else {
            listEl.innerHTML = flagged.map(f => `
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2.5 rounded-xl border ${f.level === 'high' ? 'bg-rose-950/35 border-rose-700/60' : 'bg-amber-950/30 border-amber-700/50'}">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${f.level === 'high' ? 'bg-rose-500/20 text-rose-200' : 'bg-amber-500/20 text-amber-200'}">
                    ${f.level === 'high' ? '🚨 סבירות גבוהה מאוד לריח חריף / עשן' : (f.level === 'dust' ? '🏜️ אובך מינרלי' : '💨 ייתכן ריח חריף / עשן')} 
                  </span>
                  <span class="mono font-extrabold text-white">${f.dt}</span>
                </div>
                <div class="text-[11px] text-slate-300 mono">${f.reasons.join(' • ')}</div>
              </div>
            `).join('');
          }
        } catch (err) {
          statusEl.textContent = 'שגיאה בפענוח: ' + err.message;
          statusEl.className = 'text-xs font-bold text-rose-400';
        }
      }

      const histTa = document.getElementById('historyJsonTextarea');
      if (histTa) histTa.value = JSON.stringify(SAMPLE_HISTORY_SERIES, null, 2); // synthetic sample, scanned only on request

      document.getElementById('btnLoadHistorySample')?.addEventListener('click', () => {
        if (histTa) histTa.value = JSON.stringify(SAMPLE_HISTORY_SERIES, null, 2);
        runHistoryFireScan();
      });

      document.getElementById('btnScanHistory')?.addEventListener('click', runHistoryFireScan);

      document.getElementById('historyFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (histTa) histTa.value = String(reader.result || '');
          runHistoryFireScan();
        };
        reader.readAsText(file);
      });

      document.getElementById('btnCopyPython').addEventListener('click', () => {
        const code = document.getElementById('pythonCodeBlock').textContent;
        const lbl = document.getElementById('copyPythonLabel');
        copyTextReliable(code, () => { lbl.textContent = 'הועתק!'; setTimeout(() => { lbl.textContent = 'העתק קוד'; }, 2000); });
      });
    }

    function switchTab(tabId) {
      APP_STATE.activeTab = tabId;
      document.querySelectorAll('details[data-gear]').forEach(d => { d.open = false; });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const active = document.getElementById('tab-' + tabId);
      if (active) active.classList.remove('hidden');

      document.querySelectorAll('.tab-btn').forEach(b => {
        b.className = b.getAttribute('data-tab') === tabId
          ? 'tab-btn px-3.5 py-1.5 rounded-lg text-sm font-bold bg-sky-500 text-slate-950 flex items-center gap-1.5 transition'
          : 'tab-btn px-3.5 py-1.5 rounded-lg text-sm font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-1.5 transition';
      });
      document.querySelectorAll('.tab-btn-mob').forEach(b => {
        b.className = b.getAttribute('data-tab') === tabId
          ? 'tab-btn-mob flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-sky-400 font-extrabold text-[11px]'
          : 'tab-btn-mob flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-400 font-semibold text-[11px]';
      });

      if (tabId === 'matrix') renderMatrix();
      else if (tabId === 'trends') { renderPirateFirePanel(); updateCharts(); }
      else if (tabId === 'guide') { renderEncyclopedia(); renderCalculatorSliders(); }
    }

    window.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.tab-btn, .tab-btn-mob').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
      });


      document.getElementById('btnDownloadStandaloneHtml')?.addEventListener('click', async () => {
        // the standalone file must carry its scripts inline (they are separate files on the site)
        let html = document.documentElement.outerHTML;
        for (const src of ['js/fire_v2b.js', 'js/app.js']) {
          try {
            const code = await (await fetch('./' + src)).text();
            html = html.replace(`<script src="${src}"></script>`, () => '<script>' + code.replace(/<\/script/gi, '<\\/script') + '</script>');
          } catch (e) { console.warn('standalone export: could not inline ' + src, e); }
        }
        const blob = new Blob(['<!DOCTYPE html>\n' + html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'krayot_air_dashboard.html';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });

      // re-render without moving what the user is reading: the first open pollutant row (else the first
      // visible card) keeps its on-screen position even if content above it grows or shrinks
      const renderKeepingPlace = () => {
        const anchor = document.querySelector('#pollutantCardsGrid details[data-pol][open]')
          || [...document.querySelectorAll('.tab-panel:not(.hidden) > *')].find(el => el.getBoundingClientRect().bottom > 0);
        const key = anchor && anchor.dataset ? anchor.dataset.pol : null;
        const top0 = anchor ? anchor.getBoundingClientRect().top : null;
        renderMatrix();
        const again = key ? document.querySelector(`#pollutantCardsGrid details[data-pol="${key}"]`) : anchor;
        if (again && top0 != null) window.scrollBy(0, again.getBoundingClientRect().top - top0);
      };
      const btnBenchEnv = document.getElementById('btnBenchEnv');
      const btnBenchTarget = document.getElementById('btnBenchTarget');
      btnBenchEnv.addEventListener('click', () => {
        APP_STATE.benchmarkMode = 'env';
        btnBenchEnv.className = 'px-2 py-1.5 rounded-md font-bold whitespace-nowrap bg-purple-600 text-white transition';
        btnBenchTarget.className = 'px-2 py-1.5 rounded-md font-bold whitespace-nowrap text-slate-300 hover:text-white transition';
        renderKeepingPlace();
      });
      btnBenchTarget.addEventListener('click', () => {
        APP_STATE.benchmarkMode = 'target';
        btnBenchTarget.className = 'px-2 py-1.5 rounded-md font-bold whitespace-nowrap bg-rose-600 text-white transition';
        btnBenchEnv.className = 'px-2 py-1.5 rounded-md font-bold whitespace-nowrap text-slate-300 hover:text-white transition';
        renderKeepingPlace();
      });

      // theme: auto (follows the phone, live) / light / dark; persisted in localStorage 'krayot.theme'
      const mqLight = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
      const applyTheme = (pref, rerender) => {
        const light = pref === 'light' || (pref === 'auto' && !!(mqLight && mqLight.matches));
        document.documentElement.dataset.themePref = pref;
        document.documentElement.dataset.theme = light ? 'light' : 'dark';
        document.querySelectorAll('.theme-btn').forEach(b => {
          const on = b.dataset.themeChoice === pref;
          b.setAttribute('aria-checked', on ? 'true' : 'false');
          b.className = 'theme-btn flex-1 px-1.5 py-1.5 rounded-md font-bold transition ' + (on ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white');
        });
        if (rerender) renderMatrix(); // charts pick up the new axis / grid colours
      };
      applyTheme(document.documentElement.dataset.themePref || 'auto', false);
      document.querySelectorAll('.theme-btn').forEach(b => b.addEventListener('click', () => {
        const pref = b.dataset.themeChoice;
        try { localStorage.setItem('krayot.theme', pref); } catch (e) {}
        applyTheme(pref, true);
      }));
      if (mqLight) {
        const onScheme = () => { if ((document.documentElement.dataset.themePref || 'auto') === 'auto') applyTheme('auto', true); };
        if (mqLight.addEventListener) mqLight.addEventListener('change', onScheme); else if (mqLight.addListener) mqLight.addListener(onScheme);
      }

      // ⚙️ menu closes on a tap/click outside it, or on Escape
      const closeGear = () => document.querySelectorAll('details[data-gear][open]').forEach(d => { d.open = false; });
      document.addEventListener('pointerdown', e => { if (!e.target.closest('details[data-gear]')) closeGear(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGear(); });

      const btnUnitUg = document.getElementById('btnUnitUg');
      const btnUnitPpb = document.getElementById('btnUnitPpb');
      btnUnitUg.addEventListener('click', () => {
        APP_STATE.unitMode = 'ug';
        btnUnitUg.className = 'flex-1 px-2 py-1.5 rounded-md font-bold bg-sky-600 text-white transition';
        btnUnitPpb.className = 'flex-1 px-2 py-1.5 rounded-md font-bold text-slate-300 hover:text-white transition';
        renderKeepingPlace();
      });
      btnUnitPpb.addEventListener('click', () => {
        APP_STATE.unitMode = 'ppb';
        btnUnitPpb.className = 'flex-1 px-2 py-1.5 rounded-md font-bold bg-purple-600 text-white transition';
        btnUnitUg.className = 'flex-1 px-2 py-1.5 rounded-md font-bold text-slate-300 hover:text-white transition';
        renderKeepingPlace();
      });

      document.getElementById('trendPollutantSelect').addEventListener('change', updateCharts);
      document.getElementById('trendHorizonSelect').addEventListener('change', updateCharts);

      // filter button counts from the data itself
      const liveIds = ['PM25', 'PM10', 'NO2', 'NOX', 'O3', 'SO2', 'C6H6', 'WS', 'WD', 'AQI_INDEX'];
      const fireIds = ['PM25', 'PM10', 'CO', 'C6H6', 'CH2O', 'WD', 'WS', 'STABILITY_ZL'];
      document.querySelectorAll('.param-cat-btn').forEach(btn => {
        const cat = btn.getAttribute('data-param-cat');
        const n = PARAMETERS_DATA.filter(p => cat === 'all' || (cat === 'live' ? liveIds.includes(p.id) : cat === 'carcinogen' ? p.isCarcinogen : cat === 'fire' ? fireIds.includes(p.id) : p.category === cat)).length;
        if (/\(\d+\)/.test(btn.textContent)) btn.textContent = btn.textContent.replace(/\(\d+\)/, '(' + n + ')');
      });
      document.querySelectorAll('.param-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          APP_STATE.paramCategory = btn.getAttribute('data-param-cat');
          document.querySelectorAll('.param-cat-btn').forEach(b => {
            b.className = 'param-cat-btn shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
          });
          btn.className = 'param-cat-btn shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500 text-slate-950 transition';
          renderEncyclopedia();
        });
      });

      document.getElementById('paramSearchInput').addEventListener('input', e => {
        APP_STATE.paramSearch = e.target.value;
        renderEncyclopedia();
      });

      document.querySelectorAll('.aqi-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = btn.getAttribute('data-preset');
          if (p === 'tel_aviv_official') APP_STATE.aqiInputs = { PM25: 24.4, PM10: 34.5, O3: 36.1, SO2: 0.8, NO2: 2.4, NOX: 38.0, CO: 0.3 };
          else if (p === 'no2_example') APP_STATE.aqiInputs = { PM25: 19.0, PM10: 45.0, O3: 40.0, SO2: 5.0, NO2: 133.0, NOX: 310.0, CO: 1.2 };
          else if (p === 'haifa_traffic') APP_STATE.aqiInputs = { PM25: 38.5, PM10: 118.0, O3: 28.0, SO2: 12.0, NO2: 96.0, NOX: 525.0, CO: 4.5 };
          else if (p === 'dust_alert') APP_STATE.aqiInputs = { PM25: 142.0, PM10: 340.0, O3: 52.0, SO2: 8.0, NO2: 32.0, NOX: 120.0, CO: 0.8 };
          else if (p === 'home_smoke') APP_STATE.aqiInputs = { PM25: 45.0, PM10: 92.0, O3: 32.0, SO2: 3.0, NO2: 18.0, NOX: 60.0, CO: 1.4 };
          renderCalculatorSliders();
        });
      });

      fetchWindForecast();
      document.getElementById('btnRefreshWindForecast')?.addEventListener('click', () => { window.__windFcCache = {}; fetchWindForecast(); });
      document.getElementById('btnToggleAqiCalculator')?.addEventListener('click', (e) => {
        const d = document.getElementById('aqiCalculatorDrawer');
        if (!d) return;
        const hidden = d.classList.toggle('hidden');
        e.currentTarget.textContent = hidden ? 'פתח מחשבון 100-AQI עצמאי ↓' : 'הסתר מחשבון 100-AQI ↑';
      });

      renderMatrix();
      renderEncyclopedia();
      renderCalculatorSliders();
      initApiTab();

      async function fetchJson(url) {
        const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return res.json();
      }

      // One "last hour" for the whole UI: the detector reads rolling.hourly, so the card, station
      // buttons and MOEP summary read it too (metrics.hourly stays as fallback for pollutants
      // rolling doesn't carry, e.g. NO2, and for O3's 8-hour window).
      function applyRollingHour(st, rolling) {
        const h = rolling && rolling.hourly;
        if (!h) return;
        Object.keys(st.metrics || {}).forEach(k => {
          const m = st.metrics[k];
          if (!m || (k === 'O3' && m.window === '8h')) return;
          const v = Number(h[k]);
          if (h[k] == null || !Number.isFinite(v)) return;
          if (m.hourlyWindow === undefined) m.hourlyWindow = m.hourly;
          m.hourly = v;
          m.hourlySource = 'rolling';
        });
      }

      async function loadLiveData() {
        try {
          const data = await fetchJson('./live_krayot.json');
          window.LIVE_DOC = data;
          if (!data || !Array.isArray(data.stations)) return;
          data.stations.forEach(live => {
            const st = STATIONS_DATA.find(s => s.id === live.id);
            if (!st) return;
            st.live = live;
            const { history24h, ...last30 } = live.last30m || {};
            st.last30m = Object.assign(st.last30m || {}, Object.fromEntries(Object.entries(last30).filter(([, x]) => x != null)));
            st.history24h = history24h || [];
            st.daily30d = live.daily30d || [];
            st.stale = !!live.stale;
            Object.entries(live.metrics || {}).forEach(([k, v]) => {
              st.metrics[k] = Object.assign(st.metrics[k] || {}, Object.fromEntries(Object.entries(v).filter(([, x]) => x != null)));
            });
            applyRollingHour(st, live.rolling);
            deriveRealSummary(st);
          });
          if (data.timestamp) {
            updateLastUpdatedTimestamp(new Date(data.timestamp).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
          }
        } catch (e) {
          console.warn('live_krayot.json not loaded', e);
        }
        try {
          const hist = await fetchJson('./data/history_90d.json');
          window.HISTORY_90D = (hist && hist.stations) || {};
          try { window.FIRE_V2B = window.FireV2B ? FireV2B.compute(window.HISTORY_90D) : null; } catch (e) { console.warn('fire v2b failed', e); window.FIRE_V2B = null; }
          // live 'rolling hour' evaluation (same C-A formula on the last 60/120 min of live_krayot.json)
          try { window.FIRE_LIVE = window.FIRE_V2B && FireV2B.evaluateLive ? FireV2B.evaluateLive(window.FIRE_V2B, window.LIVE_DOC) : null; } catch (e) { console.warn('fire live failed', e); window.FIRE_LIVE = null; }
          renderPublicVerdict();
          // default scanner view: the real 30-day scan of the selected station (once; later scans are user-driven)
          if (!window.__realScanShown && window.FIRE_V2B) {
            window.__realScanShown = true;
            try { renderV2BScan(STATIONS_DATA.find(x => x.id === APP_STATE.selectedStationId) || STATIONS_DATA[0], 30); } catch (e) { console.warn('real scan failed', e); }
          }
        } catch (e) {
          console.warn('history_90d.json not loaded', e);
        }
        renderMatrix();
        try { updateCharts(); } catch (e) {}
      }

      function historyRowsForScanner(stationId, days) {
        const rows = ((window.HISTORY_90D || {})[stationId] || {}).rows || [];
        const cutoff = rows.length ? new Date(rows[rows.length - 1].t).getTime() - days * 86400000 : 0;
        return rows.filter(r => new Date(r.t).getTime() > cutoff).map(r => {
          const o = { datetime: r.t.slice(0, 16).replace('T', ' ') };
          [['PM25', 'PM25'], ['PM10', 'PM10'], ['CO', 'CO'], ['C6H6', 'C6H6'], ['windDir', 'WD'], ['windSpeed', 'WS']]
            .forEach(([from, to]) => { if (r[from] != null) o[to] = r[from]; });
          return o;
        });
      }
      window.historyRowsForScanner = historyRowsForScanner;

      document.getElementById('btnRefreshLive')?.addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true; b.textContent = 'מרענן...';
        try { await loadLiveData(); renderMatrix(); fetchWindForecast(); b.textContent = 'רוענן ✓'; }
        catch (err) { b.textContent = 'שגיאה'; }
        setTimeout(() => { b.textContent = 'רענן נתוני אמת'; b.disabled = false; }, 2000);
      });

      function renderV2BScan(st, days, R = window.FIRE_V2B, periodLabel = null) {
        const status = document.getElementById('historyScanStatus');
        const listEl = document.getElementById('historyFireEventsList');
        const canvas = document.getElementById('chartHistoryFireTimeline');
        if (!R || !R.S[st.id]) {
          if (status) { status.textContent = `סורק v2b זמין ל-5 תחנות ה-PM בקריות בלבד (לא ל${st.shortName})`; status.className = 'text-xs font-bold text-rose-400'; }
          return;
        }
        const ch = R.S[st.id];
        const from = days ? Math.max(0, R.axis.length - days * 24) : 0;
        const idx = []; for (let i = from; i < R.axis.length; i++) idx.push(i);
        const eps = FireV2B.episodes(R, st.id, 'watch').filter(e => e.end >= from);
        const highN = eps.filter(e => e.peak >= FireV2B.HIGH).length;
        status.textContent = `v2b • ${st.shortName} • ${periodLabel || days + ' יום'}: 🚨 ${highN} סבירות גבוהה מאוד לריח חריף / עשן, 💨 ${eps.length - highN} ייתכן ריח חריף / עשן`;
        status.className = eps.length ? 'text-xs font-extrabold text-orange-300' : 'text-xs font-bold text-emerald-300';
        AQCharts.renderV2BScan(canvas, {
          labels: idx.map(i => v2bHourLabel(R.axis[i])),
          pm25: idx.map(i => ch.PM25[i]),
          levels: idx.map(i => R.level(ch.S[i]))
        });
        if (!eps.length) {
          listEl.innerHTML = '<div class="p-3 rounded-xl bg-emerald-950/30 border border-emerald-700/40 text-emerald-300">לא זוהו אירועי עשן או שריפה בתקופה.</div>';
          return;
        }
        listEl.innerHTML = eps.slice().reverse().map(e => {
          const hi = e.peak >= FireV2B.HIGH;
          let pk = e.start; for (let i = e.start; i <= e.end; i++) if ((ch.S[i] ?? -1) > (ch.S[pk] ?? -1)) pk = i;
          const parts = ch.parts[pk] || {};
          const why = Object.keys(V2B_REASONS).filter(k => parts[k] !== null && parts[k] >= 0.5).map(k => V2B_REASONS[k]);
          const reg = R.verdicts[pk].regional ? ' • 🌁 אוויר עומד' : '';
          const wd = ch.flags[pk].wd;
          return `<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2.5 rounded-xl border ${hi ? 'bg-rose-950/35 border-rose-700/60' : 'bg-amber-950/30 border-amber-700/50'}">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${hi ? 'bg-rose-500/20 text-rose-200' : 'bg-amber-500/20 text-amber-200'}">${hi ? '🚨 סבירות גבוהה מאוד' : '💨 ייתכן ריח / עשן'}</span>
              <span class="mono font-extrabold text-white">${v2bHourLabel(R.axis[e.start])}</span>
              <span class="text-slate-400">${v2bEpisodeHours(R, st.id, e) === 1 ? 'שעה אחת' : v2bEpisodeHours(R, st.id, e) + ' שעות'} • PM2.5 עד ${Math.round(Math.max(...idx.filter(i => i >= e.start - 1 && i <= e.end).map(i => ch.PM25[i] ?? 0)))}</span>
            </div>
            <div class="text-[11px] text-slate-300">${why.join(' • ')}${wd !== null && wd !== undefined ? ' • רוח ' + Math.round(wd) + '°' : ''}${reg}</div>
          </div>`;
        }).join('');
      }

      document.getElementById('btnLoadRealHistory')?.addEventListener('click', () => {
        const st = STATIONS_DATA.find(x => x.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
        renderV2BScan(st, 30);
      });

      // monthly archives: never fetched on page load; the small index is fetched on first interaction
      // with the month picker, and a month file only when it is chosen
      const ARCHIVE_CACHE = {};
      let archiveIndexP = null;
      const monthSel = document.getElementById('archiveMonthSelect');
      async function ensureArchiveIndex() {
        if (!archiveIndexP) {
          archiveIndexP = fetchJson('./data/archives_index.json').then(ix => {
            (ix.months || []).slice().reverse().forEach(m => {
              const o = document.createElement('option');
              o.value = m.month; o.dataset.file = m.file;
              o.textContent = `${m.month.slice(5)}/${m.month.slice(0, 4)} (${m.hours} שעות)`;
              monthSel.appendChild(o);
            });
            return ix;
          }).catch(e => { archiveIndexP = null; throw e; });
        }
        return archiveIndexP;
      }
      ['pointerdown', 'focus'].forEach(ev => monthSel?.addEventListener(ev, () => { ensureArchiveIndex().catch(e => console.warn('archive index', e)); }));
      monthSel?.addEventListener('change', async () => {
        const opt = monthSel.selectedOptions[0];
        if (!opt || !opt.value) return;
        const st = STATIONS_DATA.find(x => x.id === APP_STATE.selectedStationId) || STATIONS_DATA[0];
        const status = document.getElementById('historyScanStatus');
        if (status) { status.textContent = 'טוען ארכיון ' + opt.textContent + '…'; status.className = 'text-xs font-bold text-slate-300'; }
        try {
          if (!ARCHIVE_CACHE[opt.value]) {
            const doc = await fetchJson('./' + opt.dataset.file);
            ARCHIVE_CACHE[opt.value] = FireV2B.compute(doc.stations || {});
          }
          if (!ARCHIVE_CACHE[opt.value]) {
            if (status) { status.textContent = 'מעט מדי נתונים בחודש הזה לסריקה (פחות מ-48 שעות)'; status.className = 'text-xs font-bold text-amber-300'; }
            return;
          }
          renderV2BScan(st, null, ARCHIVE_CACHE[opt.value], 'חודש ' + opt.value.slice(5) + '/' + opt.value.slice(0, 4));
        } catch (e) {
          console.warn('archive month failed', e);
          if (status) { status.textContent = 'טעינת הארכיון נכשלה'; status.className = 'text-xs font-bold text-rose-400'; }
        }
      });

      loadLiveData();
      setInterval(loadLiveData, 10 * 60 * 1000);

      if (window.lucide) window.lucide.createIcons();
    });
  
