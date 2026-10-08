import { CatmullRomCurve3, Vector3 } from 'three';
import type { MapPoint } from '../flight/simulation';

export interface CircuitPose {
  x: number;
  z: number;
  heading: number;
  speed: number;
  lap: number;
}
export interface RaceCar {
  width: number;
  length: number;
  height: number;
  wheelRadius: number;
}
export interface RaceCircuit {
  path: Vector3[];
  length: number;
  roadWidth: number;
  car: RaceCar;
  carName: string;
  pose: (distance: number) => CircuitPose;
}

export function createCircuit(
  points: MapPoint[],
  options: {
    minSpeed: number;
    maxSpeed: number;
    cornerAcceleration: number;
    length?: number;
  },
): Pick<RaceCircuit, 'path' | 'length' | 'pose'> {
  const curve = new CatmullRomCurve3(
    points.map(([x, z]) => new Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  curve.arcLengthDivisions = 8192;
  if (options.length) {
    const scale = options.length / curve.getLength();
    curve.points.forEach((point) => point.multiplyScalar(scale));
    curve.updateArcLengths();
  }
  const length = curve.getLength();
  const sampleCount = 4096;
  const spacing = length / sampleCount;
  const path = curve.getSpacedPoints(sampleCount);
  const tangents = path.slice(0, -1).map((_, i) =>
    path[(i + 1) % sampleCount]
      .clone()
      .sub(path[(i - 1 + sampleCount) % sampleCount])
      .normalize(),
  );
  const window = 18;
  const speeds = tangents.map((_, i) => {
    const bend =
      Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            tangents[(i + window) % sampleCount].dot(
              tangents[(i - window + sampleCount) % sampleCount],
            ),
          ),
        ),
      ) /
      (2 * window * spacing);
    return Math.max(
      options.minSpeed,
      Math.min(options.maxSpeed, Math.sqrt(options.cornerAcceleration / Math.max(bend, 0.001))),
    );
  });
  return {
    path,
    length,
    pose(distance) {
      const progress = (((distance % length) + length) % length) / spacing;
      const i = Math.floor(progress) % sampleCount;
      const next = (i + 1) % sampleCount;
      const t = progress - Math.floor(progress);
      const a = path[i];
      const b = path[next];
      const direction = tangents[i].clone().lerp(tangents[next], t).normalize();
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        heading: Math.atan2(direction.x, -direction.z),
        speed: speeds[i] + (speeds[next] - speeds[i]) * t,
        lap: Math.floor(Math.max(0, distance) / length) + 1,
      };
    },
  };
}
