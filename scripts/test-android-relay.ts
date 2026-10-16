import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';
import { createTrainerServer } from '../server/app';
import { PROTOCOL_VERSION, type ServerMessage, type Telemetry } from '../shared/protocol';

const app = await createTrainerServer({ port: 0, publicOrigin: 'https://takeoff.example' });
const port = (app.server.address() as { port: number }).port;
const station = app.relay.create();
const host = new WebSocket(`ws://127.0.0.1:${port}/ws`);
const telemetry: Telemetry = {
  altitude: 3,
  heading: 0,
  speed: 0,
  gimbal: -12,
  mode: 'flying',
  paused: false,
  reason: 'Native bridge integration test',
  captures: 0,
  receiptToFrameMs: 0,
  lastInputSeq: 0,
};
let heartbeat: ReturnType<typeof setInterval> | undefined;
let inputSeen = false;
let firstHeldInputAt: number | undefined;
let lastHeldInputAt: number | undefined;
const actions = new Set<string>();
let lastInputSequence = -1;
let suspended = false;
let failure: unknown;

host.on('message', (raw) => {
  try {
    const message = JSON.parse(raw.toString()) as ServerMessage;
    if (message.type === 'connection' && !message.ready && inputSeen) suspended = true;
    if (message.type === 'input') {
      assert.ok(message.seq > lastInputSequence);
      lastInputSequence = message.seq;
      assert.equal(message.controls.climb, 0);
      assert.equal(message.controls.yaw, 0);
      assert.equal(message.controls.right, 0);
      if (message.controls.forward === 1) {
        assert.equal(message.controls.gimbal, 0.5);
        inputSeen = true;
        firstHeldInputAt ??= Date.now();
        lastHeldInputAt = Date.now();
      }
    }
    if (message.type === 'action') {
      assert.ok(['capture', 'land'].includes(message.action));
      actions.add(message.action);
      host.send(
        JSON.stringify({
          type: 'ack',
          generation: message.generation,
          id: message.id,
          ok: true,
          message:
            message.action === 'capture' ? 'Native capture confirmed' : 'Native landing confirmed',
        }),
      );
    }
  } catch (error) {
    failure = error;
  }
});

try {
  await new Promise<void>((accept, reject) => {
    host.once('open', accept);
    host.once('error', reject);
  });
  const welcomed = new Promise<void>((accept) => host.once('message', () => accept()));
  host.send(
    JSON.stringify({
      type: 'hello',
      role: 'host',
      sessionId: station.id,
      token: station.hostToken,
      version: PROTOCOL_VERSION,
    }),
  );
  await welcomed;
  heartbeat = setInterval(
    () => host.send(JSON.stringify({ type: 'status', status: telemetry })),
    50,
  );
  const command = process.env.TAKEOFF_GRADLE || resolve('android/gradlew');
  const child = spawn(
    command,
    ['-p', resolve('android'), ':bridge:relayProbe', '--console=plain', '--no-daemon'],
    {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: process.env,
    },
  );
  child.stdin.end(
    `http://127.0.0.1:${port}/controller#session=${station.id}&token=${station.joinToken}\n`,
  );
  const timeout = setTimeout(() => child.kill('SIGTERM'), 60_000);
  try {
    const exit = await new Promise<number | null>((accept, reject) => {
      child.once('exit', accept);
      child.once('error', reject);
    });
    assert.equal(exit, 0, 'Native bridge probe must pass');
  } finally {
    clearTimeout(timeout);
  }
  // Let the final suspend/close reach the host before checking the relay state.
  await new Promise((accept) => setTimeout(accept, 100));
  if (failure) throw failure;
  assert.ok(inputSeen, 'Real relay received normalized physical-stick input');
  assert.ok(
    firstHeldInputAt !== undefined &&
      lastHeldInputAt !== undefined &&
      lastHeldInputAt - firstHeldInputAt >= 1_000,
    'Real relay kept receiving held-stick inputs without new hardware callbacks',
  );
  assert.deepEqual([...actions].sort(), ['capture', 'land']);
  assert.ok(suspended, 'Real relay suspended when the remote disconnected');
  assert.equal(station.ready, false);
  console.log('Takeoff relay accepted the native Android bridge end to end.');
} finally {
  if (heartbeat) clearInterval(heartbeat);
  host.close();
  await app.close();
}
