import { DRONE_HALF_HEIGHT, DRONE_RADIUS, type Obstacle } from './simulation';

type Position = [number, number, number];
export interface CourseGate {
  kind: 'hoop' | 'gap' | 'passage'; center: Position; heading: number;
  width: number; height: number; radius?: number; tube?: number;
  wallWidth?: number; wallHeight?: number;
}
export interface CourseBox {
  name: string; center: Position; size: Position; heading: number; gate?: number; accent?: boolean;
}
export interface PracticeCourse {
  id: string; name: string; color: string; tip: string;
  pad: { x: number; z: number }; heading: number; gates: CourseGate[]; boxes: CourseBox[]; path?: Position[];
}

const east = Math.PI / 2;
const hoopPoints: Position[] = [[48, 3.5, 15], [60, 5, 1], [77, 7, -11], [92, 9, -26], [94, 7, -43], [89, 5.3, -59], [91, 3.5, -81]];
export const PRACTICE_COURSES: PracticeCourse[] = [
  {
    id: 'hoop-slalom', name: 'Hoop slalom', color: '#46aaa7', pad: { x: 48, z: 29 }, heading: 0,
    tip: 'Follow seven numbered hoops as they rise, turn, and descend. Openings shrink from 4.7 m to 2.3 m. Try 5 m/s first.',
    gates: hoopPoints.map((center, i) => {
      const before: Position = i ? hoopPoints[i - 1] : [48, 3, 29];
      const after = hoopPoints[i + 1] ?? [91, 3.5, -96];
      const heading = Math.atan2(after[0] - before[0], before[2] - after[2]);
      const radius = [2.5, 2.3, 2, 1.8, 1.65, 1.45, 1.3][i], tube = 0.14;
      return { kind: 'hoop', center, heading, radius, tube, width: (radius - tube) * 2, height: (radius - tube) * 2 };
    }), boxes: [],
  },
  {
    id: 'window-gaps', name: 'Window gaps', color: '#dda45d', pad: { x: -88, z: 34 }, heading: 0,
    tip: 'Fly through five wall openings in order. Shift sideways and change altitude between walls; the last gap is only 1.6 × 1.6 m. Use 5 m/s.',
    gates: [
      { center: [-88, 3.3, 20], width: 3.5, height: 2.8 },
      { center: [-83, 4.4, 9], width: 2.8, height: 2.4 },
      { center: [-90, 3.2, -3], width: 2.4, height: 2.2 },
      { center: [-80, 5.2, -15], width: 2, height: 1.8 },
      { center: [-84, 3.6, -28], width: 1.6, height: 1.6 },
    ].map(gate => ({ ...gate, center: gate.center as Position, kind: 'gap', heading: 0, wallWidth: 16, wallHeight: 8 })), boxes: [],
  },
  {
    id: 'tight-corridor', name: 'Tight corridor', color: '#cf8874', pad: { x: -65, z: 89 }, heading: east,
    tip: 'Enter the covered passage, make two right-angle turns, descend under the low beam, then clear the small exit window. Use 5 m/s and brake before each turn.',
    gates: [
      { kind: 'passage', center: [-52, 1.9, 89], heading: east, width: 3.65, height: 3.7 },
      { kind: 'passage', center: [-40, 1.9, 89], heading: east, width: 3.65, height: 3.7 },
      { kind: 'passage', center: [-32, 1.9, 79], heading: 0, width: 3.65, height: 3.7 },
      { kind: 'passage', center: [-32, 1.9, 70], heading: 0, width: 3.65, height: 3.7 },
      { kind: 'passage', center: [-22, 1, 67], heading: east, width: 3.65, height: 1.7 },
      { kind: 'gap', center: [-9, 1.1, 67], heading: east, width: 1.6, height: 1.6, wallWidth: 4, wallHeight: 3.8 },
    ], boxes: [],
  },
];

function box(course: PracticeCourse, name: string, center: Position, size: Position, heading = 0, gate?: number, accent = false): void {
  course.boxes.push({ name: `${course.name} · ${name}`, center, size, heading, gate, accent });
}
function gateBox(course: PracticeCourse, gate: CourseGate, index: number, x: number, y: number, size: Position, accent = false): void {
  const [cx, cy, cz] = gate.center, c = Math.cos(gate.heading), s = Math.sin(gate.heading);
  box(course, `gate ${index + 1}`, [cx + x * c, cy + y, cz + x * s], size, gate.heading, index, accent);
}
for (const course of PRACTICE_COURSES) course.gates.forEach((gate, i) => {
  if (gate.kind === 'hoop') {
    const bottom = gate.center[1] - gate.radius! - gate.tube!;
    box(course, `hoop ${i + 1} support`, [gate.center[0], bottom / 2, gate.center[2]], [0.18, bottom, 0.18]);
    box(course, `hoop ${i + 1} base`, [gate.center[0], 0.08, gate.center[2]], [1.3, 0.16, 1.3]);
  }
  if (gate.kind !== 'gap') return;
  const w = gate.wallWidth!, h = gate.wallHeight!, side = (w - gate.width) / 2;
  const bottom = gate.center[1] - gate.height / 2, top = gate.center[1] + gate.height / 2;
  for (const sign of [-1, 1]) gateBox(course, gate, i, sign * (gate.width / 2 + side / 2), h / 2 - gate.center[1], [side, h, 0.65]);
  gateBox(course, gate, i, 0, bottom / 2 - gate.center[1], [gate.width, bottom, 0.65]);
  gateBox(course, gate, i, 0, (h + top) / 2 - gate.center[1], [gate.width, h - top, 0.65]);
  // Painted frame bars occupy the wall edges and share the same collision dimensions.
  for (const sign of [-1, 1]) {
    gateBox(course, gate, i, sign * (gate.width / 2 + 0.09), 0, [0.18, gate.height + 0.36, 0.73], true);
    gateBox(course, gate, i, 0, sign * (gate.height / 2 + 0.09), [gate.width, 0.18, 0.73], true);
  }
});
const corridor = PRACTICE_COURSES[2];
// Follow the corridor center around both corners instead of cutting through its walls.
corridor.path = [[-65, 3.065, 89], ...corridor.gates.slice(0, 2).map(gate => gate.center), [-32, 1.9, 89],
  ...corridor.gates.slice(2, 4).map(gate => gate.center), [-32, 1.5, 67],
  ...corridor.gates.slice(4).map(gate => gate.center), [-4, 1.1, 67]];
const outline: [number, number][] = [[-54, 87], [-34, 87], [-34, 65], [-8, 65], [-8, 69], [-30, 69], [-30, 91], [-54, 91]];
outline.forEach(([x, z], i) => {
  if (i === 3 || i === 7) return; // Keep the entrance and exit open.
  const [nx, nz] = outline[(i + 1) % outline.length];
  box(corridor, 'corridor wall', [(x + nx) / 2, 1.9, (z + nz) / 2], [Math.abs(nx - x) || 0.35, 3.8, Math.abs(nz - z) || 0.35]);
});
for (const [x, z, w, d] of [[-42, 89, 24, 4.35], [-32, 78, 4.35, 26], [-21, 67, 26, 4.35]]) {
  box(corridor, 'corridor roof', [x, 3.95, z], [w, 0.3, d]);
}
box(corridor, 'low beam', [-22, 2.85, 67], [0.5, 1.9, 4], 0, 4, true);

export function gateCoordinates(gate: CourseGate, point: { x: number; y: number; z: number }): Position {
  const x = point.x - gate.center[0], z = point.z - gate.center[2], c = Math.cos(gate.heading), s = Math.sin(gate.heading);
  return [x * c + z * s, point.y - gate.center[1], x * s - z * c];
}

function boxObstacle(part: CourseBox): Obstacle {
  const c = Math.abs(Math.cos(part.heading)), s = Math.abs(Math.sin(part.heading));
  const hx = (part.size[0] * c + part.size[2] * s) / 2, hz = (part.size[0] * s + part.size[2] * c) / 2;
  return {
    name: part.name,
    min: [part.center[0] - hx, part.center[1] - part.size[1] / 2, part.center[2] - hz],
    max: [part.center[0] + hx, part.center[1] + part.size[1] / 2, part.center[2] + hz],
    intersects: (x, y, z, radius, halfHeight) => {
      const dx = x - part.center[0], dz = z - part.center[2], cos = Math.cos(part.heading), sin = Math.sin(part.heading);
      const right = Math.max(0, Math.abs(dx * cos + dz * sin) - part.size[0] / 2);
      const depth = Math.max(0, Math.abs(-dx * sin + dz * cos) - part.size[2] / 2);
      return Math.hypot(right, depth) < radius && Math.abs(y - part.center[1]) < part.size[1] / 2 + halfHeight;
    },
  };
}
function hoopObstacle(course: PracticeCourse, gate: CourseGate, i: number): Obstacle {
  const r = gate.radius!, tube = gate.tube!, extent = r + tube, [x, y, z] = gate.center;
  const c = Math.abs(Math.cos(gate.heading)), s = Math.abs(Math.sin(gate.heading));
  return {
    name: `${course.name} · hoop ${i + 1}`,
    min: [x - extent * c - tube * s, y - extent, z - extent * s - tube * c],
    max: [x + extent * c + tube * s, y + extent, z + extent * s + tube * c],
    intersects: (px, py, pz, radius, halfHeight) => {
      const [right, up, depth] = gateCoordinates(gate, { x: px, y: py, z: pz });
      // Minimum distance from the circular hoop centerline to the aircraft's cylinder.
      // Refining the closest arc preserves the open center and the small vertical envelope.
      const distance = (angle: number) => {
        const horizontal = Math.max(0, Math.hypot(right - r * Math.cos(angle), depth) - radius);
        const vertical = Math.max(0, Math.abs(up - r * Math.sin(angle)) - halfHeight);
        return horizontal * horizontal + vertical * vertical;
      };
      const step = Math.PI / 24;
      let best = 0, minimum = Infinity;
      for (let a = 0; a < Math.PI * 2; a += step) {
        const value = distance(a); if (value < minimum) { minimum = value; best = a; }
      }
      let lo = best - step, hi = best + step;
      for (let n = 0; n < 16; n++) {
        const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
        if (distance(a) < distance(b)) hi = b; else lo = a;
      }
      return Math.min(minimum, distance((lo + hi) / 2)) <= (tube + 0.003) ** 2;
    },
  };
}
export const PRACTICE_OBSTACLES: Obstacle[] = PRACTICE_COURSES.flatMap(course => [
  ...course.boxes.map(boxObstacle),
  ...course.gates.flatMap((gate, i) => gate.kind === 'hoop' ? [hoopObstacle(course, gate, i)] : []),
]);

export function advanceCourse(course: PracticeCourse, next: number, before: { x: number; y: number; z: number }, after: { x: number; y: number; z: number }): number {
  const gate = course.gates[next]; if (!gate) return next;
  const a = gateCoordinates(gate, before), b = gateCoordinates(gate, after);
  if (a[2] > 0 || b[2] <= 0 || b[2] <= a[2]) return next;
  const t = -a[2] / (b[2] - a[2]);
  const x = Math.abs(a[0] + (b[0] - a[0]) * t) + DRONE_RADIUS;
  const y = Math.abs(a[1] + (b[1] - a[1]) * t) + DRONE_HALF_HEIGHT;
  const clear = gate.kind === 'hoop' ? Math.hypot(x, y) < gate.width / 2 : x < gate.width / 2 && y < gate.height / 2;
  return clear ? next + 1 : next;
}
