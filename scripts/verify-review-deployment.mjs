const baseUrl = String(process.env.REVIEW_BASE_URL || '').replace(/\/$/, '');
const reviewUser = process.env.REVIEW_USER || '';
const reviewPassword = process.env.REVIEW_PASSWORD || '';
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

if (!baseUrl || !reviewUser || !reviewPassword) {
  throw new Error('REVIEW_BASE_URL, REVIEW_USER and REVIEW_PASSWORD are required.');
}

const commonHeaders = {
  Authorization: `Basic ${Buffer.from(`${reviewUser}:${reviewPassword}`).toString('base64')}`,
};
if (bypassSecret) commonHeaders['x-vercel-protection-bypass'] = bypassSecret;

async function get(path, authenticated = true) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: authenticated
      ? commonHeaders
      : bypassSecret
        ? { 'x-vercel-protection-bypass': bypassSecret }
        : {},
    redirect: 'manual',
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned ${response.status} and non-JSON content.`);
  }
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text}`);
  return payload;
}

const health = await get('/healthz', false);
if (health.status !== 'ok' || health.database !== 'connected') {
  throw new Error('/healthz did not confirm the Neon connection.');
}

const [{ summary }, { companies }] = await Promise.all([
  get('/api/review/summary'),
  get('/api/review/companies'),
]);
if (!summary || !Array.isArray(companies)) {
  throw new Error('The review summary or company list has an invalid response contract.');
}

if (companies.length > 0) {
  const detail = await get(`/api/review/companies/${companies[0].id}`);
  if (!detail.company || !Array.isArray(detail.secondaryCriteria) || !Array.isArray(detail.investors)) {
    throw new Error('The company detail or investor-category response contract is invalid.');
  }
}

console.log(JSON.stringify({
  status: 'ok',
  totalEligible: summary.total_eligible,
  reviewRows: companies.length,
  detailChecked: companies.length > 0,
}));
