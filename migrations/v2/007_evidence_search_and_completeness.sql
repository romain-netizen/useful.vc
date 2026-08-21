BEGIN;

CREATE TABLE IF NOT EXISTS directory_v2.profile_field_evidence (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  field_name text NOT NULL CHECK (field_name IN (
    'canonical_name','website','country','founded_on','founding_year','plain_summary',
    'customer_summary','employee_estimate','employee_band','funding','operating_status',
    'ownership_status','current_owner','regulatory_summary'
  )),
  value_text text,
  source_id bigint REFERENCES research_v2.sources(id) ON DELETE RESTRICT,
  confidence numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence_date date,
  selected boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, field_name, source_id, value_text)
);

CREATE TABLE IF NOT EXISTS research_v2.legacy_evidence_map (
  legacy_evidence_id bigint PRIMARY KEY REFERENCES public.evidence(id) ON DELETE RESTRICT,
  source_id bigint NOT NULL REFERENCES research_v2.sources(id) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE research_v2.claims
  ADD COLUMN IF NOT EXISTS legacy_evidence_id bigint REFERENCES public.evidence(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS claims_legacy_evidence_unique_idx
  ON research_v2.claims (legacy_evidence_id)
  WHERE legacy_evidence_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS research_v2.unit_candidates (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  candidate_name text NOT NULL,
  candidate_summary text,
  intended_use text,
  claimed_outcome text,
  economic_model text,
  source_kind text NOT NULL CHECK (source_kind IN ('legacy_summary','shadow_reference','public_research','human_review')),
  source_reference text,
  needs_split boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unresolved'
    CHECK (status IN ('unresolved','researching','ready_for_unit_creation','rejected','superseded')),
  confidence numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, candidate_name, source_kind)
);

INSERT INTO directory_v2.company_aliases (
  company_id, alias, alias_type, source_url, evidence_date
)
SELECT DISTINCT
  c.id,
  btrim(alias_value),
  'former_name',
  NULLIF(btrim(c.status_source_url), ''),
  c.status_checked_at
FROM public.companies c
CROSS JOIN LATERAL regexp_split_to_table(c.former_names, '\s*;\s*') alias_value
WHERE NULLIF(btrim(c.former_names), '') IS NOT NULL
  AND NULLIF(btrim(alias_value), '') IS NOT NULL
  AND lower(btrim(alias_value)) <> lower(btrim(c.name))
ON CONFLICT DO NOTHING;

WITH normalized AS (
  SELECT
    e.company_id,
    COALESCE(NULLIF(btrim(e.source_url), ''), 'legacy://public.evidence/' || e.id::text) AS url,
    max(NULLIF(btrim(e.publisher), '')) AS publisher,
    max(NULLIF(btrim(e.source_type), '')) AS source_type,
    max(
      CASE
        WHEN e.publication_date ~ '^\d{4}-\d{2}-\d{2}$' THEN e.publication_date::date
        ELSE NULL
      END
    ) AS published_on,
    bool_or(lower(coalesce(e.support_status, '')) ~ '(contradict|refut|negative|does not support)') AS material_conflict,
    CASE
      WHEN bool_or(lower(coalesce(e.source_type, '')) LIKE '%company%') THEN true
      WHEN bool_or(lower(coalesce(e.source_type, '')) ~ '(government|regulator|peer-reviewed|academic|international authority|research institution)') THEN false
      ELSE NULL
    END AS company_controlled,
    md5(string_agg(e.id::text || ':' || coalesce(e.claim_supported, ''), '|' ORDER BY e.id)) AS source_hash,
    max('Imported from legacy evidence; original publication-date text retained in mapped claim notes.') AS notes
  FROM public.evidence e
  GROUP BY e.company_id, COALESCE(NULLIF(btrim(e.source_url), ''), 'legacy://public.evidence/' || e.id::text)
)
INSERT INTO research_v2.sources (
  company_id, url, title, publisher, source_type, published_on,
  company_controlled, material_conflict, source_hash, notes
)
SELECT
  n.company_id,
  n.url,
  COALESCE(n.publisher, 'Legacy public evidence') || ' — imported evidence',
  n.publisher,
  n.source_type,
  n.published_on,
  n.company_controlled,
  n.material_conflict,
  n.source_hash,
  n.notes
FROM normalized n
ON CONFLICT (company_id, url) DO NOTHING;

INSERT INTO research_v2.legacy_evidence_map (legacy_evidence_id, source_id)
SELECT e.id, s.id
FROM public.evidence e
JOIN research_v2.sources s
  ON s.company_id = e.company_id
 AND s.url = COALESCE(NULLIF(btrim(e.source_url), ''), 'legacy://public.evidence/' || e.id::text)
ON CONFLICT (legacy_evidence_id) DO NOTHING;

INSERT INTO research_v2.claims (
  source_id, company_id, unit_id, claim_type, claim_text,
  support_status, rule_code, legacy_evidence_id
)
SELECT
  m.source_id,
  e.company_id,
  NULL,
  COALESCE(NULLIF(btrim(e.criterion), ''), 'legacy evidence'),
  COALESCE(NULLIF(btrim(e.claim_supported), ''), NULLIF(btrim(e.notes), ''), 'Legacy evidence record without extracted claim text.'),
  CASE
    WHEN lower(coalesce(e.support_status, '')) ~ '(contradict|refut|negative|does not support)' THEN 'contradicts'
    WHEN lower(coalesce(e.support_status, '')) LIKE 'support%' THEN 'supports'
    WHEN lower(coalesce(e.support_status, '')) ~ '(unclear|inconclusive|unknown)' THEN 'unclear'
    ELSE 'context'
  END,
  CASE
    WHEN lower(coalesce(e.criterion, '')) LIKE '%readiness%' THEN 'Readiness'
    WHEN lower(coalesce(e.criterion, '')) ~ '(funding|investor|status|identity|website|country)' THEN 'Profile'
    ELSE NULL
  END,
  e.id
FROM public.evidence e
JOIN research_v2.legacy_evidence_map m ON m.legacy_evidence_id = e.id
ON CONFLICT (legacy_evidence_id) WHERE legacy_evidence_id IS NOT NULL DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS company_status_history_source_unique_idx
  ON directory_v2.company_status_history (
    company_id, checked_on, source_url, operating_status, ownership_status, coalesce(current_owner, '')
  );

INSERT INTO directory_v2.company_status_history (
  company_id, operating_status, ownership_status, current_owner,
  effective_on, checked_on, source_url, source_title, notes
)
SELECT
  cp.company_id,
  cp.operating_status,
  cp.ownership_status,
  cp.current_owner,
  NULL,
  COALESCE(c.status_checked_at, current_date),
  c.status_source_url,
  'Legacy status source',
  'Imported as a research lead. Corporate status remains separate from the product verdict.'
FROM directory_v2.company_profiles cp
JOIN public.companies c ON c.id = cp.company_id
WHERE NULLIF(btrim(c.status_source_url), '') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO research_v2.unit_candidates (
  company_id, candidate_name, candidate_summary, source_kind,
  source_reference, needs_split, status, confidence, notes
)
SELECT
  cp.company_id,
  cp.canonical_name || ' — material product units unresolved',
  cp.plain_summary,
  'legacy_summary',
  'public.companies.evidence_summary',
  true,
  'unresolved',
  0.200,
  'Placeholder for product-unit discovery only. It is not a product unit, rule assessment or verdict.'
FROM directory_v2.company_profiles cp
WHERE NULLIF(btrim(cp.plain_summary), '') IS NOT NULL
ON CONFLICT (company_id, candidate_name, source_kind) DO NOTHING;

UPDATE research_v2.company_queue q
SET
  next_action = CASE sr.provisional_state
    WHEN 'Split' THEN 'Separate every material product, service, platform and deployment unit before applying R1–R5.'
    WHEN 'No verdict' THEN 'Resolve the product-use unit and the material structural facts identified by the shadow reference.'
    ELSE q.next_action
  END,
  updated_at = now()
FROM research_v2.shadow_assessments sr
WHERE sr.company_id = q.company_id
  AND sr.source_sheet = 'Current Main or Pending'
  AND sr.provisional_state IN ('Split', 'No verdict');

CREATE OR REPLACE VIEW publication_v2.profile_completeness AS
WITH source_counts AS (
  SELECT company_id, count(*)::integer AS source_count
  FROM research_v2.sources
  GROUP BY company_id
), investor_counts AS (
  SELECT company_id, count(*)::integer AS investor_count
  FROM public.company_investors
  GROUP BY company_id
), alias_counts AS (
  SELECT company_id, count(*)::integer AS alias_count
  FROM directory_v2.company_aliases
  GROUP BY company_id
)
SELECT
  cp.company_id,
  (cp.founded_on IS NOT NULL OR cp.founding_year IS NOT NULL) AS has_founding_date,
  (NULLIF(btrim(cp.plain_summary), '') IS NOT NULL) AS has_summary,
  (NULLIF(btrim(cp.customer_summary), '') IS NOT NULL) AS has_customer_summary,
  (cp.employee_estimate IS NOT NULL OR cp.employee_band <> 'Unknown') AS has_size,
  (cp.operating_status <> 'Uncertain') AS has_operating_status,
  (cp.ownership_status <> 'Uncertain') AS has_ownership_status,
  (COALESCE(ic.investor_count, 0) > 0) AS has_investors,
  COALESCE(sc.source_count, 0) AS source_count,
  COALESCE(ic.investor_count, 0) AS investor_count,
  COALESCE(ac.alias_count, 0) AS alias_count,
  (
    (cp.founded_on IS NOT NULL OR cp.founding_year IS NOT NULL)::integer +
    (NULLIF(btrim(cp.plain_summary), '') IS NOT NULL)::integer +
    (NULLIF(btrim(cp.customer_summary), '') IS NOT NULL)::integer +
    (cp.employee_estimate IS NOT NULL OR cp.employee_band <> 'Unknown')::integer +
    (cp.operating_status <> 'Uncertain')::integer +
    (cp.ownership_status <> 'Uncertain')::integer +
    (COALESCE(ic.investor_count, 0) > 0)::integer
  ) AS completed_core_fields,
  7 AS total_core_fields,
  round(100.0 * (
    (cp.founded_on IS NOT NULL OR cp.founding_year IS NOT NULL)::integer +
    (NULLIF(btrim(cp.plain_summary), '') IS NOT NULL)::integer +
    (NULLIF(btrim(cp.customer_summary), '') IS NOT NULL)::integer +
    (cp.employee_estimate IS NOT NULL OR cp.employee_band <> 'Unknown')::integer +
    (cp.operating_status <> 'Uncertain')::integer +
    (cp.ownership_status <> 'Uncertain')::integer +
    (COALESCE(ic.investor_count, 0) > 0)::integer
  ) / 7.0, 1) AS completeness_percent
FROM directory_v2.company_profiles cp
LEFT JOIN source_counts sc ON sc.company_id = cp.company_id
LEFT JOIN investor_counts ic ON ic.company_id = cp.company_id
LEFT JOIN alias_counts ac ON ac.company_id = cp.company_id;

DROP VIEW IF EXISTS publication_v2.preview_companies;

CREATE OR REPLACE VIEW publication_v2.company_directory AS
WITH investor_rollup AS (
  SELECT
    ci.company_id,
    jsonb_agg(
      jsonb_build_object('id', i.id, 'name', i.name, 'source_type', ci.source_type)
      ORDER BY i.name
    ) AS investors,
    string_agg(DISTINCT i.name, ' ' ORDER BY i.name) AS investor_search
  FROM public.company_investors ci
  JOIN public.investors i ON i.id = ci.investor_id
  GROUP BY ci.company_id
), verdict_rollup AS (
  SELECT
    pu.company_id,
    count(*) FILTER (WHERE csv.verdict = 'Listed') AS listed_units,
    count(*) FILTER (WHERE csv.verdict = 'Pending') AS pending_units,
    count(*) FILTER (WHERE csv.verdict = 'Excluded') AS excluded_units,
    count(*) AS signed_units,
    jsonb_agg(
      jsonb_build_object(
        'unit_id', pu.id,
        'product_name', pu.product_name,
        'intended_use', pu.intended_use,
        'claimed_outcome', pu.claimed_outcome,
        'verdict', csv.verdict,
        'collection', uc.collection
      ) ORDER BY pu.product_name
    ) AS product_units
  FROM engine_v2.product_units pu
  JOIN publication_v2.current_signed_verdicts csv ON csv.unit_id = pu.id
  LEFT JOIN engine_v2.unit_collections uc ON uc.unit_id = pu.id
  WHERE csv.published = true
  GROUP BY pu.company_id
), alias_rollup AS (
  SELECT
    company_id,
    jsonb_agg(jsonb_build_object('alias', alias, 'type', alias_type) ORDER BY alias) AS aliases,
    string_agg(alias, ' ' ORDER BY alias) AS alias_search
  FROM directory_v2.company_aliases
  GROUP BY company_id
), customer_rollup AS (
  SELECT
    cct.company_id,
    jsonb_agg(jsonb_build_object('tag', ct.tag, 'name', ct.display_name) ORDER BY ct.display_name) AS customer_tags,
    string_agg(ct.display_name, ' ' ORDER BY ct.display_name) AS customer_search
  FROM directory_v2.company_customer_tags cct
  JOIN directory_v2.customer_tags ct ON ct.tag = cct.tag
  GROUP BY cct.company_id
), candidate_rollup AS (
  SELECT
    company_id,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', candidate_name,
        'summary', candidate_summary,
        'status', status,
        'needs_split', needs_split,
        'confidence', confidence
      ) ORDER BY id
    ) AS unit_candidates,
    string_agg(concat_ws(' ', candidate_name, candidate_summary), ' ' ORDER BY id) AS candidate_search
  FROM research_v2.unit_candidates
  WHERE status NOT IN ('rejected','superseded')
  GROUP BY company_id
), shadow_rollup AS (
  SELECT DISTINCT ON (company_id)
    company_id,
    provisional_state AS shadow_state,
    admission_route AS shadow_admission_route,
    causal_position AS shadow_causal_position,
    r1 AS shadow_r1,
    r2 AS shadow_r2,
    r3 AS shadow_r3,
    r4 AS shadow_r4,
    r5 AS shadow_r5,
    readiness AS shadow_readiness,
    confidence AS shadow_confidence,
    rationale AS shadow_rationale,
    next_action AS shadow_next_action
  FROM research_v2.shadow_assessments
  WHERE source_sheet = 'Current Main or Pending'
  ORDER BY company_id, imported_at DESC, id DESC
)
SELECT
  cp.company_id AS id,
  cp.canonical_name AS name,
  cp.website,
  cp.country,
  cp.founded_on,
  cp.founding_year,
  cp.founding_precision,
  cp.plain_summary,
  cp.customer_summary,
  cp.employee_estimate,
  cp.employee_band,
  cp.disclosed_funding_total,
  cp.latest_funding_date,
  cp.latest_funding_type,
  cp.operating_status,
  cp.ownership_status,
  cp.current_owner,
  cp.regulatory_summary,
  cp.profile_confidence,
  cp.evidence_date,
  cp.research_state,
  cp.legacy_public_state,
  cp.legacy_publication_scope,
  COALESCE(ir.investors, '[]'::jsonb) AS investors,
  COALESCE(vr.product_units, '[]'::jsonb) AS product_units,
  COALESCE(vr.listed_units, 0) AS listed_units,
  COALESCE(vr.pending_units, 0) AS pending_units,
  COALESCE(vr.excluded_units, 0) AS excluded_units,
  CASE
    WHEN COALESCE(vr.listed_units, 0) > 0 THEN 'Main'
    WHEN COALESCE(vr.pending_units, 0) > 0 THEN 'Pending'
    WHEN COALESCE(vr.signed_units, 0) > 0
     AND COALESCE(vr.excluded_units, 0) = COALESCE(vr.signed_units, 0) THEN 'Excluded'
    ELSE NULL
  END AS v2_state,
  pcc.all_material_units_identified,
  pcc.human_review_complete,
  pcc.allow_preview_publication,
  concat_ws(
    ' ', cp.canonical_name, cp.plain_summary, cp.customer_summary,
    cp.country, cp.operating_status, cp.ownership_status,
    ar.alias_search, cr.customer_search, ir.investor_search, car.candidate_search
  ) AS search_text,
  COALESCE(ar.aliases, '[]'::jsonb) AS aliases,
  COALESCE(cr.customer_tags, '[]'::jsonb) AS customer_tags,
  COALESCE(car.unit_candidates, '[]'::jsonb) AS unit_candidates,
  sr.shadow_state,
  sr.shadow_admission_route,
  sr.shadow_causal_position,
  sr.shadow_r1,
  sr.shadow_r2,
  sr.shadow_r3,
  sr.shadow_r4,
  sr.shadow_r5,
  sr.shadow_readiness,
  sr.shadow_confidence,
  sr.shadow_rationale,
  sr.shadow_next_action,
  CASE WHEN vr.signed_units IS NULL OR vr.signed_units = 0 THEN true ELSE false END AS shadow_only,
  q.priority_tier AS research_priority,
  q.status AS queue_status,
  q.profile_status,
  q.engine_status,
  q.next_action AS queue_next_action,
  pc.has_founding_date,
  pc.has_summary,
  pc.has_customer_summary,
  pc.has_size,
  pc.has_operating_status,
  pc.has_ownership_status,
  pc.has_investors,
  pc.source_count,
  pc.investor_count,
  pc.completed_core_fields,
  pc.total_core_fields,
  pc.completeness_percent
FROM directory_v2.company_profiles cp
LEFT JOIN investor_rollup ir ON ir.company_id = cp.company_id
LEFT JOIN verdict_rollup vr ON vr.company_id = cp.company_id
LEFT JOIN alias_rollup ar ON ar.company_id = cp.company_id
LEFT JOIN customer_rollup cr ON cr.company_id = cp.company_id
LEFT JOIN candidate_rollup car ON car.company_id = cp.company_id
LEFT JOIN shadow_rollup sr ON sr.company_id = cp.company_id
LEFT JOIN research_v2.company_queue q ON q.company_id = cp.company_id
LEFT JOIN publication_v2.profile_completeness pc ON pc.company_id = cp.company_id
JOIN publication_v2.company_controls pcc ON pcc.company_id = cp.company_id;

CREATE OR REPLACE VIEW publication_v2.preview_companies AS
SELECT *
FROM publication_v2.company_directory
WHERE allow_preview_publication = true;

CREATE OR REPLACE VIEW publication_v2.data_completeness_summary AS
SELECT
  count(*) AS total_companies,
  count(*) FILTER (WHERE has_founding_date) AS with_founding_date,
  count(*) FILTER (WHERE has_summary) AS with_summary,
  count(*) FILTER (WHERE has_customer_summary) AS with_customer_summary,
  count(*) FILTER (WHERE has_size) AS with_size,
  count(*) FILTER (WHERE has_operating_status) AS with_operating_status,
  count(*) FILTER (WHERE has_ownership_status) AS with_ownership_status,
  count(*) FILTER (WHERE has_investors) AS with_investors,
  round(avg(completeness_percent), 1) AS average_core_completeness,
  sum(source_count) AS source_records,
  count(*) FILTER (WHERE shadow_state IS NOT NULL) AS with_shadow_reference,
  count(*) FILTER (WHERE v2_state IS NOT NULL) AS with_signed_v2_state
FROM publication_v2.company_directory;

COMMIT;
