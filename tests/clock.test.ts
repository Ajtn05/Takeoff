import assert from 'node:assert/strict';
import test from 'node:test';
import { FlightClock, FLIGHT_STEP_SECONDS } from '../src/flight/clock';

test('flight time stays consistent across display rates', () => {
  const stepCounts = [30, 60, 120].map((rate) => {
    const clock = new FlightClock();
    let steps = 0;
    for (let frame = 0; frame < rate * 10; frame++) {
      clock.advance(1000 / rate, false, (seconds) => {
        assert.equal(seconds, FLIGHT_STEP_SECONDS);
        steps++;
        return true;
      });
    }
    return steps;
  });
  assert.deepEqual(stepCounts, [600, 600, 600]);
});

test('paused frames and interrupted flights discard accumulated time', () => {
  const clock = new FlightClock();
  let steps = 0;
  const step = () => {
    steps++;
    return true;
  };
  clock.advance(10, false, step);
  clock.advance(5000, true, step);
  clock.advance(10, false, step);
  assert.equal(steps, 0);
  clock.advance(100, false, () => {
    steps++;
    return false;
  });
  assert.equal(steps, 1);
  clock.advance(10, false, step);
  assert.equal(steps, 1);
});

test('catch-up work is bounded after a long display stall', () => {
  const clock = new FlightClock();
  let simulatedSeconds = 0;
  clock.advance(5000, false, (seconds) => {
    simulatedSeconds += seconds;
    return true;
  });
  assert.ok(simulatedSeconds > 0.23 && simulatedSeconds <= 0.25);
});
