"""Convert an OSM API map.json extract to the bundled campus geometry.

Usage: python3 scripts/import-ateneo.py area.json boundary.json [YYYY-MM-DD]
Download the area from https://api.openstreetmap.org/api/0.6/map.json?bbox=121.074,14.632,121.084,14.648
and the boundary from https://api.openstreetmap.org/api/0.6/way/138294127/full.json.
"""
import datetime
import json
import math
from pathlib import Path
import sys

area, boundary = [json.loads(Path(p).read_text()) for p in sys.argv[1:3]]
nodes = {e['id']: e for e in area['elements'] if e['type'] == 'node'}
nodes.update({e['id']: e for e in boundary['elements'] if e['type'] == 'node'})
outline = next(e for e in boundary['elements'] if e['type'] == 'way')
geo = [(nodes[n]['lon'], nodes[n]['lat']) for n in outline['nodes']]
origin = [(min(p[i] for p in geo) + max(p[i] for p in geo)) / 2 for i in range(2)]
phi = math.radians(origin[1])
# WGS84 meters per degree at the campus latitude. Preserve physical scale.
scale = [111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi) + 0.118 * math.cos(5 * phi),
         111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi) - 0.0023 * math.cos(6 * phi)]

def project(node):
    return [round((node['lon'] - origin[0]) * scale[0], 2), round((origin[1] - node['lat']) * scale[1], 2)]

def inside(lon, lat):
    result = False
    for i, (ax, ay) in enumerate(geo):
        bx, by = geo[i - 1]
        if (ay > lat) != (by > lat) and lon < (bx - ax) * (lat - ay) / (by - ay) + ax:
            result = not result
    return result

features = []
for e in area['elements']:
    if e['type'] != 'way':
        continue
    tags = e.get('tags', {})
    if tags.get('building') == 'no':
        continue
    kind = ('building' if 'building' in tags else 'road' if 'highway' in tags else
            'pitch' if tags.get('leisure') == 'pitch' else
            'green' if tags.get('landuse') == 'forest' or tags.get('natural') == 'wood' or tags.get('leisure') in ['park', 'garden'] else None)
    if not kind or any(n not in nodes for n in e['nodes']):
        continue
    points = [nodes[n] for n in e['nodes']]
    if not any(inside(n['lon'], n['lat']) for n in points):
        continue
    geometry = [project(n) for n in points]
    if kind != 'road' and geometry[0] == geometry[-1]:
        geometry.pop()
    if len(geometry) < (2 if kind == 'road' else 3):
        continue
    feature = {'id': e['id'], 'kind': kind, 'name': tags.get('name', ''), 'points': geometry}
    if kind == 'building':
        try:
            height = float(tags['height'].split()[0]) if 'height' in tags else float(tags.get('building:levels', 3)) * 3.5
        except ValueError:
            height = 10.5
        feature['height'] = max(3, min(50, height))
        feature['heightEstimated'] = 'height' not in tags
        feature['type'] = tags['building']
    elif kind == 'road':
        feature['type'] = tags['highway']
    features.append(feature)

result = {
    'name': outline['tags']['name'], 'retrieved': datetime.date.fromisoformat(sys.argv[3]).isoformat() if len(sys.argv) > 3 else datetime.date.today().isoformat(),
    'source': 'https://www.openstreetmap.org/way/138294127',
    'attribution': '© OpenStreetMap contributors', 'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
    'origin': {'longitude': origin[0], 'latitude': origin[1]}, 'metersPerDegree': scale,
    'boundary': [project(nodes[n]) for n in outline['nodes'][:-1]],
    'features': features,
    'trees': [project(e) for e in area['elements'] if e['type'] == 'node' and e.get('tags', {}).get('natural') == 'tree' and inside(e['lon'], e['lat'])],
}
destination = Path(__file__).resolve().parents[1] / 'public/data/ateneo-campus.json'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Wrote {len(features)} features and {len(result["trees"])} trees to {destination}')
