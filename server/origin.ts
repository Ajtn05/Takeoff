import type { IncomingMessage } from 'node:http';

export const sameOrigin = (req: IncomingMessage, publicOrigin?: string): boolean => {
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    return publicOrigin ? origin.origin === publicOrigin : origin.host === req.headers.host;
  } catch {
    return false;
  }
};

export function parsePublicOrigin(value?: string): string | undefined {
  if (value) {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'PUBLIC_ORIGIN must be an HTTPS origin without a path, credentials, query, or fragment.',
      );
    }
    return url.origin;
  }
}
