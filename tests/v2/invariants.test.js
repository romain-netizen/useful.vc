import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const safeguards = await readFile('migrations/v2/005_write_time_invariants.sql', 'utf8');
const shadow = await readFile('migrations/v2/006_shadow_reference.sql', 'utf8');
const evidence = await readFile('migrations/v2/007_evidence_search_and_completeness.sql', 'utf8');
const routing = await readFile('migrations/v2/008_preview_state_and_routing.sql', 'utf8');

test('methodology hash and append-only records are enforced in the database', () => {
  assert.match(safeguards, /enforce_active_methodology/i);
  assert.match(safeguards, /methodology version\/hash is not active/i);
  assert.match(safeguards, /append-only/i);
  assert.match(safeguards, /signed verdicts may only be superseded once/i);
});

test('verdict invariants are enforced before signing', () => {
  assert.match(safeguards, /Listed.*requires a current Ready assessment/is);
  assert.match(safeguards, /Pending.*requires named gaps/is);
  assert.match(safeguards, /Excluded requires at least one current R1–R5 Fail/is);
  assert.match(safeguards, /requires five Pass rule results/i);
  assert.match(safeguards, /explicit preview permission/i);
});

test('routing cannot change a verdict or put invasive units in Technology', () => {
  assert.match(safeguards, /Technology collection cannot contain an Invasive or Drug or Biologic unit/i);
  assert.match(safeguards, /must be routed to Biotech & invasive medicine/i);
  assert.doesNotMatch(routing, /UPDATE\s+engine_v2\.signed_verdicts/i);
});

test('shadow workbook remains explicitly non-authoritative', () => {
  assert.match(shadow, /authoritative boolean NOT NULL DEFAULT false CHECK \(authoritative = false\)/i);
  assert.match(shadow, /cannot create product units, rule assessments, signed verdicts or publication rights/i);
  assert.match(routing, /unsigned_shadow/i);
});

test('legacy evidence is imported as research input, not automatic R1–R5 passes', () => {
  assert.match(evidence, /research_v2\.legacy_evidence_map/i);
  assert.match(evidence, /Placeholder for product-unit discovery only/i);
  assert.doesNotMatch(evidence, /INSERT INTO engine_v2\.rule_assessments/i);
  assert.doesNotMatch(evidence, /INSERT INTO engine_v2\.signed_verdicts/i);
});
