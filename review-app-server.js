import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { handleReviewApi } from './review-server.js';

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
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

async function sendFile(req, res, relativePath) {
  const filePath = join(PUBLIC_DIR, relativePath);
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('not_file');
  res.writeHead(200, {
    ...securityHeaders,
    'Cache-Control': 'no-cache',
    'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
    'Content-Length': info.size,
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(filePath).pipe(res);
}

async function health(res) {
  if (!DATABASE_URL) return sendJson(res, 503, { status: 'error', database: 'not_configured' });
  try {
    const sql = neon(DATABASE_URL);
    await sql`SELECT 1`;
    sendJson(res, 200, { status: 'ok', database: 'connected' });
  } catch {
    sendJson(res, 503, { status: 'error', database: 'unavailable' });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/healthz') return await health(res);
    if (url.pathname.startsWith('/api/review/')) return await handleReviewApi(req, res, url.pathname);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'method_not_allowed' });
    }

    if (url.pathname === '/' || url.pathname === '/review' || url.pathname === '/review.html') {
      return await sendFile(req, res, 'review.html');
    }
    if (url.pathname === '/review.js') return await sendFile(req, res, 'review.js');
    if (url.pathname === '/review.css') return await sendFile(req, res, 'review.css');
    sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('Review server error:', error instanceof Error ? error.message : error);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal_server_error' });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`useful.vc secondary review listening on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
