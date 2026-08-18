import { handleReviewApi } from '../review-server.fixed.js';

export default async function reviewHandler(req, res) {
  const requestUrl = new URL(
    req.url || '/',
    'https://useful-vc-review-ui-v2.vercel.app',
  );
  const rewrittenPath = requestUrl.searchParams.get('review_path');
  const path = rewrittenPath
    ? `/api/review/${rewrittenPath.replace(/^\/+/, '')}`
    : requestUrl.pathname;
  return handleReviewApi(req, res, path);
}
