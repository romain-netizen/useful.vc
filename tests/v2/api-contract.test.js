import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile('directory-v2-api.js', 'utf8');
const app = await readFile('public/v2/app.js', 'utf8');
const worker = await readFile('worker.js', 'utf8');

test('preview API reads the isolated V2 preview view', () => {
  assert.match(api, /publication_v2\.company_directory_preview/);
  assert.match(api, /publication_v2\.preview_progress/);
  assert.doesNotMatch(api, /INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM/i);
});

test('signed and unsigned states are never conflated', () => {
  assert.match(api, /signedState:\s*row\.v2_state/);
  assert.match(api, /provisionalState:\s*row\.shadow_state/);
  assert.match(api, /stateAuthority:\s*row\.preview_state_authority/);
  assert.match(api, /Unsigned shadow states are research references, not published verdicts/);
  assert.match(app, /Signed verdict/);
  assert.match(app, /Unsigned research/);
  assert.match(app, /not a signed product-level verdict/);
});

test('collection routing is labelled provisional until product-level review', () => {
  assert.match(api, /collectionIsProvisional/);
  assert.match(app, /provisional_collection/);
  assert.match(app, /routing-provisional/);
});

test('canonical methodology is exposed with its hash', () => {
  assert.match(worker, /\/v2\/engine-v2-canonical\.md/);
  assert.match(worker, /X-Methodology-SHA256/);
  assert.match(worker, /1f317d5ff9801a9de935153adca45032dc7e4790e7d9f9b8c354963458a47207/);
});
