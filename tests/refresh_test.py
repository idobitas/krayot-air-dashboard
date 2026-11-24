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
rows, _ = run(fs.fetch_reference(Fake([]), 1, existing, False, days_back=4, purged_out=purged))
ok(not purged and len(rows) == 3, "empty response purges nothing")

# 6) days_back reaches the API call
seen = {}
class Spy(Fake):
    async def get_station_average(self, api_id, **kw): seen.update(kw); return NS(data=[])
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

print(f"refresh: {passes} passed, {fails} failed")
sys.exit(1 if fails else 0)
