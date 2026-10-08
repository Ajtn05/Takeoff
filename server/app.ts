import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { SessionRelay } from './session.js';
import { createPairingInfo } from './pairing-info.js';
import { parsePublicOrigin, sameOrigin } from './origin.js';
import { serveStaticFiles } from './static-files.js';
import { setupUsbForward } from './usb.js';

export interface TrainerServerOptions {
  dev?: boolean;
  host?: string;
  port?: number;
  publicOrigin?: string;
  setupUsb?: typeof setupUsbForward;
}

export async function createTrainerServer(options: TrainerServerOptions = {}) {
  const publicOrigin = parsePublicOrigin(options.publicOrigin);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8080;
  const relay = new SessionRelay();
  const dev = options.dev
    ? await (
        await import('vite')
      ).createServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa',
      })
    : undefined;
  const root = resolve('dist');
  let usbBusy = false;
  const server = createServer(async (req, res) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (!sameOrigin(req, publicOrigin)) {
        res.writeHead(403).end('{"error":"Invalid origin"}');
        return;
      }
      if (pathname === '/api/health' && req.method === 'GET') {
        res.end('{"ok":true}');
        return;
      }
      if (pathname === '/api/usb' && req.method === 'POST') {
        if (publicOrigin) {
          res
            .writeHead(403)
            .end(
              '{"error":"USB forwarding requires the trainer to run on your laptop. Use wireless pairing on this hosted app."}',
            );
          return;
        }
        let body = '';
        try {
          for await (const chunk of req) {
            body += chunk.toString();
            if (body.length > 1024) {
              res.writeHead(413).end('{"error":"Request too large"}');
              return;
            }
          }
          const data = JSON.parse(body) as { sessionId?: unknown };
          const token = req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.slice(7)
            : '';
          if (
            typeof data?.sessionId !== 'string' ||
            !relay.authenticatedHost(data.sessionId, token)
          ) {
            res.writeHead(403).end('{"error":"Open the simulator before setting up USB."}');
            return;
          }
        } catch {
          res.writeHead(400).end('{"error":"Invalid request"}');
          return;
        }
        if (usbBusy) {
          res.writeHead(409).end('{"error":"USB setup is already running."}');
          return;
        }
        usbBusy = true;
        try {
          const actualPort = (server.address() as { port: number }).port;
          res.end(JSON.stringify(await (options.setupUsb ?? setupUsbForward)(actualPort)));
        } catch {
          res.writeHead(500).end('{"error":"USB setup failed. Try again."}');
        } finally {
          usbBusy = false;
        }
        return;
      }
      if (pathname === '/api/session' && req.method === 'POST') {
        relay.checkTimeouts();
        if (relay.sessions.size >= 32) {
          res
            .writeHead(429)
            .end('{"error":"All practice stations are in use. Try again shortly."}');
          return;
        }
        const session = relay.create();
        const actualPort = (server.address() as { port: number }).port;
        res.end(JSON.stringify(createPairingInfo(session, host, actualPort, publicOrigin)));
        return;
      }
      res.writeHead(404).end('{"error":"Not found"}');
      return;
    }
    if (dev) {
      dev.middlewares(req, res);
      return;
    }
    await serveStaticFiles(req, res, pathname, root);
  });
  const ws = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  ws.on('connection', (socket) => relay.attach(socket));
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !sameOrigin(req, publicOrigin)) {
      socket.destroy();
      return;
    }
    ws.handleUpgrade(req, socket, head, (connection) => ws.emit('connection', connection, req));
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(port, host, accept);
  });
  return {
    server,
    relay,
    close: async () => {
      relay.close();
      ws.close();
      await dev?.close();
      await new Promise<void>((accept) => server.close(() => accept()));
    },
  };
}
