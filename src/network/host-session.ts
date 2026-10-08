import type { ClientMessage, ServerMessage, SessionInfo } from '../../shared/protocol';
import { TrainerSocket } from './socket';

const STORAGE_KEY = 'takeoff-phone-session';
interface SavedSession {
  session: SessionInfo;
  path?: string;
}
interface HostSessionOptions {
  receive: (message: ServerMessage) => void;
  changed: (session?: SessionInfo) => void | Promise<void>;
  unavailable: (error: unknown) => void;
}

function readSession(): SavedSession | undefined {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as SavedSession | null;
    const session = saved?.session;
    if (
      session &&
      typeof session.sessionId === 'string' &&
      typeof session.hostToken === 'string' &&
      typeof session.expiresAt === 'number' &&
      session.expiresAt > Date.now() &&
      Array.isArray(session.lanUrls) &&
      session.lanUrls.every((url) => typeof url === 'string') &&
      (session.publicUrl === undefined || typeof session.publicUrl === 'string') &&
      (session.usbUrl === undefined || typeof session.usbUrl === 'string')
    )
      return { session, path: typeof saved.path === 'string' ? saved.path : undefined };
  } catch {}
}

// The host socket belongs to the current page; pairing belongs to this browser tab.
export class HostSession {
  session?: SessionInfo;
  path?: string;
  private socket?: TrainerSocket;
  private connecting?: Promise<void>;
  private stopped = false;

  constructor(private options: HostSessionOptions) {
    const saved = readSession();
    this.session = saved?.session;
    this.path = saved?.path;
  }

  connect(renew = false): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.connecting ??= this.open(renew)
      .catch((error: unknown) => {
        if (!this.stopped) this.options.unavailable(error);
      })
      .finally(() => {
        this.connecting = undefined;
      });
    return this.connecting;
  }

  selectPath(path: string): void {
    this.path = path;
    this.save();
  }

  send(message: ClientMessage): boolean {
    return this.socket?.send(message) ?? false;
  }

  close(): void {
    this.stopped = true;
    this.socket?.close();
  }

  private save(): void {
    try {
      if (this.session)
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ session: this.session, path: this.path }),
        );
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  private async open(renew: boolean): Promise<void> {
    if (renew) {
      this.socket?.send({ type: 'revoke' });
      this.session = undefined;
      this.save();
    }
    this.socket?.close();
    this.socket = undefined;
    this.options.receive({
      type: 'connection',
      connected: false,
      ready: false,
      generation: -1,
      reason: 'Phone controls paused while connecting.',
    });
    await this.options.changed();
    if (this.stopped) return;

    if (!this.session) {
      const response = await fetch('/api/session', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Phone pairing is unavailable. Try again.');
      if (this.stopped) return;
      this.session = result as SessionInfo;
      this.save();
    }
    const session = this.session;
    this.socket = new TrainerSocket(
      { role: 'host', sessionId: session.sessionId, token: session.hostToken },
      this.options.receive,
      (reason, code) => {
        this.options.receive({
          type: 'connection',
          connected: false,
          ready: false,
          generation: -1,
          reason,
        });
        // A server restart, expired session, or duplicated tab needs its own new link.
        if (code === 4001 || code === 4003) {
          this.socket?.close();
          this.socket = undefined;
          this.session = undefined;
          this.save();
          void (this.connecting ?? Promise.resolve()).then(() => this.connect());
        }
      },
    );
    await this.options.changed(session);
  }
}
