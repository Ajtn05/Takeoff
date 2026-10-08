export const INPUT_TIMEOUT_MS = 250;
// Stop applying stale stick positions quickly, but tolerate a brief network delay.
export const CONTROLLER_TIMEOUT_MS = 2000;
export const HOST_TIMEOUT_MS = 3000;
export const MAX_QUEUE_BYTES = 16_384;
export const PROTOCOL_VERSION = 1;

export interface Controls {
  climb: number;
  yaw: number;
  forward: number;
  right: number;
  gimbal: number;
}
export const neutralControls = (): Controls => ({
  climb: 0,
  yaw: 0,
  forward: 0,
  right: 0,
  gimbal: 0,
});
export const isNeutral = (controls: Controls): boolean =>
  Object.values(controls).every((value) => value === 0);
export type Action = 'takeoff' | 'land' | 'capture' | 'resume';
export interface Telemetry {
  altitude: number;
  heading: number;
  speed: number;
  gimbal: number;
  mode: 'grounded' | 'taking-off' | 'flying' | 'landing' | 'collided';
  paused: boolean;
  reason: string;
  captures: number;
  receiptToFrameMs: number;
  lastInputSeq: number;
}
export type ClientMessage =
  | {
      type: 'hello';
      role: 'host' | 'controller';
      sessionId: string;
      token: string;
      version: number;
    }
  | { type: 'resume'; generation: number; controls: Controls }
  | { type: 'input'; generation: number; seq: number; controls: Controls }
  | { type: 'action'; generation: number; id: string; action: Action }
  | { type: 'ack'; generation: number; id: string; ok: boolean; message: string }
  | { type: 'status'; status: Telemetry }
  | { type: 'suspend'; reason: string; recoverable?: boolean }
  | { type: 'revoke' }
  | { type: 'ping'; id: number };
export type ServerMessage =
  | { type: 'welcome'; generation: number; role: 'host' | 'controller' }
  | {
      type: 'connection';
      generation: number;
      connected: boolean;
      ready: boolean;
      reason: string;
      recoverable?: boolean;
    }
  | { type: 'input'; generation: number; seq: number; controls: Controls }
  | { type: 'action'; generation: number; id: string; action: Action }
  | { type: 'ack'; generation: number; id: string; ok: boolean; message: string }
  | { type: 'status'; status: Telemetry }
  | { type: 'error'; message: string }
  | { type: 'pong'; id: number };
export interface SessionInfo {
  sessionId: string;
  hostToken: string;
  publicUrl?: string;
  usbUrl?: string;
  lanUrls: string[];
  expiresAt: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isSequence = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const isShortString = (value: unknown, max = 160): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
export function validControls(value: unknown): value is Controls {
  return (
    isRecord(value) &&
    ['climb', 'yaw', 'forward', 'right', 'gimbal'].every(
      (key) =>
        typeof value[key] === 'number' &&
        Number.isFinite(value[key]) &&
        Math.abs(value[key] as number) <= 1,
    )
  );
}
export function validTelemetry(value: unknown): value is Telemetry {
  return (
    isRecord(value) &&
    [
      'altitude',
      'heading',
      'speed',
      'gimbal',
      'captures',
      'receiptToFrameMs',
      'lastInputSeq',
    ].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key])) &&
    typeof value.paused === 'boolean' &&
    typeof value.reason === 'string' &&
    value.reason.length <= 160 &&
    ['grounded', 'taking-off', 'flying', 'landing', 'collided'].includes(value.mode as string)
  );
}
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'hello':
      return ['host', 'controller'].includes(value.role as string) &&
        isShortString(value.sessionId, 64) &&
        isShortString(value.token, 128) &&
        value.version === PROTOCOL_VERSION
        ? (value as ClientMessage)
        : null;
    case 'resume':
      return isSequence(value.generation) &&
        validControls(value.controls) &&
        isNeutral(value.controls)
        ? (value as ClientMessage)
        : null;
    case 'input':
      return isSequence(value.generation) && isSequence(value.seq) && validControls(value.controls)
        ? (value as ClientMessage)
        : null;
    case 'action':
      return isSequence(value.generation) &&
        isShortString(value.id, 64) &&
        /^[a-zA-Z0-9_-]+$/.test(value.id) &&
        ['takeoff', 'land', 'capture', 'resume'].includes(value.action as string)
        ? (value as ClientMessage)
        : null;
    case 'ack':
      return isSequence(value.generation) &&
        isShortString(value.id, 64) &&
        typeof value.ok === 'boolean' &&
        isShortString(value.message)
        ? (value as ClientMessage)
        : null;
    case 'status':
      return validTelemetry(value.status) ? (value as ClientMessage) : null;
    case 'suspend':
      return isShortString(value.reason) &&
        (value.recoverable === undefined || typeof value.recoverable === 'boolean')
        ? (value as ClientMessage)
        : null;
    case 'revoke':
      return value as ClientMessage;
    case 'ping':
      return isSequence(value.id) ? (value as ClientMessage) : null;
    default:
      return null;
  }
}
