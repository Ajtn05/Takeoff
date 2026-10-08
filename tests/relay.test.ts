import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket, type RawData } from 'ws';
import { createTrainerServer } from '../server/app';
import {
  PROTOCOL_VERSION,
  INPUT_TIMEOUT_MS,
  CONTROLLER_TIMEOUT_MS,
  HOST_TIMEOUT_MS,
  neutralControls,
  type ClientMessage,
  type ServerMessage,
  type Telemetry,
} from '../shared/protocol';

const telemetry: Telemetry = {
  altitude: 3,
  heading: 0,
  speed: 0,
  gimbal: -12,
  mode: 'flying',
  paused: true,
  reason: 'Ready',
  captures: 0,
  receiptToFrameMs: 0,
  lastInputSeq: 0,
};
class Peer {
  messages: ServerMessage[] = [];
  constructor(readonly socket: WebSocket) {
    socket.on('message', (data: RawData) => this.messages.push(JSON.parse(data.toString())));
  }
  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }
  async wait(
    predicate: (message: ServerMessage) => boolean,
    timeout = 2000,
  ): Promise<ServerMessage> {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const index = this.messages.findIndex(predicate);
      if (index !== -1) return this.messages.splice(index, 1)[0];
      await new Promise((accept) => setTimeout(accept, 5));
    }
    throw new Error('Timed out waiting for a message');
  }
}
async function fixture() {
  const app = await createTrainerServer({ port: 0 });
  const port = (app.server.address() as { port: number }).port;
  const s = app.relay.create();
  const connect = async (
    role: 'host' | 'controller',
    token = role === 'host' ? s.hostToken : s.joinToken,
  ) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`),
      peer = new Peer(socket);
    await new Promise<void>((accept) => socket.once('open', accept));
    peer.send({ type: 'hello', role, sessionId: s.id, token, version: PROTOCOL_VERSION });
    return peer;
  };
  const host = await connect('host');
  await host.wait((m) => m.type === 'welcome');
  const heartbeat = setInterval(() => host.send({ type: 'status', status: telemetry }), 80);
  const phone = await connect('controller');
  const welcome = (await phone.wait((m) => m.type === 'welcome')) as Extract<
    ServerMessage,
    { type: 'welcome' }
  >;
  phone.send({ type: 'resume', generation: welcome.generation, controls: neutralControls() });
  const ready = (await phone.wait((m) => m.type === 'connection' && m.ready)) as Extract<
    ServerMessage,
    { type: 'connection' }
  >;
  return {
    app,
    s,
    host,
    phone,
    generation: ready.generation,
    connect,
    close: async () => {
      clearInterval(heartbeat);
      await app.close();
    },
  };
}
test('relay admits one controller and rejects foreign tokens without affecting the owner', async () => {
  const f = await fixture();
  try {
    const second = await f.connect('controller');
    const [code] = await new Promise<[number]>((accept) =>
      second.socket.once('close', (code) => accept([code])),
    );
    assert.equal(code, 4003);
    const bad = await f.connect('controller', 'é'.repeat(f.s.joinToken.length));
    const badCode = await new Promise<number>((accept) => bad.socket.once('close', accept));
    assert.equal(badCode, 4001);
    assert.ok(f.s.controller);
    assert.ok(f.s.ready);
  } finally {
    await f.close();
  }
});
test('relay forwards ordered complete inputs and ignores old generations or duplicate sequences', async () => {
  const f = await fixture();
  try {
    f.host.messages = [];
    f.phone.send({
      type: 'input',
      generation: f.generation - 1,
      seq: 99,
      controls: { ...neutralControls(), forward: 1 },
    });
    f.phone.send({
      type: 'input',
      generation: f.generation,
      seq: 1,
      controls: { ...neutralControls(), climb: 0.4, right: 0.5 },
    });
    const received = (await f.host.wait((m) => m.type === 'input')) as Extract<
      ServerMessage,
      { type: 'input' }
    >;
    assert.equal(received.seq, 1);
    assert.equal(received.controls.climb, 0.4);
    assert.equal(received.controls.right, 0.5);
    f.phone.send({ type: 'input', generation: f.generation, seq: 1, controls: neutralControls() });
    await new Promise((accept) => setTimeout(accept, 30));
    assert.equal(f.host.messages.filter((m) => m.type === 'input').length, 0);
  } finally {
    await f.close();
  }
});
test('brief input delays retain readiness and accept the next input without a new handshake', async () => {
  const f = await fixture();
  try {
    f.s.lastInputAt = Date.now() - INPUT_TIMEOUT_MS - 300;
    f.app.relay.checkTimeouts();
    assert.equal(f.s.ready, true);
    assert.equal(f.s.generation, f.generation);
    f.phone.send({
      type: 'input',
      generation: f.generation,
      seq: 1,
      controls: neutralControls(),
    });
    await f.host.wait((m) => m.type === 'input' && m.generation === f.generation);
    assert.equal(f.s.ready, true);
  } finally {
    await f.close();
  }
});
test('a prolonged input gap invalidates generation and permits a new neutral recovery handshake', async () => {
  const f = await fixture();
  try {
    f.phone.send({
      type: 'input',
      generation: f.generation,
      seq: 1,
      controls: { ...neutralControls(), forward: 1 },
    });
    await f.host.wait((m) => m.type === 'input');
    f.s.lastInputAt = Date.now() - CONTROLLER_TIMEOUT_MS - 1;
    f.app.relay.checkTimeouts();
    const safety = (await f.phone.wait(
      (m) => m.type === 'connection' && !m.ready && m.recoverable === true,
    )) as Extract<ServerMessage, { type: 'connection' }>;
    assert.ok(safety.generation > f.generation);
    assert.equal(f.s.ready, false);
    assert.equal(safety.recoverable, true);
    f.phone.send({
      type: 'input',
      generation: f.generation,
      seq: 2,
      controls: { ...neutralControls(), forward: 1 },
    });
    f.phone.send({ type: 'resume', generation: safety.generation, controls: neutralControls() });
    const resumed = (await f.phone.wait((m) => m.type === 'connection' && m.ready)) as Extract<
      ServerMessage,
      { type: 'connection' }
    >;
    assert.ok(resumed.generation > safety.generation);
    f.phone.send({
      type: 'input',
      generation: safety.generation,
      seq: 999,
      controls: { ...neutralControls(), forward: 1 },
    });
    f.phone.send({
      type: 'input',
      generation: resumed.generation,
      seq: 1,
      controls: neutralControls(),
    });
    await f.host.wait((m) => m.type === 'input' && m.generation === resumed.generation);
    assert.equal(f.s.lastSeq, 1);
  } finally {
    await f.close();
  }
});
test('actions are acknowledged once and retry returns the cached result', async () => {
  const f = await fixture();
  try {
    for (const action of ['capture', 'resume'] as const) {
      const id = `${action}_1`,
        request: ClientMessage = { type: 'action', generation: f.generation, id, action };
      f.phone.send(request);
      f.phone.send(request);
      const forwarded = (await f.host.wait((m) => m.type === 'action')) as Extract<
        ServerMessage,
        { type: 'action' }
      >;
      assert.equal(forwarded.action, action);
      f.host.send({
        type: 'ack',
        generation: f.generation,
        id,
        ok: true,
        message: 'Action completed',
      });
      await f.phone.wait((m) => m.type === 'ack');
      f.phone.send(request);
      const cached = (await f.phone.wait((m) => m.type === 'ack')) as Extract<
        ServerMessage,
        { type: 'ack' }
      >;
      assert.ok(cached.ok);
      assert.equal(cached.id, id);
      assert.equal(f.host.messages.filter((m) => m.type === 'action').length, 0);
    }
  } finally {
    await f.close();
  }
});
test('controller disconnection pauses, reconnecting rotates generation, and revocation rejects old link', async () => {
  const f = await fixture();
  try {
    f.phone.socket.close();
    await f.host.wait(
      (m) => m.type === 'connection' && !m.connected && m.reason.includes('disconnected'),
    );
    const reconnected = await f.connect('controller');
    const welcome = (await reconnected.wait((m) => m.type === 'welcome')) as Extract<
      ServerMessage,
      { type: 'welcome' }
    >;
    assert.ok(welcome.generation > f.generation);
    assert.equal(f.s.ready, false);
    const oldToken = f.s.joinToken;
    f.host.send({ type: 'revoke' });
    await new Promise((accept) => reconnected.socket.once('close', accept));
    assert.notEqual(f.s.joinToken, oldToken);
    const revoked = await f.connect('controller', oldToken);
    const code = await new Promise<number>((accept) => revoked.socket.once('close', accept));
    assert.equal(code, 4001);
  } finally {
    await f.close();
  }
});
test('laptop silence requests recovery even if the phone keeps streaming', async () => {
  const f = await fixture();
  try {
    f.s.lastHostAt = Date.now() - HOST_TIMEOUT_MS - 1;
    f.app.relay.checkTimeouts();
    f.phone.send({ type: 'input', generation: f.generation, seq: 1, controls: neutralControls() });
    await f.phone.wait((m) => m.type === 'connection' && !m.ready && m.recoverable === true);
    assert.equal(f.s.ready, false);
  } finally {
    await f.close();
  }
});
test('manual suspension cancels recovery while a telemetry timeout can request it', async () => {
  const f = await fixture();
  try {
    f.phone.send({ type: 'suspend', reason: 'Telemetry delayed', recoverable: true });
    await f.phone.wait((m) => m.type === 'connection' && m.recoverable === true);
    f.phone.send({ type: 'suspend', reason: 'Controls paused by user' });
    await f.phone.wait((m) => m.type === 'connection' && m.recoverable === false);
    assert.equal(f.s.ready, false);
  } finally {
    await f.close();
  }
});
