BEGIN;

CREATE OR REPLACE VIEW publication_v2.provisional_collection_routing AS
WITH invasive_leads AS (
  SELECT company_id,
         bool_or(lower(required_correction) LIKE '%add invasive%') AS invasive,
         string_agg(required_correction, ' | ' ORDER BY id) AS lead_reason
  FROM research_v2.attribute_correction_leads
  WHERE company_id IS NOT NULL
  GROUP BY company_id
)
SELECT
  cp.company_id,
  CASE
    WHEN COALESCE(il.invasive, false) THEN 'Biotech & invasive medicine'
    WHEN lower(coalesce(cp.legacy_entity_type, '')) = 'drug' THEN 'Biotech & invasive medicine'
    WHEN lower(coalesce(c.category, '')) ~ '(therapeutic|biopharma|pharma|drug|cell therapy|gene therapy|gene editing|oncology|immunology|antibody|structural heart|surgical|implant)' THEN 'Biotech & invasive medicine'
    ELSE 'Technology'
  END AS provisional_collection,
  CASE
    WHEN COALESCE(il.invasive, false) THEN 'Existing routing review identifies an invasive product. Product-level confirmation remains required.'
    WHEN lower(coalesce(cp.legacy_entity_type, '')) = 'drug' THEN 'Legacy record identifies a drug unit. Product-level confirmation remains required.'
    WHEN lower(coalesce(c.category, '')) ~ '(therapeutic|biopharma|pharma|drug|cell therapy|gene therapy|gene editing|oncology|immunology|antibody|structural heart|surgical|implant)' THEN 'Legacy product description indicates a drug, biologic, invasive or surgical unit. Product-level confirmation remains required.'
    ELSE 'No current evidence of a drug, biologic, implant, invasive device or surgical unit. Product-level confirmation remains required.'
  END AS routing_rationale,
  CASE
    WHEN COALESCE(il.invasive, false) OR lower(coalesce(cp.legacy_entity_type, '')) = 'drug' THEN 'medium'
    ELSE 'low'
  END AS routing_confidence,
  true AS provisional
FROM directory_v2.company_profiles cp
JOIN public.companies c ON c.id = cp.company_id
LEFT JOIN invasive_leads il ON il.company_id = cp.company_id;

CREATE OR REPLACE VIEW publication_v2.company_directory_preview AS
SELECT
  cd.*,
  CASE
    WHEN cd.v2_state IS NOT NULL THEN cd.v2_state
    WHEN cd.shadow_state = 'Listed' THEN 'Main'
    WHEN cd.shadow_state = 'Pending' THEN 'Pending'
    WHEN cd.shadow_state = 'Excluded' THEN 'Excluded'
    ELSE NULL
  END AS preview_state,
  CASE
    WHEN cd.v2_state IS NOT NULL THEN 'signed'
    WHEN cd.shadow_state IN ('Listed','Pending','Excluded') THEN 'unsigned_shadow'
    WHEN cd.shadow_state = 'Split' THEN 'product_split_required'
    WHEN cd.shadow_state = 'No verdict' THEN 'no_verdict'
    ELSE 'unresearched'
  END AS preview_state_authority,
  pcr.provisional_collection,
  pcr.routing_rationale,
  pcr.routing_confidence,
  pcr.provisional AS collection_is_provisional
FROM publication_v2.company_directory cd
JOIN publication_v2.provisional_collection_routing pcr ON pcr.company_id = cd.id;

CREATE OR REPLACE VIEW publication_v2.preview_progress AS
SELECT
  rp.*,
  dcs.with_founding_date,
  dcs.with_summary,
  dcs.with_customer_summary,
  dcs.with_size,
  dcs.with_operating_status,
  dcs.with_ownership_status,
  dcs.with_investors,
  dcs.average_core_completeness,
  dcs.source_records,
  dcs.with_shadow_reference,
  dcs.with_signed_v2_state,
  srs.provisional_listed,
  srs.provisional_pending,
  srs.provisional_excluded,
  srs.provisional_split,
  srs.provisional_no_verdict
FROM publication_v2.research_progress rp
CROSS JOIN publication_v2.data_completeness_summary dcs
CROSS JOIN publication_v2.shadow_reference_summary srs;

COMMENT ON VIEW publication_v2.company_directory_preview IS
  'Preview-only directory. Signed V2 states take precedence; otherwise clearly labelled unsigned shadow research may be displayed. It is never a publication ledger.';

COMMIT;
