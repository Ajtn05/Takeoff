import { networkInterfaces } from 'node:os';
import type { SessionInfo } from '../shared/protocol.js';
import type { Session } from './session.js';

export function createPairingInfo(
  session: Session,
  host: string,
  port: number,
  publicOrigin?: string,
): SessionInfo {
  const fragment = `#session=${session.id}&token=${session.joinToken}`;
  if (publicOrigin) {
    const info: SessionInfo = {
      sessionId: session.id,
      hostToken: session.hostToken,
      publicUrl: `${publicOrigin}/controller${fragment}`,
      lanUrls: [],
      expiresAt: session.expiresAt,
    };
    return info;
  }
  const link = (address: string) => `http://${address}:${port}/controller${fragment}`;
  const ips = [
    ...new Set(
      Object.values(networkInterfaces()).flatMap(
        (entries) =>
          entries
            ?.filter((entry) => entry.family === 'IPv4' && !entry.internal)
            .map((entry) => entry.address) ?? [],
      ),
    ),
  ];
  const lanUrls =
    host === '0.0.0.0'
      ? ips.map(link)
      : host !== '127.0.0.1' && host !== 'localhost'
        ? [link(host)]
        : [];
  return {
    sessionId: session.id,
    hostToken: session.hostToken,
    usbUrl: link('127.0.0.1'),
    lanUrls,
    expiresAt: session.expiresAt,
  };
}
