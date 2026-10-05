import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocket } from 'ws';
import { HOST_TIMEOUT_MS, INPUT_TIMEOUT_MS, MAX_QUEUE_BYTES, parseClientMessage, type ServerMessage, type ClientMessage } from '../shared/protocol.js';

const secret = () => randomBytes(24).toString('base64url');
const matches = (a: string, b: string) => {
  const actual = Buffer.from(a), expected = Buffer.from(b);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
type Ack = Extract<ServerMessage, { type: 'ack' }>;
// Allow brief network interruptions, then free stations abandoned by closed tabs.
export const ABANDONED_SESSION_TTL_MS = 60_000;
export interface Session {
  id: string; hostToken: string; joinToken: string; expiresAt: number;
  host?: WebSocket; controller?: WebSocket; generation: number; ready: boolean;
  lastInputAt: number; lastHostAt: number; lastSeq: number;
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
    const session: Session = { id: randomBytes(12).toString('base64url'), hostToken: secret(), joinToken: secret(),
      expiresAt: this.now() + 12 * 60 * 60 * 1000, generation: 0, ready: false,
      lastInputAt: 0, lastHostAt: 0, lastSeq: -1, hostDisconnectedAt: this.now(), actions: new Map() };
    this.sessions.set(session.id, session); return session;
  }
  authenticatedHost(id: string, token: string): boolean {
    const session = this.sessions.get(id);
    return !!session?.host && this.now() <= session.expiresAt && matches(token, session.hostToken);
  }
  private send(socket: WebSocket | undefined, message: ServerMessage): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_QUEUE_BYTES) { socket.close(4008, 'Send queue exceeded'); return; }
    socket.send(JSON.stringify(message));
  }
  private notify(s: Session, reason: string): void {
    const m: ServerMessage = { type: 'connection', generation: s.generation, connected: !!s.controller, ready: s.ready, reason };
    this.send(s.host, m); this.send(s.controller, m);
  }
  private suspend(s: Session, reason: string): void {
    s.generation++; s.ready = false; s.lastSeq = -1;
    for (const [id, ack] of s.actions) {
      if (!ack) this.send(s.controller, { type: 'ack', generation: s.generation - 1, id, ok: false, message: reason });
    }
    s.actions.clear(); this.notify(s, reason);
  }
  checkTimeouts(): void {
    const now = this.now();
    for (const s of this.sessions.values()) {
      if (now > s.expiresAt || (!s.host && s.hostDisconnectedAt !== undefined && now - s.hostDisconnectedAt > ABANDONED_SESSION_TTL_MS)) {
        s.host?.close(4001, 'Session expired'); s.controller?.close(4001, 'Station closed. Scan a new pairing code.'); this.sessions.delete(s.id); continue;
      }
      if (s.ready && now - s.lastHostAt > HOST_TIMEOUT_MS) this.suspend(s, 'Laptop stopped responding. Enable controls again.');
      else if (s.ready && now - s.lastInputAt > INPUT_TIMEOUT_MS) this.suspend(s, 'Controller input expired. Enable controls again.');
    }
  }
  attach(socket: WebSocket): void {
    let session: Session | undefined;
    let role: 'host' | 'controller' | undefined;
    const helloTimer = setTimeout(() => socket.close(4001, 'Handshake required'), 3000);
    socket.on('error', () => socket.close());
    socket.on('message', (data, binary) => {
      const msg = binary ? null : parseClientMessage(data.toString());
      if (!msg) { socket.close(4002, 'Invalid message'); return; }
      if (!session) {
        if (msg.type !== 'hello') { socket.close(4001, 'Handshake required'); return; }
        const s = this.sessions.get(msg.sessionId);
        if (!s || this.now() > s.expiresAt || !matches(msg.token, msg.role === 'host' ? s.hostToken : s.joinToken)) {
          socket.close(4001, 'Pairing link expired or invalid'); return;
        }
        if (msg.role === 'controller' && !s.host) { socket.close(4003, 'Open the simulator first'); return; }
        if (s[msg.role]) { socket.close(4003, `${msg.role === 'host' ? 'Simulator' : 'Controller'} already connected`); return; }
        clearTimeout(helloTimer); session = s; role = msg.role; s[role] = socket;
        if (role === 'host') { s.lastHostAt = this.now(); s.hostDisconnectedAt = undefined; }
        s.generation++; s.ready = false; s.lastSeq = -1; s.actions.clear();
        this.send(socket, { type: 'welcome', role, generation: s.generation });
        this.notify(s, role === 'controller' ? 'Phone paired. Enable controls on the phone.' : 'Simulator connected.');
        return;
      }
      const s = session;
      if (msg.type === 'ping') { this.send(socket, { type: 'pong', id: msg.id }); return; }
      if (msg.type === 'suspend') { this.suspend(s, msg.reason); return; }
      if (role === 'host') this.fromHost(s, msg);
      else this.fromController(s, msg);
    });
    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (!session || !role || session[role] !== socket) return;
      session[role] = undefined;
      if (role === 'host') session.hostDisconnectedAt = this.now();
      this.suspend(session, role === 'host' ? 'Simulator disconnected.' : 'Phone disconnected.');
    });
  }
  private fromHost(s: Session, msg: ClientMessage): void {
    if (msg.type === 'status') { s.lastHostAt = this.now(); this.send(s.controller, msg); }
    if (msg.type === 'ack' && msg.generation === s.generation && s.actions.has(msg.id)) {
      if (s.actions.get(msg.id)) return;
      s.actions.set(msg.id, msg); this.send(s.controller, msg);
    }
    if (msg.type === 'revoke') {
      const controller = s.controller; s.controller = undefined;
      s.joinToken = secret(); this.suspend(s, 'Controller revoked. Create a new pairing link.');
      controller?.close(4001, 'Controller revoked. Scan a new link.');
    }
  }
  private fromController(s: Session, msg: ClientMessage): void {
    if (msg.type === 'resume' && msg.generation === s.generation && s.host && this.now() - s.lastHostAt <= HOST_TIMEOUT_MS) {
      s.generation++; s.ready = true; s.lastSeq = -1; s.lastInputAt = this.now(); s.actions.clear();
      this.notify(s, 'Controls ready. Take off, or resume practice on the laptop.'); return;
    }
    if (!s.ready || !('generation' in msg) || msg.generation !== s.generation) return;
    if (this.now() - s.lastInputAt > INPUT_TIMEOUT_MS || this.now() - s.lastHostAt > HOST_TIMEOUT_MS) {
      this.suspend(s, 'Connection expired. Enable controls again.'); return;
    }
    if (msg.type === 'input' && msg.seq > s.lastSeq) {
      s.lastSeq = msg.seq; s.lastInputAt = this.now(); this.send(s.host, msg);
    }
    if (msg.type === 'action') {
      if (s.actions.has(msg.id)) {
        const ack = s.actions.get(msg.id); if (ack) this.send(s.controller, ack); return;
      }
      // Never evict IDs within a generation: a delayed retry must not run twice.
      if (s.actions.size >= 4096) { this.suspend(s, 'Action history full. Enable controls to continue.'); return; }
      s.actions.set(msg.id, null); this.send(s.host, msg);
    }
  }
  close(): void {
    clearInterval(this.timer);
    for (const s of this.sessions.values()) { s.host?.terminate(); s.controller?.terminate(); }
    this.sessions.clear();
  }
}
