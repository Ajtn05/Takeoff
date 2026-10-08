import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRONE_PRESETS,
  defaultDroneSettings,
  parseDroneSettings,
  presetForProfile,
} from '../src/flight/profiles';
import { GENERIC_PROFILE, initialState, stepFlight } from '../src/flight/simulation';
import { neutralControls } from '../shared/protocol';

test('commercial profiles drive distinct speed limits and asymmetric climb and descent', () => {
  const bounds = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000, ceiling: 1000 };
  for (const preset of DRONE_PRESETS) {
    const horizontal = initialState();
    horizontal.mode = 'flying';
    horizontal.y = 200;
    const climb = { ...horizontal },
      descend = { ...horizontal },
      turn = { ...horizontal };
    for (let frame = 0; frame < 360; frame++) {
      stepFlight(
        horizontal,
        { ...neutralControls(), forward: 1 },
        1 / 60,
        preset.profile,
        [],
        bounds,
      );
      stepFlight(climb, { ...neutralControls(), climb: 1 }, 1 / 60, preset.profile, [], bounds);
      stepFlight(descend, { ...neutralControls(), climb: -1 }, 1 / 60, preset.profile, [], bounds);
      stepFlight(turn, { ...neutralControls(), yaw: 1 }, 1 / 60, preset.profile, [], bounds);
    }
    assert.ok(Math.abs(Math.hypot(horizontal.vx, horizontal.vz) - preset.profile.speed) < 1e-6);
    assert.equal(climb.vy, preset.profile.climbRate);
    assert.equal(descend.vy, -preset.profile.descentRate);
    assert.equal(turn.yawVelocity, preset.profile.yawRate);
  }
});

test('custom acceleration and braking change stopping distance without changing the speed cap', () => {
  const slow = initialState();
  slow.mode = 'flying';
  slow.y = 20;
  const fast = { ...slow };
  for (let i = 0; i < 60; i++) {
    stepFlight(
      slow,
      { ...neutralControls(), right: 1 },
      1 / 60,
      { ...GENERIC_PROFILE, acceleration: 1 },
      [],
    );
    stepFlight(
      fast,
      { ...neutralControls(), right: 1 },
      1 / 60,
      { ...GENERIC_PROFILE, acceleration: 10 },
      [],
    );
  }
  assert.ok(fast.vx > slow.vx * 5);
  slow.vx = fast.vx = 10;
  slow.x = fast.x = 0;
  for (let i = 0; i < 600; i++) {
    stepFlight(slow, neutralControls(), 1 / 60, { ...GENERIC_PROFILE, braking: 1 }, []);
    stepFlight(fast, neutralControls(), 1 / 60, { ...GENERIC_PROFILE, braking: 10 }, []);
  }
  assert.ok(Math.abs(slow.vx) < 1e-6);
  assert.ok(Math.abs(fast.vx) < 1e-6);
  assert.ok(slow.x > fast.x * 5);
});

test('saved presets and custom profiles round trip; corrupt or unsafe numeric settings fall back', () => {
  for (const preset of DRONE_PRESETS) {
    const expected = {
      presetId: preset.id,
      aircraftType: preset.aircraftType,
      profile: preset.profile,
    };
    assert.deepEqual(parseDroneSettings(JSON.stringify(expected)), expected);
    assert.deepEqual(
      parseDroneSettings(JSON.stringify({ presetId: preset.id, profile: preset.profile })),
      expected,
    );
  }
  const custom = { ...GENERIC_PROFILE, speed: 7.5, descentRate: 2, yawRate: Math.PI / 4 };
  assert.equal(presetForProfile(custom), 'custom');
  assert.deepEqual(parseDroneSettings(JSON.stringify({ presetId: 'air-3', profile: custom })), {
    presetId: 'custom',
    aircraftType: 'quadcopter',
    profile: custom,
  });
  for (const raw of [
    null,
    '',
    '{',
    'null',
    '{}',
    JSON.stringify({ profile: { ...GENERIC_PROFILE, speed: 0 } }),
    JSON.stringify({ profile: { ...GENERIC_PROFILE, braking: '8' } }),
    JSON.stringify({ profile: { ...GENERIC_PROFILE, yawRate: 999 } }),
    JSON.stringify({ profile: { ...GENERIC_PROFILE, acceleration: null } }),
    JSON.stringify({ profile: GENERIC_PROFILE, aircraftType: 'jet' }),
  ]) {
    assert.deepEqual(parseDroneSettings(raw), defaultDroneSettings());
  }
});

test('custom helicopter tuning keeps its aircraft type when saved and restored', () => {
  const helicopter = DRONE_PRESETS.find((preset) => preset.id === 'tracking-helicopter')!;
  for (const profile of [{ ...helicopter.profile, speed: 85 }, { ...GENERIC_PROFILE }]) {
    const settings = { presetId: 'custom', aircraftType: 'helicopter', profile };
    assert.equal(presetForProfile(profile, 'helicopter'), 'custom');
    assert.deepEqual(parseDroneSettings(JSON.stringify(settings)), settings);
  }
});
