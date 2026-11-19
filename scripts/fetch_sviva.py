#!/usr/bin/env python3
"""Fetch Krayot / Haifa Bay air-quality data from air.sviva.gov.il.

Outputs:
  live_krayot.json        - latest readings, 30-min means, 24h history, 30-day daily series
  data/history_90d.json   - rolling 90-day hourly archive (appended on every run, no duplicates)

Run with --backfill to force re-pulling the full 90 days from the API.
"""
import asyncio
import json
import math
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path

import aiohttp
from air_sviva_api.client import SvivaAirClient

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "live_krayot.json"
HISTORY = ROOT / "data" / "history_90d.json"
ARCHIVE_DIR = ROOT / "data"  # archive_YYYY_MM.json: permanent monthly copies (never trimmed)
ARCHIVE_INDEX = ROOT / "data" / "archives_index.json"
IL_TZ = ZoneInfo("Asia/Jerusalem")


def today_il():
    """Calendar date in Israel (the runner's clock is UTC: between 00:00 and 02/03:00 IL its date is yesterday)."""
    return datetime.now(IL_TZ).date()
WINDOW_DAYS = 90
MIN_HOURS_PER_DAY = 12  # a day needs this many hourly rows to count as a real daily mean
MIN_HOURS_PER_MONTH = 360  # ~half of 30*24 hours to call a monthly mean "real"

# dashboard station id -> (API station id, Hebrew name)
STATIONS = {
    "kiryat_bialik_z4": (380, "קריית ביאליק"),
    "kiryat_motzkin_z2": (382, "קריית מוצקין"),
    "kiryat_binyamin": (97, "קריית אתא/בנימין"),
    "kiryat_haim_regavim": (499, "קריית חיים"),
    "kiryat_yam_z1": (92, "קריית ים"),
    "kishon_mobile5": (517, 'גדר בז"ן/קישון'),
}

# Reference stations outside the Krayot line (history only, PM2.5 only; not shown in live_krayot.json).
# Used by js/fire_v2b.js as a regional baseline. Chosen in docs/fire-detector-analysis.md.
REF_STATIONS = {
    "ref_neve_shaanan": (86, "נווה שאנן (ייחוס)"),
    "ref_tivon": (137, "קריית טבעון (ייחוס)"),
    "ref_nesher": (87, "נשר (ייחוס)"),
}
REF_KEYS = ("PM25",)

# Open-Meteo model wind at Krayot stations whose anemometers stall at 0 (stuck-sensor check in fire_v2b.js).
OPEN_METEO = {
    "om_kiryat_bialik_z4": (380, 32.814143, 35.077715),
    "om_kiryat_haim_regavim": (499, 32.829129, 35.056529),
}

# API channel name -> dashboard key
CHANNELS = {
    "PM2.5": "PM25", "PM10": "PM10", "CO": "CO", "Benzene": "C6H6", "SO2": "SO2",
    "NOX": "NOX", "NO2": "NO2", "NO": "NO", "O3": "O3", "H2S": "H2S", "Toluene": "Toluene",
    "WD": "windDir", "WS": "windSpeed",
}
GAS_KEYS = ("PM25", "PM10", "CO", "C6H6", "SO2", "NOX", "NO2", "NO", "O3", "H2S", "Toluene")
VALUE_KEYS = (*GAS_KEYS, "windDir", "windSpeed")

MOLAR_MASS = {"SO2": 64.07, "NO2": 46.01, "NO": 30.01, "NOX": 46.01,  # NOx expressed as NO2
              "O3": 48.00, "C6H6": 78.11, "H2S": 34.08, "Toluene": 92.14}
MOLAR_VOLUME = 24.45  # L/mol at 25 C, 1 atm
CO_MGM3_PER_PPM = 1.145  # 28.01 g/mol / 24.45 L/mol


def to_dashboard_units(key, value, units):
    """Normalise a reading to the dashboard's units.

    Gases: ppb -> ug/m3 (values already in ug/m3 are untouched).
    CO: always ppm (mg/m3 / 1.145), as the dashboard's fire-signature logic expects.
    """
    if value is None:
        return None
    u = (units or "").lower().replace("³", "3").replace("µ", "u")
    if key == "CO":
        if u in ("mg/m3", "mg/m^3"):
            return value / CO_MGM3_PER_PPM
        if u == "ppb":
            return value / 1000
        if u in ("ug/m3", "ug/m^3"):
            return value / 1000 / CO_MGM3_PER_PPM
        return value  # already ppm
    if u == "ppb" and key in MOLAR_MASS:
        return value * MOLAR_MASS[key] / MOLAR_VOLUME
    return value


def mean(vals):
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def circ_mean(degs):
    degs = [d for d in degs if d is not None]
    if not degs:
        return None
    s = sum(math.sin(math.radians(d)) for d in degs)
    c = sum(math.cos(math.radians(d)) for d in degs)
    return round(math.degrees(math.atan2(s, c)) % 360, 1)


def agg(key, vals):
    return circ_mean(vals) if key == "windDir" else mean(vals)


def parse_dt(s):
    return datetime.fromisoformat(s)


def points_of(avg_resp):
    """-> sorted list of (datetime, {key: value}); valid, non-negative readings only."""
    out = []
    for p in avg_resp.data or []:
        if not p.datetime:
            continue
        vals = {}
        for ch in p.channels or []:
            key = CHANNELS.get(ch.name)
            if key and ch.valid and ch.value is not None and ch.value >= 0:
                vals[key] = round(to_dashboard_units(key, ch.value, ch.units), 3)
        if vals:
            out.append((parse_dt(p.datetime), vals))
    out.sort(key=lambda x: x[0])
    return out


def window_mean(points, since):
    acc = defaultdict(list)
    for t, vals in points:
        if t >= since:
            for k, v in vals.items():
                acc[k].append(v)
    return {k: agg(k, v) for k, v in acc.items()}


def history_30min(points):
    buckets = defaultdict(lambda: defaultdict(list))
    for t, vals in points:
        b = t.replace(minute=0 if t.minute < 30 else 30, second=0, microsecond=0)
        for k, v in vals.items():
            buckets[b][k].append(v)
    return [{"t": b.isoformat(), **{k: agg(k, v) for k, v in sorted(buckets[b].items())}}
            for b in sorted(buckets)]


# ---------------------------------------------------------------- history archive

def hourly_rows(points):
    """Complete hourly buckets only (the still-running hour is skipped)."""
    if not points:
        return {}
    latest = points[-1][0]
    # a bucket needs readings covering at least half the hour (6 x 5-min); the step is measured
    # from the data so coarser API timebases still work
    gaps = sorted((points[i + 1][0] - points[i][0]).total_seconds() / 60 for i in range(len(points) - 1))
    step = max(1.0, gaps[len(gaps) // 2]) if gaps else 5.0
    need = max(1, math.ceil(30 / step))
    buckets = defaultdict(lambda: defaultdict(list))
    stamps = defaultdict(set)
    for t, vals in points:
        b = t.replace(minute=0, second=0, microsecond=0)
        stamps[b].add(t)
        for k, v in vals.items():
            buckets[b][k].append(v)
    rows = {}
    for b, vals in buckets.items():
        if latest < b + timedelta(minutes=55) or len(stamps[b]) < need:
            continue
        rows[b.isoformat()] = {k: agg(k, v) for k, v in vals.items() if k in VALUE_KEYS}
    return rows


def load_history():
    if HISTORY.exists():
        try:
            return json.loads(HISTORY.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            print("history file unreadable; starting empty", file=sys.stderr)
    return {"stations": {}}


def history_text(updated, stations, extra_head=()):
    """One row per line keeps git diffs append-only and small."""
    head = ["{", '"updated": ' + json.dumps(updated) + ",", *extra_head,
            '"resolution": "hourly (complete hours only)",',
            '"units": "ug/m3 (CO ppm), wind m/s & deg",',
            '"stations": {']
    blocks = []
    for sid, st in stations.items():
        rows = ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in st["rows"])
        blocks.append(json.dumps(sid) + ': {"apiStationId": ' + json.dumps(st["apiStationId"])
                      + ', "rows": [\n' + rows + "\n]}")
    return "\n".join(head) + "\n" + ",\n".join(blocks) + "\n}\n}\n"


def save_history(doc):
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    HISTORY.write_text(history_text(doc["updated"], doc["stations"],
                                   ['"windowDays": ' + str(WINDOW_DAYS) + ","]), encoding="utf-8")


def update_archives(hist_stations):
    """Copy every hourly row into data/archive_YYYY_MM.json (month of the +02:00 timestamp).

    Archives only grow (fresh value wins per timestamp), so hours that fall out of the 90-day
    window are kept forever. Files are rewritten only when their content changes.
    Returns the list of month keys written.
    """
    by_month = defaultdict(lambda: defaultdict(list))
    for sid, st in hist_stations.items():
        for r in st["rows"]:
            by_month[r["t"][:7]][sid].append(r)
    written = []
    for ym, stations in sorted(by_month.items()):
        path = ARCHIVE_DIR / f"archive_{ym.replace('-', '_')}.json"
        old = {}
        if path.exists():
            try:
                old = json.loads(path.read_text(encoding="utf-8")).get("stations", {})
            except (OSError, ValueError):
                print(f"archive {path.name} unreadable; rebuilding from history", file=sys.stderr)
        merged = {}
        for sid in sorted(set(old) | set(stations)):
            by_t = {r["t"]: r for r in old.get(sid, {}).get("rows", [])}
            for r in stations.get(sid, []):
                by_t[r["t"]] = r
            api = (hist_stations.get(sid) or old.get(sid) or {}).get("apiStationId")
            merged[sid] = {"apiStationId": api, "rows": sorted(by_t.values(), key=lambda r: parse_dt(r["t"]))}
        last = max((s["rows"][-1]["t"] for k, s in merged.items() if k in STATIONS and s["rows"]), default=None)
        text = history_text(last, merged, ['"month": ' + json.dumps(ym) + ","])
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8")
            written.append(ym)
    # index of all archive files (including months no longer in the 90-day history)
    months = []
    for path in sorted(ARCHIVE_DIR.glob("archive_????_??.json")):
        try:
            st = json.loads(path.read_text(encoding="utf-8"))["stations"]
        except (OSError, ValueError, KeyError):
            continue
        krayot = [r["t"] for k, s in st.items() if k in STATIONS for r in s["rows"]]
        if not krayot:
            continue
        months.append({"month": path.stem[8:].replace("_", "-"), "file": "data/" + path.name,
                       "from": min(krayot, key=parse_dt), "to": max(krayot, key=parse_dt),
                       "hours": len(set(krayot))})
    index = json.dumps({"months": months}, ensure_ascii=False, indent=1) + "\n"
    if not ARCHIVE_INDEX.exists() or ARCHIVE_INDEX.read_text(encoding="utf-8") != index:
        ARCHIVE_INDEX.write_text(index, encoding="utf-8")
    return written


def merge_rows(existing, new_rows):
    """Append without duplicates (by timestamp, fresh value wins); rolling 90-day window."""
    by_t = {r["t"]: r for r in existing}
    for t, vals in new_rows.items():
        by_t[t] = {"t": t, **vals}
    rows = sorted(by_t.values(), key=lambda r: parse_dt(r["t"]))
    if rows:
        cutoff = parse_dt(rows[-1]["t"]) - timedelta(days=WINDOW_DAYS)
        rows = [r for r in rows if parse_dt(r["t"]) > cutoff]
    return rows


def coverage_days(rows):
    if len(rows) < 2:
        return 0
    return (parse_dt(rows[-1]["t"]) - parse_dt(rows[0]["t"])).days


def daily_series(rows, days=30):
    by_day = defaultdict(lambda: defaultdict(list))
    n_rows = defaultdict(int)
    for r in rows:
        d = r["t"][:10]
        n_rows[d] += 1
        for k in VALUE_KEYS:
            if r.get(k) is not None:
                by_day[d][k].append(r[k])
    out = []
    for d in sorted(by_day)[-days:]:
        if n_rows[d] < MIN_HOURS_PER_DAY:
            continue
        out.append({"d": d, **{k: agg(k, v) for k, v in sorted(by_day[d].items())}})
    return out


def monthly_means(rows, latest_t):
    since = latest_t - timedelta(days=30)
    acc = defaultdict(list)
    for r in rows:
        if parse_dt(r["t"]) > since:
            for k in GAS_KEYS:
                if r.get(k) is not None:
                    acc[k].append(r[k])
    return {k: mean(v) for k, v in acc.items() if len(v) >= MIN_HOURS_PER_MONTH}


# ---------------------------------------------------------------- fetch

async def fetch_station(client, dash_id, api_id, name, hist_rows, backfill):
    if backfill:
        avg = await client.get_station_average(
            api_id, from_date=today_il() - timedelta(days=WINDOW_DAYS), to_date=today_il() + timedelta(days=1))
    else:
        avg = await client.get_station_average(api_id, hours_back=24, timebase=5)
    all_pts = points_of(avg)
    if not all_pts:
        raise RuntimeError("no valid data points")
    latest_t = all_pts[-1][0]
    pts = [p for p in all_pts if p[0] > latest_t - timedelta(hours=24)]

    rows = merge_rows(hist_rows, hourly_rows(all_pts))

    last5 = dict(pts[-1][1])
    last30 = window_mean(pts, latest_t - timedelta(minutes=30))
    hourly = window_mean(pts, latest_t - timedelta(hours=1))
    daily = window_mean(pts, latest_t - timedelta(hours=24))
    monthly = monthly_means(rows, latest_t)
    metrics = {}
    for k in GAS_KEYS:
        if k in daily or k in monthly:
            m = {"hourly": hourly.get(k), "daily": daily.get(k)}
            if k in monthly:
                m["monthly"] = monthly[k]
                m["monthlyReal"] = True
            metrics[k] = m
    return rows, {
        "id": dash_id,
        "apiStationId": api_id,
        "name": name,
        "measuredAt": latest_t.isoformat(),
        "metrics": metrics,
        "last5m": last5,
        "last30m": {**{k: last30.get(k) for k in VALUE_KEYS}, "history24h": history_30min(pts)},
        "daily30d": daily_series(rows),
        "historyDays": coverage_days(rows),
    }


async def fetch_reference(client, api_id, hist_rows, backfill):
    if backfill:
        avg = await client.get_station_average(
            api_id, from_date=today_il() - timedelta(days=WINDOW_DAYS), to_date=today_il() + timedelta(days=1))
    else:
        avg = await client.get_station_average(api_id, hours_back=24, timebase=5)
    new = {t: {k: v[k] for k in REF_KEYS if v.get(k) is not None}
           for t, v in hourly_rows(points_of(avg)).items()}
    return merge_rows(hist_rows, {t: v for t, v in new.items() if v})


async def fetch_open_meteo(session, lat, lon, hist_rows, backfill):
    """Hourly 10 m wind, aligned to the archive's hour buckets (+02:00, value = mean of t and t+1h)."""
    common = (f"latitude={lat}&longitude={lon}&hourly=wind_speed_10m,wind_direction_10m"
              "&wind_speed_unit=ms&timezone=UTC")
    if backfill:
        url = ("https://historical-forecast-api.open-meteo.com/v1/forecast?" + common
               + f"&start_date={today_il() - timedelta(days=WINDOW_DAYS)}&end_date={today_il()}")
    else:
        url = "https://api.open-meteo.com/v1/forecast?" + common + "&past_days=2&forecast_days=1"
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
        resp.raise_for_status()
        h = (await resp.json())["hourly"]
    tz = datetime.fromisoformat("2000-01-01T00:00:00+02:00").tzinfo
    now = datetime.now(tz)
    times = [datetime.fromisoformat(t + "+00:00").astimezone(tz) for t in h["time"]]
    new = {}
    for i in range(len(times) - 1):
        if times[i] + timedelta(hours=1) > now:
            break
        ws = [h["wind_speed_10m"][i], h["wind_speed_10m"][i + 1]]
        wd = [h["wind_direction_10m"][i], h["wind_direction_10m"][i + 1]]
        if None in ws or None in wd:
            continue
        new[times[i].isoformat()] = {"windSpeed": mean(ws), "windDir": circ_mean(wd)}
    return merge_rows(hist_rows, new)


async def main(force_backfill=False):
    history = load_history()
    hist_stations = history.setdefault("stations", {})
    stations, times = [], []
    async with aiohttp.ClientSession() as session:
        client = SvivaAirClient(session)
        await client.generate_token()
        for dash_id, (api_id, name) in STATIONS.items():
            existing = hist_stations.get(dash_id, {}).get("rows", [])
            need_backfill = force_backfill or coverage_days(existing) < WINDOW_DAYS - 5
            try:
                rows, st = await fetch_station(client, dash_id, api_id, name, existing, need_backfill)
                hist_stations[dash_id] = {"apiStationId": api_id, "rows": rows}
                stations.append(st)
                times.append(parse_dt(st["measuredAt"]))
                tag = " [backfill]" if need_backfill else ""
                print(f"OK   {name} ({api_id}) @ {st['measuredAt']} history={st['historyDays']}d{tag}")
            except Exception as exc:  # keep going; one station must not kill the run
                print(f"FAIL {name} ({api_id}): {exc!r}", file=sys.stderr)
        # auxiliary series for the fire detector; failures never affect the Krayot output
        for ref_id, (api_id, name) in REF_STATIONS.items():
            existing = hist_stations.get(ref_id, {}).get("rows", [])
            need_backfill = force_backfill or coverage_days(existing) < WINDOW_DAYS - 5
            try:
                rows = await fetch_reference(client, api_id, existing, need_backfill)
                hist_stations[ref_id] = {"apiStationId": api_id, "rows": rows}
                print(f"OK   {name} ({api_id}) rows={len(rows)}{' [backfill]' if need_backfill else ''}")
            except Exception as exc:
                print(f"FAIL {name} ({api_id}): {exc!r}", file=sys.stderr)
        for om_id, (api_id, lat, lon) in OPEN_METEO.items():
            existing = hist_stations.get(om_id, {}).get("rows", [])
            need_backfill = force_backfill or coverage_days(existing) < WINDOW_DAYS - 5
            try:
                rows = await fetch_open_meteo(session, lat, lon, existing, need_backfill)
                hist_stations[om_id] = {"apiStationId": f"open-meteo@{api_id}", "rows": rows}
                print(f"OK   Open-Meteo wind @ {api_id} rows={len(rows)}{' [backfill]' if need_backfill else ''}")
            except Exception as exc:
                print(f"FAIL Open-Meteo @ {api_id}: {exc!r}", file=sys.stderr)
    if not stations:
        print("No station data fetched; leaving output files untouched.", file=sys.stderr)
        return 1
    ts = max(times).isoformat()
    history["updated"] = max((r["t"] for k, s in hist_stations.items() if k in STATIONS for r in s["rows"][-1:]),
                             default=ts)
    save_history(history)
    # archive before anything is trimmed on the next run (merge_rows already cut >90 d, but those
    # hours were archived on earlier runs while they were still inside the window)
    written = update_archives(hist_stations)
    if written:
        print("Archive updated: " + ", ".join(written))
    # keep the previous record of any station that failed this run instead of dropping it
    fetched = {st["id"] for st in stations}
    try:
        prev = json.loads(OUT.read_text(encoding="utf-8")).get("stations", []) if OUT.exists() else []
    except (OSError, ValueError):
        prev = []
    for old in prev:
        if old.get("id") in STATIONS and old["id"] not in fetched:
            old["stale"] = True
            stations.append(old)
            print(f"KEEP {old['id']}: previous record kept (measuredAt {old.get('measuredAt')})")
    order = list(STATIONS)
    stations.sort(key=lambda st: order.index(st["id"]) if st["id"] in order else len(order))
    doc = {"timestamp": ts, "source": "air.sviva.gov.il", "units": "ug/m3 (CO ppm), wind m/s & deg",
           "stations": stations}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.name} and {HISTORY.relative_to(ROOT)} ({len(stations)} stations)")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(force_backfill="--backfill" in sys.argv)))
