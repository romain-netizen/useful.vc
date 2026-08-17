import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');
const sql = neon(url);
const aliases = ['Karavela','Surge','Norbert Health','Cowboy','Full Speed Automation','Orakl Oncology','Orakl','HCVC'];

const tables = ['companies','criterion_reviews','evidence','investors','company_investors','vc_funds','company_vc_sources','review_runs','site_syncs'];

async function safe(label, fn) {
  try { console.log(`PROBE:${label}=${JSON.stringify(await fn())}`); }
  catch (e) { console.log(`PROBE:${label}:ERROR=${e?.message || e}`); }
}

await safe('active_engine_memory', async () => sql`SELECT * FROM public.active_engine_memory`);
await safe('columns', async () => sql`
  SELECT table_name,column_name,data_type,column_default,is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name = ANY(${tables})
  ORDER BY table_name,ordinal_position
`);
await safe('hcvc_fund', async () => sql`SELECT * FROM public.vc_funds WHERE lower(name)=lower('HCVC')`);
await safe('existing_aliases', async () => sql`
  SELECT * FROM public.companies WHERE lower(name) = ANY(${aliases.map(x=>x.toLowerCase())}) ORDER BY name
`);
await safe('alias_criteria', async () => sql`
  SELECT c.name,cr.* FROM public.criterion_reviews cr JOIN public.companies c ON c.id=cr.company_id
  WHERE lower(c.name) = ANY(${aliases.map(x=>x.toLowerCase())}) ORDER BY c.name,cr.criterion
`);
await safe('alias_investors', async () => sql`
  SELECT c.name AS company,i.name AS investor,ci.source_type
  FROM public.company_investors ci JOIN public.companies c ON c.id=ci.company_id JOIN public.investors i ON i.id=ci.investor_id
  WHERE lower(c.name) = ANY(${aliases.map(x=>x.toLowerCase())}) ORDER BY c.name,i.name,ci.source_type
`);
console.log('PROBE:DONE');
