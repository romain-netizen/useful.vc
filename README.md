# useful.vc

Public, evidence-led directory backed directly by Neon Postgres.

## Architecture

- Cloudflare Workers is the production runtime. Cloudflare Static Assets serves the browser application, while `worker.js` serves the Neon-backed JSON API.
- `directory-api.js` contains the shared, runtime-neutral API so the temporary Railway rollback service and Cloudflare return the same data.
- `GET /api/companies` reads publishable company rows from `public.public_companies` and merges every recorded investor relationship from `company_investors` and real fund-source relationship from `company_vc_sources`.
- `GET /api/assets` exposes clinical assets and drug rows separately—including pathology-specific diagnostics and invasive interventions—without mixing them into company pages or company screening statistics.
- The company API also reports the full screening funnel from Neon: companies with all eight criteria reviewed, plus Main and Pending counts and percentages against that denominator.
- `GET /api/investors` and `GET /api/investors/:slug` expose the searchable investor index; the legacy `/api/vcs` routes remain compatible.
- `/countries` and `/investors` provide public indexes and detail pages without duplicating business data in the application.
- `GET /healthz` verifies that the runtime can reach Neon.
- The browser never receives database credentials and has no write path.
- Railway remains a temporary rollback target during the Cloudflare cutover.

## Public company content contract

- `evidence_summary` is the only source for public company descriptions; internal assessment `notes` are never used as fallback copy.
- Every published company should have a description, category, country, commercial status, review date and methodology version.
- Descriptions are public-facing prose rather than methodology shorthand such as criterion numbers or pass counts.
- Company cards group detailed commercial-status wording into a consistent stage. The full stored status remains visible in the company profile.

Neon remains the sole source of truth. There is no checked-in company or investor dataset and no application-side business-data cache.

## Local development

1. Copy `.env.example` to `.env` and add the pooled Neon `DATABASE_URL`.
2. Export the variables from that file in your shell.
3. Run `npm install` and `npm start`.
4. Open `http://localhost:3000`.

For the Cloudflare runtime, create an uncommitted `.dev.vars` file containing `DATABASE_URL`, then run `npm run dev:cloudflare`.

## Cloudflare Workers

- `wrangler.jsonc` deploys `public/` as static assets and sends only `/api/*` and `/healthz` through the Worker first.
- `DATABASE_URL` must be configured as a Cloudflare secret, never as a plaintext Wrangler variable.
- Connect the GitHub repository in Workers Builds to deploy `main` automatically.
- Direct country and investor URLs use the static asset single-page application fallback.
- The private secondary-review application remains isolated in the protected Vercel project `useful-vc-review-ui-v2` and is excluded from the public Worker routes.
- `npm run deploy:cloudflare:dry-run` validates and bundles the exact Worker payload without publishing it.

## Railway

The committed `railway.toml` defines the start command, database-aware health check, and restart policy. Configure only:

- `DATABASE_URL`: the pooled Neon connection string.
- `NODE_ENV=production`.

Railway supplies `PORT` automatically.

## Private review deployment

The canonical private review application is built from this same Git repository by Vercel project `useful-vc-review-ui-v2`. Its serverless entrypoints, routing, security headers, health check and source-verification workflow are versioned here; only encrypted credentials and Vercel Deployment Protection remain outside Git.

See `docs/review-deployment.md` for the source contract, one-time secret setup and release verification. Phase 2 remains frozen until the Git-built writer passes a controlled throwaway adjudication against Neon.

## Data safety

The public directory runtime executes only `SELECT` statements against the public company view and investor relationship tables. It does not migrate, seed, update, or delete Neon data. The separate protected review runtime has an intentional adjudication write path governed by the classified database gate described below.

## Classified write gate

`migrations/20260818_phase1_classified_write_gate.sql` installs the only permitted write path for criterion claims: `public.apply_classified_claim`.

- Every proposal declares one fact class: `structural`, `readiness`, `liveness`, `scope`, or `finance`.
- Only structural claims may target C1–C8. Direct writes to either criterion-review table, or to protected company classification fields, are neutralised and recorded in `qa_monitor.claim_write_audit`.
- Readiness routes to the qualification condition; liveness routes to lifecycle fields; scope routes to publication scope; finance routes to the funding or exit tables and requires a primary-source URL.
- The deterministic phrase guard includes the 24 historical regression fixtures in `qa_monitor.claim_gate_fixtures`; `qa_monitor.v_claim_gate_fixture_results` reports their status.
- Automated canonical writes to human-adjudicated company rows are neutralised and also recorded in `qa_monitor.guard_audit`.
- The private adjudication server preflights every criterion rationale and calls the same stored procedure for criterion, readiness and canonical-state writes.

`migrations/20260818_human_adjudication_provenance.sql` closes the human-marker provenance gap discovered after Phase 1 verification.

- `public.apply_human_adjudication_claim` requires a `review_feedback` row for the same company and review before it delegates to the classified write gate.
- The feedback decision must agree with the exact methodology stamp, and the application path is recorded as `vercel_adjudication`, `migration`, or `manual`.
- Companies and criterion rows carry the matching feedback ID and application path. `qa_monitor.v_human_adjudication_orphans` must remain empty.
- Accepted and rejected stamp attempts are recorded in the append-only `qa_monitor.human_adjudication_audit` table.
- The 13 fabricated category-exclusion stamps are removed without changing their states, criterion verdicts, or rationales. Recoverable company-level versions come from QA snapshots; uncaptured versions use an explicit unknown-provenance marker.

