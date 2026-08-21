BEGIN;

INSERT INTO directory_v2.company_profiles (
  company_id, canonical_name, website, country, plain_summary,
  operating_status, ownership_status, current_owner, evidence_date,
  research_state, legacy_public_state, legacy_publication_scope,
  legacy_entity_type, unresolved_reason
)
SELECT
  c.id,
  c.name,
  c.website,
  c.country,
  NULLIF(btrim(c.evidence_summary), ''),
  CASE
    WHEN lower(coalesce(c.operating_status, '')) IN ('active','operating') THEN 'Active'
    WHEN lower(coalesce(c.operating_status, '')) IN ('inactive','dormant') THEN 'Inactive'
    WHEN lower(coalesce(c.operating_status, '')) ~ '(bankrupt|liquidat|insolven)' THEN 'Bankrupt or liquidated'
    ELSE 'Uncertain'
  END,
  CASE
    WHEN lower(coalesce(c.lifecycle_state, '')) ~ '(acquir|sold)'
      OR NULLIF(btrim(c.acquirer_successor), '') IS NOT NULL THEN 'Acquired or sold'
    WHEN lower(coalesce(c.lifecycle_state, '')) ~ '(public|listed|ipo)' THEN 'Publicly listed'
    WHEN lower(coalesce(c.lifecycle_state, '')) ~ 'merged' THEN 'Merged'
    WHEN lower(coalesce(c.operating_status, '')) IN ('active','operating') THEN 'Independent private'
    ELSE 'Uncertain'
  END,
  NULLIF(btrim(c.acquirer_successor), ''),
  c.status_checked_at,
  'queued',
  c.public_state,
  c.publication_scope,
  c.entity_type,
  'V2 profile enrichment pending; legacy fields copied only as research leads.'
FROM public.companies c
ON CONFLICT (company_id) DO UPDATE SET
  canonical_name = EXCLUDED.canonical_name,
  website = COALESCE(directory_v2.company_profiles.website, EXCLUDED.website),
  country = COALESCE(directory_v2.company_profiles.country, EXCLUDED.country),
  plain_summary = COALESCE(directory_v2.company_profiles.plain_summary, EXCLUDED.plain_summary),
  legacy_public_state = EXCLUDED.legacy_public_state,
  legacy_publication_scope = EXCLUDED.legacy_publication_scope,
  legacy_entity_type = EXCLUDED.legacy_entity_type,
  updated_at = now();

INSERT INTO publication_v2.company_controls (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;

WITH legacy_failures AS (
  SELECT
    c.id AS company_id,
    count(*) FILTER (WHERE cr.verdict = 'FAIL') AS fail_count
  FROM public.companies c
  LEFT JOIN public.criterion_reviews cr ON cr.company_id = c.id
  GROUP BY c.id
), public_now AS (
  SELECT id AS company_id FROM public.public_companies
)
INSERT INTO research_v2.company_queue (
  company_id, priority_tier, priority_reason, next_action, assigned_to
)
SELECT
  c.id,
  CASE
    WHEN p.company_id IS NOT NULL THEN 1
    WHEN c.public_state IN ('Main','Pending') THEN 1
    WHEN c.public_state = 'Excluded' AND lf.fail_count = 0 THEN 2
    WHEN c.public_state = 'Excluded' THEN 3
    ELSE 4
  END,
  CASE
    WHEN p.company_id IS NOT NULL THEN 'Currently published: rejudge before V2 preview cutover'
    WHEN c.public_state IN ('Main','Pending') THEN 'Legacy retained company: product-unit definition and V2 rejudgement required'
    WHEN c.public_state = 'Excluded' AND lf.fail_count = 0 THEN 'Legacy exclusion has no named FAIL and must be reopened'
    WHEN c.public_state = 'Excluded' THEN 'Legacy exclusion requires V2 rejudgement; old criteria carry no precedent'
    ELSE 'Unreviewed or nonstandard legacy state'
  END,
  'Resolve identity and status; identify every material current product-use unit; enrich profile; apply R1–R5; assess readiness.',
  'ChatGPT takeover pipeline'
FROM public.companies c
JOIN legacy_failures lf ON lf.company_id = c.id
LEFT JOIN public_now p ON p.company_id = c.id
ON CONFLICT (company_id) DO UPDATE SET
  priority_tier = EXCLUDED.priority_tier,
  priority_reason = EXCLUDED.priority_reason,
  next_action = EXCLUDED.next_action,
  updated_at = now();

INSERT INTO research_v2.tasks (
  company_id, priority, task_type, question, assigned_to
)
SELECT
  q.company_id,
  q.priority_tier,
  'full_v2_review',
  q.next_action,
  'ChatGPT takeover pipeline'
FROM research_v2.company_queue q
WHERE NOT EXISTS (
  SELECT 1 FROM research_v2.tasks t
  WHERE t.company_id = q.company_id
    AND t.task_type = 'full_v2_review'
);

CREATE OR REPLACE VIEW publication_v2.current_rule_assessments AS
SELECT DISTINCT ON (unit_id, rule_code)
  id, unit_id, methodology_version, methodology_hash, rule_code,
  result, rationale, factual_basis, threshold_or_test,
  contradictory_evidence, assessor, assessed_at
FROM engine_v2.rule_assessments
ORDER BY unit_id, rule_code, assessed_at DESC, id DESC;

CREATE OR REPLACE VIEW publication_v2.current_readiness_assessments AS
SELECT DISTINCT ON (unit_id)
  id, unit_id, methodology_version, methodology_hash, result,
  ordinary_external_use, contribution_evidence, causal_bridge_evidence,
  external_conversion_evidence, frontier_scale_evidence,
  missing_conditions, observable_thresholds, verification_route,
  next_milestone, review_date, rationale, assessor, assessed_at
FROM engine_v2.readiness_assessments
ORDER BY unit_id, assessed_at DESC, id DESC;

CREATE OR REPLACE VIEW publication_v2.current_signed_verdicts AS
SELECT
  sv.id, sv.unit_id, sv.candidate_id, sv.methodology_version,
  sv.methodology_hash, sv.verdict, sv.signer_name, sv.signature_date,
  sv.publication_reasoning, sv.published, sv.published_at, sv.created_at
FROM engine_v2.signed_verdicts sv
JOIN engine_v2.methodology_versions mv
  ON mv.version = sv.methodology_version
 AND mv.content_hash = sv.methodology_hash
 AND mv.active = true
WHERE sv.superseded_at IS NULL;

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
), funding_rollup AS (
  SELECT
    cf.company_id,
    sum(cf.amount) FILTER (WHERE cf.amount_disclosed) AS disclosed_funding_total_native,
    max(cf.announced_on) AS latest_funding_date
  FROM public.company_funding cf
  GROUP BY cf.company_id
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
  COALESCE(cp.disclosed_funding_total, fr.disclosed_funding_total_native) AS disclosed_funding_total,
  COALESCE(cp.latest_funding_date, fr.latest_funding_date) AS latest_funding_date,
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
    cp.country, cp.operating_status, cp.ownership_status, ir.investor_search
  ) AS search_text
FROM directory_v2.company_profiles cp
LEFT JOIN investor_rollup ir ON ir.company_id = cp.company_id
LEFT JOIN funding_rollup fr ON fr.company_id = cp.company_id
LEFT JOIN verdict_rollup vr ON vr.company_id = cp.company_id
JOIN publication_v2.company_controls pcc ON pcc.company_id = cp.company_id;

CREATE OR REPLACE VIEW publication_v2.preview_companies AS
SELECT *
FROM publication_v2.company_directory
WHERE allow_preview_publication = true;

CREATE OR REPLACE VIEW publication_v2.research_progress AS
SELECT
  count(*) AS total_companies,
  count(*) FILTER (WHERE status = 'complete') AS complete_companies,
  count(*) FILTER (WHERE status = 'review') AS review_companies,
  count(*) FILTER (WHERE status = 'researching') AS researching_companies,
  count(*) FILTER (WHERE status = 'queued') AS queued_companies,
  count(*) FILTER (WHERE status = 'blocked') AS blocked_companies,
  count(*) FILTER (WHERE priority_tier = 1) AS priority_one_companies,
  count(*) FILTER (WHERE priority_tier = 2) AS priority_two_companies
FROM research_v2.company_queue;

COMMIT;
