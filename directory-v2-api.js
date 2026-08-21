import { neon } from '@neondatabase/serverless';
import { jsonResponse } from './directory-api.js';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 30;

function database(databaseUrl) {
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  return neon(databaseUrl);
}

function clean(value) {
  return String(value || '').trim();
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeState(value) {
  const state = clean(value).toLowerCase();
  if (state === 'listed' || state === 'main') return 'Main';
  if (state === 'pending') return 'Pending';
  if (state === 'excluded') return 'Excluded';
  if (state === 'none' || state === 'no-verdict' || state === 'no_verdict') return 'No verdict';
  return '';
}

function normalizeCollection(value) {
  const collection = clean(value).toLowerCase();
  if (collection === 'technology' || collection === 'tech') return 'Technology';
  if (collection === 'biotech' || collection === 'invasive' || collection === 'biotech-invasive') {
    return 'Biotech & invasive medicine';
  }
  return '';
}

function companyState(row) {
  return row.v2_state || 'No verdict';
}

async function progressResponse(request, databaseUrl) {
  const sql = database(databaseUrl);
  const [progress] = await sql`SELECT * FROM publication_v2.research_progress`;
  const [engine] = await sql`
    SELECT
      count(*)::integer AS product_units,
      count(*) FILTER (WHERE csv.verdict = 'Listed')::integer AS listed_units,
      count(*) FILTER (WHERE csv.verdict = 'Pending')::integer AS pending_units,
      count(*) FILTER (WHERE csv.verdict = 'Excluded')::integer AS excluded_units,
      count(*) FILTER (WHERE csv.id IS NULL)::integer AS unsigned_units
    FROM engine_v2.product_units pu
    LEFT JOIN publication_v2.current_signed_verdicts csv ON csv.unit_id = pu.id
  `;
  const [methodology] = await sql`
    SELECT version, content_hash, title, canonical_public_path, activated_at
    FROM engine_v2.methodology_versions
    WHERE active = true
    LIMIT 1
  `;
  return jsonResponse(request, 200, {
    preview: true,
    productionChanged: false,
    progress,
    engine,
    methodology,
    generatedAt: new Date().toISOString(),
  });
}

async function companiesResponse(request, databaseUrl, url) {
  const sql = database(databaseUrl);
  const q = clean(url.searchParams.get('q'));
  const qLike = `%${q}%`;
  const state = normalizeState(url.searchParams.get('state'));
  const collection = normalizeCollection(url.searchParams.get('collection'));
  const country = clean(url.searchParams.get('country'));
  const countryLike = `%${country}%`;
  const investor = clean(url.searchParams.get('investor'));
  const investorLike = `%${investor}%`;
  const customer = clean(url.searchParams.get('customer'));
  const customerLike = `%${customer}%`;
  const operating = clean(url.searchParams.get('operating'));
  const ownership = clean(url.searchParams.get('ownership'));
  const employeeBand = clean(url.searchParams.get('size'));
  const foundedFrom = boundedInteger(url.searchParams.get('founded_from'), 0, 0, 3000);
  const foundedTo = boundedInteger(url.searchParams.get('founded_to'), 3000, 0, 3000);
  const page = boundedInteger(url.searchParams.get('page'), 1, 1, 100000);
  const limit = boundedInteger(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = (page - 1) * limit;

  const rows = await sql`
    SELECT
      c.*,
      count(*) OVER()::integer AS filtered_count,
      CASE
        WHEN ${q} = '' THEN 0
        ELSE greatest(similarity(c.name, ${q}), similarity(coalesce(c.search_text, ''), ${q}))
      END AS search_rank
    FROM publication_v2.company_directory c
    WHERE
      (
        ${q} = ''
        OR c.search_text ILIKE ${qLike}
        OR similarity(c.name, ${q}) >= 0.20
      )
      AND (
        ${state} = ''
        OR (${state} = 'No verdict' AND c.v2_state IS NULL)
        OR c.v2_state = ${state}
      )
      AND (
        ${collection} = ''
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(c.product_units) AS unit
          WHERE unit->>'collection' = ${collection}
        )
      )
      AND (${country} = '' OR coalesce(c.country, '') ILIKE ${countryLike})
      AND (
        ${investor} = ''
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(c.investors) AS inv
          WHERE coalesce(inv->>'name', '') ILIKE ${investorLike}
        )
      )
      AND (${customer} = '' OR coalesce(c.customer_summary, '') ILIKE ${customerLike})
      AND (${operating} = '' OR c.operating_status = ${operating})
      AND (${ownership} = '' OR c.ownership_status = ${ownership})
      AND (${employeeBand} = '' OR c.employee_band = ${employeeBand})
      AND (c.founding_year IS NULL OR c.founding_year >= ${foundedFrom})
      AND (c.founding_year IS NULL OR c.founding_year <= ${foundedTo})
    ORDER BY
      CASE WHEN ${q} = '' THEN 0 ELSE 1 END DESC,
      search_rank DESC,
      CASE c.v2_state WHEN 'Main' THEN 0 WHEN 'Pending' THEN 1 WHEN 'Excluded' THEN 2 ELSE 3 END,
      c.name ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const total = rows.length ? Number(rows[0].filtered_count) : 0;
  const companies = rows.map(({ filtered_count: _filteredCount, search_rank: _searchRank, ...row }) => ({
    ...row,
    state: companyState(row),
  }));

  return jsonResponse(request, 200, {
    companies,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
    filters: { q, state, collection, country, investor, customer, operating, ownership, employeeBand },
    source: 'Neon isolated V2 branch: publication_v2.company_directory',
    generatedAt: new Date().toISOString(),
  });
}

async function companyResponse(request, databaseUrl, companyId) {
  const sql = database(databaseUrl);
  const [company] = await sql`
    SELECT *
    FROM publication_v2.company_directory
    WHERE id = ${companyId}
    LIMIT 1
  `;
  if (!company) return jsonResponse(request, 404, { error: 'company_not_found' });

  const units = await sql`
    SELECT
      pu.*,
      uc.collection,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'attribute', ua.attribute,
              'rationale', ua.rationale,
              'source_url', ua.source_url,
              'evidence_date', ua.evidence_date
            ) ORDER BY ua.attribute
          )
          FROM engine_v2.unit_attributes ua
          WHERE ua.unit_id = pu.id
        ),
        '[]'::jsonb
      ) AS attributes,
      csv.verdict,
      csv.signer_name,
      csv.signature_date,
      csv.publication_reasoning,
      cra.result AS readiness_result,
      cra.missing_conditions,
      cra.observable_thresholds,
      cra.verification_route,
      cra.next_milestone,
      cra.review_date,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'rule', rule_code,
              'result', result,
              'rationale', rationale,
              'factual_basis', factual_basis,
              'threshold_or_test', threshold_or_test,
              'contradictory_evidence', contradictory_evidence,
              'assessor', assessor,
              'assessed_at', assessed_at
            ) ORDER BY rule_code
          )
          FROM publication_v2.current_rule_assessments ra
          WHERE ra.unit_id = pu.id
        ),
        '[]'::jsonb
      ) AS rules
    FROM engine_v2.product_units pu
    LEFT JOIN engine_v2.unit_collections uc ON uc.unit_id = pu.id
    LEFT JOIN publication_v2.current_signed_verdicts csv ON csv.unit_id = pu.id
    LEFT JOIN publication_v2.current_readiness_assessments cra ON cra.unit_id = pu.id
    WHERE pu.company_id = ${companyId}
    ORDER BY pu.active DESC, pu.product_name ASC
  `;

  const sources = await sql`
    SELECT id, unit_id, url, title, publisher, source_type, published_on,
           retrieved_at, company_controlled, material_conflict, notes
    FROM research_v2.sources
    WHERE company_id = ${companyId}
    ORDER BY material_conflict DESC, published_on DESC NULLS LAST, retrieved_at DESC
    LIMIT 200
  `;

  const aliases = await sql`
    SELECT alias, alias_type, source_url, evidence_date
    FROM directory_v2.company_aliases
    WHERE company_id = ${companyId}
    ORDER BY alias
  `;

  const tasks = await sql`
    SELECT id, unit_id, priority, task_type, question, status, attempts,
           assigned_to, due_on, updated_at
    FROM research_v2.tasks
    WHERE company_id = ${companyId}
      AND status <> 'complete'
    ORDER BY priority, created_at
  `;

  return jsonResponse(request, 200, {
    company: { ...company, state: companyState(company) },
    aliases,
    units,
    sources,
    openResearch: tasks,
    generatedAt: new Date().toISOString(),
  });
}

async function investorsResponse(request, databaseUrl, url) {
  const sql = database(databaseUrl);
  const q = clean(url.searchParams.get('q'));
  const qLike = `%${q}%`;
  const limit = boundedInteger(url.searchParams.get('limit'), 100, 1, 500);
  const investors = await sql`
    SELECT
      i.id,
      i.name,
      count(DISTINCT ci.company_id)::integer AS company_count,
      count(DISTINCT ci.company_id) FILTER (WHERE d.v2_state = 'Main')::integer AS main_count,
      count(DISTINCT ci.company_id) FILTER (WHERE d.v2_state = 'Pending')::integer AS pending_count
    FROM public.investors i
    JOIN public.company_investors ci ON ci.investor_id = i.id
    LEFT JOIN publication_v2.company_directory d ON d.id = ci.company_id
    WHERE ${q} = '' OR i.name ILIKE ${qLike} OR similarity(i.name, ${q}) >= 0.20
    GROUP BY i.id, i.name
    ORDER BY company_count DESC, i.name
    LIMIT ${limit}
  `;
  return jsonResponse(request, 200, { investors, generatedAt: new Date().toISOString() });
}

async function facetsResponse(request, databaseUrl) {
  const sql = database(databaseUrl);
  const countries = await sql`
    SELECT country AS value, count(*)::integer AS count
    FROM publication_v2.company_directory
    WHERE country IS NOT NULL AND btrim(country) <> ''
    GROUP BY country
    ORDER BY count DESC, country
  `;
  const operatingStatuses = await sql`
    SELECT operating_status AS value, count(*)::integer AS count
    FROM publication_v2.company_directory
    GROUP BY operating_status
    ORDER BY count DESC, operating_status
  `;
  const ownershipStatuses = await sql`
    SELECT ownership_status AS value, count(*)::integer AS count
    FROM publication_v2.company_directory
    GROUP BY ownership_status
    ORDER BY count DESC, ownership_status
  `;
  const sizeBands = await sql`
    SELECT employee_band AS value, count(*)::integer AS count
    FROM publication_v2.company_directory
    GROUP BY employee_band
    ORDER BY CASE employee_band
      WHEN '1–10' THEN 1 WHEN '11–50' THEN 2 WHEN '51–200' THEN 3
      WHEN '201–500' THEN 4 WHEN '501–1,000' THEN 5 WHEN '1,001+' THEN 6 ELSE 7 END
  `;
  return jsonResponse(request, 200, {
    states: ['Main', 'Pending', 'Excluded', 'No verdict'],
    collections: ['Technology', 'Biotech & invasive medicine'],
    countries,
    operatingStatuses,
    ownershipStatuses,
    sizeBands,
    generatedAt: new Date().toISOString(),
  });
}

async function methodologyResponse(request, databaseUrl) {
  const sql = database(databaseUrl);
  const [methodology] = await sql`
    SELECT version, content_hash, title, canonical_repository_path,
           canonical_public_path, active, activated_at, notes
    FROM engine_v2.methodology_versions
    WHERE active = true
    LIMIT 1
  `;
  return jsonResponse(request, 200, { methodology, generatedAt: new Date().toISOString() });
}

export async function handleV2ApiRequest(request, databaseUrl) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse(request, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
  }
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, '');
  try {
    if (pathname === '/api/v2' || pathname === '/api/v2/progress') {
      return await progressResponse(request, databaseUrl);
    }
    if (pathname === '/api/v2/companies') {
      return await companiesResponse(request, databaseUrl, url);
    }
    if (pathname.startsWith('/api/v2/companies/')) {
      const companyId = boundedInteger(pathname.slice('/api/v2/companies/'.length), 0, 1, Number.MAX_SAFE_INTEGER);
      if (!companyId) return jsonResponse(request, 400, { error: 'invalid_company_id' });
      return await companyResponse(request, databaseUrl, companyId);
    }
    if (pathname === '/api/v2/investors') {
      return await investorsResponse(request, databaseUrl, url);
    }
    if (pathname === '/api/v2/facets') {
      return await facetsResponse(request, databaseUrl);
    }
    if (pathname === '/api/v2/methodology') {
      return await methodologyResponse(request, databaseUrl);
    }
    return jsonResponse(request, 404, { error: 'v2_endpoint_not_found' });
  } catch (error) {
    console.error('V2 API request failed:', error instanceof Error ? error.message : error);
    return jsonResponse(request, 500, { error: 'v2_internal_server_error' });
  }
}
