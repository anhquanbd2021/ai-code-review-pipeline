import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { review, summarize } from './index.js';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const APP_DIR = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const APP_MODULES = ['index.js', 'agent.js', 'pipeline.js', 'rules.js', 'fixture.js', 'tokens.js'];

const STATIC_FILES = new Map([
  ['/', ['text/html; charset=utf-8', 'index.html']],
  ['/index.html', ['text/html; charset=utf-8', 'index.html']],
  ['/tokens.css', ['text/css; charset=utf-8', 'tokens.css']],
  ['/app.js', ['text/javascript; charset=utf-8', 'app.js']],
].map(([path, [type, file]]) => [
  path,
  [type, readFileSync(join(PUBLIC, file))],
]));
for (const m of APP_MODULES) {
  STATIC_FILES.set(`/app/${m}`, [
    'text/javascript; charset=utf-8',
    readFileSync(join(APP_DIR, m)),
  ]);
}

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function reviewPayload() {
  const r = review();
  return {
    agent: r.agent,
    pipeline: r.pipeline,
    summary: summarize(r),
  };
}

export function createStaticServer() {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end('ok');
      return;
    }
    if (url.pathname === '/api/review') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' })
        .end(JSON.stringify(reviewPayload()));
      return;
    }
    if (url.pathname === '/version') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({
          name: PACKAGE.name,
          version: PACKAGE.version,
          commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
        }));
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const asset = STATIC_FILES.get(url.pathname);
      if (asset) {
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          'cache-control': 'public, max-age=300',
          'content-type': asset[0],
        }).end(req.method === 'HEAD' ? undefined : asset[1]);
        return;
      }
    }
    res.writeHead(404, SECURITY_HEADERS).end('not found');
  });
}

export async function startProduction({ port = Number(process.env.PORT) || 3000 } = {}) {
  const server = createStaticServer();
  server.listen(port, '0.0.0.0');
  await once(server, 'listening');
  const close = () => new Promise((resolve) => server.close(resolve));
  return { server, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { server, close } = await startProduction();
  console.log(`AI Code Review Lab listening on ${server.address().port}`);
  const shutdown = async () => { await close(); process.exit(0); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}