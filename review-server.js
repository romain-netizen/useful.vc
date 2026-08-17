import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || '';
const REVIEW_USER = process.env.REVIEW_USER || '';
const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD || '';

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders,
    ...extraHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function database() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(DATABASE_URL);
}

function decodeBasicAuth(value) {
  if (!value?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8');
    const split = decoded.indexOf(':');
    if (split < 0) return null;
    return { user: decoded.slice(0, split), password: decoded.slice(split + 1) };
  } catch {
    return null;
  }
}

function isAuthorized(req) {
  if (!REVIEW_USER || !REVIEW_PASSWORD) return false;
  const credentials = decodeBasicAuth(req.headers.authorization);
  return credentials?.user === REVIEW_USER && credentials.password === REVIEW_PASSWORD;
}

function requireAuth(req, res) {
  if (!REVIEW_USER || !REVIEW_PASSWORD) {
    sendJson(res, 503, { error: 'review_auth_not_configured' });
    return false;
  }
  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Basic realm="useful.vc review", charset="UTF-8"' });
    return false;
  }
  return true;
}

async function readJson(req, limit = 64 * 1024) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.toLowerCase().startsWith('application/json')) throw new Error('invalid_content_type');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) throw new Error('body_too_large');
  }
  if (!body) return {};
  return JSON.parse(body);
}

async function sendSummary(res) {
  const sql = database();
  const rows = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (company_id)
        id, company_id, original_state, proposed_state, agreement,
        false_positive_candidate, false_negative_candidate,
        review_status, reviewed_at, primary_updated_at_snapshot
      FROM public.secondary_company_reviews
      ORDER BY company_id, reviewed_at DESC, id DESC
    ), eligible AS (
      SELECT id, updated_at
      FROM public.companies
      WHERE public_state IN ('Main', 'Pending', 'Excluded')
    )
    SELECT
      (SELECT COUNT(*)::int FROM eligible) AS total_eligible,
      (SELECT COUNT(*)::int FROM latest) AS reviewed,
      (SELECT COUNT(*)::int FROM eligible e LEFT JOIN latest l ON l.company_id = e.id WHERE l.id IS NULL) AS never_reviewed,
      (SELECT COUNT(*)::int FROM eligible e JOIN latest l ON l.company_id = e.id WHERE e.updated_at > COALESCE(l.primary_updated_at_snapshot, l.reviewed_at)) AS stale,
      (SELECT COUNT(*)::int FROM latest WHERE agreement) AS agreements,
      (SELECT COUNT(*)::int FROM latest WHERE NOT agreement) AS disagreements,
      (SELECT COUNT(*)::int FROM latest WHERE false_positive_candidate) AS false_positive_candidates,
      (SELECT COUNT(*)::int FROM latest WHERE false_negative_candidate) AS false_negative_candidates,
      (SELECT COUNT(*)::int FROM latest WHERE review_status = 'awaiting_adjudication' AND NOT agreement) AS awaiting_adjudication,
      (SELECT COUNT(*)::int FROM public.review_feedback) AS feedback_count,
      (SELECT COUNT(*)::int FROM public.engine_memory WHERE status = 'active' AND superseded_by IS NULL) AS active_memory_count
  `;
  sendJson(res, 200, { summary: rows[0], generatedAt: new Date().toISOString() });
}

async function sendCompanyIndex(res) {
  const sql = database();
  const companies = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (company_id) scr.*
      FROM public.secondary_company_reviews scr
      ORDER BY company_id, reviewed_at DESC, id DESC
    )
    SELECT
      l.id AS review_id,
      c.id AS company_id,
      c.name, c.website, c.country, c.category,
      c.public_state AS current_primary_state,
      c.updated_at AS current_primary_updated_at,
      l.original_state, l.proposed_state, l.agreement, l.confidence,
      l.classification_rationale, l.key_issue, l.readiness_gap,
      l.false_positive_candidate, l.false_negative_candidate,
      l.review_status, l.reviewed_at, l.primary_updated_at_snapshot,
      (c.updated_at > COALESCE(l.primary_updated_at_snapshot, l.reviewed_at)) AS stale,
      rf.decision AS feedback_decision,
      rf.final_state AS feedback_final_state,
      rf.use_for_learning,
      rf.learning_status
    FROM latest l
    JOIN public.companies c ON c.id = l.company_id
    LEFT JOIN public.review_feedback rf ON rf.secondary_review_id = l.id
    ORDER BY
      CASE WHEN NOT l.agreement AND l.review_status = 'awaiting_adjudication' THEN 0 ELSE 1 END,
      CASE WHEN l.false_positive_candidate OR l.false_negative_candidate THEN 0 ELSE 1 END,
      l.reviewed_at DESC, c.name
  `;
  sendJson(res, 200, { companies, generatedAt: new Date().toISOString() });
}

async function sendCompanyDetail(res, reviewId) {
  const sql = database();
  const companyRows = await sql`
    SELECT
      scr.*,
      c.name, c.category, c.public_state AS current_primary_state,
      c.commercialised, c.what_it_needs_to_qualify, c.notes,
      c.website, c.country, c.last_reviewed, c.methodology_version,
      c.publishable, c.evidence_summary, c.updated_at AS current_primary_updated_at
    FROM public.secondary_company_reviews scr
    JOIN public.companies c ON c.id = scr.company_id
    WHERE scr.id = ${reviewId}
    LIMIT 1
  `;
  if (!companyRows.length) {
    sendJson(res, 404, { error: 'review_not_found' });
    return;
  }
  const company = companyRows[0];
  const [primaryCriteria, secondaryCriteria, evidence, feedback, memory] = await Promise.all([
    sql`SELECT criterion, verdict, rationale, reviewed_at, methodology_version FROM public.criterion_reviews WHERE company_id = ${company.company_id} ORDER BY criterion`,
    sql`SELECT criterion, original_verdict, proposed_verdict, agreement, rationale, missing_evidence FROM public.secondary_criterion_reviews WHERE secondary_review_id = ${reviewId} ORDER BY criterion`,
    sql`SELECT criterion, source_url, publisher, source_type, publication_date, claim, evidence_direction, notes, retrieved_at FROM public.secondary_evidence WHERE secondary_review_id = ${reviewId} ORDER BY criterion NULLS LAST, id`,
    sql`SELECT decision, final_state, final_criterion_overrides, feedback_note, use_for_learning, learning_status, learning_processed_at, created_at FROM public.review_feedback WHERE secondary_review_id = ${reviewId} LIMIT 1`,
    sql`SELECT id, memory_type, criterion, pattern_key, lesson, guidance, supporting_examples, false_positive_examples, false_negative_examples, updated_at, activated_at FROM public.active_engine_memory ORDER BY criterion NULLS FIRST, updated_at DESC`,
  ]);
  sendJson(res, 200, {
    company,
    primaryCriteria,
    secondaryCriteria,
    evidence,
    feedback: feedback[0] || null,
    activeMemory: memory,
    generatedAt: new Date().toISOString(),
  });
}

async function saveFeedback(req, res, reviewId) {
  const body = await readJson(req);
  const decision = String(body.decision || '');
  if (!['primary_correct', 'secondary_correct', 'custom'].includes(decision)) {
    sendJson(res, 400, { error: 'invalid_decision' });
    return;
  }
  const sql = database();
  const reviews = await sql`SELECT id, company_id, original_state, proposed_state FROM public.secondary_company_reviews WHERE id = ${reviewId} LIMIT 1`;
  if (!reviews.length) {
    sendJson(res, 404, { error: 'review_not_found' });
    return;
  }
  const review = reviews[0];
  const customState = body.final_state == null ? null : String(body.final_state);
  const finalState = decision === 'primary_correct'
    ? review.original_state
    : decision === 'secondary_correct'
      ? review.proposed_state
      : customState;
  if (!finalState || !['Main', 'Pending', 'Excluded'].includes(finalState)) {
    sendJson(res, 400, { error: 'invalid_final_state' });
    return;
  }
  const overrides = body.final_criterion_overrides && typeof body.final_criterion_overrides === 'object' ? body.final_criterion_overrides : {};
  const feedbackNote = body.feedback_note == null ? null : String(body.feedback_note).slice(0, 8000);
  const useForLearning = body.use_for_learning !== false;
  const overridesJson = JSON.stringify(overrides);

  const saved = await sql`
    INSERT INTO public.review_feedback (
      company_id, secondary_review_id, decision, final_state,
      final_criterion_overrides, feedback_note, use_for_learning,
      learning_status, learning_processed_at
    ) VALUES (
      ${review.company_id}, ${review.id}, ${decision}, ${finalState},
      ${overridesJson}::jsonb, ${feedbackNote}, ${useForLearning},
      ${useForLearning ? 'pending' : 'ignored'}, NULL
    )
    ON CONFLICT (secondary_review_id) DO UPDATE SET
      decision = EXCLUDED.decision,
      final_state = EXCLUDED.final_state,
      final_criterion_overrides = EXCLUDED.final_criterion_overrides,
      feedback_note = EXCLUDED.feedback_note,
      use_for_learning = EXCLUDED.use_for_learning,
      learning_status = CASE WHEN EXCLUDED.use_for_learning THEN 'pending' ELSE 'ignored' END,
      learning_processed_at = NULL,
      created_at = now()
    RETURNING id, decision, final_state, final_criterion_overrides,
              feedback_note, use_for_learning, learning_status, created_at
  `;
  await sql`UPDATE public.secondary_company_reviews SET review_status = 'adjudicated', adjudicated_at = now(), adjudication_note = ${feedbackNote} WHERE id = ${review.id}`;
  sendJson(res, 200, { feedback: saved[0] });
}

async function sendMemory(res) {
  const sql = database();
  const memory = await sql`
    SELECT id, status, memory_type, criterion, pattern_key, lesson, guidance,
           source_review_ids, supporting_examples, false_positive_examples,
           false_negative_examples, created_at, updated_at, activated_at, superseded_by
    FROM public.engine_memory
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END, updated_at DESC
  `;
  sendJson(res, 200, { memory, generatedAt: new Date().toISOString() });
}

export async function handleReviewApi(req, res, pathname) {
  if (!requireAuth(req, res)) return;
  try {
    if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/review/summary') return await sendSummary(res);
    if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/review/companies') return await sendCompanyIndex(res);
    if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/review/memory') return await sendMemory(res);
    const detailMatch = pathname.match(/^\/api\/review\/companies\/(\d+)$/);
    if ((req.method === 'GET' || req.method === 'HEAD') && detailMatch) return await sendCompanyDetail(res, Number(detailMatch[1]));
    const feedbackMatch = pathname.match(/^\/api\/review\/companies\/(\d+)\/feedback$/);
    if (req.method === 'POST' && feedbackMatch) return await saveFeedback(req, res, Number(feedbackMatch[1]));
    sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Review API failed:', message);
    if (message === 'invalid_content_type' || message === 'body_too_large' || error instanceof SyntaxError) return sendJson(res, 400, { error: 'invalid_request' });
    sendJson(res, 502, { error: 'review_database_unavailable' });
  }
}
