import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocket } from 'ws';
import {
  HOST_TIMEOUT_MS,
  INPUT_TIMEOUT_MS,
  MAX_QUEUE_BYTES,
  parseClientMessage,
  type ServerMessage,
  type ClientMessage,
} from '../shared/protocol.js';

const secret = () => randomBytes(24).toString('base64url');
const matches = (a: string, b: string) => {
  const actual = Buffer.from(a);
  const expected = Buffer.from(b);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
type Ack = Extract<ServerMessage, { type: 'ack' }>;
// Allow brief network interruptions, then free stations abandoned by closed tabs.
export const ABANDONED_SESSION_TTL_MS = 60_000;
export interface Session {
  id: string;
  hostToken: string;
  joinToken: string;
  expiresAt: number;
  host?: WebSocket;
  controller?: WebSocket;
  generation: number;
  ready: boolean;
  lastInputAt: number;
  lastHostAt: number;
  lastSeq: number;
  hostDisconnectedAt?: number;
  actions: Map<string, Ack | null>;
}
export class SessionRelay {
  sessions = new Map<string, Session>();
  private timer: ReturnType<typeof setInterval>;
  constructor(private now = Date.now) {
    this.timer = setInterval(() => this.checkTimeouts(), 40);
    this.timer.unref();
  }
  create(): Session {
    const session: Session = {
      id: randomBytes(12).toString('base64url'),
      hostToken: secret(),
      joinToken: secret(),
      expiresAt: this.now() + 12 * 60 * 60 * 1000,
      generation: 0,
      ready: false,
      lastInputAt: 0,
      lastHostAt: 0,
      lastSeq: -1,
      hostDisconnectedAt: this.now(),
      actions: new Map(),
    };
    this.sessions.set(session.id, session);
    return session;
  }
  authenticatedHost(id: string, token: string): boolean {
    const session = this.sessions.get(id);
    return !!session?.host && this.now() <= session.expiresAt && matches(token, session.hostToken);
  }
  private send(socket: WebSocket | undefined, message: ServerMessage): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_QUEUE_BYTES) {
      socket.close(4008, 'Send queue exceeded');
      return;
    }
    socket.send(JSON.stringify(message));
  }
  private notify(session: Session, reason: string): void {
    const message: ServerMessage = {
      type: 'connection',
      generation: session.generation,
      connected: !!session.controller,
      ready: session.ready,
      reason,
    };
    this.send(session.host, message);
    this.send(session.controller, message);
  }
  private suspend(session: Session, reason: string): void {
    session.generation++;
    session.ready = false;
    session.lastSeq = -1;
    for (const [id, ack] of session.actions) {
      if (!ack)
        this.send(session.controller, {
          type: 'ack',
          generation: session.generation - 1,
          id,
          ok: false,
          message: reason,
        });
    }
    session.actions.clear();
    this.notify(session, reason);
  }
  checkTimeouts(): void {
    const now = this.now();
    for (const session of this.sessions.values()) {
      if (
        now > session.expiresAt ||
        (!session.host &&
          session.hostDisconnectedAt !== undefined &&
          now - session.hostDisconnectedAt > ABANDONED_SESSION_TTL_MS)
      ) {
        session.host?.close(4001, 'Session expired');
        session.controller?.close(4001, 'Station closed. Scan a new pairing code.');
        this.sessions.delete(session.id);
        continue;
      }
      if (session.ready && now - session.lastHostAt > HOST_TIMEOUT_MS)
        this.suspend(session, 'Laptop stopped responding. Enable controls again.');
      else if (session.ready && now - session.lastInputAt > INPUT_TIMEOUT_MS)
        this.suspend(session, 'Controller input expired. Enable controls again.');
    }
  }
  attach(socket: WebSocket): void {
    let session: Session | undefined;
    let role: 'host' | 'controller' | undefined;
    const helloTimer = setTimeout(() => socket.close(4001, 'Handshake required'), 3000);
    socket.on('error', () => socket.close());
    socket.on('message', (data, binary) => {
      const message = binary ? null : parseClientMessage(data.toString());
      if (!message) {
        socket.close(4002, 'Invalid message');
        return;
      }
      if (!session) {
        if (message.type !== 'hello') {
          socket.close(4001, 'Handshake required');
          return;
        }
        const candidate = this.sessions.get(message.sessionId);
        if (
          !candidate ||
          this.now() > candidate.expiresAt ||
          !matches(
            message.token,
            message.role === 'host' ? candidate.hostToken : candidate.joinToken,
          )
        ) {
          socket.close(4001, 'Pairing link expired or invalid');
          return;
        }
        if (message.role === 'controller' && !candidate.host) {
          socket.close(4003, 'Open the simulator first');
          return;
        }
        if (candidate[message.role]) {
          socket.close(
            4003,
            `${message.role === 'host' ? 'Simulator' : 'Controller'} already connected`,
          );
          return;
        }
        clearTimeout(helloTimer);
        session = candidate;
        role = message.role;
        candidate[role] = socket;
        if (role === 'host') {
          candidate.lastHostAt = this.now();
          candidate.hostDisconnectedAt = undefined;
        }
        candidate.generation++;
        candidate.ready = false;
        candidate.lastSeq = -1;
        candidate.actions.clear();
        this.send(socket, { type: 'welcome', role, generation: candidate.generation });
        this.notify(
          candidate,
          role === 'controller'
            ? 'Phone paired. Enable controls on the phone.'
            : 'Simulator connected.',
        );
        return;
      }
      const activeSession = session;
      if (message.type === 'ping') {
        this.send(socket, { type: 'pong', id: message.id });
        return;
      }
      if (message.type === 'suspend') {
        this.suspend(activeSession, message.reason);
        return;
      }
      if (role === 'host') this.fromHost(activeSession, message);
      else this.fromController(activeSession, message);
    });
    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (!session || !role || session[role] !== socket) return;
      session[role] = undefined;
      if (role === 'host') session.hostDisconnectedAt = this.now();
      this.suspend(session, role === 'host' ? 'Simulator disconnected.' : 'Phone disconnected.');
    });
  }
  private fromHost(session: Session, message: ClientMessage): void {
    if (message.type === 'status') {
      session.lastHostAt = this.now();
      this.send(session.controller, message);
    }
    if (
      message.type === 'ack' &&
      message.generation === session.generation &&
      session.actions.has(message.id)
    ) {
      if (session.actions.get(message.id)) return;
      session.actions.set(message.id, message);
      this.send(session.controller, message);
    }
    if (message.type === 'revoke') {
      const controller = session.controller;
      session.controller = undefined;
      session.joinToken = secret();
      this.suspend(session, 'Controller revoked. Create a new pairing link.');
      controller?.close(4001, 'Controller revoked. Scan a new link.');
    }
  }
  private fromController(session: Session, message: ClientMessage): void {
    if (
      message.type === 'resume' &&
      message.generation === session.generation &&
      session.host &&
      this.now() - session.lastHostAt <= HOST_TIMEOUT_MS
    ) {
      session.generation++;
      session.ready = true;
      session.lastSeq = -1;
      session.lastInputAt = this.now();
      session.actions.clear();
      this.notify(session, 'Controls ready. Take off, or tap Resume game on the phone.');
      return;
    }
    if (!session.ready || !('generation' in message) || message.generation !== session.generation)
      return;
    if (
      this.now() - session.lastInputAt > INPUT_TIMEOUT_MS ||
      this.now() - session.lastHostAt > HOST_TIMEOUT_MS
    ) {
      this.suspend(session, 'Connection expired. Enable controls again.');
      return;
    }
    if (message.type === 'input' && message.seq > session.lastSeq) {
      session.lastSeq = message.seq;
      session.lastInputAt = this.now();
      this.send(session.host, message);
    }
    if (message.type === 'action') {
      if (session.actions.has(message.id)) {
        const ack = session.actions.get(message.id);
        if (ack) this.send(session.controller, ack);
        return;
      }
      // Never evict IDs within a generation: a delayed retry must not run twice.
      if (session.actions.size >= 4096) {
        this.suspend(session, 'Action history full. Enable controls to continue.');
        return;
      }
      session.actions.set(message.id, null);
      this.send(session.host, message);
    }
  }
  close(): void {
    clearInterval(this.timer);
    for (const session of this.sessions.values()) {
      session.host?.terminate();
      session.controller?.terminate();
    }
    this.sessions.clear();
  }
}
