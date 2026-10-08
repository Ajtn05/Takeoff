import assert from 'node:assert/strict';
import test from 'node:test';
import { TrainerSocket } from '../src/network/socket';

test('closing an old pairing socket ignores queued events and cancels reconnects', (context) => {
  class SocketStub extends EventTarget {
    static OPEN = 1;
    readyState = SocketStub.OPEN;
    bufferedAmount = 0;
    messages: string[] = [];
    send(message: string): void {
      this.messages.push(message);
    }
    close(): void {}
  }

  let connection: SocketStub;
  let connections = 0;
  class WebSocketStub extends SocketStub {
    constructor() {
      super();
      connection = this;
      connections++;
    }
  }
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { protocol: 'http:', host: 'localhost' },
  });
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: WebSocketStub });
  context.after(() => {
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
    else Reflect.deleteProperty(globalThis, 'location');
    if (originalWebSocket) Object.defineProperty(globalThis, 'WebSocket', originalWebSocket);
    else Reflect.deleteProperty(globalThis, 'WebSocket');
  });
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let received = 0;
  let disconnected = 0;
  const socket = new TrainerSocket(
    { role: 'host', sessionId: 'station', token: 'token' },
    () => {
      received++;
    },
    () => {
      disconnected++;
    },
  );
  connection!.dispatchEvent(new Event('open'));
  assert.equal(socket.connected, true);
  socket.close();
  connection!.dispatchEvent(
    new MessageEvent('message', { data: JSON.stringify({ type: 'connection', connected: false }) }),
  );
  connection!.dispatchEvent(new Event('open'));
  const closed = new Event('close');
  Object.assign(closed, { code: 1006, reason: 'Connection lost' });
  connection!.dispatchEvent(closed);
  context.mock.timers.tick(1000);
  assert.equal(received, 0);
  assert.equal(disconnected, 0);
  assert.equal(socket.connected, false);
  assert.equal(socket.send({ type: 'ping', id: 1 }), false);
  assert.equal(connections, 1);
});
