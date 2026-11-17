// Tiny static file server for local development of the SANDLINE game.
//
// Run it from the repo root with `node serve.ts` (or `node serve.ts --port
// 8901`) and open http://localhost:8080. It serves the game/ directory and
// nothing else: any request that would escape game/ is refused, and nothing
// is cached, so edits show up on the next reload.
//
// This is a dev convenience, not a production server: it binds loopback
// only, has no directory listings, no range support and no compression.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, stat } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DIR = resolve(fileURLToPath(new URL('./game/', import.meta.url)));
const DEFAULT_PORT = 8080;

// Content type by extension. Text types carry an explicit UTF-8 charset;
// anything unlisted is served as a generic binary download.
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function pickPort(argv: string[]): number {
  const at = argv.indexOf('--port');
  if (at < 0 || at + 1 >= argv.length) return DEFAULT_PORT;
  const n = Number.parseInt(argv[at + 1], 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return DEFAULT_PORT;
  return n;
}

function fail(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(message);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Only the path part of the URL matters here; a bare host never reaches us.
  const raw = req.url ?? '/';
  const pathOnly = raw.split('?')[0].split('#')[0];

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    fail(res, 400, 'bad request');
    return;
  }

  // A trailing slash means "the index page of this folder".
  const relPath = decoded.endsWith('/') ? `${decoded}index.html` : decoded;

  // Resolve inside game/ and refuse anything that climbs out of it.
  const target = resolve(join(GAME_DIR, relPath));
  if (target !== GAME_DIR && !target.startsWith(GAME_DIR + sep)) {
    fail(res, 403, 'forbidden');
    return;
  }

  let info;
  try {
    info = await new Promise<{ isFile: boolean; size: number }>((done, nope) => {
      stat(target, (err, st) => {
        if (err) return nope(err);
        done({ isFile: st.isFile(), size: st.size });
      });
    });
  } catch {
    fail(res, 404, 'not found');
    return;
  }
  if (!info.isFile) {
    fail(res, 404, 'not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store',
  });
  createReadStream(target).pipe(res);
}

const port = pickPort(process.argv.slice(2));
const server = createServer((req, res) => {
  void handle(req, res).catch(() => {
    if (!res.headersSent) fail(res, 500, 'internal error');
    else res.destroy();
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${port}`);
});
