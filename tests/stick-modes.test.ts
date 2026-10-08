import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutralControls } from '../shared/protocol';
import {
  parseStickMode,
  stickInput,
  type StickMode,
  type StickSide,
} from '../src/flight/stick-modes';

test('DJI stick modes route each positive and negative axis to its flight command', () => {
  const mappings: [StickMode, StickSide, 'x' | 'y', keyof ReturnType<typeof neutralControls>][] = [
    ['1', 'left', 'x', 'yaw'],
    ['1', 'left', 'y', 'forward'],
    ['1', 'right', 'x', 'right'],
    ['1', 'right', 'y', 'climb'],
    ['2', 'left', 'x', 'yaw'],
    ['2', 'left', 'y', 'climb'],
    ['2', 'right', 'x', 'right'],
    ['2', 'right', 'y', 'forward'],
    ['3', 'left', 'x', 'right'],
    ['3', 'left', 'y', 'forward'],
    ['3', 'right', 'x', 'yaw'],
    ['3', 'right', 'y', 'climb'],
  ];
  for (const [mode, side, axis, command] of mappings) {
    for (const value of [-1, -0.35, 0, 0.35, 1]) {
      const actual = {
        ...neutralControls(),
        ...stickInput(mode, side, axis === 'x' ? value : 0, axis === 'y' ? value : 0),
      };
      assert.deepEqual(
        actual,
        { ...neutralControls(), [command]: value },
        `Mode ${mode}, ${side} ${axis}: ${value}`,
      );
    }
  }
});

test('two sticks preserve all four commands and releasing one leaves the other active', () => {
  for (const mode of ['1', '2', '3'] as const) {
    const controls = {
      ...neutralControls(),
      gimbal: 0.5,
      ...stickInput(mode, 'left', -0.4, 0.7),
      ...stickInput(mode, 'right', 0.2, -0.3),
    };
    assert.equal(controls.gimbal, 0.5);
    const before = { ...controls };
    Object.assign(controls, stickInput(mode, 'left', 0, 0));
    const right = stickInput(mode, 'right', 0.2, -0.3);
    for (const key of Object.keys(right) as (keyof typeof controls)[])
      assert.equal(controls[key], before[key]);
    Object.assign(controls, stickInput(mode, 'right', 0, 0));
    assert.deepEqual(controls, { ...neutralControls(), gimbal: 0.5 });
  }
});

test('missing or invalid saved stick modes fall back to DJI default Mode 2', () => {
  assert.equal(parseStickMode('1'), '1');
  assert.equal(parseStickMode('3'), '3');
  for (const value of [null, '', '2', '0', '4', 'mode-1', '{}'])
    assert.equal(parseStickMode(value), '2');
});
