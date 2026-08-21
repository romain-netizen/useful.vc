import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(moduleDirectory, '..', '..');
const manifestPath = path.join(moduleDirectory, 'engine-v2-manifest.json');

export function loadEngineV2Manifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

export function loadEngineV2CanonicalText() {
  const manifest = loadEngineV2Manifest();
  return manifest.parts
    .map((relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'))
    .join('');
}

export function loadClassifierSystemPrompt() {
  return loadEngineV2CanonicalText();
}

export function loadCoverageAutomationPrompt() {
  return loadEngineV2CanonicalText();
}
