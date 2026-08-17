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

function slugify(value) {
  return String(value || '')
    .replace(/²/g, '-2')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function decorateCompanies(companies) {
  return companies.map((company) => ({
    ...company,
    vc_funds: Array.isArray(company.vc_funds)
      ? company.vc_funds.map((fund) => ({ ...fund, slug: slugify(fund.name) }))
      : [],
  }));
}

async function getCompanies() {
  const sql = database();
  const companies = await sql`
    SELECT
      pc.id,
      pc.name,
      pc.category,
      pc.public_state,
      pc.commercialised,
      pc.what_it_needs_to_qualify,
      pc.notes,
      pc.website,
      pc.country,
      pc.last_reviewed,
      pc.methodology_version,
      pc.publishable,
      pc.evidence_summary,
      pc.updated_at,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object('id', v.id, 'name', v.name)
            ORDER BY v.name
          )
          FROM public.company_vc_sources AS cvs
          JOIN public.vc_funds AS v ON v.id = cvs.vc_fund_id
          WHERE cvs.company_id = pc.id
            AND v.name IN ('Racine²', 'Singular', 'Wind', 'Shift4Good', 'Teampact Ventures')
        ),
        '[]'::jsonb
      ) AS vc_funds
    FROM public.public_companies AS pc
    ORDER BY
      CASE pc.public_state WHEN 'Main' THEN 0 WHEN 'Pending' THEN 1 ELSE 2 END,
      pc.name ASC
  `;
  return decorateCompanies(companies);
}

function buildCountries(companies) {
  const countries = new Map();

  for (const company of companies) {
    const name = typeof company.country === 'string' ? company.country.trim() : '';
    if (!name) continue;
    if (!countries.has(name)) {
      countries.set(name, {
        name,
        slug: slugify(name),
        company_count: 0,
        main_count: 0,
        pending_count: 0,
        categories: new Set(),
      });
    }
    const country = countries.get(name);
    country.company_count += 1;
    if (company.public_state === 'Main') country.main_count += 1;
    if (company.public_state === 'Pending') country.pending_count += 1;
    if (company.category) country.categories.add(company.category);
  }

  return [...countries.values()]
    .map((country) => ({ ...country, categories: [...country.categories].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getVcFunds() {
  const sql = database();
  const funds = await sql`
    SELECT
      v.id,
      v.name,
      v.country,
      v.status,
      v.notes,
      v.website,
      v.france_qualification,
      v.fund_type,
      v.portfolio_url,
      v.priority,
      v.portfolio_companies_found,
      v.companies_processed,
      v.unique_new_companies,
      v.last_scanned,
      v.completed_at,
      COUNT(DISTINCT pc.id)::integer AS company_count,
      COUNT(DISTINCT pc.id) FILTER (WHERE pc.public_state = 'Main')::integer AS main_count,
      COUNT(DISTINCT pc.id) FILTER (WHERE pc.public_state = 'Pending')::integer AS pending_count
    FROM public.vc_funds AS v
    LEFT JOIN public.company_vc_sources AS cvs ON cvs.vc_fund_id = v.id
    LEFT JOIN public.public_companies AS pc ON pc.id = cvs.company_id
    WHERE v.name IN ('Racine²', 'Singular', 'Wind', 'Shift4Good', 'Teampact Ventures')
    GROUP BY v.id
    ORDER BY
      CASE v.name
        WHEN 'Racine²' THEN 1
        WHEN 'Singular' THEN 2
        WHEN 'Wind' THEN 3
        WHEN 'Shift4Good' THEN 4
        WHEN 'Teampact Ventures' THEN 5
        ELSE 6
      END,
      v.name ASC
  `;

  return funds.map((fund) => ({
    ...fund,
    slug: slugify(fund.name),
    company_count: asNumber(fund.company_count),
    main_count: asNumber(fund.main_count),
    pending_count: asNumber(fund.pending_count),
  }));
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

  if (pathname === '/api/countries' || pathname.startsWith('/api/countries/')) {
    try {
      const companies = await getCompanies();
      const countries = buildCountries(companies);
      if (pathname === '/api/countries') {
        sendJson(res, 200, {
          countries,
          company_count: countries.reduce((total, country) => total + country.company_count, 0),
          source: 'Neon public.public_companies',
          generatedAt: new Date().toISOString(),
        });
        return;
      }
      const requestedSlug = decodeURIComponent(pathname.slice('/api/countries/'.length)).replace(/\/$/, '');
      const country = countries.find((item) => item.slug === requestedSlug);
      if (!country) {
        sendJson(res, 404, { error: 'country_not_found' });
        return;
      }
      sendJson(res, 200, {
        country,
        companies: companies.filter((company) => company.country?.trim() === country.name),
        source: 'Neon public.public_companies',
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Country query failed:', error instanceof Error ? error.message : error);
      sendJson(res, 502, { error: 'database_unavailable' });
    }
    return;
  }

  if (pathname === '/api/vcs' || pathname.startsWith('/api/vcs/')) {
    try {
      const funds = await getVcFunds();
      if (pathname === '/api/vcs') {
        const companies = await getCompanies();
        sendJson(res, 200, {
          funds,
          company_count: companies.filter((company) => company.vc_funds.length).length,
          source: 'Neon public.vc_funds and public.company_vc_sources',
          generatedAt: new Date().toISOString(),
        });
        return;
      }
      const requestedSlug = decodeURIComponent(pathname.slice('/api/vcs/'.length)).replace(/\/$/, '');
      const fund = funds.find((item) => item.slug === requestedSlug);
      if (!fund) {
        sendJson(res, 404, { error: 'vc_not_found' });
        return;
      }
      const companies = (await getCompanies()).filter((company) =>
        company.vc_funds.some((companyFund) => String(companyFund.id) === String(fund.id)),
      );
      sendJson(res, 200, {
        fund,
        companies,
        source: 'Neon public.vc_funds, public.company_vc_sources and public.public_companies',
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('VC query failed:', error instanceof Error ? error.message : error);
      sendJson(res, 502, { error: 'database_unavailable' });
    }
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

function isApplicationRoute(pathname) {
  return pathname === '/'
    || pathname === '/countries'
    || /^\/countries\/[^/]+\/?$/.test(pathname)
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
    await sendFile(req, res, filePath, requested === '/index.html' ? 'no-cache' : 'public, max-age=3600');
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
