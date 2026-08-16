import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

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

function database() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(DATABASE_URL);
}

async function getCompanies() {
  const sql = database();
  return sql`
    SELECT
      id,
      name,
      category,
      public_state,
      commercialised,
      what_it_needs_to_qualify,
      notes,
      website,
      country,
      last_reviewed,
      methodology_version,
      publishable,
      evidence_summary,
      updated_at
    FROM public.public_companies
    ORDER BY
      CASE public_state WHEN 'Main' THEN 0 WHEN 'Pending' THEN 1 ELSE 2 END,
      name ASC
  `;
}

async function handleApi(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (pathname === '/healthz') {
    try {
      const sql = database();
      await sql`SELECT 1 AS ok`;
      sendJson(res, 200, { status: 'ok', database: 'connected' });
    } catch (error) {
      console.error('Health check failed:', error instanceof Error ? error.message : error);
      sendJson(res, 503, { status: 'error', database: 'unavailable' });
    }
    return;
  }

  if (pathname === '/api/companies') {
    try {
      const companies = await getCompanies();
      sendJson(res, 200, {
        companies,
        source: 'Neon public.public_companies',
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Company query failed:', error instanceof Error ? error.message : error);
      sendJson(res, 502, { error: 'database_unavailable' });
    }
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
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
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      ...securityHeaders,
      'Cache-Control': requested === '/index.html' ? 'no-cache' : 'public, max-age=3600',
      'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
      'Content-Length': info.size,
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: 'not_found' });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/healthz' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, url.pathname);
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
