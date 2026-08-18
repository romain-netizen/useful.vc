# Canonical review deployment

The private review application is deployed from this repository to the Vercel project `useful-vc-review-ui-v2`. The exact team, project, repository and production branch are recorded in `deployment/review-vercel.json`. The Git commit is the release artifact; source files must never be copied into the Vercel dashboard or a temporary directory.

## Repository contract

- `review-server.fixed.js` is the adjudication writer.
- `api/review.js` is the Vercel function adapter; `vercel.json` forwards the complete review API path to it.
- `api/healthz.js` verifies the server-side Neon connection without returning credentials or database errors.
- `public/review.html`, `public/review.js` and `public/review.css` are the private review interface.
- `vercel.json` owns routing, function duration and security headers.
- `npm run check` validates this contract and rejects a tracked Postgres credential.
- `npm run verify:review` performs the read-only production checks for health, authenticated summary, list, detail and investor categories.

## Platform state kept outside Git

Only credentials and access controls remain in Vercel. Configure these once for Production and Preview:

- `DATABASE_URL`: pooled production Neon connection string.
- `REVIEW_USER`: Basic Auth username.
- `REVIEW_PASSWORD`: long random Basic Auth password.
- `VERCEL_AUTOMATION_BYPASS_SECRET`: Vercel Deployment Protection bypass value for the external verifier. Deployment Protection stays enabled.

The variables are encrypted platform state and must not be committed, pasted into source, or copied into `vercel.json`. A change to a secret is rotation, not a source deployment.

## Release flow

1. Open or update a pull request. GitHub runs `npm run check`.
2. Vercel builds a protected preview from the same commit.
3. Run the read-only parity check against that preview:

   ```text
   REVIEW_BASE_URL=https://preview.example REVIEW_USER=... REVIEW_PASSWORD=... VERCEL_AUTOMATION_BYPASS_SECRET=... npm run verify:review
   ```

4. Perform the controlled throwaway adjudication required by the database acceptance procedure. It must use a quarantined `Not reviewed` company and be removed after its Neon writes and `adjudication_path` audit are verified.
5. Merge only after both checks pass. Vercel deploys `main` to the canonical protected production project.

Phase 2 remains frozen until step 4 proves that the deployed writer reaches Neon. No real adjudication should be submitted before then.
