import type { Controls } from '../../shared/protocol';
import {
  DRONE_HALF_HEIGHT,
  DRONE_RADIUS,
  GENERIC_PROFILE,
  initialState,
  stepFlight,
  takeoff,
  type DroneState,
  type FlightProfile,
} from '../flight/simulation';

export const GAME_PROFILE: FlightProfile = {
  ...GENERIC_PROFILE,
  speed: 8,
  acceleration: 12,
  braking: 15,
};
export const GAME_BOUNDS = { minX: -14, maxX: 14, minZ: -14, maxZ: 14, ceiling: 18 };
// Fore/aft limits frame the aircraft in the moving course; only the sides and ceiling are walls.
const GAME_FLIGHT_BOUNDS = { ...GAME_BOUNDS, minZ: -Infinity, maxZ: Infinity };
export const GATE_SPACING = 52;
type InputAxis = keyof Controls;
export interface Maneuver {
  id: string;
  label: string;
  hint: string;
  key: string;
  phone: string;
  symbol: string;
  axis?: InputAxis;
  sign?: number;
  x: number;
  y: number;
  heading?: number;
  gimbal?: number;
  depth?: number;
  hover?: boolean;
  photo?: boolean;
}
const turn = (35 * Math.PI) / 180;
export const MANEUVERS: Maneuver[] = [
  {
    id: 'forward',
    label: 'Push forward',
    hint: 'Move at least 2 m ahead of center. Release to hold your position.',
    key: '↑',
    phone: 'Pitch forward',
    symbol: '↑',
    axis: 'forward',
    sign: 1,
    x: 0,
    y: 6,
    depth: -2,
  },
  {
    id: 'left',
    label: 'Strafe left',
    hint: 'Move sideways into the left opening.',
    key: '←',
    phone: 'Roll left',
    symbol: '←',
    axis: 'right',
    sign: -1,
    x: -6,
    y: 6,
  },
  {
    id: 'right',
    label: 'Strafe right',
    hint: 'Move sideways into the right opening.',
    key: '→',
    phone: 'Roll right',
    symbol: '→',
    axis: 'right',
    sign: 1,
    x: 6,
    y: 6,
  },
  {
    id: 'climb',
    label: 'Climb',
    hint: 'Rise through the high opening.',
    key: 'W',
    phone: 'Throttle up',
    symbol: '↗',
    axis: 'climb',
    sign: 1,
    x: 0,
    y: 11,
  },
  {
    id: 'descend',
    label: 'Descend',
    hint: 'Drop into the low opening. Keep clear of the ground.',
    key: 'S',
    phone: 'Throttle down',
    symbol: '↘',
    axis: 'climb',
    sign: -1,
    x: 0,
    y: 4,
  },
  {
    id: 'yaw-left',
    label: 'Turn left',
    hint: 'Center in the opening and face 35° left as you pass.',
    key: 'A',
    phone: 'Yaw left',
    symbol: '↶',
    axis: 'yaw',
    sign: -1,
    x: 0,
    y: 6,
    heading: -turn,
  },
  {
    id: 'yaw-right',
    label: 'Turn right',
    hint: 'Center in the opening and face 35° right as you pass.',
    key: 'D',
    phone: 'Yaw right',
    symbol: '↷',
    axis: 'yaw',
    sign: 1,
    x: 0,
    y: 6,
    heading: turn,
  },
  {
    id: 'backward',
    label: 'Pull backward',
    hint: 'Face forward and move at least 2 m behind center before crossing.',
    key: '↓',
    phone: 'Pitch backward',
    symbol: '↓',
    axis: 'forward',
    sign: -1,
    x: 0,
    y: 6,
    heading: 0,
    depth: 2,
  },
  {
    id: 'hover',
    label: 'Hold a hover',
    hint: 'Center in the opening and release the sticks for one second.',
    key: 'RELEASE',
    phone: 'Center both sticks',
    symbol: '◎',
    x: 0,
    y: 6,
    hover: true,
  },
  {
    id: 'tilt-up',
    label: 'Tilt camera up',
    hint: 'Keep flying through the opening. Tilt the camera to 0°.',
    key: 'R',
    phone: 'Tilt up button',
    symbol: '⌃',
    axis: 'gimbal',
    sign: 1,
    x: 0,
    y: 6,
    gimbal: 0,
  },
  {
    id: 'tilt-down',
    label: 'Tilt camera down',
    hint: 'Keep flying through the opening. Tilt the camera to −35°.',
    key: 'F',
    phone: 'Tilt down button',
    symbol: '⌄',
    axis: 'gimbal',
    sign: -1,
    x: 0,
    y: 6,
    gimbal: -35,
  },
  {
    id: 'photo',
    label: 'Capture the beacon',
    hint: 'Face forward, tilt to −12°, then capture when the camera beacon lights up.',
    key: 'C',
    phone: 'Camera button',
    symbol: '⊙',
    x: 0,
    y: 6,
    heading: 0,
    gimbal: -12,
    photo: true,
  },
];
export interface RushGate {
  id: number;
  distance: number;
  maneuver: Maneuver;
  width: number;
  height: number;
  evidence: number;
  captured: boolean;
  result?: 'clear' | 'miss';
}
export interface RushRun {
  phase: 'ready' | 'takeoff' | 'running' | 'over';
  drone: DroneState;
  distance: number;
  elapsed: number;
  score: number;
  bonus: number;
  combo: number;
  bestCombo: number;
  cleared: number;
  shields: number;
  level: number;
  gates: RushGate[];
  generated: number;
  endReason: string;
}
export interface RushEvent {
  kind: 'clear' | 'miss' | 'over';
  message: string;
  points?: number;
}
export const angleDifference = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const runSpeed = (run: RushRun) => Math.min(14, 7 + (run.level - 1) * 0.65);
export const runPace = (run: RushRun) => Math.max(0, runSpeed(run) - run.drone.vz);
export const multiplier = (run: RushRun) => Math.min(5, 1 + Math.floor(run.combo / 4));
export const nextRushGate = (run: RushRun) => run.gates.find((gate) => !gate.result);
export const gateZ = (run: RushRun, gate: RushGate) => run.distance - gate.distance;

function extendCourse(run: RushRun): void {
  while (run.generated * GATE_SPACING + 45 < run.distance + 240) {
    const id = run.generated++;
    const base = MANEUVERS[id % MANEUVERS.length];
    const level = 1 + Math.floor(id / 8);
    // Every cycle includes every command. Later cycles vary the aperture without creating unreachable jumps.
    const offset =
      id < MANEUVERS.length || base.hover || base.photo ? 0 : Math.sin(id * 2.399) * 0.65;
    run.gates.push({
      id,
      distance: 45 + id * GATE_SPACING,
      maneuver: { ...base, x: base.x + offset },
      width: Math.max(4, 7.5 - (level - 1) * 0.3),
      height: Math.max(3.4, 5 - (level - 1) * 0.12),
      evidence: 0,
      captured: false,
    });
  }
  run.gates = run.gates.filter((gate) => gateZ(run, gate) < 28);
}
export function createRushRun(): RushRun {
  const run: RushRun = {
    phase: 'ready',
    drone: initialState({ x: 0, z: 0 }),
    distance: 0,
    elapsed: 0,
    score: 0,
    bonus: 0,
    combo: 0,
    bestCombo: 0,
    cleared: 0,
    shields: 3,
    level: 1,
    gates: [],
    generated: 0,
    endReason: '',
  };
  extendCourse(run);
  return run;
}
export function launchRush(run: RushRun): void {
  if (run.phase !== 'ready') return;
  takeoff(run.drone);
  run.drone.takeoffY = 6;
  run.phase = 'takeoff';
}
export function finishRush(run: RushRun, reason: string): RushEvent {
  run.phase = 'over';
  run.endReason = reason;
  run.drone.mode = 'collided';
  run.drone.collision = reason;
  run.drone.vx = run.drone.vy = run.drone.vz = run.drone.yawVelocity = 0;
  return { kind: 'over', message: reason };
}
export function beaconInFrame(run: RushRun): boolean {
  const gate = nextRushGate(run);
  const s = run.drone;
  if (run.phase !== 'running' || !gate?.maneuver.photo || gate.captured) return false;
  const depth = s.z - gateZ(run, gate);
  const pitch = (s.gimbal * Math.PI) / 180;
  const dx = gate.maneuver.x - s.x - Math.sin(s.heading) * 0.105;
  const dy = gate.maneuver.y - s.y + 0.025;
  const dz = gateZ(run, gate) - s.z + Math.cos(s.heading) * 0.105;
  const right = dx * Math.cos(s.heading) + dz * Math.sin(s.heading);
  const forward = dx * Math.sin(s.heading) - dz * Math.cos(s.heading);
  const up = dy * Math.cos(pitch) - forward * Math.sin(pitch);
  const cameraDepth = forward * Math.cos(pitch) + dy * Math.sin(pitch);
  const tangent = Math.tan((GAME_PROFILE.fov * Math.PI) / 360);
  return (
    depth >= 2 &&
    depth <= 24 &&
    cameraDepth > 0 &&
    Math.abs(right) < ((cameraDepth * tangent * 16) / 9) * 0.85 &&
    Math.abs(up) < cameraDepth * tangent * 0.8 &&
    Math.abs(s.x - gate.maneuver.x) < 3 &&
    Math.abs(s.y - gate.maneuver.y) < 2.3 &&
    Math.abs(angleDifference(s.heading, 0)) < (12 * Math.PI) / 180 &&
    Math.abs(s.gimbal + 12) < 10
  );
}
export function captureRush(run: RushRun): boolean {
  if (!beaconInFrame(run)) return false;
  nextRushGate(run)!.captured = true;
  return true;
}
function maneuverComplete(gate: RushGate, s: DroneState): boolean {
  const move = gate.maneuver;
  if (
    (move.axis && gate.evidence < 0.25) ||
    (move.hover && gate.evidence < 1) ||
    (move.photo && !gate.captured)
  )
    return false;
  if (
    move.heading !== undefined &&
    Math.abs(angleDifference(s.heading, move.heading)) > (15 * Math.PI) / 180
  )
    return false;
  if (move.gimbal !== undefined && Math.abs(s.gimbal - move.gimbal) > 10) return false;
  if (move.depth !== undefined && (move.depth < 0 ? s.z > move.depth : s.z < move.depth))
    return false;
  return true;
}
export function stepRush(run: RushRun, input: Controls, dt: number): RushEvent[] {
  if (dt <= 0 || dt > 0.05 || run.phase === 'ready' || run.phase === 'over') return [];
  const before = { ...run.drone };
  const previousDistance = run.distance;
  stepFlight(run.drone, input, dt, GAME_PROFILE, [], GAME_FLIGHT_BOUNDS);
  if (run.drone.mode === 'collided')
    return [
      finishRush(
        run,
        run.drone.collision === 'practice boundary'
          ? 'You left the flight corridor.'
          : 'Ground contact. Keep some altitude.',
      ),
    ];
  if (run.phase === 'takeoff') {
    if (run.drone.mode === 'flying') run.phase = 'running';
    return [];
  }
  run.elapsed += dt;
  const framedZ = Math.max(GAME_BOUNDS.minZ, Math.min(GAME_BOUNDS.maxZ, run.drone.z));
  // Transfer travel beyond the view into course scrolling, preserving the gap to every gate.
  // Backward input can stop the course, but cannot reverse distance or previously scored gates.
  run.distance = Math.max(
    previousDistance,
    previousDistance + runSpeed(run) * dt - (run.drone.z - framedZ),
  );
  run.drone.z = framedZ;
  const gate = nextRushGate(run);
  const events: RushEvent[] = [];
  if (gate) {
    const gap = before.z - (previousDistance - gate.distance);
    const move = gate.maneuver;
    // Input evidence belongs to the active approach, so earlier maneuvers cannot satisfy later gates.
    if (gap > 0 && gap < GATE_SPACING + 15) {
      if (move.axis && input[move.axis] * move.sign! > 0.25) gate.evidence += dt;
      if (move.hover) {
        const stable =
          Math.hypot(run.drone.vx, run.drone.vy, run.drone.vz) < 0.8 &&
          Math.abs(run.drone.yawVelocity) < 0.1 &&
          Math.abs(run.drone.x - move.x) < 1.3 &&
          Math.abs(run.drone.y - move.y) < 1.1 &&
          ['forward', 'right', 'climb', 'yaw'].every(
            (axis) => Math.abs(input[axis as InputAxis]) < 0.1,
          );
        gate.evidence = stable ? gate.evidence + dt : 0;
      }
    }
    const remaining = run.drone.z - gateZ(run, gate);
    if (gap > 0 && remaining <= 0) {
      // Interpolate the crossing instead of judging only the end of a fast simulation step.
      const t = gap / (gap - remaining);
      const s = {
        ...run.drone,
        x: before.x + (run.drone.x - before.x) * t,
        y: before.y + (run.drone.y - before.y) * t,
        z: before.z + (run.drone.z - before.z) * t,
        heading: before.heading + angleDifference(run.drone.heading, before.heading) * t,
        gimbal: before.gimbal + (run.drone.gimbal - before.gimbal) * t,
      };
      const opening =
        Math.abs(s.x - move.x) + DRONE_RADIUS <= gate.width / 2 &&
        Math.abs(s.y - move.y) + DRONE_HALF_HEIGHT <= gate.height / 2;
      if (opening && maneuverComplete(gate, s)) {
        gate.result = 'clear';
        run.combo++;
        run.cleared++;
        run.bestCombo = Math.max(run.bestCombo, run.combo);
        const perfect = Math.hypot(s.x - move.x, s.y - move.y) < 0.85;
        const points = (100 + (perfect ? 50 : 0)) * multiplier(run);
        run.bonus += points;
        events.push({
          kind: 'clear',
          points,
          message: `${perfect ? 'Perfect gate' : 'Gate cleared'} +${points}`,
        });
      } else {
        gate.result = 'miss';
        run.shields--;
        run.combo = 0;
        events.push({
          kind: 'miss',
          message: opening
            ? `${move.label} incomplete · Shield lost`
            : 'Missed the opening · Shield lost',
        });
        if (!run.shields) events.push(finishRush(run, 'All three shields used.'));
      }
      run.level = 1 + Math.floor((gate.id + 1) / 8);
    }
  }
  run.score = Math.floor(run.distance * 2) + run.bonus;
  extendCourse(run);
  return events;
}
