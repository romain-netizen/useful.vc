# Operations contract

GitHub is the source of truth for every reproducible part of useful.vc. The only external systems in use are GitHub, Neon, Cloudflare Workers and Vercel; the exact identifiers and known-good versions are in `deployment/services.json`.

## While Romain is away

- Never open an interactive login, OAuth approval, password, OTP or connection-validation prompt.
- If an existing connector expires, continue safe repository work on the current pull-request branch and record the blocked external action on GitHub.
- Never weaken Vercel Deployment Protection, expose a Neon connection string, or copy a local OAuth token into GitHub Actions.
- Never promote production merely because a connection is available. Existing acceptance gates still apply.
- Phase 2 remains frozen until the Git-built Vercel writer completes the controlled throwaway adjudication and cleanup.

## GitHub

Repository: `romain-netizen/useful.vc`. `main` is the production branch. The canonical classifier and coverage methodology lives under `prompts/`; unversioned prompt copies and Google Drive/Sheets are not execution sources. Pull requests run syntax, prompt-synchronisation, deployment-source, credential-embedding and Cloudflare dry-build checks. No application dataset or secret is committed.

## Neon

Project `aged-unit-27578806` (`Useful Companies`) is the sole database. SQL schema changes are committed under `migrations/` before application. Runtimes use pooled `DATABASE_URL` secrets held by Cloudflare and Vercel.

## Cloudflare Workers

Worker `useful-vc` serves the public website from `worker.js` and `public/`, configured by `wrangler.jsonc`. `DATABASE_URL` is present as a Worker secret. Known-good production version: `c1b65cab-1fdc-486e-a3c3-4ba258385988`.

The current production version was uploaded by Wrangler from a computer. Romain approved connecting Cloudflare Workers Builds to `romain-netizen/useful.vc`, branch `main`, on 2026-08-18. The connection flow reached GitHub's web sign-in, but no authenticated browser session was available. Do not request a login while Romain is away. Production remains on the known-good version until the GitHub App installation can be completed.

## Vercel

Project `useful-vc-review-ui-v2` is persistently connected to this GitHub repository and creates protected previews from commits. `DATABASE_URL` is configured for Production and Preview. `REVIEW_USER` and `REVIEW_PASSWORD` remain intentionally unset; no adjudication is allowed until they are configured once and the controlled parity test passes.

## Excluded systems

Railway is not part of the architecture and has no deployment configuration in this repository. Harmonic is not a data source. Reintroducing either requires an explicit architectural decision and a change to `deployment/services.json`.
