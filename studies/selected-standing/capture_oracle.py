# /// script
# requires-python = ">=3.11"
# dependencies = ["skyfield==1.54"]
# ///
"""Independent DE421 apparent declinations for actual selected-minute downloads.

The large JPL kernel stays in the supplied cache; only these date values and
its identity are retained. This is not a new field-accuracy measurement.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path

from skyfield.api import Loader
import skyfield

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cache', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
loader = Loader(str(args.cache))
ts = loader.timescale()
eph = loader('de421.bsp')
points = []
for utc in ['2026-10-17T01:00:00Z','2026-10-17T07:00:00Z',
            '2026-11-01T08:30:00Z','2026-11-01T09:30:00Z','1900-01-01T11:50:39Z']:
    time = ts.from_datetime(datetime.fromisoformat(utc.replace('Z','+00:00')))
    _, dec, _ = eph['earth'].at(time).observe(eph['sun']).apparent().radec(epoch='date')
    points.append({'utc':utc,'apparentDeclinationDeg':dec.degrees})
kernel = args.cache/'de421.bsp'
result = {'source':'Skyfield apparent geocentric Sun, epoch of date, JPL DE421',
          'skyfield':skyfield.__version__, 'kernel':{'file':kernel.name,'bytes':kernel.stat().st_size,
          'sha256':hashlib.sha256(kernel.read_bytes()).hexdigest()}, 'points':points,
          'scope':'Independent date input for controlled native standing-point geometry; no field measurement or accuracy extension.'}
args.out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'points':len(points),'skyfield':skyfield.__version__}))
