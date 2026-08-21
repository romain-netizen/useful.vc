BEGIN;

CREATE TABLE IF NOT EXISTS engine_v2.product_units (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  process_or_product text NOT NULL DEFAULT 'product'
    CHECK (process_or_product IN ('product','process','operated technical system')),
  material_version text NOT NULL DEFAULT 'current',
  intended_use text NOT NULL,
  claimed_outcome text NOT NULL,
  economic_model text NOT NULL,
  plain_summary text,
  customer_summary text,
  admission_route text
    CHECK (admission_route IN ('essential_outcome','frontier_capability')),
  causal_position text
    CHECK (causal_position IN ('direct','decision','enabling','frontier_capability')),
  active boolean NOT NULL DEFAULT true,
  source_scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, product_name, material_version, intended_use, claimed_outcome, economic_model)
);

CREATE TABLE IF NOT EXISTS engine_v2.rule_assessments (
  id bigserial PRIMARY KEY,
  unit_id bigint NOT NULL REFERENCES engine_v2.product_units(id) ON DELETE RESTRICT,
  methodology_version text NOT NULL,
  methodology_hash text NOT NULL,
  rule_code text NOT NULL CHECK (rule_code IN ('R1','R2','R3','R4','R5')),
  result text NOT NULL CHECK (result IN ('Pass','Fail','Unresolved')),
  rationale text NOT NULL,
  factual_basis text,
  threshold_or_test text,
  contradictory_evidence text,
  assessor text NOT NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id bigint REFERENCES engine_v2.rule_assessments(id) ON DELETE RESTRICT,
  FOREIGN KEY (methodology_version, methodology_hash)
    REFERENCES engine_v2.methodology_versions(version, content_hash)
);

CREATE TABLE IF NOT EXISTS engine_v2.readiness_assessments (
  id bigserial PRIMARY KEY,
  unit_id bigint NOT NULL REFERENCES engine_v2.product_units(id) ON DELETE RESTRICT,
  methodology_version text NOT NULL,
  methodology_hash text NOT NULL,
  result text NOT NULL CHECK (result IN ('Ready','Pending','Unresolved')),
  ordinary_external_use boolean,
  contribution_evidence boolean,
  causal_bridge_evidence boolean,
  external_conversion_evidence boolean,
  frontier_scale_evidence boolean,
  missing_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  observable_thresholds jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_route text,
  next_milestone text,
  review_date date,
  rationale text NOT NULL,
  assessor text NOT NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id bigint REFERENCES engine_v2.readiness_assessments(id) ON DELETE RESTRICT,
  FOREIGN KEY (methodology_version, methodology_hash)
    REFERENCES engine_v2.methodology_versions(version, content_hash),
  CHECK (result <> 'Pending' OR jsonb_array_length(missing_conditions) > 0),
  CHECK (result <> 'Pending' OR review_date IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS engine_v2.verdict_candidates (
  id bigserial PRIMARY KEY,
  unit_id bigint NOT NULL REFERENCES engine_v2.product_units(id) ON DELETE RESTRICT,
  methodology_version text NOT NULL,
  methodology_hash text NOT NULL,
  proposed_verdict text CHECK (proposed_verdict IN ('Listed','Pending','Excluded')),
  overall_reasoning text NOT NULL,
  confidence numeric(4,3)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  candidate_writer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id bigint REFERENCES engine_v2.verdict_candidates(id) ON DELETE RESTRICT,
  FOREIGN KEY (methodology_version, methodology_hash)
    REFERENCES engine_v2.methodology_versions(version, content_hash)
);

CREATE TABLE IF NOT EXISTS engine_v2.signed_verdicts (
  id bigserial PRIMARY KEY,
  unit_id bigint NOT NULL REFERENCES engine_v2.product_units(id) ON DELETE RESTRICT,
  candidate_id bigint NOT NULL REFERENCES engine_v2.verdict_candidates(id) ON DELETE RESTRICT,
  methodology_version text NOT NULL,
  methodology_hash text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('Listed','Pending','Excluded')),
  signer_name text NOT NULL,
  signature_date date NOT NULL,
  publication_reasoning text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (methodology_version, methodology_hash)
    REFERENCES engine_v2.methodology_versions(version, content_hash),
  CHECK ((published = false AND published_at IS NULL)
      OR (published = true AND published_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS one_current_signed_verdict_per_unit_idx
  ON engine_v2.signed_verdicts (unit_id)
  WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS engine_v2.unit_attributes (
  unit_id bigint NOT NULL REFERENCES engine_v2.product_units(id) ON DELETE CASCADE,
  attribute text NOT NULL CHECK (attribute IN ('Asset','Invasive','Drug or Biologic')),
  rationale text NOT NULL,
  source_url text,
  evidence_date date,
  PRIMARY KEY (unit_id, attribute)
);

CREATE TABLE IF NOT EXISTS engine_v2.unit_collections (
  unit_id bigint PRIMARY KEY REFERENCES engine_v2.product_units(id) ON DELETE CASCADE,
  collection text NOT NULL CHECK (collection IN ('Technology','Biotech & invasive medicine')),
  rationale text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rule_assessments_unit_idx
  ON engine_v2.rule_assessments (unit_id, rule_code, assessed_at DESC);
CREATE INDEX IF NOT EXISTS product_units_company_idx
  ON engine_v2.product_units (company_id, active);
CREATE INDEX IF NOT EXISTS product_units_name_trgm_idx
  ON engine_v2.product_units USING gin (product_name gin_trgm_ops);

COMMIT;
