import { CatmullRomCurve3, Vector3 } from 'three';
import { FLIGHT_CEILING, type FlightBounds, type Obstacle } from './simulation';
import type { RaceCar, RaceCircuit } from './circuit';

export const RALLY_BOUNDS: FlightBounds = { minX: -370, maxX: 370, minZ: -140, maxZ: 140, ceiling: FLIGHT_CEILING };
export const RALLY_PAD = { x: -15, z: 108 };
export const RALLY_ROAD_WIDTH = 9;
// Collision envelope includes protruding tyres, bumpers, and the roof.
export const RALLY_CAR = { width: 2.32, length: 4.38, height: 1.57, wheelRadius: 0.38 };

// A closed gravel circuit with a fast home straight, sweeping bends, and two hairpins.
const waypoints = [[0, 85], [82, 85], [127, 66], [135, 30], [116, 10], [78, 28], [42, 23],
  [26, -6], [45, -40], [100, -57], [120, -88], [87, -108], [15, -100], [-29, -70],
  [-66, -78], [-125, -100], [-143, -67], [-110, -32], [-87, 10], [-122, 36], [-115, 71], [-72, 85]];
const curve = new CatmullRomCurve3(waypoints.map(([x, z]) => new Vector3(x, 0, z)), true, 'centripetal');
curve.arcLengthDivisions = 4096;
export const RALLY_LENGTH = curve.getLength();
// Distance-spaced samples keep the car's speed independent of waypoint spacing.
const sampleCount = 2048;
export const RALLY_PATH = curve.getSpacedPoints(sampleCount);
const spacing = RALLY_LENGTH / sampleCount;
const tangents = RALLY_PATH.slice(0, -1).map((_, i) => RALLY_PATH[(i + 1) % sampleCount].clone()
  .sub(RALLY_PATH[(i - 1 + sampleCount) % sampleCount]).normalize());
const speeds = tangents.map((tangent, i) => {
  const ahead = tangents[(i + 18) % sampleCount], behind = tangents[(i - 18 + sampleCount) % sampleCount];
  const bend = Math.acos(Math.max(-1, Math.min(1, ahead.dot(behind)))) / (36 * spacing);
  return Math.max(10, Math.min(22, Math.sqrt(5 / Math.max(bend, 0.001))));
});

export interface RallyPose { x: number; z: number; heading: number; speed: number; lap: number }
export function rallyPose(distance: number): RallyPose {
  const progress = ((distance % RALLY_LENGTH) + RALLY_LENGTH) % RALLY_LENGTH / spacing;
  const i = Math.floor(progress) % sampleCount, next = (i + 1) % sampleCount, t = progress - Math.floor(progress);
  const a = RALLY_PATH[i], b = RALLY_PATH[next];
  const direction = tangents[i].clone().lerp(tangents[next], t).normalize();
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    heading: Math.atan2(direction.x, -direction.z), speed: speeds[i] + (speeds[next] - speeds[i]) * t,
    lap: Math.floor(Math.max(0, distance) / RALLY_LENGTH) + 1 };
}

export const RALLY_CIRCUIT: RaceCircuit = { path: RALLY_PATH, length: RALLY_LENGTH, pose: rallyPose,
  roadWidth: RALLY_ROAD_WIDTH, car: RALLY_CAR, carName: 'rally car' };

export interface RallySession {
  distance: number; flyingTime: number; framedTime: number; streak: number; bestStreak: number;
}
export const initialRallySession = (): RallySession => ({ distance: 0, flyingTime: 0, framedTime: 0, streak: 0, bestStreak: 0 });
export function advanceRally(session: RallySession, dt: number, pose = rallyPose): void {
  if (dt <= 0 || dt > 0.05) return;
  // Short integration steps also preserve timing through fast F1 corner transitions.
  const steps = Math.ceil(dt * 120), step = dt / steps;
  for (let i = 0; i < steps; i++) {
    const middle = session.distance + pose(session.distance).speed * step / 2;
    session.distance += pose(middle).speed * step;
  }
}
export function recordTracking(session: RallySession, dt: number, framed: boolean): void {
  if (dt <= 0) return;
  session.flyingTime += dt;
  session.framedTime += framed ? dt : 0;
  session.streak = framed ? session.streak + dt : 0;
  session.bestStreak = Math.max(session.bestStreak, session.streak);
}

export function rallyCarObstacle(pose: RallyPose, car: RaceCar = RALLY_CAR, name = 'rally car'): Obstacle {
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  const hx = (car.width * Math.abs(c) + car.length * Math.abs(s)) / 2;
  const hz = (car.width * Math.abs(s) + car.length * Math.abs(c)) / 2;
  return { name, min: [pose.x - hx, 0, pose.z - hz], max: [pose.x + hx, car.height, pose.z + hz],
    intersects: (x, y, z, radius, halfHeight) => {
      const dx = x - pose.x, dz = z - pose.z;
      const right = Math.max(0, Math.abs(dx * c + dz * s) - car.width / 2);
      const depth = Math.max(0, Math.abs(-dx * s + dz * c) - car.length / 2);
      return Math.hypot(right, depth) < radius && y - halfHeight < car.height && y + halfHeight > 0;
    } };
}
