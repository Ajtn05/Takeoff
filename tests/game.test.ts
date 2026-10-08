import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutralControls, type Controls } from '../shared/protocol';
import {
  angleDifference,
  beaconInFrame,
  captureRush,
  createRushRun,
  GAME_BOUNDS,
  GAME_PROFILE,
  gateZ,
  launchRush,
  MANEUVERS,
  multiplier,
  nextRushGate,
  runPace,
  runSpeed,
  stepRush,
  type RushRun,
} from '../src/game/engine';
import { DRONE_RADIUS } from '../src/flight/simulation';

const dt = 1 / 60;
function airborne(): RushRun {
  const run = createRushRun();
  run.phase = 'running';
  run.drone.mode = 'flying';
  run.drone.y = 6;
  return run;
}
function crossFirst(x = 0, evidence = 0.5): RushRun {
  const run = airborne(),
    gate = nextRushGate(run)!;
  run.drone.x = x;
  run.drone.z = -3;
  gate.evidence = evidence;
  run.distance = gate.distance + run.drone.z - 0.06;
  stepRush(run, neutralControls(), dt);
  return run;
}

test('launch takes off automatically and the course waits for the aircraft to reach hover', () => {
  const run = createRushRun();
  stepRush(run, neutralControls(), dt);
  assert.equal(run.distance, 0);
  assert.equal(run.drone.mode, 'grounded');
  launchRush(run);
  for (let i = 0; i < 1000 && run.phase === 'takeoff'; i++) {
    stepRush(run, neutralControls(), dt);
    assert.equal(run.distance, 0);
    assert.equal(run.score, 0);
  }
  assert.equal(run.phase, 'running');
  assert.equal(run.drone.mode, 'flying');
  assert.equal(run.drone.y, 6);
});

test('holding forward advances the course beyond the front of the view without leaving the corridor', () => {
  const run = airborne(),
    idle = airborne(),
    firstGate = nextRushGate(run)!;
  for (let i = 0; i < 360; i++) {
    stepRush(run, { ...neutralControls(), forward: 1 }, dt);
    stepRush(idle, neutralControls(), dt);
    assert.equal(run.phase, 'running', run.endReason);
    assert.ok(run.drone.z >= GAME_BOUNDS.minZ);
  }
  assert.equal(run.drone.z, GAME_BOUNDS.minZ);
  assert.equal(run.drone.vz, -GAME_PROFILE.speed);
  assert.equal(runPace(run), runSpeed(run) + GAME_PROFILE.speed);
  assert.ok(run.distance > idle.distance + 20);
  assert.equal(firstGate.result, 'clear', 'the forward gate still checks the maneuver');
  assert.equal(run.cleared, 1);
  assert.equal(run.shields, 3);
  for (let i = 0; i < 60; i++) stepRush(run, neutralControls(), dt);
  assert.equal(run.phase, 'running');
  assert.equal(run.drone.vz, 0);
  assert.equal(runPace(run), runSpeed(run), 'release brakes back to the automatic pace');
});

test('backward travel stays in view, cannot reverse progress, and resumes scrolling on release', () => {
  for (const heading of [0, Math.PI]) {
    const run = airborne();
    run.drone.heading = heading;
    for (let i = 0; i < 360; i++) {
      const distance = run.distance;
      stepRush(run, { ...neutralControls(), forward: heading === 0 ? -1 : 1 }, dt);
      assert.equal(run.phase, 'running', run.endReason);
      assert.ok(run.drone.z <= GAME_BOUNDS.maxZ);
      assert.ok(run.distance >= distance, 'course distance never goes backward');
    }
    assert.equal(run.drone.z, GAME_BOUNDS.maxZ);
    assert.equal(runPace(run), 0);
    const stoppedDistance = run.distance,
      stoppedScore = run.score;
    stepRush(run, { ...neutralControls(), forward: heading === 0 ? -1 : 1 }, dt);
    assert.equal(run.distance, stoppedDistance);
    assert.equal(run.score, stoppedScore);
    for (let i = 0; i < 60; i++) stepRush(run, neutralControls(), dt);
    assert.ok(run.distance > stoppedDistance);
    assert.equal(run.drone.vz, 0);
    assert.equal(runPace(run), runSpeed(run));
  }
});

test('a fast gate crossing at the front of the view is scored once with its original approach gap', () => {
  const run = airborne(),
    gate = nextRushGate(run)!;
  run.drone.z = GAME_BOUNDS.minZ;
  run.drone.vz = -GAME_PROFILE.speed;
  run.distance = gate.distance + run.drone.z - 0.1;
  gate.evidence = 1;
  const distance = run.distance;
  const events = stepRush(run, { ...neutralControls(), forward: 1 }, 0.05);
  assert.equal(run.phase, 'running');
  assert.equal(run.drone.z, GAME_BOUNDS.minZ);
  assert.ok(Math.abs(run.distance - distance - (runSpeed(run) + GAME_PROFILE.speed) * 0.05) < 1e-9);
  assert.equal(events.filter((event) => event.kind === 'clear').length, 1);
  assert.equal(run.cleared, 1);
  assert.equal(run.shields, 3);
  assert.equal(run.bonus, 150);
  assert.deepEqual(stepRush(run, { ...neutralControls(), forward: 1 }, 0.05), []);
  assert.equal(run.cleared, 1);
});

test('clearing a gate requires its maneuver, position, and full aircraft clearance', () => {
  const centered = crossFirst();
  assert.equal(centered.cleared, 1);
  assert.equal(centered.bonus, 150);
  assert.equal(centered.shields, 3);
  assert.equal(crossFirst(0, 0).cleared, 0);
  const width = nextRushGate(airborne())!.width;
  assert.equal(crossFirst(width / 2 - DRONE_RADIUS - 0.01).cleared, 1);
  assert.equal(crossFirst(width / 2 - DRONE_RADIUS + 0.01).shields, 2);
  const run = airborne();
  run.distance = 44.95;
  run.gates[0].evidence = 1;
  stepRush(run, neutralControls(), dt);
  assert.equal(run.cleared, 0, 'a forward input without moving ahead is insufficient');
});

test('idle input cannot farm gates, and using three shields ends and freezes the run', () => {
  const run = airborne();
  for (let i = 0; i < 5000 && run.phase !== 'over'; i++) stepRush(run, neutralControls(), dt);
  assert.equal(run.phase, 'over');
  assert.equal(run.cleared, 0);
  assert.equal(run.shields, 0);
  assert.equal(run.drone.mode, 'collided');
  const before = { distance: run.distance, score: run.score };
  for (let i = 0; i < 120; i++) stepRush(run, { ...neutralControls(), forward: 1 }, dt);
  assert.deepEqual({ distance: run.distance, score: run.score }, before);
});

test('yaw gates check wrapped heading, hover requires stability, and capture requires the beacon window', () => {
  const run = airborne();
  const gate = run.gates[0];
  gate.maneuver = { ...MANEUVERS.find((m) => m.id === 'yaw-left')! };
  gate.evidence = 1;
  run.distance = 44.95;
  run.drone.heading = Math.PI * 2 + gate.maneuver.heading!;
  stepRush(run, neutralControls(), dt);
  assert.equal(run.cleared, 1);
  const wrong = airborne();
  wrong.gates[0].maneuver = gate.maneuver;
  wrong.gates[0].evidence = 1;
  wrong.distance = 44.95;
  stepRush(wrong, neutralControls(), dt);
  assert.equal(wrong.shields, 2);
  const hover = airborne();
  hover.gates[0].maneuver = MANEUVERS.find((m) => m.hover)!;
  for (let i = 0; i < 80; i++) stepRush(hover, neutralControls(), dt);
  assert.ok(hover.gates[0].evidence >= 1);
  stepRush(hover, { ...neutralControls(), right: 1 }, dt);
  assert.equal(hover.gates[0].evidence, 0);
  const photo = airborne();
  photo.gates[0].maneuver = MANEUVERS.find((m) => m.photo)!;
  assert.equal(captureRush(photo), false, 'beacon is too far away');
  photo.distance = 30;
  assert.equal(beaconInFrame(photo), true);
  photo.drone.heading = Math.PI;
  assert.equal(captureRush(photo), false);
  photo.drone.heading = 0;
  photo.drone.gimbal = -35;
  assert.equal(captureRush(photo), false);
  photo.drone.gimbal = -12;
  photo.drone.x = 2.9;
  photo.distance = 43;
  assert.equal(
    beaconInFrame(photo),
    false,
    'a close beacon outside the camera frustum cannot be captured',
  );
  photo.drone.x = 0;
  photo.distance = 30;
  photo.drone.gimbal = -12;
  assert.equal(captureRush(photo), true);
  assert.equal(captureRush(photo), false, 'capture cannot be repeated');
  photo.distance = 44.95;
  stepRush(photo, neutralControls(), dt);
  assert.equal(photo.cleared, 1);
});

test('the complete course remains flyable with real controls through every maneuver and maximum difficulty', () => {
  const run = airborne(),
    completed = new Set<string>();
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  for (let i = 0; i < 70_000 && run.cleared < 120; i++) {
    const gate = nextRushGate(run)!,
      move = gate.maneuver,
      s = run.drone;
    const heading = move.heading ?? 0,
      depth = move.depth ? Math.sign(move.depth) * 4 : 0;
    const tx = clamp((move.x - s.x) * 0.5) * GAME_PROFILE.speed;
    const tz = clamp((depth - s.z) * 0.5) * GAME_PROFILE.speed;
    const input: Controls = {
      ...neutralControls(),
      right: clamp((tx * Math.cos(s.heading) + tz * Math.sin(s.heading)) / GAME_PROFILE.speed),
      forward: clamp((tx * Math.sin(s.heading) - tz * Math.cos(s.heading)) / GAME_PROFILE.speed),
      climb: clamp((move.y - s.y) * 0.7),
      yaw: clamp(angleDifference(heading, s.heading) * 2),
      gimbal: clamp(((move.gimbal ?? -12) - s.gimbal) * 0.2),
    };
    if (move.photo) captureRush(run);
    const events = stepRush(run, input, dt);
    assert.equal(run.phase, 'running', `${move.id}: ${run.endReason}`);
    assert.equal(
      run.shields,
      3,
      `${move.id} at gate ${gate.id}: ${events.map((event) => event.message)}`,
    );
    if (events.some((event) => event.kind === 'clear')) completed.add(move.id);
    assert.ok(run.gates.length <= 7, 'generated course stays bounded');
    assert.ok(Math.abs(s.z) < 14 && Math.abs(s.x) < 14 && s.y > 0);
  }
  assert.equal(run.cleared, 120);
  assert.deepEqual(completed, new Set(MANEUVERS.map((move) => move.id)));
  assert.equal(runSpeed(run), 14);
  assert.equal(multiplier(run), 5);
  assert.equal(run.bestCombo, 120);
  assert.ok(run.score > run.distance * 2 + 120 * 100);
  assert.ok(run.generated > 120);
  assert.ok(gateZ(run, nextRushGate(run)!) < 0);
});

test('ground and corridor contact end the run, and invalid time steps have no effect', () => {
  const run = airborne();
  const distance = run.distance;
  stepRush(run, neutralControls(), 0.5);
  assert.equal(run.distance, distance);
  run.drone.x = 13.99;
  run.drone.vx = 8;
  assert.equal(stepRush(run, { ...neutralControls(), right: 1 }, dt).at(-1)?.kind, 'over');
  assert.match(run.endReason, /flight corridor/);
  const ceiling = airborne();
  ceiling.drone.y = GAME_BOUNDS.ceiling;
  ceiling.drone.vy = GAME_PROFILE.climbRate;
  stepRush(ceiling, { ...neutralControls(), climb: 1 }, dt);
  assert.equal(ceiling.phase, 'over');
  assert.match(ceiling.endReason, /flight corridor/);
  const ground = airborne();
  ground.drone.y = 0.07;
  ground.drone.vy = -5;
  stepRush(ground, { ...neutralControls(), climb: -1 }, dt);
  assert.equal(ground.phase, 'over');
  assert.match(ground.endReason, /Ground/);
});
