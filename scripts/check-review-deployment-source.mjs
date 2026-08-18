import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const requiredFiles = [
  'api/healthz.js',
  'api/review.js',
  'deployment/review-vercel.json',
  'public/review.html',
  'public/review.css',
  'public/review.js',
  'review-server.fixed.js',
  'vercel.json',
];

for (const file of requiredFiles) readFileSync(file);

const adapter = readFileSync('api/review.js', 'utf8');
if (!adapter.includes("from '../review-server.fixed.js'")) {
  throw new Error('The Vercel adapter must use the protected adjudication writer.');
}

const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
const target = JSON.parse(readFileSync('deployment/review-vercel.json', 'utf8'));
if (
  target.projectName !== 'useful-vc-review-ui-v2'
  || target.gitRepository !== 'https://github.com/romain-netizen/useful.vc'
  || target.productionBranch !== 'main'
) {
  throw new Error('The canonical Vercel/Git target has drifted.');
}
const rewrites = new Map((config.rewrites || []).map(({ source, destination }) => [source, destination]));
if (rewrites.get('/') !== '/review.html' || rewrites.get('/healthz') !== '/api/healthz') {
  throw new Error('The canonical review and health routes are not repository-defined.');
}
if (rewrites.get('/api/review/:path*') !== '/api/review?review_path=:path*') {
  throw new Error('The complete review API path is not routed to the canonical writer.');
}

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => file !== '.env.example');

const embeddedDatabaseCredential = /postgres(?:ql)?:\/\/[^\s/:]+:[^\s/@]+@/i;
for (const file of trackedFiles) {
  const contents = readFileSync(file);
  if (contents.includes(0)) continue;
  if (embeddedDatabaseCredential.test(contents.toString('utf8'))) {
    throw new Error(`A database credential is embedded in tracked source: ${file}`);
  }
}

console.log('Review deployment source is complete and contains no embedded database credential.');
