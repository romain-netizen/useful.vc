# useful.vc V2 — Claude handoff

## Ownership

This branch is the sole Claude working branch:

```text
v2/claude-handoff-2026-08-21
```

Use only this Neon branch:

```text
Name: useful-vc-v2-claude-2026-08-21
ID: br-dawn-haze-avwyh1bd
Project: aged-unit-27578806
Database: neondb
```

Do not write to:

- `main`;
- the production Neon branch;
- `v2/engine-and-website`;
- `v2/chatgpt-takeover-2026-08-21`;
- `useful-vc-v2-shadow`;
- `useful-vc-v2-chatgpt-2026-08-21`;
- the production Cloudflare Worker or production domain.

Do not merge or deploy to production. Create a preview and a draft pull request only.

## Objective

Finish useful.vc V2 end to end:

1. preserve V1 unchanged and available as an archive;
2. apply Engine V2 to all 1,123 legacy companies at product-use-unit level;
3. enrich every company profile with founding date, plain-language description, customers, approximate size, status, investors and sources;
4. keep Main and Pending;
5. physically separate `Technology` from `Biotech & invasive medicine` after the verdict;
6. provide searchable company, product, investor, country, status, customer and size data;
7. publish full reasoning, evidence, missing facts, methodology version and signer;
8. deploy only an isolated preview;
9. leave production unchanged.

## Authoritative doctrine

Engine V2 is authoritative. Its registered values are:

```text
Version: 2.0
SHA-256: 1f317d5ff9801a9de935153adca45032dc7e4790e7d9f9b8c354963458a47207
```

Do not rewrite the doctrine, add named examples to the classifier, add sector shortcuts, target verdict counts or restore the V1 causal-proximity bias.

Core safeguards:

- importance and material additionality come before causal proximity;
- information, diagnostics and enabling technology do not fail merely because another professional performs the final act;
- direct physical action receives no automatic credit;
- carbon, avoided-emissions calculations, customer savings and policy-created value cannot qualify by themselves;
- pure deployment, installation, leasing, financing, distribution and substitutable labour fail without necessary company-built technical leverage;
- missing evidence cannot create Excluded;
- unresolved structure cannot create Pending;
- assets, invasive products, drugs and biologics are routing attributes after the verdict.

The concise public explanation is in `public/v2/methodology.html`. The exact canonical Markdown must be added at `methodology/useful-vc-engine-v2-canonical.md` before any classifier or bulk verdict run; its bytes must hash to the value above. Do not classify if the canonical file is absent or the hash differs.

## Work already implemented on this branch

- isolated V2 migration files:
  - `migrations/v2/001_foundation.sql`
  - `migrations/v2/002_engine.sql`
  - `migrations/v2/003_research_publication.sql`
  - `migrations/v2/004_seed_and_views.sql`
- product-level V2 engine schema;
- append-only rule, readiness, candidate and signed-verdict tables;
- separate directory, research and publication schemas;
- methodology version/hash registration;
- research queue logic for all legacy companies;
- searchable V2 API in `directory-v2-api.js`;
- V2 routing in `worker.js`;
- isolated preview config in `wrangler.v2.jsonc`;
- V2 directory shell, profile dialog, filters and responsive design under `public/v2/`;
- public manifesto and concise methodology pages;
- initial schema-contract tests under `tests/v2/`;
- package scripts for checks, tests and V2 preview deployment.

## Neon initialization

The Claude Neon branch was created from production for isolation. Apply, in order, only on branch `br-dawn-haze-avwyh1bd`:

```text
migrations/v2/001_foundation.sql
migrations/v2/002_engine.sql
migrations/v2/003_research_publication.sql
migrations/v2/004_seed_and_views.sql
```

Then verify:

- four V2 schemas exist;
- 1,123 company profiles exist;
- 1,123 company queue records exist;
- legacy public tables are unchanged;
- no preview publication control is enabled by default;
- active methodology version and hash match Engine V2.

Never point the preview Worker at any other Neon branch.

## Required remaining work

### 1. Complete and harden the database

- add deterministic write-time validation for Listed, Pending and Excluded;
- validate five current Pass results for Listed/Pending;
- require precise Pending gaps, thresholds, route and review date;
- require at least one R1–R5 failure for Excluded;
- enforce active methodology hash on every write;
- complete append-only supersession logic;
- add challenge, correction and audit records;
- add normalized regulatory classification and collection routing;
- add search indexes and query-performance tests;
- keep all legacy records historical and immutable.

### 2. Add the exact canonical methodology

Commit `methodology/useful-vc-engine-v2-canonical.md` and verify its SHA-256. Copy it identically into the classifier and coverage automation prompts. Block writes on any mismatch.

### 3. Build the research/classification pipeline

For every company:

1. resolve identity and corporate status;
2. identify all material current products/processes;
3. split platform, product, service, deployment and mixed units;
4. enrich the public profile;
5. apply R1–R5 separately;
6. assess readiness only after five structural passes;
7. conduct targeted second and third research passes for unresolved facts;
8. record sources, dates, company control, conflicting evidence and confidence;
9. retain No verdict where a structural fact remains unresolved;
10. produce candidate records append-only.

Priority order:

1. currently published companies;
2. legacy Main/Pending not currently visible;
3. legacy exclusions with no named FAIL;
4. remaining exclusions;
5. unreviewed/nonstandard records.

Do not bulk-translate C1–C8 or the prior shadow workbook into verdicts.

### 4. Create blind doctrine regression tests

The classifier must not see expected outcomes. Test matched cases for:

- important health information versus low-priority physical optimisation;
- diagnostics with consequential clinical utility versus unused reports;
- frontier clean-energy technology versus installation/leasing/deployment;
- real nature restoration versus carbon accounting/credits/reporting;
- technical product versus labour-led service;
- direct versus informational products with equal material contribution;
- structural failure versus readiness gap versus unresolved research;
- invariance to name, sector label, buyer, investor and useful.vc relationship.

Any systematic preference for direct physical action or carbon proxies blocks activation.

### 5. Finish the website

- add stable company and product URLs rather than dialog-only navigation;
- add Technology Main/Pending pages;
- add Biotech & invasive medicine Main/Pending pages;
- add All companies, investor and country pages;
- expose Excluded and historical decisions for transparency;
- add complete evidence and challenge displays;
- add French public pages;
- add archive/version history;
- ensure mobile, accessibility, performance and shareable filtered URLs;
- display `V2 research preview — not the current production list` persistently.

### 6. Test and preview-deploy

Run and expand:

```text
npm run check
npm run test:v2
npm run deploy:v2:dry-run
```

Deploy only Worker:

```text
useful-vc-v2-preview
```

Use only Neon branch ID `br-dawn-haze-avwyh1bd` for its `DATABASE_URL` secret. Do not attach the production domain or routes.

### 7. Deliverables

Do not claim completion until all of these exist:

- all 1,123 companies processed;
- all identifiable material product-use units created;
- profile completeness report;
- counts by Listed, Pending, Excluded and No verdict;
- counts by Technology and Biotech & invasive medicine;
- unresolved-company report with exact missing facts;
- regression results;
- automated test results;
- preview URL;
- V1-to-V2 impact report;
- migration and data dictionary documentation;
- draft PR from this branch to `main`;
- explicit confirmation that production is unchanged.

## Working style

Work autonomously. Do not stop at a plan. Do not ask for wording, architecture or implementation preferences that can be resolved safely from this document and the repository. Ask only when a genuinely unavailable credential or permission blocks further work.

Commit in coherent, reviewable increments. Keep a running `docs/v2-progress.md` with verified counts and blockers. Never fabricate research facts or verdict evidence.
