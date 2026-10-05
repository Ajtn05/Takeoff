"""Crop public HGT elevation data to a campus-relative metric grid.

python3 scripts/import-elevation.py N14E121.hgt.gz [YYYY-MM-DD]
Source: https://s3.amazonaws.com/elevation-tiles-prod/skadi/N14/N14E121.hgt.gz
HGT is north-to-south, big-endian signed 16-bit elevation above sea level.
"""
import datetime
import gzip
import json
import math
from pathlib import Path
import struct
import sys

root = Path(__file__).resolve().parents[1]
campus = json.loads((root / 'public/data/ateneo-campus.json').read_text())
raw = gzip.open(sys.argv[1], 'rb').read()
size = math.isqrt(len(raw) // 2)
assert size == 3601 and len(raw) == size * size * 2, 'Expected a 1 arc-second HGT tile'
origin, scale = campus['origin'], campus['metersPerDegree']

def sample(x, z):
    lon, lat = origin['longitude'] + x / scale[0], origin['latitude'] - z / scale[1]
    u, v = (lon - 121) * (size - 1), (15 - lat) * (size - 1)
    col, row = math.floor(u), math.floor(v)
    tx, ty = u - col, v - row
    values = [struct.unpack_from('>h', raw, 2 * ((row + dy) * size + col + dx))[0]
              for dy in range(2) for dx in range(2)]
    assert all(h != -32768 for h in values), 'Missing source elevation'
    return values[0] * (1 - tx) * (1 - ty) + values[1] * tx * (1 - ty) + values[2] * (1 - tx) * ty + values[3] * tx * ty

step, minimum, count = 30, -1320, 89
values = [[sample(minimum + col * step, minimum + row * step) for col in range(count)] for row in range(count)]
# One symmetric 3x3 binomial pass reduces radar/canopy noise. No invented hills.
smoothed = []
for row in range(count):
    for col in range(count):
        smoothed.append(round(sum(values[max(0, min(count - 1, row + dy))][max(0, min(count - 1, col + dx))] * wx * wy
                                  for dy, wy in [(-1, 1), (0, 2), (1, 1)]
                                  for dx, wx in [(-1, 1), (0, 2), (1, 1)]) / 16, 2))
result = {
    'source': 'https://s3.amazonaws.com/elevation-tiles-prod/skadi/N14/N14E121.hgt.gz',
    'documentation': 'https://registry.opendata.aws/terrain-tiles/',
    'attribution': 'SRTM data courtesy of the U.S. Geological Survey, via Mapzen/AWS Terrain Tiles',
    'retrieved': sys.argv[2] if len(sys.argv) > 2 else datetime.date.today().isoformat(),
    'sourceResolutionMeters': 30, 'sourceEpoch': '2000 (SRTM radar survey)',
    'processing': 'Bilinear resampling to 30 m metric grid; one 3x3 binomial smoothing pass. No vertical exaggeration.',
    'minX': minimum, 'minZ': minimum, 'step': step, 'columns': count, 'rows': count,
    'heights': smoothed,
}
destination = root / 'public/data/ateneo-elevation.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f'Wrote {count} x {count} heights, range {min(smoothed):.1f}–{max(smoothed):.1f} m ASL')
