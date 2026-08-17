import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || '';
const REVIEW_USER = process.env.REVIEW_USER || '';
const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD || '';

function db(){ if(!DATABASE_URL) throw new Error('DATABASE_URL missing'); return neon(DATABASE_URL); }
function json(res,status,body,headers={}){const p=JSON.stringify(body);res.writeHead(status,{...headers,'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(p),'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});res.end(p)}
function auth(req,res){const h=String(req.headers.authorization||'');if(!REVIEW_USER||!REVIEW_PASSWORD)return json(res,503,{error:'review_auth_not_configured'}),false;if(!h.startsWith('Basic '))return json(res,401,{error:'unauthorized'},{'WWW-Authenticate':'Basic realm="useful.vc review"'}),false;try{const [u,...rest]=Buffer.from(h.slice(6),'base64').toString('utf8').split(':');if(u===REVIEW_USER&&rest.join(':')===REVIEW_PASSWORD)return true}catch{}json(res,401,{error:'unauthorized'},{'WWW-Authenticate':'Basic realm="useful.vc review"'});return false}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>65536)throw new Error('too_large')}return s?JSON.parse(s):{}}

async function summary(res){const sql=db();const [r]=await sql`
WITH latest AS (SELECT DISTINCT ON(company_id) * FROM public.secondary_company_reviews ORDER BY company_id,reviewed_at DESC,id DESC),
eligible AS (SELECT id,updated_at FROM public.companies WHERE public_state IN ('Main','Pending','Excluded'))
SELECT
 (SELECT count(*)::int FROM eligible) total_eligible,
 (SELECT count(*)::int FROM latest) reviewed,
 (SELECT count(*)::int FROM latest WHERE agreement) agreements,
 (SELECT count(*)::int FROM latest WHERE NOT agreement) disagreements,
 (SELECT count(*)::int FROM latest WHERE false_positive_candidate) false_positive_candidates,
 (SELECT count(*)::int FROM latest WHERE false_negative_candidate) false_negative_candidates,
 (SELECT count(*)::int FROM latest WHERE review_status='awaiting_adjudication' AND NOT agreement) awaiting_adjudication,
 (SELECT coalesce(sum(investor_issue_count),0)::int FROM latest) investor_issues,
 (SELECT count(*)::int FROM latest WHERE status_issue) status_issues,
 (SELECT count(*)::int FROM public.engine_memory WHERE status='active' AND superseded_by IS NULL) active_memory_count`;
json(res,200,{summary:r})}

async function index(res){const sql=db();const rows=await sql`
WITH latest AS (SELECT DISTINCT ON(company_id) * FROM public.secondary_company_reviews ORDER BY company_id,reviewed_at DESC,id DESC)
SELECT l.id review_id,c.id company_id,c.name,c.website,c.country,c.category,c.public_state current_primary_state,c.updated_at current_primary_updated_at,
 l.original_state,l.proposed_state,l.agreement,l.confidence,l.classification_rationale,l.key_issue,l.false_positive_candidate,l.false_negative_candidate,
 l.verified_entity_status,l.entity_status_date,l.status_issue,l.investor_issue_count,l.review_status,l.reviewed_at,l.primary_updated_at_snapshot,
 (c.updated_at>coalesce(l.primary_updated_at_snapshot,l.reviewed_at)) stale,rf.decision feedback_decision,rf.final_state feedback_final_state,rf.learning_status
FROM latest l JOIN public.companies c ON c.id=l.company_id LEFT JOIN public.review_feedback rf ON rf.secondary_review_id=l.id
ORDER BY (NOT l.agreement) DESC,l.reviewed_at DESC,c.name`;
json(res,200,{companies:rows})}

async function detail(res,id){const sql=db();const [company]=await sql`
SELECT scr.*,c.name,c.category,c.public_state current_primary_state,c.commercialised,c.what_it_needs_to_qualify,c.notes,c.website,c.country,c.last_reviewed,c.methodology_version,c.publishable,c.evidence_summary,c.updated_at current_primary_updated_at
FROM public.secondary_company_reviews scr JOIN public.companies c ON c.id=scr.company_id WHERE scr.id=${id} LIMIT 1`;
if(!company)return json(res,404,{error:'review_not_found'});
const [primaryCriteria,secondaryCriteria,evidence,investors,feedback,memory]=await Promise.all([
sql`SELECT criterion,verdict,rationale,reviewed_at,methodology_version FROM public.criterion_reviews WHERE company_id=${company.company_id} ORDER BY criterion`,
sql`SELECT criterion,original_verdict,proposed_verdict,agreement,rationale,missing_evidence FROM public.secondary_criterion_reviews WHERE secondary_review_id=${id} ORDER BY criterion`,
sql`SELECT evidence_kind,criterion,source_url,publisher,source_type,publication_date,claim,support_status AS evidence_direction,notes,created_at AS retrieved_at FROM public.secondary_evidence WHERE secondary_review_id=${id} ORDER BY criterion NULLS LAST,id`,
sql`SELECT investor_name,canonical_name,relationship_type,original_relationship_present,proposed_action,source_url,source_type,rationale FROM public.secondary_investor_reviews WHERE secondary_review_id=${id} ORDER BY proposed_action DESC,investor_name`,
sql`SELECT decision,final_state,final_criterion_overrides,feedback_note,use_for_learning,learning_status,learning_processed_at,created_at FROM public.review_feedback WHERE secondary_review_id=${id} LIMIT 1`,
sql`SELECT id,status,memory_type,pattern_key,pattern_name,trigger_conditions,typical_failure_mode,mandatory_follow_up_checks,evidence_types_to_seek,criteria_affected,examples,counterexamples,guidance,observed_count AS supporting_examples,false_positive_examples,false_negative_examples,confidence,updated_at,activated_at,superseded_by FROM public.engine_memory ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END,updated_at DESC`
]);
json(res,200,{company,primaryCriteria,secondaryCriteria,evidence,investors,feedback:feedback[0]||null,activeMemory:memory})}

async function memory(res){const sql=db();const rows=await sql`SELECT id,status,memory_type,pattern_key,pattern_name,trigger_conditions,typical_failure_mode,mandatory_follow_up_checks,evidence_types_to_seek,criteria_affected,examples,counterexamples,guidance,observed_count AS supporting_examples,false_positive_examples,false_negative_examples,confidence,created_at,updated_at,activated_at,superseded_by FROM public.engine_memory ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END,updated_at DESC`;json(res,200,{memory:rows})}

async function saveFeedback(req,res,id){const sql=db();const b=await body(req);if(!['primary_correct','secondary_correct','custom'].includes(b.decision))return json(res,400,{error:'invalid_decision'});const [r]=await sql`SELECT id,company_id,original_state,proposed_state FROM public.secondary_company_reviews WHERE id=${id}`;if(!r)return json(res,404,{error:'review_not_found'});const finalState=b.decision==='primary_correct'?r.original_state:b.decision==='secondary_correct'?r.proposed_state:b.final_state;if(!['Main','Pending','Excluded'].includes(finalState))return json(res,400,{error:'invalid_final_state'});const note=b.feedback_note?String(b.feedback_note).slice(0,8000):null;const learn=b.use_for_learning!==false;const overrides=JSON.stringify(b.final_criterion_overrides||{});const [saved]=await sql`INSERT INTO public.review_feedback(company_id,secondary_review_id,decision,final_state,final_criterion_overrides,feedback_note,use_for_learning,learning_status,learning_processed_at) VALUES(${r.company_id},${r.id},${b.decision},${finalState},${overrides}::jsonb,${note},${learn},${learn?'pending':'ignored'},NULL) ON CONFLICT(secondary_review_id) DO UPDATE SET decision=excluded.decision,final_state=excluded.final_state,final_criterion_overrides=excluded.final_criterion_overrides,feedback_note=excluded.feedback_note,use_for_learning=excluded.use_for_learning,learning_status=excluded.learning_status,learning_processed_at=NULL,created_at=now() RETURNING *`;await sql`UPDATE public.secondary_company_reviews SET review_status='adjudicated',adjudicated_at=now(),adjudication_note=${note} WHERE id=${id}`;json(res,200,{feedback:saved})}

export async function handleReviewApi(req,res,path){if(!auth(req,res))return;try{if(req.method==='GET'&&path==='/api/review/summary')return summary(res);if(req.method==='GET'&&path==='/api/review/companies')return index(res);if(req.method==='GET'&&path==='/api/review/memory')return memory(res);let m=path.match(/^\/api\/review\/companies\/(\d+)$/);if(req.method==='GET'&&m)return detail(res,Number(m[1]));m=path.match(/^\/api\/review\/companies\/(\d+)\/feedback$/);if(req.method==='POST'&&m)return saveFeedback(req,res,Number(m[1]));json(res,404,{error:'not_found'})}catch(e){console.error(e);json(res,502,{error:'review_database_unavailable',detail:e instanceof Error?e.message:String(e)})}}
