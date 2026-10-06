import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHelicopter } from '../src/helicopter';
import { DRONE_PRESETS } from '../src/profiles';
import { HELICOPTER_ENVELOPE, initialState, land, stepFlight, takeoff } from '../src/simulation';
import { SILVERSTONE_MAP } from '../src/maps';
import { SILVERSTONE_CIRCUIT } from '../src/silverstone';
import { neutralControls } from '../shared/protocol';

const profile = DRONE_PRESETS.find(preset => preset.id === 'tracking-helicopter')!.profile;
const map = SILVERSTONE_MAP, envelope = HELICOPTER_ENVELOPE;

test('helicopter model has main and tail rotors, clears the ground and fits its collision envelope', () => {
  const { body, propellers } = createHelicopter();
  assert.deepEqual(propellers.map(rotor => rotor.name), ['main-rotor', 'tail-rotor']);
  for (const angle of [0, Math.PI / 4, Math.PI / 2]) {
    propellers[0].rotation.y = angle; propellers[1].rotation.x = angle;
    const box = new THREE.Box3().setFromObject(body);
    assert.ok(box.min.y + envelope.restHeight > 0);
    assert.ok(box.min.y >= -envelope.halfHeight && box.max.y <= envelope.halfHeight);
    assert.ok(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) <= envelope.radius);
  }
  const materials = new Set<THREE.Material>();
  body.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose(); materials.add(object.material as THREE.Material);
  });
  materials.forEach(material => material.dispose());
});

test('tracking helicopter can exceed the F1 maximum and honor the 85 m/s matching cap', () => {
  const state = initialState(map.spots[0].pad, 0, map.ground, envelope); state.mode = 'flying'; state.y += 50;
  for (let i = 0; i < 360; i++) stepFlight(state, { ...neutralControls(), forward: 1, right: 1 }, 1 / 60,
    profile, map.obstacles, map.bounds, map.ground, envelope);
  assert.equal(state.mode, 'flying');
  assert.ok(Math.abs(Math.hypot(state.vx, state.vz) - 90) < 1e-6);
  const carMaximum = Math.max(...SILVERSTONE_CIRCUIT.path.map((_, i) => SILVERSTONE_CIRCUIT.pose(i / 4096 * SILVERSTONE_CIRCUIT.length).speed));
  assert.ok(Math.hypot(state.vx, state.vz) > carMaximum);
  for (let i = 0; i < 120; i++) stepFlight(state, { ...neutralControls(), forward: 1, right: 1 }, 1 / 60,
    { ...profile, speed: 85 }, map.obstacles, map.bounds, map.ground, envelope);
  assert.ok(Math.abs(Math.hypot(state.vx, state.vz) - 85) < 1e-6);
});

test('helicopter takeoff and landing preserve local ground clearance and rotor-sized collisions', () => {
  const spot = map.spots[0], state = initialState(spot.pad, spot.heading, map.ground, envelope);
  assert.equal(state.y, envelope.restHeight); takeoff(state);
  for (let i = 0; i < 600; i++) stepFlight(state, neutralControls(), 1 / 60, profile, map.obstacles, map.bounds, map.ground, envelope);
  assert.equal(state.mode, 'flying'); assert.equal(state.y, envelope.restHeight + 3);
  land(state);
  for (let i = 0; i < 600; i++) stepFlight(state, neutralControls(), 1 / 60, profile, map.obstacles, map.bounds, map.ground, envelope);
  assert.equal(state.mode, 'grounded'); assert.equal(state.y, envelope.restHeight);
  const contact = initialState({ x: -6, z: 0 }, 0, map.ground, envelope); contact.y = 10; contact.mode = 'flying'; contact.vx = 90;
  stepFlight(contact, { ...neutralControls(), right: 1 }, 0.05, profile,
    [{ name: 'thin wall', min: [-0.01, 0, -10], max: [0.01, 20, 10] }], map.bounds, map.ground, envelope);
  assert.equal(contact.collision, 'thin wall'); assert.ok(contact.x < -4);
});
