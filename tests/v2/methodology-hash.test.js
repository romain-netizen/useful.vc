import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  loadClassifierSystemPrompt,
  loadCoverageAutomationPrompt,
  loadEngineV2CanonicalText,
  loadEngineV2Manifest,
} from '../../prompts/v2/load-engine-v2.js';

const EXPECTED_HASH = '1f317d5ff9801a9de935153adca45032dc7e4790e7d9f9b8c354963458a47207';
const EXPECTED_BYTES = 42055;

function sha256(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

test('canonical Engine V2 text is byte-exact', () => {
  const methodology = loadEngineV2CanonicalText();
  assert.equal(Buffer.byteLength(methodology, 'utf8'), EXPECTED_BYTES);
  assert.equal(sha256(methodology), EXPECTED_HASH);
});

test('classifier and coverage automation receive identical text', () => {
  const classifier = loadClassifierSystemPrompt();
  const coverage = loadCoverageAutomationPrompt();
  assert.equal(classifier, coverage);
  assert.equal(sha256(classifier), EXPECTED_HASH);
});

test('manifest matches the active methodology', () => {
  const manifest = loadEngineV2Manifest();
  assert.equal(manifest.version, '2.0');
  assert.equal(manifest.sha256, EXPECTED_HASH);
  assert.deepEqual(manifest.consumers, ['classifier', 'coverage_automation', 'public_rules_page']);
});
