import test from 'node:test';
import assert from 'node:assert/strict';

import { createStaticServer } from '../app/server.js';
import { once } from 'node:events';

async function listen() {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

test('/health returns ok, /version returns package meta', async () => {
  const server = await listen();
  const port = server.address().port;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');
    const version = await fetch(`http://127.0.0.1:${port}/version`);
    assert.equal(version.status, 200);
    const meta = await version.json();
    assert.equal(meta.name, 'ai-code-review-pipeline-demo');
  } finally {
    server.close();
  }
});

test('/api/review returns the shared review payload', async () => {
  const server = await listen();
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/review`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pipeline.findings.length, 4);
    assert.equal(body.agent.missed.length, 2);
    assert.ok(body.summary.tokenRatio >= 5);
  } finally {
    server.close();
  }
});

test('allowlisted files serve; everything else 404s', async () => {
  const server = await listen();
  const port = server.address().port;
  try {
    for (const path of ['/', '/index.html', '/tokens.css', '/app.js', '/app/index.js', '/app/pipeline.js']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(res.status, 200, path);
    }
    for (const path of ['/package.json', '/../server.js', '/nope']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(res.status, 404, path);
    }
  } finally {
    server.close();
  }
});