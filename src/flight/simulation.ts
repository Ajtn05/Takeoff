import { neutralControls, type Controls, type Telemetry } from '../../shared/protocol';
import { FLAT_GROUND, type GroundSampler } from '../maps/terrain';

export interface FlightProfile {
  speed: number;
  climbRate: number;
  descentRate: number;
  yawRate: number;
  acceleration: number;
  braking: number;
  gimbalRate: number;
  gimbalMin: number;
  gimbalMax: number;
  fov: number;
}
export const GENERIC_PROFILE: FlightProfile = {
  speed: 20,
  climbRate: 5,
  descentRate: 5,
  yawRate: Math.PI / 2,
  acceleration: 5,
  braking: 8,
  gimbalRate: 35,
  gimbalMin: -90,
  gimbalMax: 20,
  fov: 64,
};
export type MapPoint = [number, number];
// Aircraft envelope references DJI Air 3's published unfolded dimensions (without propellers).
export const DRONE_DIMENSIONS = {
  length: 0.2588,
  width: 0.326,
  height: 0.1058,
  rotorDiameter: 0.22,
};
export const DRONE_RADIUS =
  Math.hypot((DRONE_DIMENSIONS.width - 0.03) / 2, (DRONE_DIMENSIONS.length - 0.03) / 2) +
  DRONE_DIMENSIONS.rotorDiameter / 2;
export const DRONE_HALF_HEIGHT = DRONE_DIMENSIONS.height / 2;
export type AircraftType = 'quadcopter' | 'helicopter';
export interface AircraftEnvelope {
  radius: number;
  halfHeight: number;
  restHeight: number;
  cameraForward: number;
  cameraHeight: number;
}
export const DRONE_ENVELOPE: AircraftEnvelope = {
  radius: DRONE_RADIUS,
  halfHeight: DRONE_HALF_HEIGHT,
  restHeight: 0.065,
  cameraForward: 0.105,
  cameraHeight: -0.025,
};
// The tracking helicopter is an illustrative simulator aircraft, including its rotor and tail.
export const HELICOPTER_ENVELOPE: AircraftEnvelope = {
  radius: 4.5,
  halfHeight: 1.2,
  restHeight: 1.22,
  cameraForward: 1.35,
  cameraHeight: -0.63,
};
export const aircraftEnvelope = (type: AircraftType): AircraftEnvelope =>
  type === 'helicopter' ? HELICOPTER_ENVELOPE : DRONE_ENVELOPE;
export interface Obstacle {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
  footprint?: MapPoint[];
  topAt?: GroundSampler;
  intersects?: (x: number, y: number, z: number, radius: number, halfHeight: number) => boolean;
}
export interface FlightBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  ceiling: number;
  footprint?: MapPoint[];
}
export const FLIGHT_CEILING = 300;
export const PRACTICE_BOUNDS: FlightBounds = {
  minX: -120,
  maxX: 120,
  minZ: -120,
  maxZ: 120,
  ceiling: FLIGHT_CEILING,
};
export const OBSTACLES: Obstacle[] = [
  { name: 'studio building', min: [-19, 0, -19], max: [-9, 7, -7] },
  { name: 'photo sculpture', min: [-1.3, 0, -14.3], max: [1.3, 5.3, -11.7] },
  ...[
    [12, -15],
    [17, -5],
    [-16, 8],
    [11, 16],
    [-5, -25],
  ].map(([x, z], i) => ({
    name: `tree ${i + 1}`,
    min: [x - 2, 0, z - 2] as [number, number, number],
    max: [x + 2, 8, z + 2] as [number, number, number],
  })),
  { name: 'west pavilion', min: [-83, 0, -62], max: [-57, 12, -44] },
  { name: 'east studio', min: [52, 0, -75], max: [76, 9, -55] },
  { name: 'garden hall', min: [48, 0, 54], max: [68, 8, 70] },
];
export interface DroneState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  yawVelocity: number;
  gimbal: number;
  bank: number;
  pitch: number;
  mode: Telemetry['mode'];
  collision: string | null;
  takeoffY?: number;
}
export const PAD = { x: 0, z: 9 };
export const GROUND_HEIGHT = DRONE_ENVELOPE.restHeight;
export const initialState = (
  pad = PAD,
  heading = 0,
  ground: GroundSampler = FLAT_GROUND,
  envelope = DRONE_ENVELOPE,
): DroneState => ({
  x: pad.x,
  y: ground(pad.x, pad.z) + envelope.restHeight,
  z: pad.z,
  vx: 0,
  vy: 0,
  vz: 0,
  heading,
  yawVelocity: 0,
  gimbal: -12,
  bank: 0,
  pitch: 0,
  mode: 'grounded',
  collision: null,
});
const approach = (value: number, target: number, amount: number) =>
  value + Math.max(-amount, Math.min(amount, target - value));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function headingVelocity(forward: number, right: number, heading: number): [number, number] {
  // Heading 0 faces -Z. Positive yaw turns clockwise when viewed from above.
  return [
    Math.sin(heading) * forward + Math.cos(heading) * right,
    -Math.cos(heading) * forward + Math.sin(heading) * right,
  ];
}
export function takeoff(s: DroneState): boolean {
  if (s.mode !== 'grounded') return false;
  s.takeoffY = s.y + 3;
  s.mode = 'taking-off';
  return true;
}
export function land(s: DroneState): boolean {
  if (s.mode !== 'flying') return false;
  s.mode = 'landing';
  return true;
}
export function pointInPolygon(x: number, z: number, polygon: MapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[i];
    const [bx, bz] = polygon[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
export function overlapsFootprint(
  x: number,
  z: number,
  polygon: MapPoint[],
  radius = DRONE_RADIUS,
): boolean {
  if (pointInPolygon(x, z, polygon)) return true;
  return polygon.some(([ax, az], i) => {
    const [bx, bz] = polygon[(i + 1) % polygon.length];
    const length = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = length ? clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / length, 0, 1) : 0;
    return Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)) < radius;
  });
}
export function stepFlight(
  s: DroneState,
  controls: Controls,
  dt: number,
  profile = GENERIC_PROFILE,
  obstacles = OBSTACLES,
  bounds = PRACTICE_BOUNDS,
  ground: GroundSampler = FLAT_GROUND,
  envelope = DRONE_ENVELOPE,
): void {
  if (dt <= 0 || dt > 0.05 || s.mode === 'collided') return;
  const subdivisions = Math.ceil(
    (Math.hypot(s.vx, s.vy, s.vz) * dt + profile.acceleration * dt * dt) /
      (Math.min(envelope.radius, DRONE_RADIUS) / 2),
  );
  if (subdivisions > 1) {
    for (let i = 0; i < subdivisions; i++)
      stepFlight(s, controls, dt / subdivisions, profile, obstacles, bounds, ground, envelope);
    return;
  }
  s.gimbal = clamp(
    s.gimbal + controls.gimbal * profile.gimbalRate * dt,
    profile.gimbalMin,
    profile.gimbalMax,
  );
  if (s.mode === 'grounded') return;
  const automatic = s.mode === 'taking-off' || s.mode === 'landing';
  const input = automatic ? neutralControls() : controls;
  s.yawVelocity = approach(s.yawVelocity, input.yaw * profile.yawRate, Math.PI * 3 * dt);
  s.heading = (s.heading + s.yawVelocity * dt + Math.PI * 2) % (Math.PI * 2);
  const length = Math.max(1, Math.hypot(input.forward, input.right));
  const [tx, tz] = headingVelocity(
    (input.forward / length) * profile.speed,
    (input.right / length) * profile.speed,
    s.heading,
  );
  const dx = tx - s.vx;
  const dz = tz - s.vz;
  const distance = Math.hypot(dx, dz);
  const rate = Math.hypot(tx, tz) < Math.hypot(s.vx, s.vz) ? profile.braking : profile.acceleration;
  const scale = distance === 0 ? 0 : Math.min(1, (rate * dt) / distance);
  s.vx += dx * scale;
  s.vz += dz * scale;
  let targetClimb = input.climb * (input.climb >= 0 ? profile.climbRate : profile.descentRate);
  const rest = ground(s.x, s.z) + envelope.restHeight;
  if (s.mode === 'taking-off') targetClimb = clamp(((s.takeoffY ?? rest + 3) - s.y) * 2, 0, 1.5);
  if (s.mode === 'landing') targetClimb = -Math.min(1, (s.y - rest) * 2 + 0.15);
  s.vy = approach(s.vy, targetClimb, profile.acceleration * dt);
  const next = { x: s.x + s.vx * dt, y: s.y + s.vy * dt, z: s.z + s.vz * dt };
  const hit = obstacles.find(
    (o) =>
      next.x + envelope.radius > o.min[0] &&
      next.x - envelope.radius < o.max[0] &&
      next.y + envelope.halfHeight > o.min[1] &&
      next.y - envelope.halfHeight < (o.topAt?.(next.x, next.z) ?? o.max[1]) &&
      next.z + envelope.radius > o.min[2] &&
      next.z - envelope.radius < o.max[2] &&
      (!o.footprint || overlapsFootprint(next.x, next.z, o.footprint, envelope.radius)) &&
      (!o.intersects || o.intersects(next.x, next.y, next.z, envelope.radius, envelope.halfHeight)),
  );
  const nextGround = ground(next.x, next.z);
  const nextRest = nextGround + envelope.restHeight;
  const boundary =
    next.x < bounds.minX ||
    next.x > bounds.maxX ||
    next.z < bounds.minZ ||
    next.z > bounds.maxZ ||
    next.y - nextRest > bounds.ceiling ||
    (bounds.footprint && !pointInPolygon(next.x, next.z, bounds.footprint));
  const groundHit = next.y < nextRest && s.mode !== 'landing';
  if (hit || boundary || groundHit) {
    s.mode = 'collided';
    s.collision = hit?.name ?? (groundHit ? 'ground' : 'practice boundary');
    s.vx = s.vy = s.vz = s.yawVelocity = 0;
    return;
  }
  s.x = next.x;
  s.y = Math.max(nextRest, next.y);
  s.z = next.z;
  if (s.mode === 'taking-off' && s.y >= (s.takeoffY ?? nextRest + 3) - 0.03) {
    s.y = s.takeoffY ?? nextRest + 3;
    s.vy = 0;
    s.mode = 'flying';
  }
  if (s.mode === 'landing' && s.y <= nextRest + 0.01) {
    s.y = nextRest;
    s.vx = s.vy = s.vz = 0;
    s.mode = 'grounded';
  }
  const [bodyRightX, bodyRightZ] = headingVelocity(0, 1, s.heading);
  const [bodyForwardX, bodyForwardZ] = headingVelocity(1, 0, s.heading);
  s.bank = approach(
    s.bank,
    clamp(-(s.vx * bodyRightX + s.vz * bodyRightZ) / profile.speed, -1, 1) * 0.42,
    dt * 0.9,
  );
  s.pitch = approach(
    s.pitch,
    clamp(-(s.vx * bodyForwardX + s.vz * bodyForwardZ) / profile.speed, -1, 1) * 0.42,
    dt * 0.9,
  );
}
