import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

test('a browser reset during a pending WebSocket upgrade does not stop login', { timeout: 10000 }, async (t) => {
  const sockets = new Set();
  const upstream = http.createServer((_req, res) => res.end('login fixture'));
  upstream.on('connection', socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  const upgrading = new Promise(resolve => upstream.once('upgrade', resolve));
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    upstream.close();
  });
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const gateway = spawn(process.execPath, [fileURLToPath(new URL('./dev-gateway.mjs', import.meta.url))], {
    env: {
      ...process.env,
      GATEWAY_PORT: String(port),
      MAMMOTH_WEB_ORIGIN: `http://127.0.0.1:${upstream.address().port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => gateway.kill());
  let output = '';
  gateway.stdout.on('data', chunk => { output += chunk; });
  gateway.stderr.on('data', chunk => { output += chunk; });
  for (let i = 0; !output.includes('Gateway ready') && i < 100; i++) {
    assert.equal(gateway.exitCode, null, output);
    await setTimeout(20);
  }
  assert.match(output, /Gateway ready/);
  const browser = net.connect(port, '127.0.0.1');
  browser.on('error', () => {});
  t.after(() => browser.destroy());
  await once(browser, 'connect');
  browser.write(`GET /hmr HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`);
  await upgrading;
  browser.resetAndDestroy();
  await setTimeout(150);
  assert.equal(gateway.exitCode, null, output);
  const response = await fetch(`http://127.0.0.1:${port}/login`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'login fixture');
});
