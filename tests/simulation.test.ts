import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  headingVelocity,
  initialState,
  stepFlight,
  takeoff,
  land,
  GENERIC_PROFILE,
  GROUND_HEIGHT,
} from '../src/flight/simulation';
import { neutralControls, parseClientMessage } from '../shared/protocol';
import { RemoteInput } from '../src/flight/input';

const close = (a: number, b: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} is not close to ${b}`);
test('movement follows drone heading, including facing the learner', () => {
  const cases = [
    [0, 1, 0, 1, 0],
    [1, 0, 0, 0, -1],
    [1, 0, Math.PI / 2, 1, 0],
    [0, 1, Math.PI, -1, 0],
    [1, 0, Math.PI, 0, 1],
  ];
  for (const [forward, right, heading, x, z] of cases) {
    const v = headingVelocity(forward, right, heading);
    close(v[0], x);
    close(v[1], z);
  }
});
test('takeoff reaches a stable 3 m hover without teleporting', () => {
  const s = initialState();
  assert.ok(takeoff(s));
  assert.equal(takeoff(s), false);
  stepFlight(s, neutralControls(), 1 / 60);
  assert.ok(s.y - GROUND_HEIGHT < 0.01);
  for (let i = 0; i < 600; i++) stepFlight(s, neutralControls(), 1 / 60);
  assert.equal(s.mode, 'flying');
  close(s.y - GROUND_HEIGHT, 3);
  close(s.vy, 0);
});
test('acceleration is bounded, diagonal speed is bounded, centered sticks brake into hover', () => {
  const s = initialState();
  s.mode = 'flying';
  s.y = 10;
  const controls = { ...neutralControls(), forward: 1, right: 1 };
  stepFlight(s, controls, 1 / 60, GENERIC_PROFILE, []);
  close(Math.hypot(s.vx, s.vz), GENERIC_PROFILE.acceleration / 60);
  for (let i = 0; i < 300; i++) stepFlight(s, controls, 1 / 60, GENERIC_PROFILE, []);
  close(Math.hypot(s.vx, s.vz), GENERIC_PROFILE.speed);
  const before = { x: s.x, z: s.z };
  for (let i = 0; i < 180; i++) stepFlight(s, neutralControls(), 1 / 60, GENERIC_PROFILE, []);
  close(s.vx, 0);
  close(s.vz, 0);
  assert.ok(
    Math.hypot(s.x - before.x, s.z - before.z) <=
      GENERIC_PROFILE.speed ** 2 / (2 * GENERIC_PROFILE.braking),
  );
});
test('gimbal limits are independent of heading and visible banking', () => {
  const s = initialState();
  s.mode = 'flying';
  s.y = 10;
  for (let i = 0; i < 300; i++)
    stepFlight(
      s,
      { ...neutralControls(), gimbal: -1, right: 0.3, yaw: 0.2 },
      1 / 60,
      GENERIC_PROFILE,
      [],
    );
  assert.equal(s.gimbal, -90);
  assert.notEqual(s.heading, 0);
  assert.notEqual(s.bank, 0);
  for (let i = 0; i < 300; i++)
    stepFlight(s, { ...neutralControls(), gimbal: 1 }, 1 / 60, GENERIC_PROFILE, []);
  assert.equal(s.gimbal, 20);
});
test('landing stops exactly on the ground, and reset is repeatable', () => {
  const s = initialState();
  s.mode = 'flying';
  s.y = 4;
  assert.ok(land(s));
  for (let i = 0; i < 600; i++) stepFlight(s, neutralControls(), 1 / 60);
  assert.equal(s.mode, 'grounded');
  close(s.y, GROUND_HEIGHT);
  close(s.vy, 0);
  assert.deepEqual(initialState(), initialState());
});
test('obstacle collision freezes flight and ground contact requires a landing command', () => {
  const s = initialState();
  s.mode = 'flying';
  s.x = -14;
  s.y = 8;
  s.z = -13;
  for (let i = 0; i < 180; i++) stepFlight(s, { ...neutralControls(), climb: -1 }, 1 / 60);
  assert.equal(s.mode, 'collided');
  assert.equal(s.collision, 'studio building');
  const x = s.x;
  stepFlight(s, { ...neutralControls(), right: 1 }, 1 / 60);
  close(s.x, x);
  const ground = initialState();
  ground.mode = 'flying';
  stepFlight(ground, { ...neutralControls(), climb: -1 }, 1 / 60);
  assert.equal(ground.mode, 'collided');
  assert.equal(ground.collision, 'ground');
});
test('large accumulated time steps do not move the drone', () => {
  const s = initialState();
  takeoff(s);
  const before = { ...s };
  stepFlight(s, { ...neutralControls(), forward: 1 }, 1);
  assert.deepEqual(s, before);
});
test('local input guard rejects old generations, replays, and expired input', () => {
  const input = new RemoteInput();
  input.reset(2, true);
  assert.equal(input.accept(1, 9, neutralControls(), 100), false);
  assert.equal(input.accept(2, 1, { ...neutralControls(), right: 1 }, 100), true);
  assert.equal(input.accept(2, 1, neutralControls(), 120), false);
  assert.ok(input.fresh(350));
  assert.equal(input.fresh(351), false);
  input.reset(3);
  assert.deepEqual(input.controls, neutralControls());
  assert.equal(input.fresh(150), false);
});
test('protocol rejects malformed, non-finite, out-of-range and non-neutral resume controls', () => {
  assert.equal(parseClientMessage('not JSON'), null);
  for (const value of [2, null, '1'])
    assert.equal(
      parseClientMessage(
        JSON.stringify({
          type: 'input',
          generation: 1,
          seq: 1,
          controls: { ...neutralControls(), right: value },
        }),
      ),
      null,
    );
  assert.equal(
    parseClientMessage(
      JSON.stringify({
        type: 'resume',
        generation: 1,
        controls: { ...neutralControls(), climb: 1 },
      }),
    ),
    null,
  );
  assert.equal(
    parseClientMessage(
      JSON.stringify({ type: 'input', generation: 1, seq: -1, controls: neutralControls() }),
    ),
    null,
  );
});
