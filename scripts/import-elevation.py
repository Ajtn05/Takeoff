"""Crop public HGT elevation data to a campus-relative metric grid.

python3 scripts/import-elevation.py N14E121.hgt.gz [YYYY-MM-DD]
Source: https://s3.amazonaws.com/elevation-tiles-prod/skadi/N14/N14E121.hgt.gz
HGT is north-to-south, big-endian signed 16-bit elevation above sea level.
"""

import argparse
import gzip
import math
import struct

from import_utils import DATA_DIRECTORY, parse_retrieval_date, read_json, write_json

GRID_STEP = 30
GRID_MINIMUM = -1320
GRID_COUNT = 89
SMOOTHING_WEIGHTS = [(-1, 1), (0, 2), (1, 1)]


class ElevationTile:
    def __init__(self, raw, campus):
        self.raw = raw
        self.size = math.isqrt(len(raw) // 2)
        if self.size != 3601 or len(raw) != self.size * self.size * 2:
            raise ValueError('Expected a 1 arc-second HGT tile')
        self.origin = campus['origin']
        self.scale = campus['metersPerDegree']

    def sample(self, x, z):
        longitude = self.origin['longitude'] + x / self.scale[0]
        latitude = self.origin['latitude'] - z / self.scale[1]
        column_position = (longitude - 121) * (self.size - 1)
        row_position = (15 - latitude) * (self.size - 1)
        column = math.floor(column_position)
        row = math.floor(row_position)
        horizontal_fraction = column_position - column
        vertical_fraction = row_position - row
        heights = [
            struct.unpack_from('>h', self.raw, 2 * ((row + dz) * self.size + column + dx))[0]
            for dz in range(2)
            for dx in range(2)
        ]
        if any(height == -32768 for height in heights):
            raise ValueError('Missing source elevation')
        return (
            heights[0] * (1 - horizontal_fraction) * (1 - vertical_fraction)
            + heights[1] * horizontal_fraction * (1 - vertical_fraction)
            + heights[2] * (1 - horizontal_fraction) * vertical_fraction
            + heights[3] * horizontal_fraction * vertical_fraction
        )


def smooth_grid(values):
    count = len(values)
    smoothed = []
    for row in range(count):
        for column in range(count):
            total = sum(
                values[max(0, min(count - 1, row + dz))][max(0, min(count - 1, column + dx))]
                * horizontal_weight
                * vertical_weight
                for dz, vertical_weight in SMOOTHING_WEIGHTS
                for dx, horizontal_weight in SMOOTHING_WEIGHTS
            )
            smoothed.append(round(total / 16, 2))
    return smoothed


def convert_elevation(tile, retrieved):
    values = [
        [
            tile.sample(GRID_MINIMUM + column * GRID_STEP, GRID_MINIMUM + row * GRID_STEP)
            for column in range(GRID_COUNT)
        ]
        for row in range(GRID_COUNT)
    ]
    return {
        'source': 'https://s3.amazonaws.com/elevation-tiles-prod/skadi/N14/N14E121.hgt.gz',
        'documentation': 'https://registry.opendata.aws/terrain-tiles/',
        'attribution': 'SRTM data courtesy of the U.S. Geological Survey, via Mapzen/AWS Terrain Tiles',
        'retrieved': retrieved.isoformat(),
        'sourceResolutionMeters': 30,
        'sourceEpoch': '2000 (SRTM radar survey)',
        'processing': (
            'Bilinear resampling to 30 m metric grid; one 3x3 binomial smoothing pass. '
            'No vertical exaggeration.'
        ),
        'minX': GRID_MINIMUM,
        'minZ': GRID_MINIMUM,
        'step': GRID_STEP,
        'columns': GRID_COUNT,
        'rows': GRID_COUNT,
        'heights': smooth_grid(values),
    }


def main():
    parser = argparse.ArgumentParser(description='Convert an HGT tile to bundled campus elevation.')
    parser.add_argument('tile')
    parser.add_argument('retrieved', nargs='?', type=parse_retrieval_date, default=parse_retrieval_date())
    arguments = parser.parse_args()
    campus = read_json(DATA_DIRECTORY / 'ateneo-campus.json')
    with gzip.open(arguments.tile, 'rb') as source:
        tile = ElevationTile(source.read(), campus)
    result = convert_elevation(tile, arguments.retrieved)
    write_json(DATA_DIRECTORY / 'ateneo-elevation.json', result)
    heights = result['heights']
    print(
        f'Wrote {GRID_COUNT} x {GRID_COUNT} heights, '
        f'range {min(heights):.1f}–{max(heights):.1f} m ASL'
    )


if __name__ == '__main__':
    main()
