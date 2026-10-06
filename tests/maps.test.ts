import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { flightObstacles, loadCampus, PRACTICE_MAP } from '../src/maps';
import { initialState, takeoff, stepFlight, GENERIC_PROFILE, pointInPolygon, overlapsFootprint } from '../src/simulation';
import { neutralControls } from '../shared/protocol';

test('campus launches remain within the real boundary and clear every mapped building', async () => {
  const originalFetch = globalThis.fetch;
  const data = await readFile(new URL('../public/data/ateneo-campus.json', import.meta.url), 'utf8');
  const elevation = await readFile(new URL('../public/data/ateneo-elevation.json', import.meta.url), 'utf8');
  globalThis.fetch = async (input) => new Response(String(input).includes('elevation') ? elevation : data);
  try {
    const map = await loadCampus();
    assert.equal(map.bounds.ceiling, 300);
    assert.equal(map.spots.length, 10);
    assert.ok(map.obstacles.length > 100);
    assert.equal(flightObstacles(map,true),map.obstacles);
    const withoutTrees=flightObstacles(map,false);
    assert.equal(withoutTrees.length+map.trees!.length,map.obstacles.length);
    assert.ok(withoutTrees.every(o=>map.obstacles.includes(o) && o.name!=='acacia tree'));
    const tree=map.trees![2];
    for(const visible of [true,false]) {
      const state=initialState({x:tree.x,z:tree.z},0,map.ground);state.mode='flying';state.y=tree.base+3;
      stepFlight(state,neutralControls(),1/60,GENERIC_PROFILE,flightObstacles(map,visible),map.bounds,map.ground);
      assert.equal(state.mode,visible?'collided':'flying');
      if(visible) assert.equal(state.collision,'acacia tree');
    }
    assert.equal(flightObstacles(PRACTICE_MAP,false),PRACTICE_MAP.obstacles);
    for (const spot of map.spots) {
      assert.ok(pointInPolygon(spot.pad.x, spot.pad.z, map.bounds.footprint!), spot.name);
      const state = initialState(spot.pad, spot.heading, map.ground);
      takeoff(state);
      for (let i = 0; i < 600; i++) stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, map.obstacles, map.bounds, map.ground);
      assert.equal(state.mode, 'flying', `${spot.name}: ${state.collision}`);
    }
    const outside = initialState({ x: map.bounds.maxX - 1, z: map.bounds.maxZ - 1 }); outside.mode = 'flying'; outside.y = 10;
    assert.equal(pointInPolygon(outside.x, outside.z, map.bounds.footprint!), false);
    stepFlight(outside, neutralControls(), 1 / 60, GENERIC_PROFILE, [], map.bounds);
    assert.equal(outside.collision, 'practice boundary');
  } finally { globalThis.fetch = originalFetch; }
});

test('polygon collision preserves open courtyards and catches edges within the drone radius', () => {
  const footprint: [number, number][] = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 10], [0, 10]];
  assert.equal(overlapsFootprint(7, 7, footprint), false);
  assert.equal(overlapsFootprint(2, 7, footprint), true);
  assert.equal(overlapsFootprint(3.2, 7, footprint), true);
  const obstacle = { name: 'L-shaped hall', min: [0, 0, 0] as [number, number, number], max: [10, 12, 10] as [number, number, number], footprint };
  const state = initialState({ x: 7, z: 7 }); state.mode = 'flying'; state.y = 4;
  stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, [obstacle]); assert.equal(state.mode, 'flying');
  state.x = 2; stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, [obstacle]); assert.equal(state.collision, 'L-shaped hall');
});

test('expanded park allows flight past the previous 40 m edge and still enforces its new edge', () => {
  const state = initialState({ x: 95, z: 20 }); state.mode = 'flying'; state.y = 10;
  stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, PRACTICE_MAP.obstacles, PRACTICE_MAP.bounds);
  assert.equal(state.mode, 'flying');
  state.x = 121; stepFlight(state, neutralControls(), 1 / 60, GENERIC_PROFILE, PRACTICE_MAP.obstacles, PRACTICE_MAP.bounds);
  assert.equal(state.collision, 'practice boundary');
});
