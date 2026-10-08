import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { HostSession } from '../src/network/host-session';
import type { ClientMessage, SessionInfo } from '../shared/protocol';

function fixture(context: TestContext) {
  const stored = new Map<string, string>();
  const sockets: SocketStub[] = [];
  let created = 0;
  class SocketStub extends EventTarget {
    static OPEN = 1;
    readyState = SocketStub.OPEN;
    bufferedAmount = 0;
    messages: ClientMessage[] = [];
    constructor() {
      super();
      sockets.push(this);
    }
    send(raw: string): void {
      this.messages.push(JSON.parse(raw) as ClientMessage);
    }
    close(): void {
      this.readyState = 3;
    }
    disconnect(code: number): void {
      this.close();
      const event = new Event('close');
      Object.assign(event, { code, reason: 'Pairing unavailable' });
      this.dispatchEvent(event);
    }
  }
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  };
  for (const [key, value] of Object.entries({
    sessionStorage: storage,
    location: { protocol: 'http:', host: 'localhost' },
    WebSocket: SocketStub,
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    context.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const freshSession = (): SessionInfo => ({
    sessionId: `station-${++created}`,
    hostToken: 'host-token',
    usbUrl: `http://localhost/controller#session=${created}&token=phone-token`,
    lanUrls: [],
    expiresAt: Date.now() + 60_000,
  });
  const fetch = context.mock.method(globalThis, 'fetch', async () => Response.json(freshSession()));
  const createHost = () => {
    const host = new HostSession({
      receive: () => {},
      changed: () => {},
      unavailable: (error) => assert.fail(String(error)),
    });
    context.after(() => host.close());
    return host;
  };
  return { sockets, storage, stored, freshSession, fetch, createHost };
}

test('mode changes reuse the same tab session and connection path without revoking the phone', async (context) => {
  const f = fixture(context);
  const game = f.createHost();
  await game.connect();
  f.sockets[0].dispatchEvent(new Event('open'));
  game.selectPath('usb');
  const session = game.session;
  game.close();

  const menu = f.createHost();
  await menu.connect();
  menu.close();
  const practice = f.createHost();
  await practice.connect();
  f.sockets[2].dispatchEvent(new Event('open'));

  assert.deepEqual(practice.session, session);
  assert.equal(practice.path, 'usb');
  assert.equal(f.fetch.mock.callCount(), 1);
  assert.equal(
    f.sockets[0].messages.some((message) => message.type === 'revoke'),
    false,
  );
  assert.deepEqual(f.sockets[2].messages, f.sockets[0].messages);
});

test('explicit renewal revokes the old phone and persists the replacement session', async (context) => {
  const f = fixture(context);
  const host = f.createHost();
  await host.connect();
  f.sockets[0].dispatchEvent(new Event('open'));
  const oldId = host.session?.sessionId;
  await host.connect(true);
  assert.ok(f.sockets[0].messages.some((message) => message.type === 'revoke'));
  assert.notEqual(host.session?.sessionId, oldId);
  assert.equal(f.fetch.mock.callCount(), 2);
  host.close();
  assert.deepEqual(f.createHost().session, host.session);
});

for (const code of [4001, 4003]) {
  test(`rejected saved session (${code}) creates a fresh station without revoking another host`, async (context) => {
    const f = fixture(context);
    const oldHost = f.createHost();
    await oldHost.connect();
    const oldId = oldHost.session?.sessionId;
    oldHost.close();
    const host = f.createHost();
    await host.connect();
    f.sockets[1].dispatchEvent(new Event('open'));
    f.sockets[1].disconnect(code);
    await new Promise((resolve) => setImmediate(resolve));
    assert.notEqual(host.session?.sessionId, oldId);
    assert.equal(f.fetch.mock.callCount(), 2);
    assert.equal(f.sockets.length, 3);
    assert.equal(
      f.sockets[1].messages.some((message) => message.type === 'revoke'),
      false,
    );
  });
}

test('expired saved pairing creates a new session', async (context) => {
  const f = fixture(context);
  const expired = f.freshSession();
  expired.expiresAt = Date.now() - 1;
  f.stored.set('takeoff-phone-session', JSON.stringify({ session: expired }));
  const host = f.createHost();
  assert.equal(host.session, undefined);
  await host.connect();
  assert.notEqual(host.session?.sessionId, expired.sessionId);
});

test('unavailable browser storage still allows pairing', async (context) => {
  const f = fixture(context);
  context.mock.method(f.storage, 'getItem', () => {
    throw new Error('Storage disabled');
  });
  context.mock.method(f.storage, 'setItem', () => {
    throw new Error('Storage disabled');
  });
  const host = f.createHost();
  await host.connect();
  assert.ok(host.session);
  assert.equal(f.sockets.length, 1);
});

test('leaving while session creation is pending does not open or save an abandoned connection', async (context) => {
  const f = fixture(context);
  let respond!: (response: Response) => void;
  f.fetch.mock.mockImplementation(() => new Promise<Response>((resolve) => (respond = resolve)));
  const host = f.createHost();
  const connecting = host.connect();
  await new Promise((resolve) => setImmediate(resolve));
  host.close();
  respond(Response.json(f.freshSession()));
  await connecting;
  assert.equal(f.sockets.length, 0);
  assert.equal(f.stored.size, 0);
});
