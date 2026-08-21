import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationFiles = [
  'migrations/v2/001_foundation.sql',
  'migrations/v2/002_engine.sql',
  'migrations/v2/003_research_publication.sql',
  'migrations/v2/004_seed_and_views.sql',
];

async function migrations() {
  return (await Promise.all(migrationFiles.map((path) => readFile(path, 'utf8')))).join('\n');
}

test('V2 schemas are isolated from legacy public tables', async () => {
  const sql = await migrations();
  for (const schema of ['directory_v2', 'engine_v2', 'research_v2', 'publication_v2']) {
    assert.match(sql, new RegExp(`CREATE SCHEMA IF NOT EXISTS ${schema}`, 'i'));
  }
  assert.doesNotMatch(sql, /DROP\s+(TABLE|SCHEMA|VIEW)/i);
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+public\./i);
  assert.doesNotMatch(sql, /UPDATE\s+public\.companies/i);
});

test('methodology hash is fixed in the migration', async () => {
  const sql = await migrations();
  assert.match(sql, /1f317d5ff9801a9de935153adca45032dc7e4790e7d9f9b8c354963458a47207/);
  assert.match(sql, /'2\.0'/);
});

test('product-level judgement and five rule results are represented', async () => {
  const sql = await migrations();
  assert.match(sql, /CREATE TABLE IF NOT EXISTS engine_v2\.product_units/i);
  assert.match(sql, /rule_code IN \('R1','R2','R3','R4','R5'\)/i);
  assert.match(sql, /result IN \('Pass','Fail','Unresolved'\)/i);
  assert.match(sql, /proposed_verdict IN \('Listed','Pending','Excluded'\)/i);
});

test('Pending cannot be written without named gaps and a review date', async () => {
  const sql = await migrations();
  assert.match(sql, /result <> 'Pending' OR jsonb_array_length\(missing_conditions\) > 0/i);
  assert.match(sql, /result <> 'Pending' OR review_date IS NOT NULL/i);
});

test('V2 publication requires explicit company controls', async () => {
  const sql = await migrations();
  assert.match(sql, /all_material_units_identified boolean NOT NULL DEFAULT false/i);
  assert.match(sql, /human_review_complete boolean NOT NULL DEFAULT false/i);
  assert.match(sql, /allow_preview_publication boolean NOT NULL DEFAULT false/i);
});

test('all legacy companies enter an explicit V2 research queue', async () => {
  const sql = await migrations();
  assert.match(sql, /INSERT INTO research_v2\.company_queue/i);
  assert.match(sql, /Currently published: rejudge before V2 preview cutover/i);
  assert.match(sql, /Legacy exclusion has no named FAIL and must be reopened/i);
});
