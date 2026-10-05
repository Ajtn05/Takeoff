import { createServer, type IncomingMessage } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { SessionRelay } from './session.js';
import type { SessionInfo } from '../shared/protocol.js';
import { setupUsbForward } from './usb.js';

const sameOrigin = (req: IncomingMessage, publicOrigin?: string): boolean => {
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    return publicOrigin ? origin.origin === publicOrigin : origin.host === req.headers.host;
  } catch { return false; }
};
export async function createTrainerServer(options: { dev?: boolean; host?: string; port?: number; publicOrigin?: string; setupUsb?: typeof setupUsbForward } = {}) {
  let publicOrigin: string | undefined;
  if (options.publicOrigin) {
    const url = new URL(options.publicOrigin);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a path, credentials, query, or fragment.');
    }
    publicOrigin = url.origin;
  }
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8080;
  const relay = new SessionRelay();
  const dev = options.dev ? await (await import('vite')).createServer({
    server: { middlewareMode: true, hmr: false }, appType: 'spa',
  }) : undefined;
  const root = resolve('dist');
  let usbBusy = false;
  const server = createServer(async (req, res) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      if (!sameOrigin(req, publicOrigin)) { res.writeHead(403).end('{"error":"Invalid origin"}'); return; }
      if (pathname === '/api/health' && req.method === 'GET') { res.end('{"ok":true}'); return; }
      if (pathname === '/api/usb' && req.method === 'POST') {
        if (publicOrigin) { res.writeHead(403).end('{"error":"USB forwarding requires the trainer to run on your laptop. Use wireless pairing on this hosted app."}'); return; }
        let body = '';
        try {
          for await (const chunk of req) {
            body += chunk.toString();
            if (body.length > 1024) { res.writeHead(413).end('{"error":"Request too large"}'); return; }
          }
          const data = JSON.parse(body) as { sessionId?: unknown };
          const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
          if (typeof data?.sessionId !== 'string' || !relay.authenticatedHost(data.sessionId, token)) {
            res.writeHead(403).end('{"error":"Open the simulator before setting up USB."}'); return;
          }
        } catch { res.writeHead(400).end('{"error":"Invalid request"}'); return; }
        if (usbBusy) { res.writeHead(409).end('{"error":"USB setup is already running."}'); return; }
        usbBusy = true;
        try {
          const actualPort = (server.address() as { port: number }).port;
          res.end(JSON.stringify(await (options.setupUsb ?? setupUsbForward)(actualPort)));
        } catch { res.writeHead(500).end('{"error":"USB setup failed. Try again."}'); }
        finally { usbBusy = false; }
        return;
      }
      if (pathname === '/api/session' && req.method === 'POST') {
        relay.checkTimeouts();
        if (relay.sessions.size >= 32) { res.writeHead(429).end('{"error":"All practice stations are in use. Try again shortly."}'); return; }
        const s = relay.create(); const actualPort = (server.address() as { port: number }).port;
        const fragment = `#session=${s.id}&token=${s.joinToken}`;
        if (publicOrigin) {
          const info: SessionInfo = { sessionId: s.id, hostToken: s.hostToken, publicUrl: `${publicOrigin}/controller${fragment}`, lanUrls: [], expiresAt: s.expiresAt };
          res.end(JSON.stringify(info)); return;
        }
        const link = (address: string) => `http://${address}:${actualPort}/controller${fragment}`;
        const ips = [...new Set(Object.values(networkInterfaces()).flatMap((entries) =>
          entries?.filter((entry) => entry.family === 'IPv4' && !entry.internal).map((entry) => entry.address) ?? []))];
        const lanUrls = host === '0.0.0.0' ? ips.map(link) : host !== '127.0.0.1' && host !== 'localhost' ? [link(host)] : [];
        res.end(JSON.stringify({ sessionId: s.id, hostToken: s.hostToken, usbUrl: link('127.0.0.1'), lanUrls, expiresAt: s.expiresAt })); return;
      }
      res.writeHead(404).end('{"error":"Not found"}'); return;
    }
    if (dev) { dev.middlewares(req, res); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    try {
      const decoded = decodeURIComponent(pathname);
      const file = decoded === '/' || decoded === '/controller' ? resolve(root, 'index.html') : resolve(root, `.${decoded}`);
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
      res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404).end('Not found. Run npm run build before npm start.'); }
  });
  const ws = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  ws.on('connection', (socket) => relay.attach(socket));
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !sameOrigin(req, publicOrigin)) { socket.destroy(); return; }
    ws.handleUpgrade(req, socket, head, (connection) => ws.emit('connection', connection, req));
  });
  await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(port, host, accept); });
  return { server, relay, close: async () => {
    relay.close(); ws.close(); await dev?.close();
    await new Promise<void>((accept) => server.close(() => accept()));
  } };
}
