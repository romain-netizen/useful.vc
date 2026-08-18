import { readFileSync } from 'node:fs';

const promptPaths = [
  'prompts/02_classifier_system_prompt.md',
  'prompts/06_french_vc_coverage_automation_prompt.md',
];
const start = '<!-- ENGINE_METHODOLOGY_START -->';
const end = '<!-- ENGINE_METHODOLOGY_END -->';
const promptSources = new Map(promptPaths.map((path) => [path, readFileSync(path, 'utf8')]));

function methodology(path) {
  const source = promptSources.get(path);
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || source.indexOf(start, startIndex + 1) >= 0 || source.indexOf(end, endIndex + 1) >= 0) {
    throw new Error(`${path} must contain exactly one marked engine methodology.`);
  }
  return source.slice(startIndex + start.length, endIndex);
}

const [classifierMethodology, automationMethodology] = promptPaths.map(methodology);
if (classifierMethodology !== automationMethodology) {
  throw new Error('The classifier and automation engine methodologies have diverged.');
}

for (const required of [
  'Does the product do the thing, or does it help someone else maybe do it?',
  'R1 — The product must do the thing itself',
  'R2 — Whoever pays must not be the one who benefits',
  'R3 — The product must reduce the problem, not manage it',
  'R4 — The company must lose money if the problem disappears',
  'Only levels 1 to 3 qualify',
  'The level 1 bypass',
  'additionality_substitute',
  'No exceptions',
  'Order: the 13 first, then the 154 published, then the rest.',
]) {
  if (!classifierMethodology.includes(required)) {
    throw new Error(`Engine methodology is missing required language: ${required}`);
  }
}

for (const forbidden of [
  'Commons exception — a rule, not a door',
  'narrow commons exception',
  'Test 1 — Gravity',
  'Test 2 — Realisation',
  'Test 3 — Additionality',
]) {
  if (classifierMethodology.includes(forbidden)) {
    throw new Error(`Superseded doctrine language remains in engine methodology: ${forbidden}`);
  }
}

for (const [path, source] of promptSources) {
  for (const forbidden of [
    '<!-- SELECTIVITY_DOCTRINE_START -->',
    '<!-- SELECTIVITY_DOCTRINE_END -->',
    'Apply Test 1 — Gravity',
    'Apply Test 2 — Realisation',
    'The narrow commons exception applies',
    'apply the separate additionality gate',
  ]) {
    if (source.includes(forbidden)) {
      throw new Error(`${path} still contains superseded active instruction: ${forbidden}`);
    }
  }
}

console.log('Classifier and automation prompts contain the same four-rule engine methodology.');
