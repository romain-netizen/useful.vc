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

function decorateCompanies(companies) {
  return companies.map((company) => ({
    ...company,
    investors: Array.isArray(company.investors)
      ? company.investors.map((investor) => ({
        ...investor,
        slug: slugify(investor.name),
        source_types: Array.isArray(investor.source_types) ? investor.source_types : [],
      }))
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
            jsonb_build_object(
              'id', investor.id,
              'name', investor.name,
              'source_type', investor.source_type,
              'source_types', investor.source_types
            )
            ORDER BY investor.name
          )
          FROM (
            SELECT
              MIN(discovered.source_id) AS id,
              (array_agg(discovered.name ORDER BY discovered.source_priority, discovered.name))[1] AS name,
              string_agg(DISTINCT discovered.source_type, ', ' ORDER BY discovered.source_type) AS source_type,
              array_agg(DISTINCT discovered.source_type ORDER BY discovered.source_type) AS source_types
            FROM (
              SELECT
                'investor:' || i.id::text AS source_id,
                i.name,
                ci.source_type,
                0 AS source_priority
              FROM public.company_investors AS ci
              JOIN public.investors AS i ON i.id = ci.investor_id
              WHERE ci.company_id = pc.id

              UNION ALL

              SELECT
                'fund:' || v.id::text AS source_id,
                v.name,
                'VC fund portfolio'::text AS source_type,
                1 AS source_priority
              FROM public.company_vc_sources AS cvs
              JOIN public.vc_funds AS v ON v.id = cvs.vc_fund_id
              WHERE cvs.company_id = pc.id
                AND v.name NOT IN (
                  'Disclosed funding sources',
                  'Portfolio + disclosed funding sources',
                  'Teampact portfolio review'
                )
                AND COALESCE(v.status, '') NOT ILIKE 'Invalid%'
            ) AS discovered
            GROUP BY LOWER(BTRIM(discovered.name))
          ) AS investor
        ),
        '[]'::jsonb
      ) AS investors
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

async function getFundMetadata() {
  const sql = database();
  const funds = await sql`
    SELECT
      v.id AS fund_id,
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
      v.completed_at
    FROM public.vc_funds AS v
    WHERE v.name NOT IN (
      'Disclosed funding sources',
      'Portfolio + disclosed funding sources',
      'Teampact portfolio review'
    )
      AND COALESCE(v.status, '') NOT ILIKE 'Invalid%'
    ORDER BY v.name
  `;
  return funds.map((fund) => ({ ...fund, slug: slugify(fund.name) }));
}

async function getInvestors(companies = null) {
  const companyList = companies || await getCompanies();
  const funds = await getFundMetadata();
  const fundBySlug = new Map(funds.map((fund) => [fund.slug, fund]));
  const investorMap = new Map();

  for (const company of companyList) {
    for (const companyInvestor of company.investors) {
      const slug = companyInvestor.slug;
      if (!investorMap.has(slug)) {
        investorMap.set(slug, {
          ...fundBySlug.get(slug),
          id: companyInvestor.id,
          name: companyInvestor.name,
          slug,
          source_types: new Set(),
          company_count: 0,
          main_count: 0,
          pending_count: 0,
        });
      }
      const investor = investorMap.get(slug);
      for (const sourceType of companyInvestor.source_types || []) investor.source_types.add(sourceType);
      investor.company_count += 1;
      if (company.public_state === 'Main') investor.main_count += 1;
      if (company.public_state === 'Pending') investor.pending_count += 1;
    }
  }

  return [...investorMap.values()]
    .map((investor) => ({ ...investor, source_types: [...investor.source_types].sort() }))
    .sort((a, b) => b.company_count - a.company_count || a.name.localeCompare(b.name));
}

async function sendCompanies(res) {
  const companies = await getCompanies();
  sendJson(res, 200, {
    companies,
    source: 'Neon public.public_companies with merged investor and VC-fund relationships',
    generatedAt: new Date().toISOString(),
  });
}

async function sendCountries(res, pathname) {
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
    source: 'Neon public.public_companies with merged investor and VC-fund relationships',
    generatedAt: new Date().toISOString(),
  });
}

async function sendInvestors(res, pathname) {
  const companies = await getCompanies();
  const investors = await getInvestors(companies);
  const isLegacyPath = pathname === '/api/vcs' || pathname.startsWith('/api/vcs/');
  const indexPath = isLegacyPath ? '/api/vcs' : '/api/investors';

  if (pathname === indexPath) {
    sendJson(res, 200, {
      investors,
      funds: investors,
      company_count: companies.filter((company) => company.investors.length).length,
      source: 'Neon public.investors, public.company_investors, public.vc_funds, public.company_vc_sources and public.public_companies',
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  const requestedSlug = decodeURIComponent(pathname.slice(`${indexPath}/`.length)).replace(/\/$/, '');
  const investor = investors.find((item) => item.slug === requestedSlug);
  if (!investor) {
    sendJson(res, 404, { error: 'investor_not_found' });
    return;
  }
  const investorCompanies = companies.filter((company) =>
    company.investors.some((companyInvestor) => companyInvestor.slug === investor.slug),
  );
  sendJson(res, 200, {
    investor,
    fund: investor,
    companies: investorCompanies,
    source: 'Neon public.investors, public.company_investors, public.vc_funds, public.company_vc_sources and public.public_companies',
    generatedAt: new Date().toISOString(),
  });
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

  try {
    if (pathname === '/api/companies') {
      await sendCompanies(res);
      return;
    }
    if (pathname === '/api/countries' || pathname.startsWith('/api/countries/')) {
      await sendCountries(res, pathname);
      return;
    }
    if (
      pathname === '/api/investors'
      || pathname.startsWith('/api/investors/')
      || pathname === '/api/vcs'
      || pathname.startsWith('/api/vcs/')
    ) {
      await sendInvestors(res, pathname);
      return;
    }
  } catch (error) {
    console.error('Database query failed:', error instanceof Error ? error.message : error);
    sendJson(res, 502, { error: 'database_unavailable' });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
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
