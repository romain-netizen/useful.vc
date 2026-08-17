import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRequest, securityHeaders } from './directory-api.js';

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function sendResponse(req, res, response) {
  const headers = Object.fromEntries(response.headers.entries());
  res.writeHead(response.status, headers);
  if (req.method === 'HEAD' || !response.body) {
    res.end();
    return;
  }
  res.end(Buffer.from(await response.arrayBuffer()));
}

function isApplicationRoute(pathname) {
  return pathname === '/'
    || pathname === '/countries'
    || /^\/countries\/[^/]+\/?$/.test(pathname)
    || pathname === '/investors'
    || /^\/investors\/[^/]+\/?$/.test(pathname)
    || pathname === '/vcs'
    || /^\/vcs\/[^/]+\/?$/.test(pathname);
}

async function sendFile(req, res, filePath, cacheControl) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('not a file');
  res.writeHead(200, {
    ...securityHeaders,
    'Cache-Control': cacheControl,
    'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
    'Content-Length': info.size,
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(filePath).pipe(res);
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }

  try {
    await sendFile(req, res, filePath, 'no-cache');
  } catch {
    if (isApplicationRoute(pathname)) {
      await sendFile(req, res, join(PUBLIC_DIR, 'index.html'), 'no-cache');
      return;
    }
    sendJson(res, 404, { error: 'not_found' });
  }
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (requestUrl.pathname === '/healthz' || requestUrl.pathname.startsWith('/api/')) {
      const request = new Request(requestUrl, { method: req.method });
      await sendResponse(req, res, await handleApiRequest(request, DATABASE_URL));
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, requestUrl.pathname);
    } else {
      sendJson(res, 405, { error: 'method_not_allowed' });
    }
  } catch (error) {
    console.error('Unhandled request error:', error);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal_server_error' });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`useful.vc listening on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

