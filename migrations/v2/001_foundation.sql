BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA IF NOT EXISTS directory_v2;
CREATE SCHEMA IF NOT EXISTS engine_v2;
CREATE SCHEMA IF NOT EXISTS research_v2;
CREATE SCHEMA IF NOT EXISTS publication_v2;

CREATE TABLE IF NOT EXISTS engine_v2.methodology_versions (
  version text PRIMARY KEY,
  content_hash text NOT NULL UNIQUE,
  title text NOT NULL,
  canonical_repository_path text NOT NULL,
  canonical_public_path text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  created_by text NOT NULL,
  notes text,
  UNIQUE (version, content_hash)
);

INSERT INTO engine_v2.methodology_versions (
  version, content_hash, title, canonical_repository_path,
  canonical_public_path, active, activated_at, created_by, notes
)
VALUES (
  '2.0',
  '1f317d5ff9801a9de935153adca45032dc7e4790e7d9f9b8c354963458a47207',
  'useful.vc Engine Methodology V2',
  'methodology/useful-vc-engine-v2-canonical.md',
  '/v2/methodology',
  true,
  now(),
  'ChatGPT takeover branch',
  'Isolated V2 preview methodology. Production V1 remains authoritative until explicit cutover.'
)
ON CONFLICT (version) DO UPDATE SET
  content_hash = EXCLUDED.content_hash,
  title = EXCLUDED.title,
  canonical_repository_path = EXCLUDED.canonical_repository_path,
  canonical_public_path = EXCLUDED.canonical_public_path,
  active = EXCLUDED.active,
  activated_at = COALESCE(engine_v2.methodology_versions.activated_at, EXCLUDED.activated_at),
  notes = EXCLUDED.notes;

UPDATE engine_v2.methodology_versions
SET active = (version = '2.0')
WHERE active IS DISTINCT FROM (version = '2.0');

CREATE TABLE IF NOT EXISTS directory_v2.company_profiles (
  company_id bigint PRIMARY KEY REFERENCES public.companies(id) ON DELETE RESTRICT,
  canonical_name text NOT NULL,
  website text,
  country text,
  founded_on date,
  founding_year smallint,
  founding_precision text NOT NULL DEFAULT 'unknown'
    CHECK (founding_precision IN ('day','month','year','approximate','unknown')),
  plain_summary text,
  customer_summary text,
  employee_estimate integer CHECK (employee_estimate IS NULL OR employee_estimate >= 0),
  employee_band text NOT NULL DEFAULT 'Unknown'
    CHECK (employee_band IN ('1–10','11–50','51–200','201–500','501–1,000','1,001+','Unknown')),
  disclosed_funding_total numeric,
  funding_currency text,
  latest_funding_date date,
  latest_funding_type text,
  latest_funding_amount numeric,
  latest_funding_currency text,
  operating_status text NOT NULL DEFAULT 'Uncertain'
    CHECK (operating_status IN ('Active','Inactive','Bankrupt or liquidated','Uncertain')),
  ownership_status text NOT NULL DEFAULT 'Uncertain'
    CHECK (ownership_status IN ('Independent private','Acquired or sold','Publicly listed','Subsidiary','Merged','Uncertain')),
  current_owner text,
  regulatory_summary text,
  profile_confidence numeric(4,3)
    CHECK (profile_confidence IS NULL OR (profile_confidence >= 0 AND profile_confidence <= 1)),
  evidence_date date,
  research_state text NOT NULL DEFAULT 'queued'
    CHECK (research_state IN ('queued','researching','review','complete','blocked')),
  unresolved_reason text,
  legacy_public_state text,
  legacy_publication_scope text,
  legacy_entity_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS directory_v2.company_aliases (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_type text NOT NULL DEFAULT 'former_name'
    CHECK (alias_type IN ('former_name','trading_name','product_name','legal_name','other')),
  source_url text,
  evidence_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_aliases_unique_idx
  ON directory_v2.company_aliases (company_id, lower(btrim(alias)));

CREATE TABLE IF NOT EXISTS directory_v2.customer_tags (
  tag text PRIMARY KEY,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS directory_v2.company_customer_tags (
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag text NOT NULL REFERENCES directory_v2.customer_tags(tag) ON DELETE RESTRICT,
  source_url text,
  evidence_date date,
  PRIMARY KEY (company_id, tag)
);

CREATE TABLE IF NOT EXISTS directory_v2.company_status_history (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  operating_status text NOT NULL
    CHECK (operating_status IN ('Active','Inactive','Bankrupt or liquidated','Uncertain')),
  ownership_status text NOT NULL
    CHECK (ownership_status IN ('Independent private','Acquired or sold','Publicly listed','Subsidiary','Merged','Uncertain')),
  current_owner text,
  effective_on date,
  checked_on date NOT NULL,
  source_url text NOT NULL,
  source_title text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
