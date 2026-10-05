import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupUsbForward } from '../server/usb';
import { createTrainerServer } from '../server/app';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '../shared/protocol';

test('USB setup selects only USB and verifies forwarding for the actual trainer port', async () => {
  const calls: string[][] = [];
  const result = await setupUsbForward(8082, async (args) => {
    calls.push(args);
    return { stdout: args.includes('get-state') ? 'device\n' : args.includes('--list') ? 'UsbFfs tcp:8082 tcp:8082\n' : '', stderr: '' };
  });
  assert.ok(result.ok); assert.equal(result.status, 'ready');
  assert.deepEqual(calls, [['-d', 'get-state'], ['-d', 'reverse', 'tcp:8082', 'tcp:8082'], ['-d', 'reverse', '--list']]);
});
test('unauthorized, offline, missing ADB and ambiguous devices give actionable results', async () => {
  for (const [message, expected] of [
    ['error: device unauthorized', 'unauthorized'],
    ['error: device offline', 'no-device'],
    ['error: no devices/emulators found', 'no-device'],
    ['error: more than one device/emulator', 'multiple-devices'],
  ]) {
    let calls = 0;
    const result = await setupUsbForward(8082, async () => { calls++; throw new Error(message); });
    assert.equal(result.status, expected); assert.equal(result.ok, false); assert.equal(calls, 1);
  }
  const missing = await setupUsbForward(8082, async () => { throw Object.assign(new Error('missing'), { code: 'ADB_NOT_FOUND' }); });
  assert.equal(missing.status, 'missing-adb');
});
test('a wrong forwarding port cannot produce a false ready result', async () => {
  const result = await setupUsbForward(8082, async (args) => ({ stdout: args.includes('get-state') ? 'device' : args.includes('--list') ? 'UsbFfs tcp:8080 tcp:8080' : '', stderr: '' }));
  assert.equal(result.ok, false);
});
test('invalid ports do not invoke ADB', async () => {
  const result = await setupUsbForward(0, async () => { throw new Error('Must not execute'); });
  assert.equal(result.ok, false); assert.equal(result.message, 'The trainer port is invalid.');
});
test('USB endpoint authenticates the active host and uses the listening port', async () => {
  const ports: number[] = [];
  const app = await createTrainerServer({ port: 0, setupUsb: async (port) => {
    ports.push(port); return { ok: false, status: 'unauthorized', message: 'Unlock your phone.' };
  } });
  try {
    const port = (app.server.address() as { port: number }).port, session = app.relay.create();
    const post = (token: string) => fetch(`http://127.0.0.1:${port}/api/usb`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ sessionId: session.id }),
    });
    assert.equal((await post(session.hostToken)).status, 403); assert.equal(ports.length, 0);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((accept) => socket.once('open', accept));
    const welcome = new Promise<void>((accept) => socket.once('message', () => accept()));
    socket.send(JSON.stringify({ type: 'hello', role: 'host', sessionId: session.id, token: session.hostToken, version: PROTOCOL_VERSION }));
    await welcome;
    assert.equal((await post(session.joinToken)).status, 403); assert.equal(ports.length, 0);
    const result = await post(session.hostToken);
    assert.equal(result.status, 200); assert.equal((await result.json()).status, 'unauthorized'); assert.deepEqual(ports, [port]);
  } finally { await app.close(); }
});
