import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || '';

function reply(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

export default async function healthHandler(_req, res) {
  if (!DATABASE_URL) {
    return reply(res, 503, { status: 'error', database: 'not_configured' });
  }

  try {
    const sql = neon(DATABASE_URL);
    await sql`SELECT 1`;
    return reply(res, 200, { status: 'ok', database: 'connected' });
  } catch {
    return reply(res, 503, { status: 'error', database: 'unavailable' });
  }
}
