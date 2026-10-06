import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutralControls } from '../shared/protocol';
import { PRACTICE_MAP, RALLY_MAP, SILVERSTONE_MAP } from '../src/maps';
import { SILVERSTONE_APPROACH_MARGIN, SILVERSTONE_CIRCUIT, SILVERSTONE_CORNERS } from '../src/silverstone';
import { advanceRally, initialRallySession, rallyCarObstacle } from '../src/rally';
import { GENERIC_PROFILE, GROUND_HEIGHT, initialState, stepFlight, takeoff } from '../src/simulation';

test('Silverstone preserves a full-size closed GP lap and keeps the road inside its boundary', () => {
  const circuit = SILVERSTONE_CIRCUIT, b = SILVERSTONE_MAP.bounds;
  assert.ok(Math.abs(circuit.length - 5891) < 0.001);
  const start = circuit.pose(0), end = circuit.pose(circuit.length);
  assert.equal(end.lap, 2);
  assert.ok(Math.hypot(start.x - end.x, start.z - end.z) < 0.0001);
  assert.ok(Math.hypot(circuit.pose(circuit.length - 0.1).x - start.x, circuit.pose(circuit.length - 0.1).z - start.z) < 0.101);
  for (const point of circuit.path) {
    assert.ok(point.x > b.minX + 20 && point.x < b.maxX - 20);
    assert.ok(point.z > b.minZ + 20 && point.z < b.maxZ - 20);
  }
  assert.equal(SILVERSTONE_CORNERS.length, 15); // Paired labels cover all 18 corners.
  const speeds = circuit.path.map((_, i) => circuit.pose(i / (circuit.path.length - 1) * circuit.length).speed);
  assert.equal(Math.max(...speeds), 85);
  assert.ok(Math.min(...speeds) >= 30 && Math.min(...speeds) < 40);
});

test('Silverstone approach space extends at least 1 km beyond every side of the circuit', () => {
  const b = SILVERSTONE_MAP.bounds, path = SILVERSTONE_CIRCUIT.path;
  const minX = Math.min(...path.map(p => p.x)), maxX = Math.max(...path.map(p => p.x));
  const minZ = Math.min(...path.map(p => p.z)), maxZ = Math.max(...path.map(p => p.z));
  assert.equal(SILVERSTONE_APPROACH_MARGIN, 1000);
  assert.ok(minX - b.minX >= 1000 && b.maxX - maxX >= 1000);
  assert.ok(minZ - b.minZ >= 1000 && b.maxZ - maxZ >= 1000);
  for (const pad of [{ x: minX - 700, z: 0 }, { x: maxX + 700, z: 0 }, { x: 0, z: minZ - 700 }, { x: 0, z: maxZ + 700 }]) {
    const state = initialState(pad); state.mode = 'flying'; state.y = 30;
    stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, SILVERSTONE_MAP.obstacles, b);
    assert.equal(state.mode, 'flying');
  }
  const outside = initialState({ x: b.maxX + 1, z: 0 }); outside.mode = 'flying'; outside.y = 30;
  stepFlight(outside, neutralControls(), 1 / 60, GENERIC_PROFILE, [], b);
  assert.equal(outside.collision, 'practice boundary');
});

test('F1 progression is stable across frame rates and wraps laps without teleporting', () => {
  const fine = initialRallySession(), coarse = initialRallySession(), circuit = SILVERSTONE_CIRCUIT;
  for (let i = 0; i < 180 * 120; i++) advanceRally(fine, 1 / 120, circuit.pose);
  for (let i = 0; i < 180 * 30; i++) advanceRally(coarse, 1 / 30, circuit.pose);
  assert.ok(Math.abs(fine.distance - coarse.distance) < 0.5);
  assert.ok(circuit.pose(fine.distance).lap > 1);
  const crossing = initialRallySession(); crossing.distance = circuit.length - 0.1;
  const before = circuit.pose(crossing.distance); advanceRally(crossing, 1 / 60, circuit.pose);
  const after = circuit.pose(crossing.distance);
  assert.equal(after.lap, 2);
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) <= 85 / 60 + 0.01);
});

test('Silverstone launch clears scenery and F1 collision uses its own rotated car envelope', () => {
  const map = SILVERSTONE_MAP, circuit = SILVERSTONE_CIRCUIT, spot = map.spots[0];
  const obstacles = [...map.obstacles, rallyCarObstacle(circuit.pose(0), circuit.car, circuit.carName)];
  const launch = initialState(spot.pad, spot.heading); takeoff(launch);
  for (let i = 0; i < 600; i++) stepFlight(launch, neutralControls(), 1 / 60, GENERIC_PROFILE, obstacles, map.bounds);
  assert.equal(launch.mode, 'flying', launch.collision ?? 'Launch must be clear');
  for (const distance of [0, circuit.length * 0.25, circuit.length * 0.5, circuit.length * 0.75]) {
    const pose = circuit.pose(distance), obstacle = rallyCarObstacle(pose, circuit.car, circuit.carName);
    const contact = initialState({ x: pose.x, z: pose.z }); contact.mode = 'flying'; contact.y = 0.8;
    stepFlight(contact, neutralControls(), 1 / 60, GENERIC_PROFILE, [obstacle], map.bounds);
    assert.equal(contact.collision, 'Formula One car');
    contact.mode = 'flying'; contact.collision = null; contact.y = circuit.car.height + 0.3;
    stepFlight(contact, neutralControls(), 1 / 60, GENERIC_PROFILE, [obstacle], map.bounds);
    assert.equal(contact.mode, 'flying');
  }
});

test('all flat maps allow flight above the previous ceilings and enforce the raised ceiling', () => {
  for (const map of [PRACTICE_MAP, RALLY_MAP, SILVERSTONE_MAP]) {
    assert.equal(map.bounds.ceiling, 300);
    const state = initialState(map.spots[0].pad); state.mode = 'flying'; state.y = 150 + GROUND_HEIGHT;
    stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, map.obstacles, map.bounds);
    assert.equal(state.mode, 'flying', map.name);
    state.y = 301 + GROUND_HEIGHT;
    stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, map.obstacles, map.bounds);
    assert.equal(state.collision, 'practice boundary', map.name);
  }
});
