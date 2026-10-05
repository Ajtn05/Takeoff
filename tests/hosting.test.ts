import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createTrainerServer } from '../server/app';
import { SessionRelay, ABANDONED_SESSION_TTL_MS } from '../server/session';
import { PROTOCOL_VERSION, neutralControls, type SessionInfo, type ServerMessage } from '../shared/protocol';

const publicOrigin = 'https://takeoff.example';
const localUrl = (app: Awaited<ReturnType<typeof createTrainerServer>>) => `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

test('hosted pairing uses the configured HTTPS origin behind a proxy and exposes no local addresses', async () => {
  const app = await createTrainerServer({ port: 0, publicOrigin });
  try {
    const response = await fetch(`${localUrl(app)}/api/session`, { method: 'POST', headers: { Origin: publicOrigin, 'X-Forwarded-Host': 'untrusted.example', 'X-Forwarded-Proto': 'http' } });
    assert.equal(response.status, 200);
    const info = await response.json() as SessionInfo;
    const link = new URL(info.publicUrl!);
    assert.equal(link.origin, publicOrigin); assert.equal(link.pathname, '/controller');
    assert.equal(new URLSearchParams(link.hash.slice(1)).get('session'), info.sessionId);
    assert.equal(new URLSearchParams(link.hash.slice(1)).get('token'), app.relay.sessions.get(info.sessionId)?.joinToken);
    assert.equal(info.usbUrl, undefined); assert.deepEqual(info.lanUrls, []);
    const foreign = await fetch(`${localUrl(app)}/api/session`, { method: 'POST', headers: { Origin: 'https://other.example' } });
    assert.equal(foreign.status, 403); assert.equal(app.relay.sessions.size, 1);
    assert.equal((await fetch(`${localUrl(app)}/api/health`)).status, 200);
  } finally { await app.close(); }
});

test('hosted USB requests never run forwarding on the remote server', async () => {
  let called = false;
  const app = await createTrainerServer({ port: 0, publicOrigin, setupUsb: async () => {
    called = true; return { ok: true, status: 'ready', message: 'Ready' };
  } });
  try {
    const response = await fetch(`${localUrl(app)}/api/usb`, { method: 'POST', headers: { Origin: publicOrigin } });
    assert.equal(response.status, 403); assert.match((await response.json()).error, /wireless pairing/); assert.equal(called, false);
  } finally { await app.close(); }
});

test('local pairing retains USB and LAN links', async () => {
  const app = await createTrainerServer({ port: 0, host: '0.0.0.0' });
  try {
    const info = await (await fetch(`${localUrl(app)}/api/session`, { method: 'POST' })).json() as SessionInfo;
    assert.equal(new URL(info.usbUrl!).origin, localUrl(app)); assert.equal(info.publicUrl, undefined);
    assert.ok(Array.isArray(info.lanUrls));
  } finally { await app.close(); }
});

test('public origins reject insecure remote URLs and malformed deployment configuration', async () => {
  for (const origin of ['http://takeoff.example', 'https://takeoff.example/path', 'https://user:pass@takeoff.example', 'https://takeoff.example?query=1', 'https://takeoff.example#token', 'file:///tmp/app']) {
    await assert.rejects(createTrainerServer({ port: 0, publicOrigin: origin }), /HTTPS origin/);
  }
});

test('abandoned stations free capacity after a reconnect grace period', () => {
  let now = 10_000;
  const relay = new SessionRelay(() => now);
  try {
    const session = relay.create();
    now += ABANDONED_SESSION_TTL_MS; relay.checkTimeouts(); assert.ok(relay.sessions.has(session.id));
    now++; relay.checkTimeouts(); assert.equal(relay.sessions.size, 0);
  } finally { relay.close(); }
});

test('public WebSockets authenticate independent stations and reject a foreign website origin', async () => {
  const app = await createTrainerServer({ port: 0, publicOrigin });
  const waitFor = (socket: WebSocket, type: ServerMessage['type']) => new Promise<ServerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off('message', receive); reject(new Error(`Missing ${type}`)); }, 2000);
    const receive = (raw: unknown) => {
      const message = JSON.parse(String(raw)) as ServerMessage;
      if (message.type === type) { clearTimeout(timeout); socket.off('message', receive); resolve(message); }
    };
    socket.on('message', receive);
  });
  const connect = async (sessionId: string, token: string, role: 'host' | 'controller') => {
    const socket = new WebSocket(`${localUrl(app).replace('http:', 'ws:')}/ws`, { origin: publicOrigin });
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const welcome = waitFor(socket, 'welcome');
    socket.send(JSON.stringify({ type: 'hello', sessionId, token, role, version: PROTOCOL_VERSION }));
    return { socket, welcome: await welcome as Extract<ServerMessage, { type: 'welcome' }> };
  };
  try {
    const first = app.relay.create(), second = app.relay.create();
    const host1 = await connect(first.id, first.hostToken, 'host'), host2 = await connect(second.id, second.hostToken, 'host');
    const phone1 = await connect(first.id, first.joinToken, 'controller'), phone2 = await connect(second.id, second.joinToken, 'controller');
    const messages1: ServerMessage[] = [], messages2: ServerMessage[] = [];
    host1.socket.on('message', (raw) => messages1.push(JSON.parse(String(raw))));
    host2.socket.on('message', (raw) => messages2.push(JSON.parse(String(raw))));
    for (const peer of [phone1, phone2]) {
      const ready = waitFor(peer.socket, 'connection');
      peer.socket.send(JSON.stringify({ type: 'resume', generation: peer.welcome.generation, controls: neutralControls() }));
      const state = await ready as Extract<ServerMessage, { type: 'connection' }>;
      assert.equal(state.ready, true);
      peer.welcome.generation = state.generation;
    }
    for (const [phone, host, seq, climb] of [[phone1, host1, 42, .5], [phone2, host2, 99, -.5]] as const) {
      const received = waitFor(host.socket, 'input');
      phone.socket.send(JSON.stringify({ type: 'input', generation: phone.welcome.generation, seq, controls: { ...neutralControls(), climb } }));
      const input = await received as Extract<ServerMessage, { type: 'input' }>;
      assert.equal(input.seq, seq); assert.equal(input.controls.climb, climb);
    }
    assert.deepEqual(messages1.filter((m) => m.type === 'input').map((m) => m.seq), [42]);
    assert.deepEqual(messages2.filter((m) => m.type === 'input').map((m) => m.seq), [99]);
    const foreign = new WebSocket(`${localUrl(app).replace('http:', 'ws:')}/ws`, { origin: 'https://other.example' });
    await new Promise<void>((resolve, reject) => { foreign.once('error', () => resolve()); foreign.once('open', () => { foreign.close(); reject(new Error('Foreign origin accepted')); }); });
  } finally { await app.close(); }
});
