# useful.vc

Public, evidence-led directory backed directly by Neon Postgres.

## Engine methodology

- `/rules` is the public reference page.
- `public/engine-methodology.txt` is the canonical public source loaded by that page.
- The classifier prompt and French VC coverage prompt contain a byte-identical copy between `ENGINE_METHODOLOGY_START` and `ENGINE_METHODOLOGY_END` markers.
- The methodology replaces every earlier selectivity formulation. Earlier C1–C8 records remain historical and cannot determine a new verdict.
- Product verdicts and company-status facts are separate. Scope, financing, ownership, activity, solvency and publication state cannot enter the product rules.
- Main, Pending and Excluded decisions must be written through the methodology-specific database gate once that migration is active.

## Architecture

- Cloudflare Workers is the production runtime. Cloudflare Static Assets serves the browser application, while `worker.js` serves the Neon-backed JSON API and canonical rules routes.
- `directory-api.js` contains the shared, runtime-neutral API so the temporary Railway rollback service and Cloudflare return the same data.
- `GET /api/companies` reads publishable company rows from `public.public_companies` and merges recorded investor and fund-source relationships.
- `GET /api/assets` exposes clinical assets and drug rows separately without mixing them into company pages.
- `GET /api/investors` and `GET /api/investors/:slug` expose the searchable investor index; the legacy `/api/vcs` routes remain compatible.
- `/countries` and `/investors` provide public indexes and detail pages without duplicating business data in the application.
- `GET /healthz` verifies that the runtime can reach Neon.
- The browser never receives database credentials and has no write path.
- Railway remains a temporary rollback target during the Cloudflare cutover.

## Public company content contract

- `evidence_summary` is the only source for public company descriptions; internal assessment `notes` are never used as fallback copy.
- Every published company should have a description, category, country, commercial status, review date and methodology version.
- Company cards group detailed commercial-status wording into a consistent stage. The full stored status remains visible in the company profile.

Neon remains the sole source of company and investor data. There is no checked-in company or investor dataset and no application-side business-data cache.

## Local development

1. Copy `.env.example` to `.env` and add the pooled Neon `DATABASE_URL`.
2. Export the variables from that file in your shell.
3. Run `npm install` and `npm start`.
4. Open `http://localhost:3000`.

For the Cloudflare runtime, create an uncommitted `.dev.vars` file containing `DATABASE_URL`, then run `npm run dev:cloudflare`.

## Cloudflare Workers

- `wrangler.jsonc` deploys `public/` as static assets and sends `/api/*` and `/healthz` through the Worker first.
- `worker.js` maps `/rules` to the canonical public rules page and `/engine-methodology` to the plain-text source.
- `DATABASE_URL` must be configured as a Cloudflare secret, never as a plaintext Wrangler variable.
- Connect the GitHub repository in Workers Builds to deploy `main` automatically.
- Direct application routes use the static asset single-page application fallback.
- The private secondary-review application remains isolated from the public Worker assets.
- `npm run deploy:cloudflare:dry-run` validates and bundles the Worker payload without publishing it.

## Railway

The committed `railway.toml` defines the start command, database-aware health check and restart policy. Configure only:

- `DATABASE_URL`: the pooled Neon connection string.
- `NODE_ENV=production`.

Railway supplies `PORT` automatically.

## Data safety

The deployed public application executes only reads against Neon. It does not migrate, seed, update or delete canonical data.
