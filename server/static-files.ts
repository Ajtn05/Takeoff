import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export async function serveStaticFiles(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  root: string,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  try {
    const decoded = decodeURIComponent(pathname);
    const file = ['/', '/controller', '/practice', '/game'].includes(decoded)
      ? resolve(root, 'index.html')
      : resolve(root, `.${decoded}`);
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.setHeader('Content-Type', MIME_TYPES[extname(file)] ?? 'application/octet-stream');
    res.setHeader(
      'Cache-Control',
      file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Not found. Run npm run build before npm start.');
  }
}
