import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDrone } from '../src/rendering/drone';
import {
  DRONE_DIMENSIONS,
  GROUND_HEIGHT,
  GENERIC_PROFILE,
  initialState,
  land,
  stepFlight,
  takeoff,
} from '../src/flight/simulation';
import { terrainHeight } from '../src/maps/terrain';
import { terrainGeometry, terrainSurface } from '../src/rendering/terrain';
import { PRACTICE_MAP } from '../src/maps/maps';
import { neutralControls } from '../shared/protocol';

const close = (a: number, b: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const bounds = { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000, ceiling: 80 };

test('rendered aircraft matches published unfolded dimensions in world meters', () => {
  const { body, propellers } = createDrone();
  propellers.forEach((p) => body.remove(p));
  const size = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
  close(size.x, DRONE_DIMENSIONS.width, 0.0001);
  close(size.z, DRONE_DIMENSIONS.length, 0.0001);
  close(size.y, DRONE_DIMENSIONS.height, 0.0001);
  body.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  propellers.forEach((p) => p.geometry.dispose());
});

test('20 m/s gives 20 meters of travel per second and diagonal input stays bounded', () => {
  const state = initialState();
  state.mode = 'flying';
  state.y = 20;
  state.vx = 20;
  for (let i = 0; i < 60; i++)
    stepFlight(state, { ...neutralControls(), right: 1 }, 1 / 60, GENERIC_PROFILE, [], bounds);
  close(state.x, 20);
  close(state.vx, 20);
  const diagonal = initialState();
  diagonal.mode = 'flying';
  diagonal.y = 20;
  for (let i = 0; i < 360; i++)
    stepFlight(
      diagonal,
      { ...neutralControls(), right: 1, forward: 1 },
      1 / 60,
      GENERIC_PROFILE,
      [],
      bounds,
    );
  close(Math.hypot(diagonal.vx, diagonal.vz), 20);
});

test('fast flight cannot skip a thin obstacle even at the largest accepted step', () => {
  const state = initialState({ x: -0.5, z: 0 });
  state.y = 5;
  state.mode = 'flying';
  state.vx = 20;
  stepFlight(
    state,
    { ...neutralControls(), right: 1 },
    0.05,
    GENERIC_PROFILE,
    [{ name: 'thin facade', min: [-0.01, 0, -2], max: [0.01, 10, 2] }],
    bounds,
  );
  assert.equal(state.mode, 'collided');
  assert.equal(state.collision, 'thin facade');
  assert.ok(state.x < 0);
});

test('selecting fine control during fast flight brakes smoothly without excessive banking', () => {
  const state = initialState();
  state.y = 20;
  state.mode = 'flying';
  state.vx = 20;
  state.bank = -0.42;
  for (let i = 0; i < 150; i++) {
    const speed = state.vx;
    stepFlight(
      state,
      { ...neutralControls(), right: 1 },
      1 / 60,
      { ...GENERIC_PROFILE, speed: 5 },
      [],
      bounds,
    );
    assert.ok(state.vx >= 5 && speed - state.vx <= GENERIC_PROFILE.braking / 60 + 1e-6);
    assert.ok(Math.abs(state.bank) <= 0.42);
  }
  close(state.vx, 5);
});

test('terrain sampler and rendered mesh use identical triangle surfaces', () => {
  const terrain = { minX: 0, minZ: 0, step: 30, columns: 2, rows: 2, heights: [50, 55, 60, 72] };
  const geometry = terrainGeometry({ ...PRACTICE_MAP, terrain });
  const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  object.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for (const [x, z] of [
    [4, 9],
    [23, 9],
    [15, 15],
    [29.9, 29.9],
  ]) {
    ray.set(new THREE.Vector3(x, 150, z), new THREE.Vector3(0, -1, 0));
    close(ray.intersectObject(object)[0].point.y, terrainHeight(terrain, x, z));
  }
  close(terrainHeight(terrain, 30, 30), 72);
  geometry.dispose();
  (object.material as THREE.Material).dispose();
});

test('paths and fields remain above the terrain across cell and triangle boundaries', () => {
  const terrain = {
    minX: 0,
    minZ: 0,
    step: 30,
    columns: 3,
    rows: 3,
    heights: [50, 55, 48, 60, 72, 61, 43, 50, 60],
  };
  const ground = (x: number, z: number) => terrainHeight(terrain, x, z);
  const geometry = terrainSurface(
    [
      [3, 7],
      [57, 4],
      [54, 57],
      [6, 51],
    ],
    { ...PRACTICE_MAP, terrain, ground },
    0.04,
  );
  const positions = geometry.getAttribute('position'),
    normals = geometry.getAttribute('normal');
  assert.ok(positions.count > 6);
  for (let i = 0; i < positions.count; i += 3) {
    const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
    const y = (positions.getY(i) + positions.getY(i + 1) + positions.getY(i + 2)) / 3;
    const z = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
    close(y, ground(x, z) + 0.04, 0.00001);
    assert.ok(normals.getY(i) > 0);
  }
  geometry.dispose();
});

test('takeoff, landing and ceiling use local terrain rather than sea-level coordinates', () => {
  const ground = (x: number, z: number) => 70 + x * 0.1 + z * 0.05;
  const state = initialState({ x: 2, z: 3 }, 0, ground);
  const rest = ground(2, 3) + GROUND_HEIGHT;
  close(state.y, rest);
  takeoff(state);
  for (let i = 0; i < 600; i++)
    stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, [], bounds, ground);
  assert.equal(state.mode, 'flying');
  close(state.y - rest, 3);
  land(state);
  for (let i = 0; i < 600; i++)
    stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, [], bounds, ground);
  assert.equal(state.mode, 'grounded');
  close(state.y, rest);
  state.mode = 'flying';
  state.y = rest + 79;
  stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, [], bounds, ground);
  assert.equal(state.mode, 'flying');
  state.y = rest + 81;
  stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, [], bounds, ground);
  assert.equal(state.collision, 'practice boundary');
});

test('maintaining altitude while flying into rising terrain produces ground contact', () => {
  const ground = (x: number) => x * 0.4;
  const state = initialState({ x: 0, z: 0 }, 0, ground);
  state.mode = 'flying';
  state.y += 3;
  state.vx = 20;
  for (let i = 0; i < 60; i++)
    stepFlight(
      state,
      { ...neutralControls(), right: 1 },
      1 / 60,
      GENERIC_PROFILE,
      [],
      bounds,
      ground,
    );
  assert.equal(state.collision, 'ground');
  assert.ok(state.x < 8);
});
