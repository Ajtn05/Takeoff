import { neutralControls, type Controls, type Telemetry } from '../shared/protocol';

export interface FlightProfile {
  speed: number; climbRate: number; yawRate: number; acceleration: number; braking: number;
  gimbalRate: number; gimbalMin: number; gimbalMax: number; fov: number;
}
export const GENERIC_PROFILE: FlightProfile = {
  speed: 6, climbRate: 2.5, yawRate: Math.PI / 2, acceleration: 4, braking: 7,
  gimbalRate: 35, gimbalMin: -90, gimbalMax: 20, fov: 64,
};
export interface Obstacle { name: string; min: [number, number, number]; max: [number, number, number] }
export const OBSTACLES: Obstacle[] = [
  { name: 'studio building', min: [-19, 0, -19], max: [-9, 7, -7] },
  { name: 'photo sculpture', min: [-1.3, 0, -14.3], max: [1.3, 5.3, -11.7] },
  ...[[12, -15], [17, -5], [-16, 8], [11, 16], [-5, -25]].map(([x, z], i) => ({
    name: `tree ${i + 1}`, min: [x - 2, 0, z - 2] as [number, number, number], max: [x + 2, 8, z + 2] as [number, number, number],
  })),
];
export interface DroneState {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  heading: number; yawVelocity: number; gimbal: number; bank: number; pitch: number;
  mode: Telemetry['mode']; collision: string | null;
}
export const PAD = { x: 0, z: 9 };
export const GROUND_HEIGHT = 0.45;
export const initialState = (): DroneState => ({
  x: PAD.x, y: GROUND_HEIGHT, z: PAD.z, vx: 0, vy: 0, vz: 0, heading: 0,
  yawVelocity: 0, gimbal: -12, bank: 0, pitch: 0, mode: 'grounded', collision: null,
});
const approach = (value: number, target: number, amount: number) => value + Math.max(-amount, Math.min(amount, target - value));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function headingVelocity(forward: number, right: number, heading: number): [number, number] {
  // Heading 0 faces -Z. Positive yaw turns clockwise when viewed from above.
  return [Math.sin(heading) * forward + Math.cos(heading) * right, -Math.cos(heading) * forward + Math.sin(heading) * right];
}
export function takeoff(s: DroneState): boolean {
  if (s.mode !== 'grounded') return false;
  s.mode = 'taking-off'; return true;
}
export function land(s: DroneState): boolean {
  if (s.mode !== 'flying') return false;
  s.mode = 'landing'; return true;
}
export function stepFlight(s: DroneState, controls: Controls, dt: number, profile = GENERIC_PROFILE, obstacles = OBSTACLES): void {
  if (dt <= 0 || dt > 0.05 || s.mode === 'collided') return;
  s.gimbal = clamp(s.gimbal + controls.gimbal * profile.gimbalRate * dt, profile.gimbalMin, profile.gimbalMax);
  if (s.mode === 'grounded') return;
  const automatic = s.mode === 'taking-off' || s.mode === 'landing';
  const input = automatic ? neutralControls() : controls;
  s.yawVelocity = approach(s.yawVelocity, input.yaw * profile.yawRate, Math.PI * 3 * dt);
  s.heading = (s.heading + s.yawVelocity * dt + Math.PI * 2) % (Math.PI * 2);
  const length = Math.max(1, Math.hypot(input.forward, input.right));
  const [tx, tz] = headingVelocity(input.forward / length * profile.speed, input.right / length * profile.speed, s.heading);
  const dx = tx - s.vx, dz = tz - s.vz, distance = Math.hypot(dx, dz);
  const rate = Math.hypot(tx, tz) < Math.hypot(s.vx, s.vz) ? profile.braking : profile.acceleration;
  const scale = distance === 0 ? 0 : Math.min(1, rate * dt / distance);
  s.vx += dx * scale; s.vz += dz * scale;
  let targetClimb = input.climb * profile.climbRate;
  if (s.mode === 'taking-off') targetClimb = clamp((GROUND_HEIGHT + 3 - s.y) * 2, 0, 1.5);
  if (s.mode === 'landing') targetClimb = -Math.min(1, (s.y - GROUND_HEIGHT) * 2 + 0.15);
  s.vy = approach(s.vy, targetClimb, profile.acceleration * dt);
  const next = { x: s.x + s.vx * dt, y: s.y + s.vy * dt, z: s.z + s.vz * dt };
  const hit = obstacles.find((o) => next.x + 0.5 > o.min[0] && next.x - 0.5 < o.max[0] &&
    next.y + 0.25 > o.min[1] && next.y - 0.25 < o.max[1] && next.z + 0.5 > o.min[2] && next.z - 0.5 < o.max[2]);
  const boundary = Math.abs(next.x) > 40 || Math.abs(next.z) > 40 || next.y > 30;
  const groundHit = next.y < GROUND_HEIGHT && s.mode !== 'landing';
  if (hit || boundary || groundHit) {
    s.mode = 'collided'; s.collision = hit?.name ?? (groundHit ? 'ground' : 'practice boundary');
    s.vx = s.vy = s.vz = s.yawVelocity = 0; return;
  }
  s.x = next.x; s.y = Math.max(GROUND_HEIGHT, next.y); s.z = next.z;
  if (s.mode === 'taking-off' && s.y >= GROUND_HEIGHT + 2.97) { s.y = GROUND_HEIGHT + 3; s.vy = 0; s.mode = 'flying'; }
  if (s.mode === 'landing' && s.y <= GROUND_HEIGHT + 0.01) {
    s.y = GROUND_HEIGHT; s.vx = s.vy = s.vz = 0; s.mode = 'grounded';
  }
  const [bodyRightX, bodyRightZ] = headingVelocity(0, 1, s.heading);
  const [bodyForwardX, bodyForwardZ] = headingVelocity(1, 0, s.heading);
  s.bank = approach(s.bank, -(s.vx * bodyRightX + s.vz * bodyRightZ) / profile.speed * 0.22, dt * 0.9);
  s.pitch = approach(s.pitch, -(s.vx * bodyForwardX + s.vz * bodyForwardZ) / profile.speed * 0.16, dt * 0.9);
}
