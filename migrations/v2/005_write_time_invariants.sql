BEGIN;

UPDATE engine_v2.methodology_versions
SET canonical_public_path = '/v2/engine-v2-canonical.md'
WHERE version = '2.0';

CREATE OR REPLACE FUNCTION engine_v2.enforce_active_methodology()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM engine_v2.methodology_versions mv
    WHERE mv.version = NEW.methodology_version
      AND mv.content_hash = NEW.methodology_hash
      AND mv.active = true
  ) THEN
    RAISE EXCEPTION 'V2 write rejected: methodology version/hash is not active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rule_assessments_active_methodology_trg ON engine_v2.rule_assessments;
CREATE TRIGGER rule_assessments_active_methodology_trg
BEFORE INSERT OR UPDATE ON engine_v2.rule_assessments
FOR EACH ROW EXECUTE FUNCTION engine_v2.enforce_active_methodology();

DROP TRIGGER IF EXISTS readiness_active_methodology_trg ON engine_v2.readiness_assessments;
CREATE TRIGGER readiness_active_methodology_trg
BEFORE INSERT OR UPDATE ON engine_v2.readiness_assessments
FOR EACH ROW EXECUTE FUNCTION engine_v2.enforce_active_methodology();

DROP TRIGGER IF EXISTS verdict_candidates_active_methodology_trg ON engine_v2.verdict_candidates;
CREATE TRIGGER verdict_candidates_active_methodology_trg
BEFORE INSERT OR UPDATE ON engine_v2.verdict_candidates
FOR EACH ROW EXECUTE FUNCTION engine_v2.enforce_active_methodology();

DROP TRIGGER IF EXISTS signed_verdicts_active_methodology_trg ON engine_v2.signed_verdicts;
CREATE TRIGGER signed_verdicts_active_methodology_trg
BEFORE INSERT OR UPDATE ON engine_v2.signed_verdicts
FOR EACH ROW EXECUTE FUNCTION engine_v2.enforce_active_methodology();

CREATE OR REPLACE FUNCTION engine_v2.block_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; insert a superseding record instead', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS rule_assessments_append_only_trg ON engine_v2.rule_assessments;
CREATE TRIGGER rule_assessments_append_only_trg
BEFORE UPDATE OR DELETE ON engine_v2.rule_assessments
FOR EACH ROW EXECUTE FUNCTION engine_v2.block_append_only_change();

DROP TRIGGER IF EXISTS readiness_append_only_trg ON engine_v2.readiness_assessments;
CREATE TRIGGER readiness_append_only_trg
BEFORE UPDATE OR DELETE ON engine_v2.readiness_assessments
FOR EACH ROW EXECUTE FUNCTION engine_v2.block_append_only_change();

DROP TRIGGER IF EXISTS verdict_candidates_append_only_trg ON engine_v2.verdict_candidates;
CREATE TRIGGER verdict_candidates_append_only_trg
BEFORE UPDATE OR DELETE ON engine_v2.verdict_candidates
FOR EACH ROW EXECUTE FUNCTION engine_v2.block_append_only_change();

CREATE OR REPLACE FUNCTION engine_v2.guard_signed_verdict_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'engine_v2.signed_verdicts is append-only';
  END IF;

  IF OLD.superseded_at IS NOT NULL
     OR NEW.superseded_at IS NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
     OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
     OR NEW.methodology_version IS DISTINCT FROM OLD.methodology_version
     OR NEW.methodology_hash IS DISTINCT FROM OLD.methodology_hash
     OR NEW.verdict IS DISTINCT FROM OLD.verdict
     OR NEW.signer_name IS DISTINCT FROM OLD.signer_name
     OR NEW.signature_date IS DISTINCT FROM OLD.signature_date
     OR NEW.publication_reasoning IS DISTINCT FROM OLD.publication_reasoning
     OR NEW.published IS DISTINCT FROM OLD.published
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'signed verdicts may only be superseded once; other changes are forbidden';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS signed_verdicts_guard_change_trg ON engine_v2.signed_verdicts;
CREATE TRIGGER signed_verdicts_guard_change_trg
BEFORE UPDATE OR DELETE ON engine_v2.signed_verdicts
FOR EACH ROW EXECUTE FUNCTION engine_v2.guard_signed_verdict_change();

CREATE OR REPLACE FUNCTION engine_v2.validate_collection_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.collection = 'Technology'
     AND EXISTS (
       SELECT 1
       FROM engine_v2.unit_attributes ua
       WHERE ua.unit_id = NEW.unit_id
         AND ua.attribute IN ('Invasive', 'Drug or Biologic')
     ) THEN
    RAISE EXCEPTION 'Technology collection cannot contain an Invasive or Drug or Biologic unit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_collections_validate_trg ON engine_v2.unit_collections;
CREATE TRIGGER unit_collections_validate_trg
BEFORE INSERT OR UPDATE ON engine_v2.unit_collections
FOR EACH ROW EXECUTE FUNCTION engine_v2.validate_collection_assignment();

CREATE OR REPLACE FUNCTION engine_v2.validate_attribute_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.attribute IN ('Invasive', 'Drug or Biologic')
     AND EXISTS (
       SELECT 1
       FROM engine_v2.unit_collections uc
       WHERE uc.unit_id = NEW.unit_id
         AND uc.collection = 'Technology'
     ) THEN
    RAISE EXCEPTION 'Invasive and Drug or Biologic units must be routed to Biotech & invasive medicine';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_attributes_validate_trg ON engine_v2.unit_attributes;
CREATE TRIGGER unit_attributes_validate_trg
BEFORE INSERT OR UPDATE ON engine_v2.unit_attributes
FOR EACH ROW EXECUTE FUNCTION engine_v2.validate_attribute_assignment();

CREATE OR REPLACE FUNCTION engine_v2.validate_signed_verdict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate engine_v2.verdict_candidates%ROWTYPE;
  readiness engine_v2.readiness_assessments%ROWTYPE;
  total_rules integer;
  passed_rules integer;
  failed_rules integer;
  unresolved_rules integer;
  company_id_value bigint;
  controls publication_v2.company_controls%ROWTYPE;
BEGIN
  SELECT * INTO candidate
  FROM engine_v2.verdict_candidates vc
  WHERE vc.id = NEW.candidate_id;

  IF NOT FOUND
     OR candidate.unit_id <> NEW.unit_id
     OR candidate.methodology_version <> NEW.methodology_version
     OR candidate.methodology_hash <> NEW.methodology_hash
     OR candidate.proposed_verdict IS DISTINCT FROM NEW.verdict THEN
    RAISE EXCEPTION 'signed verdict does not match its candidate';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE result = 'Pass'),
    count(*) FILTER (WHERE result = 'Fail'),
    count(*) FILTER (WHERE result = 'Unresolved')
  INTO total_rules, passed_rules, failed_rules, unresolved_rules
  FROM (
    SELECT DISTINCT ON (ra.rule_code) ra.result
    FROM engine_v2.rule_assessments ra
    WHERE ra.unit_id = NEW.unit_id
      AND ra.methodology_version = NEW.methodology_version
      AND ra.methodology_hash = NEW.methodology_hash
    ORDER BY ra.rule_code, ra.assessed_at DESC, ra.id DESC
  ) latest_rules;

  IF total_rules <> 5 THEN
    RAISE EXCEPTION 'signed verdict requires one current assessment for every R1–R5 rule';
  END IF;

  IF NEW.verdict IN ('Listed', 'Pending')
     AND (passed_rules <> 5 OR failed_rules <> 0 OR unresolved_rules <> 0) THEN
    RAISE EXCEPTION '% requires five Pass rule results', NEW.verdict;
  END IF;

  IF NEW.verdict = 'Excluded' AND failed_rules < 1 THEN
    RAISE EXCEPTION 'Excluded requires at least one current R1–R5 Fail';
  END IF;

  SELECT * INTO readiness
  FROM engine_v2.readiness_assessments ra
  WHERE ra.unit_id = NEW.unit_id
    AND ra.methodology_version = NEW.methodology_version
    AND ra.methodology_hash = NEW.methodology_hash
  ORDER BY ra.assessed_at DESC, ra.id DESC
  LIMIT 1;

  IF NEW.verdict = 'Listed' THEN
    IF NOT FOUND
       OR readiness.result <> 'Ready'
       OR jsonb_array_length(readiness.missing_conditions) <> 0 THEN
      RAISE EXCEPTION 'Listed requires a current Ready assessment with no missing conditions';
    END IF;
  ELSIF NEW.verdict = 'Pending' THEN
    IF NOT FOUND
       OR readiness.result <> 'Pending'
       OR jsonb_array_length(readiness.missing_conditions) = 0
       OR readiness.review_date IS NULL
       OR btrim(coalesce(readiness.verification_route, '')) = '' THEN
      RAISE EXCEPTION 'Pending requires named gaps, a verification route and a review date';
    END IF;
  END IF;

  IF NEW.published THEN
    SELECT pu.company_id INTO company_id_value
    FROM engine_v2.product_units pu
    WHERE pu.id = NEW.unit_id;

    SELECT * INTO controls
    FROM publication_v2.company_controls pc
    WHERE pc.company_id = company_id_value;

    IF NOT FOUND
       OR controls.all_material_units_identified = false
       OR controls.human_review_complete = false
       OR controls.allow_preview_publication = false THEN
      RAISE EXCEPTION 'published verdict requires completed company controls and explicit preview permission';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM engine_v2.unit_collections uc WHERE uc.unit_id = NEW.unit_id
    ) THEN
      RAISE EXCEPTION 'published verdict requires a collection assignment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS signed_verdicts_validate_trg ON engine_v2.signed_verdicts;
CREATE TRIGGER signed_verdicts_validate_trg
BEFORE INSERT ON engine_v2.signed_verdicts
FOR EACH ROW EXECUTE FUNCTION engine_v2.validate_signed_verdict();

CREATE OR REPLACE VIEW publication_v2.verdict_integrity AS
WITH latest_rules AS (
  SELECT DISTINCT ON (unit_id, rule_code)
    unit_id, rule_code, result, methodology_version, methodology_hash
  FROM engine_v2.rule_assessments
  ORDER BY unit_id, rule_code, assessed_at DESC, id DESC
), rules AS (
  SELECT
    unit_id,
    count(*) AS total_rules,
    count(*) FILTER (WHERE result = 'Pass') AS passed_rules,
    count(*) FILTER (WHERE result = 'Fail') AS failed_rules,
    count(*) FILTER (WHERE result = 'Unresolved') AS unresolved_rules,
    min(methodology_version) AS methodology_version,
    min(methodology_hash) AS methodology_hash
  FROM latest_rules
  GROUP BY unit_id
)
SELECT
  pu.id AS unit_id,
  pu.company_id,
  pu.product_name,
  COALESCE(r.total_rules, 0) AS total_rules,
  COALESCE(r.passed_rules, 0) AS passed_rules,
  COALESCE(r.failed_rules, 0) AS failed_rules,
  COALESCE(r.unresolved_rules, 0) AS unresolved_rules,
  cra.result AS readiness_result,
  csv.verdict AS signed_verdict,
  CASE
    WHEN csv.verdict = 'Listed' THEN COALESCE(r.passed_rules, 0) = 5 AND cra.result = 'Ready'
    WHEN csv.verdict = 'Pending' THEN COALESCE(r.passed_rules, 0) = 5 AND cra.result = 'Pending'
    WHEN csv.verdict = 'Excluded' THEN COALESCE(r.failed_rules, 0) >= 1
    WHEN csv.verdict IS NULL THEN true
    ELSE false
  END AS structurally_valid
FROM engine_v2.product_units pu
LEFT JOIN rules r ON r.unit_id = pu.id
LEFT JOIN publication_v2.current_readiness_assessments cra ON cra.unit_id = pu.id
LEFT JOIN publication_v2.current_signed_verdicts csv ON csv.unit_id = pu.id;

COMMIT;
