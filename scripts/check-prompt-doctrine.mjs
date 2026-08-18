import { readFileSync } from 'node:fs';

const promptPaths = [
  'prompts/02_classifier_system_prompt.md',
  'prompts/06_french_vc_coverage_automation_prompt.md',
];
const start = '<!-- SELECTIVITY_DOCTRINE_START -->';
const end = '<!-- SELECTIVITY_DOCTRINE_END -->';

function doctrine(path) {
  const source = readFileSync(path, 'utf8');
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || source.indexOf(start, startIndex + 1) >= 0 || source.indexOf(end, endIndex + 1) >= 0) {
    throw new Error(`${path} must contain exactly one marked selectivity doctrine.`);
  }
  return source.slice(startIndex + start.length, endIndex);
}

const [classifierDoctrine, automationDoctrine] = promptPaths.map(doctrine);
if (classifierDoctrine !== automationDoctrine) {
  throw new Error('The classifier and automation selectivity doctrines have diverged.');
}

for (const required of [
  'Test 1 — Gravity',
  'Test 2 — Realisation',
  'Test 3 — Additionality',
  'Commons exception — a rule, not a door',
  'additionality_substitute',
  'deficit-bearing party',
  'Readiness never enters a test',
  'Re-judgement order',
]) {
  if (!classifierDoctrine.includes(required)) {
    throw new Error(`Selectivity doctrine is missing required language: ${required}`);
  }
}

console.log('Classifier and automation prompts contain the same three-test selectivity doctrine.');
