import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutralControls } from '../shared/protocol';
import { PRACTICE_MAP } from '../src/maps/maps';
import {
  advanceCourse,
  PRACTICE_COURSES,
  PRACTICE_OBSTACLES,
  type CourseGate,
} from '../src/maps/practice';
import {
  DRONE_HALF_HEIGHT,
  DRONE_RADIUS,
  GENERIC_PROFILE,
  initialState,
  stepFlight,
  takeoff,
} from '../src/flight/simulation';

function at(gate: CourseGate, right = 0, up = 0, forward = 0) {
  const c = Math.cos(gate.heading),
    s = Math.sin(gate.heading);
  return {
    x: gate.center[0] + right * c + forward * s,
    y: gate.center[1] + up,
    z: gate.center[2] + right * s - forward * c,
  };
}
function hover(point: { x: number; y: number; z: number }) {
  const state = initialState({ x: point.x, z: point.z });
  state.y = point.y;
  state.mode = 'flying';
  stepFlight(
    state,
    neutralControls(),
    1 / 60,
    GENERIC_PROFILE,
    PRACTICE_MAP.obstacles,
    PRACTICE_MAP.bounds,
  );
  return state;
}

test('every park launch has a clear automatic takeoff, including the original plaza', () => {
  assert.equal(PRACTICE_MAP.spots.length, 4);
  for (const spot of PRACTICE_MAP.spots) {
    const state = initialState(spot.pad, spot.heading);
    takeoff(state);
    for (let i = 0; i < 600; i++)
      stepFlight(
        state,
        neutralControls(),
        1 / 60,
        GENERIC_PROFILE,
        PRACTICE_MAP.obstacles,
        PRACTICE_MAP.bounds,
      );
    assert.equal(state.mode, 'flying', `${spot.name}: ${state.collision}`);
  }
});

test('each course has a continuous clear route through all its ordered gates', () => {
  for (const course of PRACTICE_COURSES) {
    const last = course.gates.at(-1)!;
    const exit = at(last, 0, 0, 5);
    const path = course.path ?? [
      [course.pad.x, 3.065, course.pad.z],
      ...course.gates.map((gate) => gate.center),
      [exit.x, exit.y, exit.z],
    ];
    let before = { x: path[0][0], y: path[0][1], z: path[0][2] },
      next = 0;
    for (let segment = 1; segment < path.length; segment++) {
      const a = path[segment - 1],
        b = path[segment];
      const samples = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.1);
      for (let i = 1; i <= samples; i++) {
        const t = i / samples,
          point = {
            x: a[0] + (b[0] - a[0]) * t,
            y: a[1] + (b[1] - a[1]) * t,
            z: a[2] + (b[2] - a[2]) * t,
          };
        assert.equal(hover(point).mode, 'flying', `${course.name} at ${JSON.stringify(point)}`);
        next = advanceCourse(course, next, before, point);
        before = point;
      }
    }
    assert.equal(next, course.gates.length, course.name);
  }
});

test('hoops preserve their open center and catch contact with the rim in every orientation', () => {
  const course = PRACTICE_COURSES[0];
  for (const gate of course.gates) {
    assert.equal(hover(at(gate)).mode, 'flying');
    const inner = gate.width / 2;
    assert.equal(hover(at(gate, 0, inner - DRONE_HALF_HEIGHT - 0.06)).mode, 'flying');
    assert.match(hover(at(gate, 0, inner - DRONE_HALF_HEIGHT + 0.04)).collision!, /hoop/);
    assert.match(hover(at(gate, inner - DRONE_RADIUS + 0.04)).collision!, /hoop/);
    assert.match(hover(at(gate, gate.radius!)).collision!, /hoop/);
  }
});

test('windows allow the full aircraft envelope through and collide at each edge', () => {
  for (const course of PRACTICE_COURSES)
    for (const gate of course.gates.filter((gate) => gate.kind === 'gap')) {
      assert.equal(hover(at(gate)).mode, 'flying');
      for (const sign of [-1, 1]) {
        assert.equal(hover(at(gate, sign * (gate.width / 2 - DRONE_RADIUS - 0.03))).mode, 'flying');
        assert.match(
          hover(at(gate, sign * (gate.width / 2 - DRONE_RADIUS + 0.03))).collision!,
          /gate/,
        );
        assert.match(
          hover(at(gate, 0, sign * (gate.height / 2 - DRONE_HALF_HEIGHT + 0.03))).collision!,
          /gate/,
        );
      }
    }
});

test('the covered corridor enforces walls, ceiling, and the low beam', () => {
  assert.match(hover({ x: -42, y: 2, z: 87 }).collision!, /corridor wall/);
  assert.match(hover({ x: -42, y: 3.85, z: 89 }).collision!, /corridor roof/);
  assert.match(hover({ x: -22, y: 2.2, z: 67 }).collision!, /low beam/);
  assert.equal(hover({ x: -22, y: 1, z: 67 }).mode, 'flying');
});

test('gate progress requires a forward crossing, correct order, and full opening clearance', () => {
  for (const course of PRACTICE_COURSES)
    course.gates.forEach((gate, i) => {
      const before = at(gate, 0, 0, -1),
        after = at(gate, 0, 0, 1);
      assert.equal(advanceCourse(course, i, before, after), i + 1);
      assert.equal(advanceCourse(course, i, after, before), i);
      assert.equal(advanceCourse(course, i, at(gate, 0, 0, -0.8), before), i);
      assert.equal(
        advanceCourse(course, i, at(gate, gate.width / 2, 0, -1), at(gate, gate.width / 2, 0, 1)),
        i,
      );
      if (i) assert.equal(advanceCourse(course, i - 1, before, after), i - 1);
    });
  const course = PRACTICE_COURSES[0],
    last = course.gates.at(-1)!;
  assert.equal(
    advanceCourse(course, course.gates.length, at(last, 0, 0, -1), at(last, 0, 0, 1)),
    course.gates.length,
  );
});

test('fast flight cannot skip through a thin hoop or a window wall', () => {
  for (const course of PRACTICE_COURSES.slice(0, 2)) {
    const gate = course.gates[0];
    const point = at(gate, gate.kind === 'hoop' ? gate.radius! : gate.width / 2 + 1, 0, -0.48);
    const state = initialState({ x: point.x, z: point.z }, gate.heading);
    state.y = point.y;
    state.mode = 'flying';
    state.vx = Math.sin(gate.heading) * 20;
    state.vz = -Math.cos(gate.heading) * 20;
    stepFlight(
      state,
      { ...neutralControls(), forward: 1 },
      0.05,
      GENERIC_PROFILE,
      PRACTICE_OBSTACLES,
    );
    assert.equal(state.mode, 'collided', course.name);
  }
});
