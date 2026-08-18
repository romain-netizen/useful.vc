import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('deployment/services.json', 'utf8'));
const expectedServices = ['cloudflare', 'github', 'neon', 'vercel'];
const actualServices = Object.keys(manifest.services || {}).sort();

if (JSON.stringify(actualServices) !== JSON.stringify(expectedServices)) {
  throw new Error(`Unexpected production service inventory: ${actualServices.join(', ')}`);
}
if (manifest.sourceOfTruth?.repository !== 'romain-netizen/useful.vc') {
  throw new Error('GitHub is not recorded as the canonical repository.');
}
if (manifest.services.cloudflare?.workerName !== 'useful-vc') {
  throw new Error('Cloudflare target does not match wrangler.jsonc.');
}
if (manifest.services.vercel?.projectName !== 'useful-vc-review-ui-v2') {
  throw new Error('Vercel target does not match the canonical review project.');
}
if (manifest.services.neon?.projectId !== 'aged-unit-27578806') {
  throw new Error('Neon target does not match the canonical database project.');
}

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const forbiddenDeploymentFiles = trackedFiles.filter((file) => /(^|\/)railway[^/]*\.toml$/i.test(file));
if (forbiddenDeploymentFiles.length > 0) {
  throw new Error(`Railway deployment configuration is forbidden: ${forbiddenDeploymentFiles.join(', ')}`);
}

console.log('Operations manifest contains exactly GitHub, Neon, Cloudflare and Vercel.');
