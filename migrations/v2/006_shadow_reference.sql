BEGIN;

CREATE TABLE IF NOT EXISTS research_v2.shadow_assessments (
  id bigserial PRIMARY KEY,
  company_id bigint REFERENCES public.companies(id) ON DELETE RESTRICT,
  company_name text NOT NULL,
  source_sheet text NOT NULL,
  currently_public boolean,
  legacy_state text,
  provisional_state text,
  admission_route text,
  causal_position text,
  r1 text,
  r2 text,
  r3 text,
  r4 text,
  r5 text,
  readiness text,
  confidence text,
  rationale text,
  next_action text,
  source_workbook text NOT NULL,
  authoritative boolean NOT NULL DEFAULT false CHECK (authoritative = false),
  import_hash text NOT NULL UNIQUE,
  imported_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE research_v2.shadow_assessments IS
  'Unsigned QA reference imported from the Engine V2 shadow workbook. It cannot create product units, rule assessments, signed verdicts or publication rights.';

CREATE TABLE IF NOT EXISTS research_v2.legacy_rejudgement_leads (
  id bigserial PRIMARY KEY,
  company_id bigint REFERENCES public.companies(id) ON DELETE RESTRICT,
  company_name text NOT NULL,
  source_sheet text NOT NULL,
  legacy_pattern text,
  provisional_state text,
  admission_route text,
  rule_or_gate text,
  treatment text,
  next_action text,
  publication_treatment text,
  source_workbook text NOT NULL,
  authoritative boolean NOT NULL DEFAULT false CHECK (authoritative = false),
  import_hash text NOT NULL UNIQUE,
  imported_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE research_v2.legacy_rejudgement_leads IS
  'Procedural reopening and prioritisation leads only. A row is not a V2 admission, exclusion or verdict.';

CREATE TABLE IF NOT EXISTS research_v2.attribute_correction_leads (
  id bigserial PRIMARY KEY,
  company_id bigint REFERENCES public.companies(id) ON DELETE RESTRICT,
  company_name text NOT NULL,
  current_field text,
  required_correction text,
  verdict_effect text,
  source_workbook text NOT NULL,
  authoritative boolean NOT NULL DEFAULT false CHECK (authoritative = false),
  import_hash text NOT NULL UNIQUE,
  imported_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE research_v2.attribute_correction_leads IS
  'Post-verdict routing and attribute QA leads. They never alter R1–R5.';

CREATE INDEX IF NOT EXISTS shadow_assessments_company_idx
  ON research_v2.shadow_assessments (company_id, provisional_state);
CREATE INDEX IF NOT EXISTS legacy_rejudgement_leads_company_idx
  ON research_v2.legacy_rejudgement_leads (company_id, source_sheet);
CREATE INDEX IF NOT EXISTS attribute_correction_leads_company_idx
  ON research_v2.attribute_correction_leads (company_id);

CREATE OR REPLACE FUNCTION research_v2.resolve_reference_company_ids()
RETURNS TABLE(reference_table text, resolved integer, unresolved integer)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE research_v2.shadow_assessments r
  SET company_id = c.id
  FROM public.companies c
  WHERE r.company_id IS NULL
    AND lower(btrim(r.company_name)) = lower(btrim(c.name));

  UPDATE research_v2.legacy_rejudgement_leads r
  SET company_id = c.id
  FROM public.companies c
  WHERE r.company_id IS NULL
    AND lower(btrim(r.company_name)) = lower(btrim(c.name));

  UPDATE research_v2.attribute_correction_leads r
  SET company_id = c.id
  FROM public.companies c
  WHERE r.company_id IS NULL
    AND lower(btrim(r.company_name)) = lower(btrim(c.name));

  RETURN QUERY
  SELECT 'shadow_assessments',
         count(*) FILTER (WHERE company_id IS NOT NULL)::integer,
         count(*) FILTER (WHERE company_id IS NULL)::integer
  FROM research_v2.shadow_assessments
  UNION ALL
  SELECT 'legacy_rejudgement_leads',
         count(*) FILTER (WHERE company_id IS NOT NULL)::integer,
         count(*) FILTER (WHERE company_id IS NULL)::integer
  FROM research_v2.legacy_rejudgement_leads
  UNION ALL
  SELECT 'attribute_correction_leads',
         count(*) FILTER (WHERE company_id IS NOT NULL)::integer,
         count(*) FILTER (WHERE company_id IS NULL)::integer
  FROM research_v2.attribute_correction_leads;
END;
$$;

CREATE OR REPLACE VIEW publication_v2.shadow_reference_summary AS
SELECT
  count(*) AS total_shadow_rows,
  count(*) FILTER (WHERE company_id IS NOT NULL) AS resolved_shadow_rows,
  count(*) FILTER (WHERE company_id IS NULL) AS unresolved_shadow_rows,
  count(*) FILTER (WHERE provisional_state = 'Listed') AS provisional_listed,
  count(*) FILTER (WHERE provisional_state = 'Pending') AS provisional_pending,
  count(*) FILTER (WHERE provisional_state = 'Excluded') AS provisional_excluded,
  count(*) FILTER (WHERE provisional_state = 'Split') AS provisional_split,
  count(*) FILTER (WHERE provisional_state = 'No verdict') AS provisional_no_verdict
FROM research_v2.shadow_assessments;

COMMIT;
