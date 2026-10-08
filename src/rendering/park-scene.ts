import * as THREE from 'three';
import type { TrainingEnvironment } from './training-environment';
import { buildCourses } from './practice-scene';

export function buildPark(environment: TrainingEnvironment): void {
  const ground = environment.mesh(new THREE.PlaneGeometry(240, 240), '#a6b795', [0, -0.04, 0]);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  environment.box([13, 0.06, 47], '#d9d0b9', [0, 0, -7]);
  environment.box([51, 0.05, 6], '#d9d0b9', [0, 0, 3]);
  environment.box([10, 7, 12], '#e9dfcb', [-14, 3.5, -13]);
  environment.box([10.4, 0.3, 12.4], '#777d72', [-14, 7.15, -13]);
  for (let i = 0; i < 5; i++) {
    environment.box([0.04, 3.7, 1.6], '#477980', [-8.97, 3.7, -17.7 + i * 2.3]);
    environment.box([0.15, 0.15, 1.8], '#a5997d', [-8.85, 1.8, -17.7 + i * 2.3]);
  }
  environment.box([4, 0.4, 2], '#bca887', [-6.5, 0.2, -13]);
  for (const [x, z] of [
    [12, -15],
    [17, -5],
    [-16, 8],
    [11, 16],
    [-5, -25],
  ]) {
    environment.mesh(new THREE.CylinderGeometry(0.25, 0.4, 4, 7), '#84735b', [x, 2, z]);
    environment.mesh(new THREE.IcosahedronGeometry(2.1, 1), '#54846b', [x, 5, z]);
    environment.mesh(new THREE.IcosahedronGeometry(1.65, 1), '#72987a', [x + 0.15, 6.6, z]);
  }
  environment.subject.position.set(0, 0, -13);
  environment.group.add(environment.subject);
  environment.mesh(
    new THREE.CylinderGeometry(1.25, 1.4, 0.35, 24),
    '#d8d3bd',
    [0, 0.23, 0],
    environment.subject,
  );
  environment.mesh(
    new THREE.CylinderGeometry(0.7, 0.95, 2.3, 12),
    '#efd5a8',
    [0, 1.5, 0],
    environment.subject,
  );
  const sculpture = environment.mesh(
    new THREE.TorusKnotGeometry(0.78, 0.22, 64, 8),
    '#d86c3b',
    [0, 3.65, 0],
    environment.subject,
  );
  sculpture.rotation.x = 0.3;
  environment.box([7, 0.05, 195], '#d9d0b9', [35, 0, 0]);
  environment.box([210, 0.05, 6], '#d9d0b9', [0, 0, -35]);
  for (const [x, z, w, h, d] of [
    [-70, -53, 26, 12, 18],
    [64, -65, 24, 9, 20],
    [58, 62, 20, 8, 16],
  ]) {
    environment.box([w, h, d], '#e9dfcb', [x, h / 2, z]);
    environment.box([w + 0.4, 0.2, d + 0.4], '#777d72', [x, h + 0.1, z]);
  }
  const grid = new THREE.GridHelper(240, 60, '#829790', '#94a99b');
  grid.position.y = 0.075;
  grid.layers.set(2);
  environment.group.add(grid);
  for (const [x, z] of [
    [-4, -5],
    [5, -22],
    [20, 5],
  ]) {
    environment.box([2.3, 0.15, 0.65], '#ad8660', [x, 0.8, z]);
    environment.box([0.15, 0.8, 0.5], '#626b61', [x - 0.8, 0.4, z]);
    environment.box([0.15, 0.8, 0.5], '#626b61', [x + 0.8, 0.4, z]);
  }
  buildCourses(environment);
  environment.batchStaticMeshes(environment.group);
  environment.batchStaticMeshes(environment.subject);
}
