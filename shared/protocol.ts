export const INPUT_TIMEOUT_MS = 250;
export const HOST_TIMEOUT_MS = 700;
export const MAX_QUEUE_BYTES = 16_384;
export const PROTOCOL_VERSION = 1;

export interface Controls { climb: number; yaw: number; forward: number; right: number; gimbal: number }
export const neutralControls = (): Controls => ({ climb: 0, yaw: 0, forward: 0, right: 0, gimbal: 0 });
export const isNeutral = (c: Controls): boolean => Object.values(c).every((v) => v === 0);
export type Action = 'takeoff' | 'land' | 'capture' | 'resume';
export interface Telemetry {
  altitude: number; heading: number; speed: number; gimbal: number;
  mode: 'grounded' | 'taking-off' | 'flying' | 'landing' | 'collided';
  paused: boolean; reason: string; captures: number;
  receiptToFrameMs: number; lastInputSeq: number;
}
export type ClientMessage =
  | { type: 'hello'; role: 'host' | 'controller'; sessionId: string; token: string; version: number }
  | { type: 'resume'; generation: number; controls: Controls }
  | { type: 'input'; generation: number; seq: number; controls: Controls }
  | { type: 'action'; generation: number; id: string; action: Action }
  | { type: 'ack'; generation: number; id: string; ok: boolean; message: string }
  | { type: 'status'; status: Telemetry }
  | { type: 'suspend'; reason: string }
  | { type: 'revoke' }
  | { type: 'ping'; id: number };
export type ServerMessage =
  | { type: 'welcome'; generation: number; role: 'host' | 'controller' }
  | { type: 'connection'; generation: number; connected: boolean; ready: boolean; reason: string }
  | { type: 'input'; generation: number; seq: number; controls: Controls }
  | { type: 'action'; generation: number; id: string; action: Action }
  | { type: 'ack'; generation: number; id: string; ok: boolean; message: string }
  | { type: 'status'; status: Telemetry }
  | { type: 'error'; message: string }
  | { type: 'pong'; id: number };
export interface SessionInfo { sessionId: string; hostToken: string; publicUrl?: string; usbUrl?: string; lanUrls: string[]; expiresAt: number }

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sequence = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const shortString = (v: unknown, max = 160): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
export function validControls(v: unknown): v is Controls {
  return record(v) && ['climb', 'yaw', 'forward', 'right', 'gimbal'].every((k) =>
    typeof v[k] === 'number' && Number.isFinite(v[k]) && Math.abs(v[k] as number) <= 1);
}
export function validTelemetry(v: unknown): v is Telemetry {
  return record(v) && ['altitude', 'heading', 'speed', 'gimbal', 'captures', 'receiptToFrameMs', 'lastInputSeq'].every((k) =>
    typeof v[k] === 'number' && Number.isFinite(v[k])) && typeof v.paused === 'boolean' &&
    typeof v.reason === 'string' && v.reason.length <= 160 &&
    ['grounded', 'taking-off', 'flying', 'landing', 'collided'].includes(v.mode as string);
}
export function parseClientMessage(raw: string): ClientMessage | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!record(v)) return null;
  switch (v.type) {
    case 'hello': return ['host', 'controller'].includes(v.role as string) && shortString(v.sessionId, 64) && shortString(v.token, 128) && v.version === PROTOCOL_VERSION ? v as ClientMessage : null;
    case 'resume': return sequence(v.generation) && validControls(v.controls) && isNeutral(v.controls) ? v as ClientMessage : null;
    case 'input': return sequence(v.generation) && sequence(v.seq) && validControls(v.controls) ? v as ClientMessage : null;
    case 'action': return sequence(v.generation) && shortString(v.id, 64) && /^[a-zA-Z0-9_-]+$/.test(v.id) && ['takeoff', 'land', 'capture', 'resume'].includes(v.action as string) ? v as ClientMessage : null;
    case 'ack': return sequence(v.generation) && shortString(v.id, 64) && typeof v.ok === 'boolean' && shortString(v.message) ? v as ClientMessage : null;
    case 'status': return validTelemetry(v.status) ? v as ClientMessage : null;
    case 'suspend': return shortString(v.reason) ? v as ClientMessage : null;
    case 'revoke': return v as ClientMessage;
    case 'ping': return sequence(v.id) ? v as ClientMessage : null;
    default: return null;
  }
}
