import {
  FLIGHT_CEILING,
  OBSTACLES,
  PAD,
  PRACTICE_BOUNDS,
  overlapsFootprint,
  pointInPolygon,
  type FlightBounds,
  type MapPoint,
  type Obstacle,
} from '../flight/simulation';
import { FLAT_GROUND, terrainHeight, type GroundSampler, type TerrainGrid } from './terrain';
import { barrelHeight, buildingModel, footprintCenter, pyramidHeight } from './landmarks';
import { acaciaObstacle, campusTrees, type AcaciaTree } from './vegetation';
import { PRACTICE_COURSES, PRACTICE_OBSTACLES } from './practice';
import { RALLY_BOUNDS, RALLY_PAD, RALLY_CIRCUIT, rallyPose } from './rally';
import type { RaceCircuit } from './circuit';
import {
  SILVERSTONE_BOUNDS,
  SILVERSTONE_CIRCUIT,
  SILVERSTONE_PAD,
  SILVERSTONE_STRUCTURES,
} from './silverstone';

export interface CampusFeature {
  id: number;
  kind: 'building' | 'road' | 'pitch' | 'green';
  name: string;
  points: MapPoint[];
  height?: number;
  heightEstimated?: boolean;
  type?: string;
}
export interface CampusData {
  boundary: MapPoint[];
  features: CampusFeature[];
  trees: MapPoint[];
}
export interface PhotoSpot {
  id: string;
  name: string;
  pad: { x: number; z: number };
  heading: number;
  target: [number, number, number];
  featureId?: number;
  courseId?: string;
  tip: string;
}
export interface TrainingMap {
  id: 'park' | 'ateneo' | 'rally' | 'silverstone';
  name: string;
  bounds: FlightBounds;
  obstacles: Obstacle[];
  spots: PhotoSpot[];
  data?: CampusData;
  terrain?: TerrainGrid;
  trees?: AcaciaTree[];
  ground: GroundSampler;
  obstaclesWithoutTrees?: Obstacle[];
  circuit?: RaceCircuit;
}
export const PRACTICE_MAP: TrainingMap = {
  id: 'park',
  name: 'Practice park',
  bounds: PRACTICE_BOUNDS,
  obstacles: [...OBSTACLES, ...PRACTICE_OBSTACLES],
  ground: FLAT_GROUND,
  spots: [
    {
      id: 'sculpture',
      name: 'Sculpture plaza',
      pad: PAD,
      heading: 0,
      target: [0, 3.5, -13],
      tip: 'Practice hovering and framing the sculpture, or choose Hoop slalom, Window gaps, or Tight corridor from the route menu.',
    },
    ...PRACTICE_COURSES.map((course) => ({
      id: course.id,
      courseId: course.id,
      name: course.name,
      pad: course.pad,
      heading: course.heading,
      target: course.gates[0].center,
      tip: course.tip,
    })),
  ],
};
const rallyStart = rallyPose(0);
export const RALLY_MAP: TrainingMap = {
  id: 'rally',
  name: 'Rally circuit',
  bounds: RALLY_BOUNDS,
  obstacles: [],
  ground: FLAT_GROUND,
  circuit: RALLY_CIRCUIT,
  spots: [
    {
      id: 'rally-tracking',
      name: 'Rally tracking',
      pad: RALLY_PAD,
      heading: Math.atan2(rallyStart.x - RALLY_PAD.x, RALLY_PAD.z - rallyStart.z),
      target: [rallyStart.x, 0.95, rallyStart.z],
      tip: 'Take off to start the car. Track it around a gravel circuit at 10–22 m/s (36–79 km/h), slowing for hairpins. Climb to 10–20 m for a wider view; use yaw and camera tilt to keep it framed. The panel measures airborne time in frame and your tracking streak. Pause freezes the car; Reset restarts the lap.',
    },
  ],
};
const silverstoneStart = SILVERSTONE_CIRCUIT.pose(0);
export const SILVERSTONE_MAP: TrainingMap = {
  id: 'silverstone',
  name: 'Silverstone · Formula One',
  bounds: SILVERSTONE_BOUNDS,
  obstacles: SILVERSTONE_STRUCTURES.map(({ name, point: [x, z], size: [w, h, d], heading }) => {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const footprint: MapPoint[] = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ].map(([right, depth]) => [x + right * c - depth * s, z + right * s + depth * c]);
    return {
      name,
      footprint,
      min: [Math.min(...footprint.map((p) => p[0])), 0, Math.min(...footprint.map((p) => p[1]))],
      max: [Math.max(...footprint.map((p) => p[0])), h, Math.max(...footprint.map((p) => p[1]))],
    };
  }),
  ground: FLAT_GROUND,
  circuit: SILVERSTONE_CIRCUIT,
  spots: [
    {
      id: 'silverstone-tracking',
      name: 'Hamilton Straight · F1 tracking',
      pad: SILVERSTONE_PAD,
      heading: Math.atan2(
        silverstoneStart.x - SILVERSTONE_PAD.x,
        SILVERSTONE_PAD.z - silverstoneStart.z,
      ),
      target: [silverstoneStart.x, 0.6, silverstoneStart.z],
      tip: 'Track a Formula One car on an approximate full-size 5.891 km Silverstone GP circuit, with 1 km of open approach space on every side. The car runs at 30–85 m/s (108–306 km/h). Select Tracking helicopter in Drone parameters to keep pace at up to 90 m/s; choose 85 m/s in the speed menu to match the car’s maximum. Use Map overview to learn the circuit, then yaw and camera tilt to frame the car. Pause freezes the car; Reset restarts the lap.',
    },
  ],
};
let campus: TrainingMap | undefined;
export async function loadCampus(): Promise<TrainingMap> {
  if (campus) return campus;
  const [response, elevation] = await Promise.all([
    fetch('/data/ateneo-campus.json'),
    fetch('/data/ateneo-elevation.json'),
  ]);
  if (!response.ok || !elevation.ok) throw new Error('Campus map could not be loaded. Try again.');
  const data = (await response.json()) as CampusData;
  const terrain = (await elevation.json()) as TerrainGrid;
  const ground: GroundSampler = (x, z) => terrainHeight(terrain, x, z);
  const xs = data.boundary.map(([x]) => x);
  const zs = data.boundary.map(([, z]) => z);
  const bounds: FlightBounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    ceiling: FLIGHT_CEILING,
    footprint: data.boundary,
  };
  const obstacles: Obstacle[] = data.features
    .filter((f) => f.kind === 'building')
    .map((f) => {
      const center = footprintCenter(f.points);
      const base = ground(...center);
      const model = buildingModel(f.id, f.height!);
      return {
        name: f.name || 'campus building',
        footprint: f.points,
        min: [
          Math.min(...f.points.map(([x]) => x)),
          Math.min(...f.points.map(([x, z]) => ground(x, z))) - 0.5,
          Math.min(...f.points.map(([, z]) => z)),
        ],
        max: [
          Math.max(...f.points.map(([x]) => x)),
          base + model.height,
          Math.max(...f.points.map(([, z]) => z)),
        ],
        topAt:
          model.kind === 'gesu'
            ? (x, z) =>
                base + pyramidHeight(f.points, center, model.wallHeight, model.height - 7, x, z)
            : model.kind === 'gym'
              ? (x, z) => base + barrelHeight(f.points, model.wallHeight, model.height, x, z)
              : undefined,
      };
    });
  const church = data.features.find((f) => f.id === 25766778)!;
  const [cx, cz] = footprintCenter(church.points);
  const cb = ground(cx, cz);
  obstacles.push({
    name: 'Gesù cupola and cross',
    min: [cx - 2.5, cb + 20, cz - 2.5],
    max: [cx + 2.5, cb + 27.2, cz + 2.5],
  });
  const trees = campusTrees(data, ground);
  const obstaclesWithoutTrees = obstacles.slice();
  obstacles.push(...trees.map(acaciaObstacle));
  const sites = [
    {
      featureId: 25766778,
      name: 'Church of the Gesù',
      tip: 'Climb for a view of the church footprint, then lower the camera for an architectural composition.',
    },
    {
      featureId: 568930822,
      name: 'Areté',
      tip: 'Try a slow sideways reveal of the arts building, keeping its facade on a thirds line.',
    },
    {
      featureId: 160456354,
      name: 'Rizal Library',
      tip: 'Frame the library and surrounding paths. Compare a low facade shot with a higher establishing view.',
    },
    {
      featureId: 24911828,
      name: 'Blue Eagle Gym',
      tip: 'Use the gym and nearby open spaces to practice wide campus establishing shots.',
    },
    {
      featureId: 25850724,
      name: 'Manila Observatory',
      tip: 'Explore the observatory footprint and frame it against the surrounding campus.',
    },
    {
      featureId: 25766486,
      name: 'Science Education Complex',
      tip: 'Fly beneath the raised acacia branches and frame the brick science halls across the field.',
    },
    {
      featureId: 25766701,
      name: 'Horacio de la Costa Hall',
      tip: 'Use the cream balcony bands and brick entrance tower to compose a low architectural view.',
    },
    {
      featureId: 25766779,
      name: 'Ricardo & Rosita Leong Hall',
      tip: 'Frame the tall glass bay, brick piers, and cream facade bands through the surrounding acacias.',
    },
    {
      featureId: 25766555,
      name: 'JG School of Management',
      tip: 'Try a slow reveal of the brick piers and blue glass bays from the shaded campus road.',
    },
    {
      featureId: 1363092068,
      name: 'International Residence Halls',
      tip: 'Compare the residence height with the acacia canopy, then descend for a view beneath the branches.',
    },
  ];
  const spots: PhotoSpot[] = sites.map((site) => {
    const feature = data.features.find((f) => f.id === site.featureId);
    if (!feature) throw new Error(`Campus landmark missing: ${site.name}`);
    const x = feature.points.reduce((sum, p) => sum + p[0], 0) / feature.points.length;
    const z = feature.points.reduce((sum, p) => sum + p[1], 0) / feature.points.length;
    const target: [number, number, number] = [
      x,
      ground(x, z) + buildingModel(feature.id, feature.height!).height / 2,
      z,
    ];
    const radius = Math.max(...feature.points.map((p) => Math.hypot(p[0] - x, p[1] - z))) + 24;
    // Find an open launch area outside all mapped footprints, within the campus.
    for (let ring = 0; ring < 8; ring++)
      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI) / 12;
        const distance = radius + ring * 12;
        const pad = { x: x + Math.sin(angle) * distance, z: z + Math.cos(angle) * distance };
        if (
          !pointInPolygon(pad.x, pad.z, data.boundary) ||
          obstacles.some((o) =>
            o.intersects
              ? o.intersects(pad.x, ground(pad.x, pad.z) + 1.5, pad.z, 3, 1.6)
              : o.footprint
                ? overlapsFootprint(pad.x, pad.z, o.footprint, 12)
                : pad.x > o.min[0] - 12 &&
                  pad.x < o.max[0] + 12 &&
                  pad.z > o.min[2] - 12 &&
                  pad.z < o.max[2] + 12,
          )
        )
          continue;
        // Keep another hall or nearby tree from hiding the selected facade at the 3 m hover.
        const cameraY = ground(pad.x, pad.z) + 3.065;
        const occluders = obstacles.filter(
          (o) =>
            o.footprint !== feature.points &&
            o.max[0] >= Math.min(pad.x, x) &&
            o.min[0] <= Math.max(pad.x, x) &&
            o.max[2] >= Math.min(pad.z, z) &&
            o.min[2] <= Math.max(pad.z, z),
        );
        let blocked = false;
        for (let t = 0.05; t < 1; t += 0.05) {
          const px = pad.x + (x - pad.x) * t;
          const pz = pad.z + (z - pad.z) * t;
          const py = cameraY + (target[1] - cameraY) * t;
          if (
            occluders.some(
              (o) =>
                px > o.min[0] &&
                px < o.max[0] &&
                pz > o.min[2] &&
                pz < o.max[2] &&
                py > o.min[1] &&
                py < (o.topAt?.(px, pz) ?? o.max[1]) &&
                (!o.footprint || pointInPolygon(px, pz, o.footprint)) &&
                (!o.intersects || o.intersects(px, py, pz, 0, 0)),
            )
          ) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        return {
          ...site,
          id: String(site.featureId),
          pad,
          heading: (Math.atan2(x - pad.x, pad.z - z) + Math.PI * 2) % (Math.PI * 2),
          target,
        };
      }
    throw new Error(`No open practice pad found near ${site.name}`);
  });
  campus = {
    id: 'ateneo',
    name: 'Ateneo de Manila · Loyola Heights',
    bounds,
    obstacles,
    obstaclesWithoutTrees,
    spots,
    data,
    terrain,
    trees,
    ground,
  };
  return campus;
}

export function flightObstacles(map: TrainingMap, treesVisible: boolean): Obstacle[] {
  return treesVisible ? map.obstacles : (map.obstaclesWithoutTrees ?? map.obstacles);
}

export function translationMarker(
  spot: PhotoSpot,
  ground: GroundSampler = FLAT_GROUND,
): [number, number, number] {
  const x = spot.pad.x + Math.cos(spot.heading) * 8 + Math.sin(spot.heading) * 6;
  const z = spot.pad.z + Math.sin(spot.heading) * 8 - Math.cos(spot.heading) * 6;
  return [x, ground(x, z) + 4, z];
}
