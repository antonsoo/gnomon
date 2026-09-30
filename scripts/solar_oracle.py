"""Generate tests/fixtures/solar-oracle.json: the Sun's apparent declination and
the equation of time from Skyfield and the JPL DE421 ephemeris, an ephemeris
independent of src/lib/astronomy.ts (the NOAA/Meeus low-precision series).

Run from the repo root (downloads de421.bsp, about 17 MB, on first use):

    uv run --with skyfield python3 scripts/solar_oracle.py [cache-dir]

Dates: 12:00 UTC every 17 days from 1900-01-01 through 2050-12-31 (DE421's
coverage). Declination is apparent, of date; the equation of time is apparent
solar time minus mean solar time at Greenwich, GAST - RA + 12h - UT1, wrapped
to +/-12 h. UT1 and UTC differ by under a second, which moves the equation of
time by well under 0.01 s.
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from skyfield.api import Loader

cache = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
load = Loader(str(cache))
ts = load.timescale()
eph = load("de421.bsp")
earth, sun = eph["earth"], eph["sun"]

points = []
day = datetime(1900, 1, 1, 12, tzinfo=timezone.utc)
end = datetime(2050, 12, 31, 12, tzinfo=timezone.utc)
while day <= end:
    t = ts.from_datetime(day)
    ra, dec, _ = earth.at(t).observe(sun).apparent().radec(epoch="date")
    ut1_hours = ((t.ut1 + 0.5) % 1.0) * 24.0
    eot_hours = t.gast - ra.hours + 12.0 - ut1_hours
    eot_hours = (eot_hours + 12.0) % 24.0 - 12.0
    points.append([day.strftime("%Y-%m-%dT%H:%M:%SZ"), round(dec.degrees, 6), round(eot_hours * 60.0, 5)])
    day += timedelta(days=17)

out = Path("tests/fixtures/solar-oracle.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({
    "source": "Skyfield + JPL DE421 (scripts/solar_oracle.py)",
    "columns": ["utc", "apparentDeclinationDeg", "equationOfTimeMin"],
    "points": points,
}, separators=(",", ":")) + "\n")
print(f"wrote {len(points)} points to {out}")
