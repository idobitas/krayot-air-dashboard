#!/usr/bin/env python3
"""Fetch Krayot / Haifa Bay air-quality data from air.sviva.gov.il into live_krayot.json."""
import asyncio
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import aiohttp
from air_sviva_api.client import SvivaAirClient

OUT = Path(__file__).resolve().parent.parent / "live_krayot.json"
REGION_ID = 2  # חיפה וקריות

# dashboard station id -> (API station id, Hebrew name)
STATIONS = {
    "kiryat_bialik_z4": (380, "קריית ביאליק"),
    "kiryat_motzkin_z2": (382, "קריית מוצקין"),
    "kiryat_binyamin": (97, "קריית אתא/בנימין"),
    "kiryat_haim_regavim": (499, "קריית חיים"),
    "kiryat_yam_z1": (92, "קריית ים"),
    "kishon_mobile5": (517, 'גדר בז"ן/קישון'),
}

# API channel name -> dashboard key
CHANNELS = {
    "PM2.5": "PM25", "PM10": "PM10", "CO": "CO", "Benzene": "C6H6", "SO2": "SO2",
    "NOX": "NOX", "NO2": "NO2", "NO": "NO", "O3": "O3", "H2S": "H2S", "Toluene": "Toluene",
    "WD": "windDir", "WS": "windSpeed",
}
GAS_KEYS = ("PM25", "PM10", "CO", "C6H6", "SO2", "NOX", "NO2", "NO", "O3", "H2S", "Toluene")

MOLAR_MASS = {"SO2": 64.07, "NO2": 46.01, "NO": 30.01, "NOX": 46.01,  # NOx expressed as NO2
              "O3": 48.00, "C6H6": 78.11, "H2S": 34.08, "Toluene": 92.14}
MOLAR_VOLUME = 24.45  # L/mol at 25 C, 1 atm


def to_ugm3(key, value, units):
    """ppb -> ug/m3 (CO: ppm -> mg/m3). Values already in ug/m3 are untouched."""
    if value is None:
        return None
    u = (units or "").lower()
    if u == "ppb" and key in MOLAR_MASS:
        return value * MOLAR_MASS[key] / MOLAR_VOLUME
    if u == "ppm" and key == "CO":
        return value * 28.01 / MOLAR_VOLUME
    if u == "ppb" and key == "CO":
        return value * 28.01 / MOLAR_VOLUME / 1000
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
    """-> list of (datetime, {key: value}) with units normalised, valid readings only."""
    out = []
    for p in avg_resp.data or []:
        if not p.datetime:
            continue
        vals = {}
        for ch in p.channels or []:
            key = CHANNELS.get(ch.name)
            if key and ch.valid and ch.value is not None:
                vals[key] = round(to_ugm3(key, ch.value, ch.units), 3)
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


async def fetch_station(client, dash_id, api_id, name):
    avg = await client.get_station_average(api_id, hours_back=24, timebase=5)
    pts = points_of(avg)
    if not pts:
        raise RuntimeError("no valid data points")
    latest_t = pts[-1][0]
    pts = [p for p in pts if p[0] > latest_t - timedelta(hours=24)]
    last5 = {k: v for k, v in pts[-1][1].items()}
    last30 = window_mean(pts, latest_t - timedelta(minutes=30))
    hourly = window_mean(pts, latest_t - timedelta(hours=1))
    daily = window_mean(pts, latest_t - timedelta(hours=24))
    metrics = {k: {"hourly": hourly.get(k), "daily": daily.get(k)}
               for k in GAS_KEYS if k in daily}
    return latest_t, {
        "id": dash_id,
        "apiStationId": api_id,
        "name": name,
        "measuredAt": latest_t.isoformat(),
        "metrics": metrics,
        "last5m": last5,
        "last30m": {**{k: last30.get(k) for k in (*GAS_KEYS, "windDir", "windSpeed")},
                    "history24h": history_30min(pts)},
    }


async def main():
    stations, times = [], []
    async with aiohttp.ClientSession() as session:
        client = SvivaAirClient(session)
        await client.generate_token()
        for dash_id, (api_id, name) in STATIONS.items():
            try:
                t, st = await fetch_station(client, dash_id, api_id, name)
                stations.append(st)
                times.append(t)
                print(f"OK   {name} ({api_id}) @ {t.isoformat()}")
            except Exception as exc:  # keep going; one station must not kill the run
                print(f"FAIL {name} ({api_id}): {exc!r}", file=sys.stderr)
    if not stations:
        print("No station data fetched; leaving live_krayot.json untouched.", file=sys.stderr)
        return 1
    doc = {"timestamp": max(times).isoformat(), "source": "air.sviva.gov.il", "units": "ug/m3 (CO mg/m3), wind m/s & deg",
           "stations": stations}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(stations)} stations)")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
