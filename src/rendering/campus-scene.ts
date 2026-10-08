import * as THREE from 'three';
import type { TrainingEnvironment } from './training-environment';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCampusBuilding } from './campus-buildings';
import { buildCampusTrees } from './trees';
import { terrainGeometry, terrainSurface } from './terrain';
import { buildingModel } from '../maps/landmarks';
import { campusRoadWidth } from '../maps/vegetation';

export function buildCampus(environment: TrainingEnvironment): void {
  const data = environment.map.data!;
  const ground = environment.mesh(terrainGeometry(environment.map), '#ffffff', [0, 0, 0]);
  ground.castShadow = false;
  ground.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  ground.userData.ownedMaterial = ground.userData.noBatch = true;
  const roads: THREE.BufferGeometry[] = [];
  const paths: THREE.BufferGeometry[] = [];
  for (const feature of data.features) {
    if (feature.kind === 'road') {
      const footpath = ['footway', 'path', 'steps', 'pedestrian'].includes(feature.type!);
      const width = campusRoadWidth(feature.type);
      for (let i = 1; i < feature.points.length; i++) {
        const [ax, az] = feature.points[i - 1];
        const [bx, bz] = feature.points[i];
        const length = Math.hypot(bx - ax, bz - az);
        if (length < 0.1) continue;
        const nx = (((bz - az) / length) * width) / 2;
        const nz = ((-(bx - ax) / length) * width) / 2;
        const geometry = terrainSurface(
          [
            [ax + nx, az + nz],
            [bx + nx, bz + nz],
            [bx - nx, bz - nz],
            [ax - nx, az - nz],
          ],
          environment.map,
          footpath ? 0.06 : 0.04,
        );
        (footpath ? paths : roads).push(geometry);
      }
      continue;
    }
    if (feature.kind !== 'building') {
      const geometry = terrainSurface(feature.points, environment.map, 0.02);
      const mesh = environment.mesh(
        geometry,
        feature.kind === 'pitch' ? '#729f77' : '#699277',
        [0, 0.01, 0],
      );
      mesh.castShadow = false;
      continue;
    }
    const selected = feature.id === environment.spot.featureId;
    const parent = selected ? environment.subject : environment.group;
    if (selected) environment.group.add(environment.subject);
    buildCampusBuilding(feature, environment.map, parent, (geometry, color, position, group) =>
      environment.mesh(geometry, color, position, group),
    );
  }
  for (const [geometries, color] of [
    [roads, '#777c75'],
    [paths, '#c8c1ac'],
  ] as const) {
    if (geometries.length) {
      const merged = mergeGeometries(geometries);
      const mesh = environment.mesh(merged, color, [0, 0, 0]);
      mesh.castShadow = false;
    }
    geometries.forEach((geometry) => geometry.dispose());
  }
  environment.forest = buildCampusTrees(environment.map.trees!, environment.group, (color) =>
    environment.material(color),
  );
  environment.forest.visible = environment.treesVisible;
  for (const spot of environment.map.spots) {
    const feature = data.features.find((f) => f.id === spot.featureId)!;
    environment.label(
      spot.name,
      [
        spot.target[0],
        environment.map.ground(spot.target[0], spot.target[2]) +
          buildingModel(feature.id, feature.height!).height +
          6,
        spot.target[2],
      ],
      20,
    );
  }
  environment.batchStaticMeshes(environment.group);
  environment.batchStaticMeshes(environment.subject);
}
