import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import httpProxy from 'http-proxy';
import os from 'node:os';

const PORT = Number(process.env.GATEWAY_PORT || 5201);
const WEB = process.env.MAMMOTH_WEB_ORIGIN || 'http://127.0.0.1:5202';
const CONSOLE_API = process.env.MAMMOTH_API_ORIGIN || 'http://127.0.0.1:3100';
// 终端 Web 页面（mammoth-agent 的 mmp web，默认 :3080），挂在 /agent 前缀下
const AGENT_WEB = process.env.MAMMOTH_AGENT_WEB || 'http://127.0.0.1:3080';
const DOWNLOADS_DIR =
  process.env.MAMMOTH_DOWNLOADS_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../downloads');
const CLIENT_DOWNLOAD_REDIRECTS = {
  '/downloads/mammoth-agent.dmg': '/downloads/mammoth-agent-mac-arm64.dmg',
  '/downloads/mammoth-agent-x86_64.dmg': '/downloads/mammoth-agent-mac-x64.dmg',
  '/downloads/mammoth-agent.exe': '/downloads/mammoth-agent-win.exe',
};

const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });

// http-proxy installs its client error listener only after the upstream upgrade.
proxy.on('proxyReqWs', (proxyReq, _req, socket) => {
  socket.on('error', (error) => {
    console.warn(`[gateway] WebSocket 连接中断：${error.code || error.message}`);
    proxyReq.destroy();
    socket.destroy();
  });
  socket.once('close', () => proxyReq.destroy());
});

function pathOf(url) {
  return (url || '/').split('?')[0];
}

function queryOf(url) {
  const i = (url || '').indexOf('?');
  return i >= 0 ? url.slice(i) : '';
}

function targetOf(url) {
  const path = pathOf(url);
  // 终端 Web（含其相对路径的 /agent/api/* 与静态资源）→ mmp web，剥掉 /agent 前缀
  if (path === '/agent' || path.startsWith('/agent/')) {
    return {
      target: AGENT_WEB,
      name: `mmp web ${AGENT_WEB}`,
      rewrite: (u) => u.replace(/^\/agent(?=\/|$)/, '') || '/',
    };
  }
  if (path === '/admin/api' || path.startsWith('/admin/api/')) {
    return {
      target: CONSOLE_API,
      name: `dev:api ${CONSOLE_API}`,
      rewrite: (u) => u.replace(/^\/admin\/api/, '/api/admin'),
    };
  }
  if (
    path.startsWith('/console/api/') ||
    path === '/console/api' ||
    path.startsWith('/middle/api/') ||
    path === '/middle/api'
  ) {
    const apiPrefix = path.startsWith('/middle') ? '/middle/api' : '/console/api';
    return {
      target: CONSOLE_API,
      name: `dev:api ${CONSOLE_API}`,
      apiPrefix,
      rewrite: (u) => u.replace(/^\/(console|middle)\/api/, '/api'),
    };
  }
  // 支付回调与中台 /api（OIDC 等）走 Nest；Octop :8088 / :5203 已废弃
  if (
    path === '/api' ||
    path.startsWith('/api/') ||
    path === '/api/pay' ||
    path.startsWith('/api/pay/')
  ) {
    return { target: CONSOLE_API, name: `dev:api ${CONSOLE_API}` };
  }
  return { target: WEB, name: `dev:web ${WEB}` };
}

proxy.on('error', (err, req, res) => {
  const url = req?.url || '';
  const where = req?.gwTargetName || targetOf(url)?.name || 'unknown';
  console.error(`[gateway] ${url} → ${where}  ${err.message}`);
  if (res && !res.headersSent && 'writeHead' in res) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`502  ${where} 没起来或挂了\n${err.message}\n`);
  }
});

function serveClientDownload(req, res, pathname) {
  const redirect = CLIENT_DOWNLOAD_REDIRECTS[pathname];
  if (redirect) {
    res.writeHead(302, { Location: redirect });
    res.end();
    return true;
  }
  if (!pathname.startsWith('/downloads/mammoth-agent')) return false;
  const name = path.basename(pathname);
  if (!/^mammoth-agent[\w.-]+$/.test(name)) {
    res.writeHead(404);
    res.end();
    return true;
  }
  const file = path.join(DOWNLOADS_DIR, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`404  没有安装包 ${name}\n放到 ${DOWNLOADS_DIR}/\n`);
    return true;
  }
  const stat = fs.statSync(file);
  const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  const cacheHeaders = {
    'Cache-Control': 'no-cache',
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, cacheHeaders);
    res.end();
    return true;
  }
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Content-Length': stat.size,
    ...cacheHeaders,
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

function applyProxy(req, hit) {
  req.gwTargetName = hit.name;
  if (hit.apiPrefix) {
    req.headers['x-mammoth-public-api'] = hit.apiPrefix;
  }
  if (hit.rewrite) req.url = hit.rewrite(req.url || '/');
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  const path = pathOf(url);
  const qs = queryOf(url);
  if (path === '/') {
    res.writeHead(302, { Location: '/console' });
    res.end();
    return;
  }
  // 终端 Web 页面：/agent/* → mmp web（剥前缀），不再 302 到 /console
  if (
    path === '/middle/login' ||
    path.startsWith('/middle/login/') ||
    path === '/console/login' ||
    path.startsWith('/console/login/')
  ) {
    res.writeHead(302, { Location: `/login${qs}` });
    res.end();
    return;
  }
  if (
    (path === '/middle' || path === '/middle/' || path.startsWith('/middle/')) &&
    !path.startsWith('/middle/api')
  ) {
    const rest = path === '/middle' || path === '/middle/' ? '/' : path.slice('/middle'.length);
    res.writeHead(302, { Location: `/console${rest}${qs}` });
    res.end();
    return;
  }
  if (serveClientDownload(req, res, path)) return;
  const hit = targetOf(url);
  applyProxy(req, hit);
  proxy.web(req, res, { target: hit.target });
});

server.on('upgrade', (req, socket, head) => {
  const url = req.url || '/';
  const hit = targetOf(url);
  applyProxy(req, hit);
  proxy.ws(req, socket, head, { target: hit.target });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (i.family === 'IPv4' && !i.internal) nets.push(`http://${i.address}:${PORT}`);
    }
  }
  console.log('');
  console.log(`[gw] ━━━━━━━━━ Gateway ready ━━━━━━━━━`);
  console.log(`[gw] Local:   http://127.0.0.1:${PORT}   ← 浏览器只开这个`);
  for (const u of nets) console.log(`[gw] Network: ${u}`);
  console.log(`[gw]   /login /console /admin /agent`);
  console.log(`[gw] web→${WEB}  api→${CONSOLE_API}  agent→${AGENT_WEB}`);
  console.log(`[gw] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('');
});
