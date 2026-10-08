import * as THREE from 'three';
import type { TrainingEnvironment } from './training-environment';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RALLY_CAR, RALLY_LENGTH, RALLY_ROAD_WIDTH, rallyPose } from '../maps/rally';
import {
  SILVERSTONE_CIRCUIT,
  SILVERSTONE_CORNERS,
  SILVERSTONE_STRUCTURES,
  silverstonePoint,
} from '../maps/silverstone';
import type { RaceCircuit } from '../maps/circuit';
import { buildFormulaCar } from './race-car';

function rallyRibbon(
  environment: TrainingEnvironment,
  width: number,
  offset = 0,
  circuit: RaceCircuit = environment.map.circuit!,
  start = 0,
  end = circuit.path.length - 1,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  circuit.path.slice(start, end + 1).forEach((point, i) => {
    const pose = circuit.pose(((start + i) / (circuit.path.length - 1)) * circuit.length);
    for (const side of [-1, 1]) {
      const right = offset + (side * width) / 2;
      positions.push(
        point.x + Math.cos(pose.heading) * right,
        0,
        point.z + Math.sin(pose.heading) * right,
      );
    }
    if (i) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function buildSilverstone(environment: TrainingEnvironment): void {
  const circuit = SILVERSTONE_CIRCUIT;
  const b = environment.map.bounds;
  const ground = environment.mesh(
    new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ),
    '#76985b',
    [(b.minX + b.maxX) / 2, -0.04, (b.minZ + b.maxZ) / 2],
  );
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  const surface = (width: number, offset: number, height: number, color: string) => {
    const road = environment.mesh(rallyRibbon(environment, width, offset), color, [0, height, 0]);
    road.castShadow = false;
  };
  surface(36, 0, 0.01, '#baa98c'); // Gravel runoff
  surface(23, 0, 0.02, '#397a68'); // Painted runoff
  surface(circuit.roadWidth, 0, 0.035, '#363c42');
  for (const side of [-1, 1]) {
    surface(0.18, side * (circuit.roadWidth / 2 - 0.18), 0.045, '#eaece1');
    surface(1.25, side * (circuit.roadWidth / 2 + 0.63), 0.05, '#edece2');
    const sections: THREE.BufferGeometry[] = [];
    const step = 4;
    for (let i = 0; i < circuit.path.length - 1; i += step * 2) {
      sections.push(
        rallyRibbon(
          environment,
          1.25,
          side * (circuit.roadWidth / 2 + 0.63),
          circuit,
          i,
          Math.min(i + step, circuit.path.length - 1),
        ),
      );
    }
    const curbs = environment.mesh(mergeGeometries(sections), '#cf3b36', [0, 0.055, 0]);
    curbs.castShadow = false;
    sections.forEach((geometry) => geometry.dispose());
  }
  const start = circuit.pose(0);
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 20; col++) {
      const right = (col - 9.5) * 0.75;
      const forward = (row - 0.5) * 0.75;
      const square = environment.box([0.75, 0.015, 0.75], (row + col) % 2 ? '#f5f4ec' : '#1b2227', [
        start.x + Math.cos(start.heading) * right + Math.sin(start.heading) * forward,
        0.065,
        start.z + Math.sin(start.heading) * right - Math.cos(start.heading) * forward,
      ]);
      square.rotation.y = -start.heading;
      square.castShadow = false;
    }
  // The pit lane runs beside Hamilton Straight, with garages on its inside.
  const [pitX, pitZ] = silverstonePoint(975, 920);
  const pitLane = environment.box([380, 0.03, 9], '#4d555a', [pitX, 0.01, pitZ]);
  pitLane.rotation.y = -0.6;
  pitLane.castShadow = false;
  for (const structure of SILVERSTONE_STRUCTURES) {
    const [x, z] = structure.point;
    const [w, h, d] = structure.size;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = -structure.heading;
    environment.group.add(group);
    environment.box([w, h, d], structure.color, [0, h / 2, 0], group);
    environment.box([w + 2, 0.4, d + 2], '#c8cdd0', [0, h + 0.2, 0], group);
    if (structure.name === 'Silverstone Wing') {
      environment.box([w - 4, 3, 0.1], '#46616c', [0, h - 3, d / 2 + 0.06], group);
      for (let door = -w / 2 + 10; door < w / 2; door += 14) {
        environment.box([10, 4, 0.1], '#353f45', [door, 2.2, d / 2 + 0.06], group);
      }
    } else {
      for (let tier = 0; tier < 7; tier++) {
        environment.box(
          [w - 4, 0.18, 0.8],
          '#b0c6d1',
          [0, h - 1 - tier * 0.9, -d / 2 - 0.12],
          group,
        );
      }
    }
    environment.label(structure.name.toUpperCase(), [x, h + 6, z], Math.min(w, 75));
  }
  for (const [name, x, z] of SILVERSTONE_CORNERS) {
    const [px, pz] = silverstonePoint(x, z);
    environment.label(name, [px, 12, pz], 70);
  }
  for (const [name, x, z] of [
    ['SILVERSTONE · GP CIRCUIT', 1070, 730],
    ['HANGAR STRAIGHT', 1180, 535],
    ['WELLINGTON STRAIGHT', 505, 550],
    ['HAMILTON STRAIGHT', 975, 1030],
  ] as const) {
    const [px, pz] = silverstonePoint(x, z);
    environment.label(name, [px, 5, pz], 130);
  }
  buildFormulaCar(environment);
  environment.batchStaticMeshes(environment.group);
  environment.updateRally(0);
}
export function buildRally(environment: TrainingEnvironment): void {
  const ground = environment.mesh(new THREE.PlaneGeometry(340, 280), '#87966d', [0, -0.04, 0]);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  for (const [width, offset, height, color] of [
    [13, 0, 0.01, '#c7b693'],
    [RALLY_ROAD_WIDTH, 0, 0.025, '#a99274'],
    [0.3, -0.9, 0.03, '#938369'],
    [0.3, 0.9, 0.03, '#938369'],
  ] as const) {
    const road = environment.mesh(rallyRibbon(environment, width, offset), color, [0, height, 0]);
    road.castShadow = false;
  }
  // Alternating start-line squares cross the home straight.
  const start = rallyPose(0);
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 12; col++) {
      const right = (col - 5.5) * 0.7;
      const forward = (row - 0.5) * 0.7;
      const square = environment.box([0.7, 0.012, 0.7], (row + col) % 2 ? '#e9e2cc' : '#37403c', [
        start.x + Math.cos(start.heading) * right + Math.sin(start.heading) * forward,
        0.042,
        start.z + Math.sin(start.heading) * right - Math.cos(start.heading) * forward,
      ]);
      square.rotation.y = -start.heading;
      square.castShadow = false;
    }
  // Low course markers leave the air above the circuit open for tracking practice.
  for (let distance = 16; distance < RALLY_LENGTH; distance += 24) {
    const pose = rallyPose(distance);
    for (const side of [-1, 1]) {
      const x = pose.x + Math.cos(pose.heading) * 6.1 * side;
      const z = pose.z + Math.sin(pose.heading) * 6.1 * side;
      environment.mesh(new THREE.ConeGeometry(0.24, 0.65, 8), '#e98f42', [x, 0.35, z]);
      environment.box([0.52, 0.06, 0.52], '#39443c', [x, 0.05, z]);
    }
  }
  environment.label('RALLY CIRCUIT', [0, 1.5, 118], 20, false);
  environment.label('HAIRPIN', [138, 1.6, 8], 8);
  environment.label('S BENDS', [-58, 1.6, -58], 8);
  environment.label('HOME STRAIGHT', [45, 1.6, 98], 12);
  // The entire car is the photographic subject, including its wheels and glass.
  environment.group.add(environment.subject);
  environment.box([1.95, 0.55, 4.3], '#e75c32', [0, 0.67, 0], environment.subject);
  environment.box([1.78, 0.13, 4.05], '#ef7744', [0, 0.98, 0], environment.subject);
  environment.box([1.63, 0.56, 1.9], '#263f48', [0, 1.22, 0.22], environment.subject);
  environment.box([1.7, 0.1, 1.8], '#f1eee1', [0, 1.52, 0.27], environment.subject);
  environment.box([0.38, 0.015, 1.18], '#f1eee1', [0, 1.06, -1.38], environment.subject);
  environment.box([1.95, 0.16, 0.2], '#28332f', [0, 0.47, -2.14], environment.subject);
  environment.box([1.95, 0.16, 0.2], '#28332f', [0, 0.47, 2.14], environment.subject);
  environment.box([1.9, 0.1, 0.4], '#26332f', [0, 1.15, 1.8], environment.subject);
  for (const side of [-1, 1]) {
    environment.box([0.45, 0.17, 0.03], '#fff0bf', [side * 0.66, 0.78, -2.17], environment.subject);
    environment.box([0.42, 0.15, 0.03], '#982e23', [side * 0.65, 0.78, 2.17], environment.subject);
    environment.box([0.02, 0.4, 0.58], '#f1eee1', [side * 0.99, 0.78, 0.1], environment.subject);
    for (const z of [-1.38, 1.38]) {
      const wheel = new THREE.Group();
      wheel.position.set(side * 1.01, RALLY_CAR.wheelRadius, z);
      environment.subject.add(wheel);
      const tyre = environment.mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16),
        '#242b29',
        [0, 0, 0],
        wheel,
      );
      tyre.rotation.z = Math.PI / 2;
      const hub = environment.mesh(
        new THREE.CylinderGeometry(0.21, 0.21, 0.29, 12),
        '#c0c6bb',
        [0, 0, 0],
        wheel,
      );
      hub.rotation.z = Math.PI / 2;
      environment.box([0.3, 0.06, 0.44], '#667169', [0, 0, 0], wheel);
      environment.rallyWheels.push(wheel);
    }
  }
  environment.rallyWheels.forEach((wheel) => environment.batchStaticMeshes(wheel));
  environment.batchStaticMeshes(environment.subject);
  const dustMaterial = new THREE.MeshStandardMaterial({
    color: '#d5c4a0',
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
    roughness: 1,
  });
  environment.rallyDust = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    dustMaterial,
    16,
  );
  environment.rallyDust.userData.ownedMaterial = true;
  environment.rallyDust.raycast = () => {};
  environment.rallyDust.frustumCulled = false;
  environment.group.add(environment.rallyDust);
  environment.batchStaticMeshes(environment.group);
  environment.updateRally(0);
}
