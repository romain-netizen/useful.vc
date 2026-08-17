ALTER TABLE public.companies
  ADD COLUMN entity_type text NOT NULL DEFAULT 'company',
  ADD CONSTRAINT companies_entity_type_check
    CHECK (entity_type IN ('company', 'asset', 'drug'));

COMMENT ON COLUMN public.companies.entity_type IS
  'Public directory grouping. Clinical assets and drugs are screened but kept out of company lists and company statistics.';

UPDATE public.companies AS c
SET entity_type = classification.entity_type,
    updated_at = now()
FROM (
  VALUES
    (1054::bigint, 'AM Pharma', 'drug'),
    (1172::bigint, 'ARTHEx Biotech', 'drug'),
    (1323::bigint, 'Abivax', 'drug'),
    (1049::bigint, 'Adcytherix', 'drug'),
    (1170::bigint, 'Agomab Therapeutics', 'drug'),
    (1050::bigint, 'Alveus Therapeutics', 'drug'),
    (1325::bigint, 'Ariceum Therapeutics', 'drug'),
    (1344::bigint, 'Artios Pharma', 'drug'),
    (1173::bigint, 'Augustine Therapeutics', 'drug'),
    (1355::bigint, 'Avalyn Pharma', 'drug'),
    (1158::bigint, 'Coave Therapeutics', 'drug'),
    (1175::bigint, 'DiogenX', 'drug'),
    (1317::bigint, 'EG 427', 'drug'),
    (1346::bigint, 'ENYO Pharma', 'drug'),
    (1334::bigint, 'Evommune', 'drug'),
    (1340::bigint, 'Exciva', 'drug'),
    (1349::bigint, 'Grey Wolf Therapeutics', 'drug'),
    (1319::bigint, 'Inventiva', 'drug'),
    (692::bigint, 'Invoke Bio', 'drug'),
    (1188::bigint, 'Kiji Therapeutics', 'drug'),
    (694::bigint, 'Kyron.bio', 'drug'),
    (1201::bigint, 'Medincell', 'drug'),
    (1330::bigint, 'Mineralys Therapeutics', 'drug'),
    (1205::bigint, 'Minoryx Therapeutics', 'drug'),
    (305::bigint, 'Neotis', 'drug'),
    (1322::bigint, 'Nouscom', 'drug'),
    (1207::bigint, 'Nuclidium', 'drug'),
    (1208::bigint, 'Nuevocor', 'drug'),
    (1336::bigint, 'Pega-One', 'asset'),
    (1211::bigint, 'Pharvaris', 'drug'),
    (1373::bigint, 'Poxel', 'drug'),
    (1214::bigint, 'RyCarma Therapeutics', 'drug'),
    (1225::bigint, 'STEP Pharma', 'drug'),
    (1216::bigint, 'SciRhom', 'drug'),
    (1179::bigint, 'SparingVision', 'drug'),
    (1228::bigint, 'Synendos Therapeutics', 'drug'),
    (1342::bigint, 'T-Knife Therapeutics', 'drug'),
    (1332::bigint, 'TargED Biopharmaceuticals', 'drug'),
    (1231::bigint, 'Vico Therapeutics', 'drug'),
    (1234::bigint, 'Zealand Pharma', 'drug'),
    (631::bigint, 'BOYDSense', 'asset'),
    (632::bigint, 'BioSerenity', 'asset'),
    (1326::bigint, 'BioVentrix', 'asset'),
    (724::bigint, 'Bodyport', 'asset'),
    (826::bigint, 'Damae Medical SAS', 'asset'),
    (1162::bigint, 'Deepull', 'asset'),
    (1327::bigint, 'FIRE1', 'asset'),
    (1194::bigint, 'Ganymed Robotics', 'asset'),
    (1343::bigint, 'HighLife Medical', 'asset'),
    (1380::bigint, 'JenaValve Technology', 'asset'),
    (1320::bigint, 'Kestra Medical Technologies', 'asset'),
    (1384::bigint, 'MDxHealth', 'asset'),
    (1351::bigint, 'Medical Microinstruments', 'asset'),
    (1335::bigint, 'Nyxoah', 'asset'),
    (1313::bigint, 'Rivermark Medical', 'asset'),
    (1404::bigint, 'SURGAR', 'asset'),
    (1315::bigint, 'Spiro Medical', 'asset'),
    (26::bigint, 'SquareMind', 'asset'),
    (420::bigint, 'StratifAI', 'asset'),
    (1347::bigint, 'TRiCares', 'asset'),
    (1407::bigint, 'Tilak Healthcare', 'asset'),
    (1028::bigint, 'Us2.ai', 'asset'),
    (621::bigint, 'Waiv', 'asset'),
    (1397::bigint, 'hema.to', 'asset')
) AS classification(id, name, entity_type)
WHERE c.id = classification.id
  AND c.name = classification.name;

CREATE INDEX idx_companies_entity_type_state
  ON public.companies (entity_type, public_state);

CREATE OR REPLACE VIEW public.public_companies AS
SELECT
  c.id,
  c.name,
  c.category,
  c.public_state,
  c.commercialised,
  c.what_it_needs_to_qualify,
  c.notes,
  c.website,
  c.country,
  c.last_reviewed,
  c.methodology_version,
  c.publishable,
  c.evidence_summary,
  c.created_at,
  c.updated_at,
  c.operating_status,
  c.former_names,
  c.acquirer_successor,
  c.status_checked_at,
  c.status_source_url,
  c.entity_type
FROM public.companies AS c
WHERE c.public_state IN ('Main', 'Pending')
  AND COALESCE(c.publishable, true) = true
  AND COALESCE(c.operating_status, 'ACTIVE') NOT IN (
    'ACQUIRED / EXITED — ABSORBED',
    'INACTIVE / DORMANT',
    'INSOLVENT / BANKRUPT / LIQUIDATED'
  )
  AND (
    SELECT count(*)
    FROM public.criterion_reviews AS cr
    WHERE cr.company_id = c.id
      AND cr.verdict = 'PASS'
  ) = 8
  AND NOT EXISTS (
    SELECT 1
    FROM public.criterion_reviews AS cr
    WHERE cr.company_id = c.id
      AND cr.verdict <> 'PASS'
  );
