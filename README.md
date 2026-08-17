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
- The private secondary-review application remains isolated on its separate Railway service during this migration and is excluded from the public Worker assets.
- `npm run deploy:cloudflare:dry-run` validates and bundles the exact Worker payload without publishing it.

## Railway

The committed `railway.toml` defines the start command, database-aware health check, and restart policy. Configure only:

- `DATABASE_URL`: the pooled Neon connection string.
- `NODE_ENV=production`.

Railway supplies `PORT` automatically.

## Data safety

The deployed application executes only `SELECT` statements against the public company view and investor relationship tables. It does not migrate, seed, update, or delete Neon data.
