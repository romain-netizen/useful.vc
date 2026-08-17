import { neon } from '@neondatabase/serverless';

export const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export function jsonResponse(request, status, body, additionalHeaders = {}) {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    status,
    headers: {
      ...securityHeaders,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...additionalHeaders,
    },
  });
}

function database(databaseUrl) {
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  return neon(databaseUrl);
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

// Public display is intentionally manager-level while Neon keeps exact
// fund/vehicle relationships. Racine² is deliberately NOT mapped to Serena.
function publicManagerName(value) {
  const name = String(value || '').trim();
  if (!name) return name;

  if (/^Kurma(?:\s|$)/i.test(name) || /^Paris Saclay Seed Fund$/i.test(name)) {
    return 'Kurma Partners';
  }
  if (/^Partech Impact$/i.test(name) || /^Partech \(former\)$/i.test(name)) {
    return 'Partech';
  }
  if (/^Ring (?:Africa|Generations|Mission)$/i.test(name)) {
    return 'Ring Capital';
  }
  if (/^Andera Partners \/ BioDiscovery \(andera Life Sciences\)$/i.test(name)
      || /^Andera Partners BioDiscovery\b/i.test(name)) {
    return 'Andera Partners';
  }
  if (/^4Elements Fund I$/i.test(name)) {
    return '4Elements Venture';
  }
  return name;
}

function decorateCompanies(companies) {
  return companies.map((company) => {
    const investorMap = new Map();
    for (const rawInvestor of Array.isArray(company.investors) ? company.investors : []) {
      const name = publicManagerName(rawInvestor.name);
      const slug = slugify(name);
      if (!slug) continue;

      if (!investorMap.has(slug)) {
        investorMap.set(slug, {
          ...rawInvestor,
          name,
          slug,
          source_types: [],
        });
      }
      const investor = investorMap.get(slug);
      const sourceTypes = Array.isArray(rawInvestor.source_types) ? rawInvestor.source_types : [];
      investor.source_types = [...new Set([...investor.source_types, ...sourceTypes])].sort();
      investor.source_type = investor.source_types.join(', ');
    }

    return {
      ...company,
      investors: [...investorMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

async function getCompanies(databaseUrl) {
  const sql = database(databaseUrl);
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
    WHERE pc.publishable IS DISTINCT FROM FALSE
    ORDER BY
      CASE pc.public_state WHEN 'Main' THEN 0 WHEN 'Pending' THEN 1 ELSE 2 END,
      pc.name ASC
  `;
  return decorateCompanies(companies);
}

async function getScreeningStats(databaseUrl) {
  const sql = database(databaseUrl);
  const [row] = await sql`
    WITH screened AS (
      SELECT c.id, c.public_state
      FROM public.companies AS c
      JOIN (
        SELECT cr.company_id
        FROM public.criterion_reviews AS cr
        GROUP BY cr.company_id
        HAVING COUNT(DISTINCT cr.criterion) = 8
      ) AS completed ON completed.company_id = c.id
    )
    SELECT
      COUNT(*)::integer AS screened_count,
      COUNT(*) FILTER (WHERE public_state = 'Main')::integer AS main_count,
      COUNT(*) FILTER (WHERE public_state = 'Pending')::integer AS pending_count
    FROM screened
  `;
  const screenedCount = Number(row?.screened_count || 0);
  const mainCount = Number(row?.main_count || 0);
  const pendingCount = Number(row?.pending_count || 0);
  const percentage = (count) => screenedCount > 0
    ? Math.round((count / screenedCount) * 1000) / 10
    : 0;
  return {
    screenedCount,
    mainCount,
    pendingCount,
    notPublishedCount: Math.max(0, screenedCount - mainCount - pendingCount),
    mainPercentage: percentage(mainCount),
    pendingPercentage: percentage(pendingCount),
  };
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

async function getFundMetadata(databaseUrl) {
  const sql = database(databaseUrl);
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

  const managerMap = new Map();
  for (const fund of funds) {
    const name = publicManagerName(fund.name);
    const slug = slugify(name);
    const normalized = { ...fund, name, slug };
    const existing = managerMap.get(slug);
    const isCanonicalManagerRow = fund.name.trim().toLowerCase() === name.toLowerCase();
    if (!existing || isCanonicalManagerRow) managerMap.set(slug, normalized);
  }
  return [...managerMap.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function getInvestors(databaseUrl, companies = null) {
  const companyList = companies || await getCompanies(databaseUrl);
  const funds = await getFundMetadata(databaseUrl);
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

async function companiesResponse(request, databaseUrl) {
  const [companies, screening] = await Promise.all([
    getCompanies(databaseUrl),
    getScreeningStats(databaseUrl),
  ]);
  return jsonResponse(request, 200, {
    companies,
    screening,
    source: 'Neon granular investor/fund relationships normalized to management-company display',
    generatedAt: new Date().toISOString(),
  });
}

async function countriesResponse(request, databaseUrl, pathname) {
  const companies = await getCompanies(databaseUrl);
  const countries = buildCountries(companies);
  if (pathname === '/api/countries') {
    return jsonResponse(request, 200, {
      countries,
      company_count: countries.reduce((total, country) => total + country.company_count, 0),
      source: 'Neon public.public_companies',
      generatedAt: new Date().toISOString(),
    });
  }

  const requestedSlug = decodeURIComponent(pathname.slice('/api/countries/'.length)).replace(/\/$/, '');
  const country = countries.find((item) => item.slug === requestedSlug);
  if (!country) return jsonResponse(request, 404, { error: 'country_not_found' });
  return jsonResponse(request, 200, {
    country,
    companies: companies.filter((company) => company.country?.trim() === country.name),
    source: 'Neon granular investor/fund relationships normalized to management-company display',
    generatedAt: new Date().toISOString(),
  });
}

async function investorsResponse(request, databaseUrl, pathname) {
  const companies = await getCompanies(databaseUrl);
  const investors = await getInvestors(databaseUrl, companies);
  const isLegacyPath = pathname === '/api/vcs' || pathname.startsWith('/api/vcs/');
  const indexPath = isLegacyPath ? '/api/vcs' : '/api/investors';

  if (pathname === indexPath) {
    return jsonResponse(request, 200, {
      investors,
      funds: investors,
      company_count: companies.filter((company) => company.investors.length).length,
      source: 'Neon granular investor/fund relationships normalized to management-company display',
      generatedAt: new Date().toISOString(),
    });
  }

  const requestedSlug = decodeURIComponent(pathname.slice(`${indexPath}/`.length)).replace(/\/$/, '');
  const investor = investors.find((item) => item.slug === requestedSlug);
  if (!investor) return jsonResponse(request, 404, { error: 'investor_not_found' });
  const investorCompanies = companies.filter((company) =>
    company.investors.some((companyInvestor) => companyInvestor.slug === investor.slug),
  );
  return jsonResponse(request, 200, {
    investor,
    fund: investor,
    companies: investorCompanies,
    source: 'Neon granular investor/fund relationships normalized to management-company display',
    generatedAt: new Date().toISOString(),
  });
}

export async function handleApiRequest(request, databaseUrl) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse(request, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
  }

  const pathname = new URL(request.url).pathname;
  if (pathname === '/healthz') {
    try {
      const sql = database(databaseUrl);
      await sql`SELECT 1 AS ok`;
      return jsonResponse(request, 200, { status: 'ok', database: 'connected' });
    } catch (error) {
      console.error('Health check failed:', error instanceof Error ? error.message : error);
      return jsonResponse(request, 503, { status: 'error', database: 'unavailable' });
    }
  }

  try {
    if (pathname === '/api/companies') return await companiesResponse(request, databaseUrl);
    if (pathname === '/api/countries' || pathname.startsWith('/api/countries/')) {
      return await countriesResponse(request, databaseUrl, pathname);
    }
    if (
      pathname === '/api/investors'
      || pathname.startsWith('/api/investors/')
      || pathname === '/api/vcs'
      || pathname.startsWith('/api/vcs/')
    ) {
      return await investorsResponse(request, databaseUrl, pathname);
    }
  } catch (error) {
    console.error('Database query failed:', error instanceof Error ? error.message : error);
    return jsonResponse(request, 502, { error: 'database_unavailable' });
  }

  return jsonResponse(request, 404, { error: 'not_found' });
}
