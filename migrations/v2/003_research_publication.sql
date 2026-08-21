BEGIN;

CREATE TABLE IF NOT EXISTS research_v2.sources (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  unit_id bigint REFERENCES engine_v2.product_units(id) ON DELETE RESTRICT,
  url text NOT NULL,
  title text,
  publisher text,
  source_type text,
  published_on date,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  company_controlled boolean,
  material_conflict boolean NOT NULL DEFAULT false,
  source_hash text,
  notes text,
  UNIQUE (company_id, url)
);

CREATE TABLE IF NOT EXISTS research_v2.claims (
  id bigserial PRIMARY KEY,
  source_id bigint NOT NULL REFERENCES research_v2.sources(id) ON DELETE CASCADE,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  unit_id bigint REFERENCES engine_v2.product_units(id) ON DELETE RESTRICT,
  claim_type text NOT NULL,
  claim_text text NOT NULL,
  support_status text NOT NULL
    CHECK (support_status IN ('supports','contradicts','context','unclear')),
  rule_code text
    CHECK (rule_code IS NULL OR rule_code IN ('R1','R2','R3','R4','R5','Readiness','Profile')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_v2.company_queue (
  company_id bigint PRIMARY KEY REFERENCES public.companies(id) ON DELETE RESTRICT,
  priority_tier smallint NOT NULL CHECK (priority_tier BETWEEN 1 AND 4),
  priority_reason text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','researching','review','complete','blocked')),
  profile_status text NOT NULL DEFAULT 'queued'
    CHECK (profile_status IN ('queued','researching','review','complete','blocked')),
  engine_status text NOT NULL DEFAULT 'queued'
    CHECK (engine_status IN ('queued','researching','review','complete','blocked')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_action text,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_v2.tasks (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  unit_id bigint REFERENCES engine_v2.product_units(id) ON DELETE RESTRICT,
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  task_type text NOT NULL,
  question text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','researching','review','complete','blocked')),
  attempts integer NOT NULL DEFAULT 0,
  assigned_to text,
  due_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS research_v2.runs (
  id bigserial PRIMARY KEY,
  methodology_version text NOT NULL,
  methodology_hash text NOT NULL,
  runner text NOT NULL,
  model text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  FOREIGN KEY (methodology_version, methodology_hash)
    REFERENCES engine_v2.methodology_versions(version, content_hash)
);

CREATE TABLE IF NOT EXISTS publication_v2.company_controls (
  company_id bigint PRIMARY KEY REFERENCES public.companies(id) ON DELETE RESTRICT,
  all_material_units_identified boolean NOT NULL DEFAULT false,
  human_review_complete boolean NOT NULL DEFAULT false,
  allow_preview_publication boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS company_profiles_name_trgm_idx
  ON directory_v2.company_profiles USING gin (canonical_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS company_profiles_country_idx
  ON directory_v2.company_profiles (country);
CREATE INDEX IF NOT EXISTS company_profiles_status_idx
  ON directory_v2.company_profiles (operating_status, ownership_status);
CREATE INDEX IF NOT EXISTS sources_company_idx
  ON research_v2.sources (company_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS tasks_queue_idx
  ON research_v2.tasks (status, priority, created_at);
CREATE INDEX IF NOT EXISTS company_queue_priority_idx
  ON research_v2.company_queue (status, priority_tier, company_id);

COMMIT;
