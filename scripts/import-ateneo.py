"""Convert an OSM API map.json extract to the bundled campus geometry.

Usage: python3 scripts/import-ateneo.py area.json boundary.json [YYYY-MM-DD]
Download the area from https://api.openstreetmap.org/api/0.6/map.json?bbox=121.074,14.632,121.084,14.648
and the boundary from https://api.openstreetmap.org/api/0.6/way/138294127/full.json.
"""

import argparse
import math

from import_utils import DATA_DIRECTORY, parse_retrieval_date, read_json, write_json


def point_inside_boundary(longitude, latitude, boundary):
    inside = False
    for index, (start_longitude, start_latitude) in enumerate(boundary):
        end_longitude, end_latitude = boundary[index - 1]
        if (start_latitude > latitude) != (end_latitude > latitude):
            crossing = (
                (end_longitude - start_longitude)
                * (latitude - start_latitude)
                / (end_latitude - start_latitude)
                + start_longitude
            )
            if longitude < crossing:
                inside = not inside
    return inside


def meters_per_degree(latitude):
    radians = math.radians(latitude)
    return [
        111412.84 * math.cos(radians)
        - 93.5 * math.cos(3 * radians)
        + 0.118 * math.cos(5 * radians),
        111132.92
        - 559.82 * math.cos(2 * radians)
        + 1.175 * math.cos(4 * radians)
        - 0.0023 * math.cos(6 * radians),
    ]


def feature_kind(tags):
    if 'building' in tags:
        return 'building'
    if 'highway' in tags:
        return 'road'
    if tags.get('leisure') == 'pitch':
        return 'pitch'
    if (
        tags.get('landuse') == 'forest'
        or tags.get('natural') == 'wood'
        or tags.get('leisure') in ['park', 'garden']
    ):
        return 'green'
    return None


def building_height(tags):
    try:
        height = (
            float(tags['height'].split()[0])
            if 'height' in tags
            else float(tags.get('building:levels', 3)) * 3.5
        )
    except ValueError:
        height = 10.5
    return max(3, min(50, height))


def convert_campus(area, boundary, retrieved):
    nodes = {
        element['id']: element
        for element in [*area['elements'], *boundary['elements']]
        if element['type'] == 'node'
    }
    outline = next(element for element in boundary['elements'] if element['type'] == 'way')
    coordinates = [(nodes[node]['lon'], nodes[node]['lat']) for node in outline['nodes']]
    origin = [
        (min(point[axis] for point in coordinates) + max(point[axis] for point in coordinates)) / 2
        for axis in range(2)
    ]
    scale = meters_per_degree(origin[1])

    def project(node):
        return [
            round((node['lon'] - origin[0]) * scale[0], 2),
            round((origin[1] - node['lat']) * scale[1], 2),
        ]

    def inside(node):
        return point_inside_boundary(node['lon'], node['lat'], coordinates)

    features = []
    for element in area['elements']:
        if element['type'] != 'way':
            continue
        tags = element.get('tags', {})
        if tags.get('building') == 'no':
            continue
        kind = feature_kind(tags)
        if not kind or any(node not in nodes for node in element['nodes']):
            continue
        points = [nodes[node] for node in element['nodes']]
        if not any(inside(node) for node in points):
            continue
        geometry = [project(node) for node in points]
        if kind != 'road' and geometry[0] == geometry[-1]:
            geometry.pop()
        if len(geometry) < (2 if kind == 'road' else 3):
            continue
        feature = {
            'id': element['id'],
            'kind': kind,
            'name': tags.get('name', ''),
            'points': geometry,
        }
        if kind == 'building':
            feature['height'] = building_height(tags)
            feature['heightEstimated'] = 'height' not in tags
            feature['type'] = tags['building']
        elif kind == 'road':
            feature['type'] = tags['highway']
        features.append(feature)

    return {
        'name': outline['tags']['name'],
        'retrieved': retrieved.isoformat(),
        'source': 'https://www.openstreetmap.org/way/138294127',
        'attribution': '© OpenStreetMap contributors',
        'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
        'origin': {'longitude': origin[0], 'latitude': origin[1]},
        'metersPerDegree': scale,
        'boundary': [project(nodes[node]) for node in outline['nodes'][:-1]],
        'features': features,
        'trees': [
            project(element)
            for element in area['elements']
            if element['type'] == 'node'
            and element.get('tags', {}).get('natural') == 'tree'
            and inside(element)
        ],
    }


def main():
    parser = argparse.ArgumentParser(description='Convert OSM campus geometry to bundled map data.')
    parser.add_argument('area')
    parser.add_argument('boundary')
    parser.add_argument('retrieved', nargs='?', type=parse_retrieval_date, default=parse_retrieval_date())
    arguments = parser.parse_args()
    result = convert_campus(read_json(arguments.area), read_json(arguments.boundary), arguments.retrieved)
    destination = DATA_DIRECTORY / 'ateneo-campus.json'
    write_json(destination, result)
    print(f'Wrote {len(result["features"])} features and {len(result["trees"])} trees to {destination}')


if __name__ == '__main__':
    main()
