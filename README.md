# useful.vc

Public, evidence-led directory backed directly by Neon Postgres.

## Architecture

- A small Node.js HTTP server serves the site and JSON API.
- `GET /api/companies` reads `public.public_companies` and merges every recorded investor relationship from `company_investors` and real fund-source relationship from `company_vc_sources`.
- `GET /api/investors` and `GET /api/investors/:slug` expose the searchable investor index; the legacy `/api/vcs` routes remain compatible.
- `/countries` and `/investors` provide public indexes and detail pages without duplicating business data in the application.
- `GET /healthz` verifies that the server can reach Neon.
- The browser never receives database credentials and has no write path.
- Railway runs the server from the repository root.

Neon remains the sole source of truth. There is no checked-in company or investor dataset and no application-side business-data cache.

## Local development

1. Copy `.env.example` to `.env` and add the pooled Neon `DATABASE_URL`.
2. Export the variables from that file in your shell.
3. Run `npm install` and `npm start`.
4. Open `http://localhost:3000`.

## Railway

The committed `railway.toml` defines the start command, database-aware health check, and restart policy. Configure only:

- `DATABASE_URL`: the pooled Neon connection string.
- `NODE_ENV=production`.

Railway supplies `PORT` automatically.

## Data safety

The deployed application executes only `SELECT` statements against the public company view and investor relationship tables. It does not migrate, seed, update, or delete Neon data.
