import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutralControls } from '../shared/protocol';
import { RALLY_MAP } from '../src/maps/maps';
import {
  advanceRally,
  initialRallySession,
  rallyCarObstacle,
  rallyPose,
  recordTracking,
  RALLY_CAR,
  RALLY_LENGTH,
  RALLY_PATH,
  RALLY_ROAD_WIDTH,
} from '../src/maps/rally';
import { GENERIC_PROFILE, initialState, stepFlight, takeoff } from '../src/flight/simulation';

test('rally circuit closes smoothly and its road stays inside the flight area', () => {
  const start = rallyPose(0),
    end = rallyPose(RALLY_LENGTH);
  assert.ok(RALLY_LENGTH > 700);
  assert.ok(Math.hypot(start.x - end.x, start.z - end.z) < 0.00001);
  assert.equal(end.lap, 2);
  assert.ok(Math.abs(start.heading - end.heading) < 0.00001);
  const nearEnd = rallyPose(RALLY_LENGTH - 0.01),
    afterStart = rallyPose(0.01);
  assert.ok(Math.hypot(nearEnd.x - afterStart.x, nearEnd.z - afterStart.z) < 0.021);
  const speeds: number[] = [];
  const bounds = RALLY_MAP.bounds,
    margin = RALLY_ROAD_WIDTH / 2 + 3;
  RALLY_PATH.forEach((point) => {
    assert.ok(point.x > bounds.minX + margin && point.x < bounds.maxX - margin);
    assert.ok(point.z > bounds.minZ + margin && point.z < bounds.maxZ - margin);
  });
  for (let distance = 0; distance < RALLY_LENGTH; distance += 1)
    speeds.push(rallyPose(distance).speed);
  assert.ok(Math.min(...speeds) >= 10 && Math.min(...speeds) < 13, 'hairpins slow the car');
  assert.equal(Math.max(...speeds), 22, 'straights reach full pace');
});

test('rally progression uses elapsed simulation time and crosses laps without teleporting', () => {
  const fine = initialRallySession(),
    coarse = initialRallySession();
  for (let i = 0; i < 120 * 120; i++) advanceRally(fine, 1 / 120);
  for (let i = 0; i < 120 * 30; i++) advanceRally(coarse, 1 / 30);
  assert.ok(Math.abs(fine.distance - coarse.distance) < 0.1);
  assert.ok(rallyPose(fine.distance).lap > 1);
  const paused = { ...fine };
  advanceRally(fine, 0);
  advanceRally(fine, -1);
  advanceRally(fine, 1);
  assert.deepEqual(fine, paused);
  const crossing = initialRallySession();
  crossing.distance = RALLY_LENGTH - 0.1;
  const before = rallyPose(crossing.distance);
  advanceRally(crossing, 1 / 60);
  const after = rallyPose(crossing.distance);
  assert.equal(after.lap, 2);
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 22 / 60 + 0.01);
});

test('tracking feedback counts framed airborne time, breaks streaks, and resets cleanly', () => {
  const session = initialRallySession();
  recordTracking(session, 2, true);
  recordTracking(session, 1, true);
  assert.equal(session.streak, 3);
  assert.equal(session.bestStreak, 3);
  recordTracking(session, 2, false);
  assert.equal(session.streak, 0);
  assert.equal(session.framedTime / session.flyingTime, 0.6);
  recordTracking(session, 1, true);
  assert.equal(session.streak, 1);
  assert.equal(session.bestStreak, 3);
  const paused = { ...session };
  recordTracking(session, 0, false);
  assert.deepEqual(session, paused);
  assert.deepEqual(initialRallySession(), {
    distance: 0,
    flyingTime: 0,
    framedTime: 0,
    streak: 0,
    bestStreak: 0,
  });
});

test('rally takeoff is clear and the moving car collides only within its rotated envelope', () => {
  const spot = RALLY_MAP.spots[0],
    launch = initialState(spot.pad, spot.heading, RALLY_MAP.ground);
  takeoff(launch);
  for (let i = 0; i < 600; i++)
    stepFlight(
      launch,
      neutralControls(),
      1 / 60,
      GENERIC_PROFILE,
      [rallyCarObstacle(rallyPose(0))],
      RALLY_MAP.bounds,
      RALLY_MAP.ground,
    );
  assert.equal(launch.mode, 'flying');
  for (const distance of [0, RALLY_LENGTH * 0.25, RALLY_LENGTH * 0.5, RALLY_LENGTH * 0.75]) {
    const pose = rallyPose(distance),
      obstacle = rallyCarObstacle(pose);
    const contact = initialState({ x: pose.x, z: pose.z });
    contact.mode = 'flying';
    contact.y = 0.8;
    stepFlight(contact, neutralControls(), 1 / 60, GENERIC_PROFILE, [obstacle], RALLY_MAP.bounds);
    assert.equal(contact.collision, 'rally car');
    const above = initialState({ x: pose.x, z: pose.z });
    above.mode = 'flying';
    above.y = RALLY_CAR.height + 0.3;
    stepFlight(above, neutralControls(), 1 / 60, GENERIC_PROFILE, [obstacle], RALLY_MAP.bounds);
    assert.equal(above.mode, 'flying');
    const beside = initialState({
      x: pose.x + Math.cos(pose.heading) * 2,
      z: pose.z + Math.sin(pose.heading) * 2,
    });
    beside.mode = 'flying';
    beside.y = 0.8;
    stepFlight(beside, neutralControls(), 1 / 60, GENERIC_PROFILE, [obstacle], RALLY_MAP.bounds);
    assert.equal(beside.mode, 'flying');
  }
});
