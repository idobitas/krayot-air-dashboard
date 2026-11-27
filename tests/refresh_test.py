"""Mock tests for the nightly 4-day refresh in scripts/fetch_sviva.py (no network, no repo writes).
Run: python tests/refresh_test.py"""
import asyncio, importlib.util, json, sys, tempfile, types
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS

ROOT = Path(__file__).resolve().parent.parent
# the script imports aiohttp / py-air-sviva-api at module level; stub them when not installed
for mod in ("aiohttp", "air_sviva_api", "air_sviva_api.client"):
    try:
        __import__(mod)
    except ImportError:
        m = types.ModuleType(mod); sys.modules[mod] = m
        if mod == "air_sviva_api.client":
            m.SvivaAirClient = object
spec = importlib.util.spec_from_file_location("fetch_sviva", ROOT / "scripts" / "fetch_sviva.py")
fs = importlib.util.module_from_spec(spec); spec.loader.exec_module(fs)

passes = fails = 0
def ok(cond, msg):
    global passes, fails
    if cond: passes += 1
    else: fails += 1; print("FAIL:", msg)

TZ = timezone(timedelta(hours=2))
H1, H2, H3 = (datetime(2026, 11, 22, h, 0, tzinfo=TZ) for h in (10, 11, 12))
iso = lambda d: d.isoformat()

def recs(start, n, pm=10.0, valid=True, step=5):
    """n 5-min API records from `start`, one PM2.5 channel."""
    return [NS(datetime=(start + timedelta(minutes=step * i)).isoformat(),
               channels=[NS(name="PM2.5", value=pm, units="µg/m³", valid=valid)]) for i in range(n)]

class Fake:
    def __init__(self, data): self.data = data
    async def get_station_average(self, api_id, **kw): return NS(data=self.data)

run = lambda c: asyncio.run(c)

# 1) trigger: first run at/after 03:00 Israel time, once per calendar day; --refresh-4d forces it
il = fs.IL_TZ
ok(not fs.refresh_due({}, now=datetime(2026, 11, 25, 2, 50, tzinfo=il)), "no refresh before 03:00")
ok(fs.refresh_due({"lastRefreshDate": "2026-11-24"}, now=datetime(2026, 11, 25, 3, 5, tzinfo=il)), "refresh on first run after 03:00")
ok(not fs.refresh_due({"lastRefreshDate": "2026-11-25"}, now=datetime(2026, 11, 25, 9, 0, tzinfo=il)), "only once per day")
ok(fs.refresh_due({"lastRefreshDate": "2026-11-25"}, now=datetime(2026, 11, 25, 9, 0, tzinfo=il), force=True), "--refresh-4d forces it")
ok(fs.REGULAR_DAYS == 1 and fs.REFRESH_DAYS == 4 and fs.REFRESH_HOUR == 3, "windows: 1 day regular, 4 days nightly, at 03:00")

# 2) covered_hours: only complete hours with >= half the records; partial / empty responses cover nothing
full = recs(H1, 12) + recs(H2, 12) + recs(H3, 2)
cov = fs.covered_hours(NS(data=full))
ok(iso(H1) in cov and iso(H2) in cov and iso(H3) not in cov, f"covered = full complete hours only ({sorted(cov)})")
ok(iso(H1) not in fs.covered_hours(NS(data=recs(H1, 3) + recs(H2, 12) + recs(H3, 12))), "3 records do not cover an hour")
ok(fs.covered_hours(NS(data=[])) == set() and fs.covered_hours(NS(data=None)) == set(), "empty / failed response covers nothing")

# 3) invalidated hour (all records valid=False) is purged; an hour the API did not return is kept
existing = [{"t": iso(H1), "PM25": 99.0}, {"t": iso(H2), "PM25": 20.0}, {"t": iso(H3), "PM25": 30.0}]
api = recs(H1, 12, pm=99.0, valid=False) + recs(H2, 12, pm=21.0) + recs(H3, 12, pm=31.0) + recs(H3 + timedelta(hours=1), 12)
purged = set()
rows, _ = run(fs.fetch_reference(Fake(api), 1, existing, False, days_back=4, purged_out=purged))
ts = {r["t"] for r in rows}
ok(purged == {iso(H1)} and iso(H1) not in ts, f"invalidated hour purged ({purged})")
ok(next(r for r in rows if r["t"] == iso(H2))["PM25"] == 21.0, "corrected value replaces the stale one")

# 4) partial API response: records cover only part of the window -> nothing outside it is touched
partial = recs(H3, 12, pm=31.0) + recs(H3 + timedelta(hours=1), 12)
purged = set()
rows, _ = run(fs.fetch_reference(Fake(partial), 1, existing, False, days_back=4, purged_out=purged))
ok(not purged and {iso(H1), iso(H2)} <= {r["t"] for r in rows}, f"partial response never wipes uncovered hours ({purged})")
# a thin hour (2 records, below the half-hour threshold) is not "covered" either
purged = set()
rows, _ = run(fs.fetch_reference(Fake(recs(H1, 2, valid=False) + recs(H2, 12, pm=21.0) + recs(H3, 12)), 1, existing, False, days_back=4, purged_out=purged))
ok(not purged and iso(H1) in {r["t"] for r in rows}, "thin hour is never purged")

# 5) failed fetch (exception / no data) leaves history untouched
class Boom:
    async def get_station_average(self, *a, **k): raise RuntimeError("API down")
try:
    run(fs.fetch_reference(Boom(), 1, existing, False, days_back=4, purged_out=set())); ok(False, "exception expected")
except RuntimeError:
    ok(True, "API failure propagates (main keeps the old rows)")
purged = set()
try:  # v3.5.13: an empty answer is an error (like fetch_station), so main keeps the old rows untouched
    run(fs.fetch_reference(Fake([]), 1, existing, False, days_back=4, purged_out=purged)); ok(False, "empty response must raise")
except RuntimeError:
    ok(not purged, "empty reference response raises and purges nothing")

# 6) days_back reaches the API call
seen = {}
class Spy(Fake):
    async def get_station_average(self, api_id, **kw): seen.update(kw); return NS(data=recs(H1, 12))
run(fs.fetch_reference(Spy([]), 1, [], False, days_back=4))
ok((fs.today_il() - seen["from_date"]).days == 4, f"4-day window requested ({seen.get('from_date')})")
run(fs.fetch_reference(Spy([]), 1, [], False))
ok((fs.today_il() - seen["from_date"]).days == 1, "regular runs keep 1 day back")

# 7) update_archives drops purged hours from archive_YYYY_MM.json (and keeps others; archives still only grow)
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    fs.ARCHIVE_DIR, fs.ARCHIVE_INDEX = tmp, tmp / "archives_index.json"
    sid = next(iter(fs.STATIONS))
    arc = tmp / "archive_2026_11.json"
    old_rows = [{"t": iso(H1), "PM25": 99.0}, {"t": iso(H2), "PM25": 20.0}, {"t": iso(datetime(2026, 11, 1, 5, tzinfo=TZ)), "PM25": 7.0}]
    arc.write_text(fs.history_text(iso(H2), {sid: {"apiStationId": 1, "rows": old_rows}}, ['"month": "2026-11",']), encoding="utf-8")
    hist = {sid: {"apiStationId": 1, "rows": [{"t": iso(H2), "PM25": 21.0}]}}
    fs.update_archives(hist, {sid: {iso(H1)}})
    rows = json.loads(arc.read_text(encoding="utf-8"))["stations"][sid]["rows"]
    tset = {r["t"]: r for r in rows}
    ok(iso(H1) not in tset, "purged hour removed from the monthly archive")
    ok(tset[iso(H2)]["PM25"] == 21.0 and iso(datetime(2026, 11, 1, 5, tzinfo=TZ)) in tset, "other hours kept / refreshed (old month rows stay)")
    fs.update_archives({sid: {"apiStationId": 1, "rows": []}})
    ok(iso(datetime(2026, 11, 1, 5, tzinfo=TZ)) in {r["t"] for r in json.loads(arc.read_text(encoding="utf-8"))["stations"][sid]["rows"]}, "without purge info archives only grow")
    # purge of a month with no fresh rows still rewrites that month
    hist2 = {sid: {"apiStationId": 1, "rows": []}}
    fs.update_archives(hist2, {sid: {iso(H2)}})
    ok(iso(H2) not in {r["t"] for r in json.loads(arc.read_text(encoding="utf-8"))["stations"][sid]["rows"]}, "purge applies even when the month has no fresh rows")

    # 8) history header keeps lastRefreshDate
    fs.HISTORY = tmp / "history_90d.json"
    fs.save_history({"updated": iso(H2), "lastRefreshDate": "2026-11-25", "stations": hist})
    doc = json.loads(fs.HISTORY.read_text(encoding="utf-8"))
    ok(doc.get("lastRefreshDate") == "2026-11-25" and doc["windowDays"] == fs.WINDOW_DAYS, "history_90d.json stores lastRefreshDate")

# 9) lastRefreshDate is recorded only when the refresh ran and no Sviva station failed
now = datetime(2026, 11, 25, 3, 10, tzinfo=il)
h = {"lastRefreshDate": "2026-11-24"}
ok(not fs.mark_refresh(h, True, 1, now=now) and h["lastRefreshDate"] == "2026-11-24", "a failed station keeps yesterday's date (retry next run)")
ok(fs.refresh_due(h, now=now + timedelta(minutes=10)), "so the next run refreshes again")
ok(not fs.mark_refresh(h, False, 0, now=now) and h["lastRefreshDate"] == "2026-11-24", "no refresh -> nothing marked")
ok(fs.mark_refresh(h, True, 0, now=now) and h["lastRefreshDate"] == "2026-11-25", "all stations OK -> today's date")
ok(not fs.refresh_due(h, now=now + timedelta(minutes=10)), "and no second refresh today")

# 10) v3.5.13 coverage is judged PER POLLUTANT and sample counts are stored
def mpts(start, n, step=5, **chans):
    """n points from start; chans = {key: value or callable(i) -> value|None}"""
    out = []
    for i in range(n):
        v = {}
        for k, x in chans.items():
            y = x(i) if callable(x) else x
            if y is not None:
                v[k] = y
        out.append((start + timedelta(minutes=step * i), v))
    return out
# PM2.5 every 5 min, NOX only twice in the hour -> hour row keeps PM2.5, drops NOX
pts = mpts(H1, 24, PM25=10.0, NOX=lambda i: 40.0 if i in (0, 1, 13) else None)
hr = fs.hourly_rows(pts)
ok(hr.get(iso(H1), {}).get("PM25") == 10.0 and "NOX" not in hr.get(iso(H1), {}), f"hourly_rows: thin NOX dropped, PM2.5 kept ({hr.get(iso(H1))})")
roll = fs.rolling_hours(pts)
ok(roll["hourly"] and "PM25" in roll["hourly"] and "NOX" not in roll["hourly"] and roll["hourly"]["n"]["PM25"] == 12 and roll["hourly"]["n"].get("NOX") == 1,
   f"rolling_hours: per-pollutant coverage + counts ({roll['hourly']})")
rows = [{"t": (H1 + timedelta(hours=h)).isoformat(), "PM25": 10.0, **({"NOX": 30.0} if h < 5 else {})} for h in range(14)]
ds = fs.daily_series(rows)
ok(ds and ds[-1].get("PM25") == 10.0 and "NOX" not in ds[-1] and ds[-1]["n"] == {"NOX": 5, "PM25": 14}, f"daily_series: per pollutant MIN_HOURS_PER_DAY + counts ({ds[-1] if ds else None})")

# 11) ozone 8-h mean: 2 readings 10 h apart never pass; a dense 8 h does
sparse = [(H1, {"O3": 80.0}), (H1 + timedelta(hours=10), {"O3": 90.0})]
ok(fs.ozone_8h(sparse, sparse[-1][0]) is None, "ozone_8h: two readings 10 h apart are not an 8-h mean")
dense = mpts(H1, 8 * 12, O3=60.0)
o = fs.ozone_8h(dense, dense[-1][0])
ok(o and o["hourly"] == 60.0 and o["window"] == "8h", f"ozone_8h: dense 8 h passes ({o})")

# 12) fetch_station: O3 nulled when no valid 8-h window; age-based stale
class FakeSt:
    def __init__(self, data): self.data = data
    async def get_station_average(self, api_id, **kw): return NS(data=self.data)
def chrecs(start, n, step=5, **vals):
    return [NS(datetime=(start + timedelta(minutes=step * i)).isoformat(),
               channels=[NS(name=k, value=v, units="µg/m³", valid=True) for k, v in vals.items()]) for i in range(n)]
data = chrecs(H1, 24, **{"PM2.5": 12.0, "O3": 70.0})  # only 2 h of ozone
now_fresh = H1 + timedelta(hours=2, minutes=10)
_, st = run(fs.fetch_station(FakeSt(data), "kiryat_motzkin_z2", 382, "x", [], False, now=now_fresh))
ok(st["metrics"]["O3"]["hourly"] is None and st["metrics"]["O3"]["daily"] is None and st["metrics"]["O3"]["window"] == "8h",
   f"O3 nulled without a valid 8-h window ({st['metrics']['O3']})")
ok(st["stale"] is False and st["ageMinutes"] == 15, f"fresh station not stale ({st['stale']}, {st['ageMinutes']})")
_, st2 = run(fs.fetch_station(FakeSt(data), "kiryat_motzkin_z2", 382, "x", [], False, now=H1 + timedelta(hours=5)))
ok(st2["stale"] is True and st2["ageMinutes"] > 120, f"latest reading > 2 h old -> stale ({st2['ageMinutes']} min)")

# 13) live windows of all fresh stations end at ONE time (no 12:20 / 12:30 mix), nobody dropped
e1 = H1 + timedelta(hours=2, minutes=20); e2 = e1 + timedelta(minutes=10); far = e1 - timedelta(minutes=50)
ok(fs.common_live_end([e1, e2]) == e1 and fs.common_live_end([e1, e2, far]) == e1 and fs.common_live_end([]) is None,
   "common end = earliest end within 30 min of the newest")
def mk(end, sid, stale=False):
    pts = mpts(end - timedelta(hours=3) + timedelta(minutes=5), 36, PM25=10.0)
    return {"id": sid, "measuredAt": end.isoformat(), "stale": stale, "rolling": fs.rolling_hours(pts), "_pts": pts}
sts = [mk(e1, "a"), mk(e2, "b"), mk(far, "c"), mk(e2, "d", stale=True)]
refs = [{"id": "r", "rolling": None, "_pts": mpts(e2 - timedelta(hours=3) + timedelta(minutes=5), 36, PM25=5.0)}]
end = fs.align_rolling(sts, refs)
ok(end == e1, f"aligned end ({end})")
ok(sts[0]["rolling"]["latest"] == e1.isoformat() and sts[1]["rolling"]["latest"] == e1.isoformat() and refs[0]["rolling"]["latest"] == e1.isoformat(),
   "newer station and reference recomputed to the common end")
ok(sts[1]["rolling"]["hourly"]["to"] == e1.isoformat() and sts[1]["rolling"]["hourly"]["n"]["PM25"] == 12, "the aligned window really ends at the common time")
ok(sts[2]["rolling"]["latest"] == far.isoformat(), "a station lagging > 30 min keeps its own end (flagged by the detector)")
ok(all("_pts" not in x for x in sts + refs), "private _pts never reach live_krayot.json")

print(f"refresh: {passes} passed, {fails} failed")
sys.exit(1 if fails else 0)
