import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || '';
const REVIEW_USER = process.env.REVIEW_USER || '';
const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD || '';

function db() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL missing');
  return neon(DATABASE_URL);
}

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...headers,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  res.end(payload);
}

function auth(req, res) {
  const header = String(req.headers.authorization || '');
  if (!REVIEW_USER || !REVIEW_PASSWORD) {
    json(res, 503, { error: 'review_auth_not_configured' });
    return false;
  }
  if (!header.startsWith('Basic ')) {
    json(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Basic realm="useful.vc review"' });
    return false;
  }
  try {
    const [user, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    if (user === REVIEW_USER && rest.join(':') === REVIEW_PASSWORD) return true;
  } catch {}
  json(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Basic realm="useful.vc review"' });
  return false;
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 65536) throw new Error('too_large');
  }
  return raw ? JSON.parse(raw) : {};
}

async function summary(res) {
  const sql = db();
  const [row] = await sql`
    WITH latest AS (
      SELECT DISTINCT ON(company_id) *
      FROM public.secondary_company_reviews
      ORDER BY company_id, reviewed_at DESC, id DESC
    ),
    eligible AS (
      SELECT id, updated_at
      FROM public.companies
      WHERE public_state IN ('Main','Pending','Excluded')
    ),
    inv AS (
      SELECT secondary_review_id,
        count(*) FILTER (WHERE upper(proposed_action)='ADD')::int additions,
        count(*) FILTER (WHERE upper(proposed_action) IN ('KEEP','KEEP_HISTORICAL','KEEP_SEPARATE'))::int confirmed_or_separate,
        count(*) FILTER (
          WHERE upper(proposed_action) IN ('REVERIFY','TYPE_UPDATE','TRUE_DUPLICATE_ALIAS','REMAP','KEEP_AND_RETYPE','RETYPE_HISTORICAL')
             OR (original_relationship_present=true AND upper(proposed_action)='DO_NOT_ADD_AS_EQUITY')
        )::int true_issues,
        count(*) FILTER (WHERE upper(proposed_action) IN ('DO_NOT_ADD_AS_EQUITY','DO_NOT_ADD_UNTIL_DISCLOSED'))::int non_equity
      FROM public.secondary_investor_reviews
      GROUP BY secondary_review_id
    )
    SELECT
      (SELECT count(*)::int FROM eligible) total_eligible,
      (SELECT count(*)::int FROM latest) reviewed,
      (SELECT count(*)::int FROM latest WHERE agreement) agreements,
      (SELECT count(*)::int FROM latest WHERE NOT agreement) disagreements,
      (SELECT count(*)::int FROM latest WHERE false_positive_candidate) false_positive_candidates,
      (SELECT count(*)::int FROM latest WHERE false_negative_candidate) false_negative_candidates,
      (SELECT count(*)::int FROM latest WHERE review_status='awaiting_adjudication' AND NOT agreement) awaiting_adjudication,
      (SELECT coalesce(sum(inv.additions),0)::int FROM latest l LEFT JOIN inv ON inv.secondary_review_id=l.id) investor_additions,
      (SELECT coalesce(sum(inv.confirmed_or_separate),0)::int FROM latest l LEFT JOIN inv ON inv.secondary_review_id=l.id) investor_confirmed,
      (SELECT coalesce(sum(inv.true_issues),0)::int FROM latest l LEFT JOIN inv ON inv.secondary_review_id=l.id) investor_issues,
      (SELECT coalesce(sum(inv.non_equity),0)::int FROM latest l LEFT JOIN inv ON inv.secondary_review_id=l.id) investor_non_equity,
      (SELECT count(*)::int FROM latest WHERE status_issue) status_issues,
      (SELECT count(*)::int FROM public.engine_memory WHERE status='active' AND superseded_by IS NULL) active_memory_count
  `;
  json(res, 200, { summary: row });
}

async function index(res) {
  const sql = db();
  const rows = await sql`
    WITH latest AS (
      SELECT DISTINCT ON(company_id) *
      FROM public.secondary_company_reviews
      ORDER BY company_id, reviewed_at DESC, id DESC
    ),
    inv AS (
      SELECT secondary_review_id,
        count(*) FILTER (WHERE upper(proposed_action)='ADD')::int investor_additions,
        count(*) FILTER (WHERE upper(proposed_action) IN ('KEEP','KEEP_HISTORICAL','KEEP_SEPARATE'))::int investor_confirmed,
        count(*) FILTER (
          WHERE upper(proposed_action) IN ('REVERIFY','TYPE_UPDATE','TRUE_DUPLICATE_ALIAS','REMAP','KEEP_AND_RETYPE','RETYPE_HISTORICAL')
             OR (original_relationship_present=true AND upper(proposed_action)='DO_NOT_ADD_AS_EQUITY')
        )::int investor_true_issues,
        count(*) FILTER (WHERE upper(proposed_action) IN ('DO_NOT_ADD_AS_EQUITY','DO_NOT_ADD_UNTIL_DISCLOSED'))::int investor_non_equity
      FROM public.secondary_investor_reviews
      GROUP BY secondary_review_id
    )
    SELECT
      l.id review_id,
      c.id company_id,
      c.name,
      c.website,
      c.country,
      c.category,
      c.public_state current_primary_state,
      c.updated_at current_primary_updated_at,
      l.original_state,
      l.proposed_state,
      l.agreement,
      l.confidence,
      l.classification_rationale,
      l.key_issue,
      l.false_positive_candidate,
      l.false_negative_candidate,
      l.verified_entity_status,
      l.entity_status_date,
      l.status_issue,
      l.investor_review_summary,
      l.review_status,
      l.reviewed_at,
      l.primary_updated_at_snapshot,
      coalesce(inv.investor_additions,0) investor_additions,
      coalesce(inv.investor_confirmed,0) investor_confirmed,
      coalesce(inv.investor_true_issues,0) investor_true_issues,
      coalesce(inv.investor_non_equity,0) investor_non_equity,
      (c.updated_at > coalesce(l.primary_updated_at_snapshot,l.reviewed_at)) stale,
      rf.decision feedback_decision,
      rf.final_state feedback_final_state,
      rf.learning_status
    FROM latest l
    JOIN public.companies c ON c.id=l.company_id
    LEFT JOIN inv ON inv.secondary_review_id=l.id
    LEFT JOIN public.review_feedback rf ON rf.secondary_review_id=l.id
    ORDER BY (NOT l.agreement) DESC, l.reviewed_at DESC, c.name
  `;
  json(res, 200, { companies: rows });
}

async function detail(res, id) {
  const sql = db();
  const [company] = await sql`
    SELECT
      scr.*,
      c.name,
      c.category,
      c.public_state current_primary_state,
      c.commercialised,
      c.what_it_needs_to_qualify,
      c.notes,
      c.website,
      c.country,
      c.last_reviewed,
      c.methodology_version,
      c.publishable,
      c.evidence_summary,
      c.updated_at current_primary_updated_at
    FROM public.secondary_company_reviews scr
    JOIN public.companies c ON c.id=scr.company_id
    WHERE scr.id=${id}
    LIMIT 1
  `;
  if (!company) return json(res, 404, { error: 'review_not_found' });

  const [primaryCriteria, secondaryCriteria, evidence, investors, feedback, memoryRows] = await Promise.all([
    sql`SELECT criterion,verdict,rationale,reviewed_at,methodology_version,fact_class,writer_lane,source_reference FROM public.criterion_reviews WHERE company_id=${company.company_id} ORDER BY criterion`,
    sql`SELECT criterion,original_verdict,proposed_verdict,agreement,rationale,missing_evidence,fact_class,writer_lane,source_reference FROM public.secondary_criterion_reviews WHERE secondary_review_id=${id} ORDER BY criterion`,
    sql`SELECT evidence_kind,criterion,source_url,publisher,source_type,publication_date,claim,support_status AS evidence_direction,notes,created_at AS retrieved_at FROM public.secondary_evidence WHERE secondary_review_id=${id} ORDER BY criterion NULLS LAST,id`,
    sql`SELECT investor_name,canonical_name,relationship_type,original_relationship_present,proposed_action,source_url,source_type,rationale FROM public.secondary_investor_reviews WHERE secondary_review_id=${id} ORDER BY proposed_action DESC,investor_name`,
    sql`SELECT decision,final_state,final_criterion_overrides,feedback_note,use_for_learning,learning_status,learning_processed_at,created_at FROM public.review_feedback WHERE secondary_review_id=${id} LIMIT 1`,
    sql`SELECT id,status,memory_type,pattern_key,pattern_name,trigger_conditions,typical_failure_mode,mandatory_follow_up_checks,evidence_types_to_seek,criteria_affected,examples,counterexamples,guidance,observed_count AS supporting_examples,false_positive_examples,false_negative_examples,confidence,updated_at,activated_at,superseded_by FROM public.engine_memory ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END,updated_at DESC`,
  ]);

  json(res, 200, {
    company,
    primaryCriteria,
    secondaryCriteria,
    evidence,
    investors,
    feedback: feedback[0] || null,
    activeMemory: memoryRows,
  });
}

async function memory(res) {
  const sql = db();
  const rows = await sql`
    SELECT id,status,memory_type,pattern_key,pattern_name,trigger_conditions,typical_failure_mode,mandatory_follow_up_checks,evidence_types_to_seek,criteria_affected,examples,counterexamples,guidance,observed_count AS supporting_examples,false_positive_examples,false_negative_examples,confidence,created_at,updated_at,activated_at,superseded_by
    FROM public.engine_memory
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END,updated_at DESC
  `;
  json(res, 200, { memory: rows });
}

function adjudicationMethodology(decision) {
  if (decision === 'custom') return 'v5 — human-adjudicated custom';
  if (decision === 'primary_correct') return 'v5 — human-adjudicated primary';
  return 'v5 — human-adjudicated QA';
}

async function applyClassifiedClaim(sql, {
  companyId,
  factClass,
  claimText,
  sourceReference,
  criterion = null,
  verdict = null,
  secondaryReviewId = null,
  payload = {},
}) {
  const [result] = await sql`
    SELECT *
    FROM public.apply_classified_claim(
      ${companyId},
      'human_adjudication',
      ${factClass},
      ${claimText},
      ${sourceReference},
      ${criterion},
      ${verdict},
      ${secondaryReviewId},
      ${JSON.stringify(payload)}::jsonb
    )
  `;
  if (!result?.applied) {
    throw new Error(`claim_gate_rejected:${result?.reason || 'unknown'}:${result?.detected_fact_class || 'unknown'}`);
  }
  return result;
}

function applyOverrides(criteria, overrides) {
  const finalCriteria = new Map(criteria.map((row) => [Number(row.criterion), {
    criterion: Number(row.criterion),
    verdict: String(row.verdict || '').toUpperCase(),
    rationale: String(row.rationale || ''),
  }]));

  if (!overrides || typeof overrides !== 'object') return [...finalCriteria.values()];
  for (const [key, value] of Object.entries(overrides)) {
    const criterion = Number(key);
    if (!Number.isInteger(criterion) || criterion < 1 || criterion > 8) continue;
    const verdict = String(value?.verdict || value || '').toUpperCase();
    if (!['PASS', 'FAIL', 'UNCLEAR'].includes(verdict)) continue;
    finalCriteria.set(criterion, {
      criterion,
      verdict,
      rationale: typeof value === 'object' && value.rationale
        ? String(value.rationale)
        : 'Human adjudication override',
    });
  }
  return [...finalCriteria.values()].sort((a, b) => a.criterion - b.criterion);
}

async function assertStructuralClaims(sql, criteria) {
  for (const criterion of criteria) {
    const [classification] = await sql`
      SELECT qa_monitor.detect_fact_class(${criterion.rationale}) AS fact_class
    `;
    if (classification?.fact_class !== 'structural') {
      throw new Error(`claim_gate_rejected:phrase_guard_detected_${classification?.fact_class || 'unknown'}:${criterion.criterion}`);
    }
  }
}

async function finalCriterionClaims(sql, review, decision, overrides) {
  if (decision === 'secondary_correct') {
    const rows = await sql`
      SELECT criterion, proposed_verdict AS verdict, rationale
      FROM public.secondary_criterion_reviews
      WHERE secondary_review_id=${review.id}
      ORDER BY criterion
    `;
    return applyOverrides(rows, null);
  }

  const rows = await sql`
    SELECT criterion, verdict, rationale
    FROM public.criterion_reviews
    WHERE company_id=${review.company_id}
    ORDER BY criterion
  `;
  return applyOverrides(rows, decision === 'custom' ? overrides : null);
}

async function applyCanonicalDecision(sql, review, decision, finalState, overrides) {
  const methodologyVersion = adjudicationMethodology(decision);
  const condition = finalState === 'Pending'
    ? (review.key_issue || review.what_first_pass_should_do_next_time || 'Pending human adjudication condition')
    : null;
  const sourceReference = `secondary_review:${review.id}:${decision}`;
  const criteria = await finalCriterionClaims(sql, review, decision, overrides);

  if (criteria.length === 0) {
    throw new Error('claim_gate_rejected:no_criterion_claims:unknown');
  }
  await assertStructuralClaims(sql, criteria);

  for (const criterion of criteria) {
    await applyClassifiedClaim(sql, {
      companyId: review.company_id,
      factClass: 'structural',
      claimText: criterion.rationale,
      sourceReference,
      criterion: criterion.criterion,
      verdict: criterion.verdict,
      payload: { methodology_version: methodologyVersion },
    });
  }

  await applyClassifiedClaim(sql, {
    companyId: review.company_id,
    factClass: 'readiness',
    claimText: condition || 'Human adjudication cleared the readiness condition.',
    sourceReference,
    payload: { clear: finalState !== 'Pending' },
  });

  await applyClassifiedClaim(sql, {
    companyId: review.company_id,
    factClass: 'structural',
    claimText: `Human adjudication set the canonical state to ${finalState}.`,
    sourceReference,
    payload: {
      target: 'canonical_decision',
      public_state: finalState,
      methodology_version: methodologyVersion,
    },
  });
}

async function saveFeedback(req, res, id) {
  const sql = db();
  const payload = await body(req);
  if (!['primary_correct','secondary_correct','custom'].includes(payload.decision)) {
    return json(res, 400, { error: 'invalid_decision' });
  }

  const [review] = await sql`
    SELECT id,company_id,original_state,proposed_state,key_issue,what_first_pass_should_do_next_time
    FROM public.secondary_company_reviews
    WHERE id=${id}
  `;
  if (!review) return json(res, 404, { error: 'review_not_found' });

  const finalState = payload.decision === 'primary_correct'
    ? review.original_state
    : payload.decision === 'secondary_correct'
      ? review.proposed_state
      : payload.final_state;

  if (!['Main','Pending','Excluded'].includes(finalState)) {
    return json(res, 400, { error: 'invalid_final_state' });
  }

  const note = payload.feedback_note ? String(payload.feedback_note).slice(0, 8000) : null;
  const learn = payload.use_for_learning !== false;
  const overridesObj = payload.final_criterion_overrides || {};
  const overrides = JSON.stringify(overridesObj);

  await applyCanonicalDecision(sql, review, payload.decision, finalState, overridesObj);

  const [saved] = await sql`
    INSERT INTO public.review_feedback(
      company_id,secondary_review_id,decision,final_state,final_criterion_overrides,
      feedback_note,use_for_learning,learning_status,learning_processed_at
    )
    VALUES(
      ${review.company_id},${review.id},${payload.decision},${finalState},${overrides}::jsonb,
      ${note},${learn},${learn ? 'pending' : 'ignored'},NULL
    )
    ON CONFLICT(secondary_review_id) DO UPDATE SET
      decision=excluded.decision,
      final_state=excluded.final_state,
      final_criterion_overrides=excluded.final_criterion_overrides,
      feedback_note=excluded.feedback_note,
      use_for_learning=excluded.use_for_learning,
      learning_status=excluded.learning_status,
      learning_processed_at=NULL,
      created_at=now()
    RETURNING *
  `;

  await sql`
    UPDATE public.secondary_company_reviews
    SET review_status='adjudicated', adjudicated_at=now(), adjudication_note=${note}
    WHERE id=${id}
  `;

  json(res, 200, { feedback: saved, canonical_applied: true });
}

export async function handleReviewApi(req, res, path) {
  if (!auth(req, res)) return;
  try {
    if (req.method === 'GET' && path === '/api/review/summary') return summary(res);
    if (req.method === 'GET' && path === '/api/review/companies') return index(res);
    if (req.method === 'GET' && path === '/api/review/memory') return memory(res);

    let match = path.match(/^\/api\/review\/companies\/(\d+)$/);
    if (req.method === 'GET' && match) return detail(res, Number(match[1]));

    match = path.match(/^\/api\/review\/companies\/(\d+)\/feedback$/);
    if (req.method === 'POST' && match) return saveFeedback(req, res, Number(match[1]));

    json(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : String(error);
    const gateRejected = detail.startsWith('claim_gate_rejected:');
    json(res, gateRejected ? 409 : 502, {
      error: gateRejected ? 'claim_gate_rejected' : 'review_database_unavailable',
      detail,
    });
  }
}
