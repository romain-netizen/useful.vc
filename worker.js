import { handleApiRequest, jsonResponse, securityHeaders } from './directory-api.js';
import { handleV2ApiRequest } from './directory-v2-api.js';

const V2_METHODOLOGY_HASH = '1f317d5ff9801a9de935153adca45032dc7e4790e7d9f9b8c354963458a47207';
const V2_METHODOLOGY_PARTS = [
  '01-introduction-through-value.md',
  '02-structural-rules.md',
  '03-evidence-and-verdicts.md',
  '04-attributes-research-and-record.md',
  '05-invariants-validation-and-challenges.md',
];

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders)) {
    secured.headers.set(name, value);
  }
  return secured;
}

async function canonicalMethodologyResponse(request, env) {
  const requestUrl = new URL(request.url);
  const parts = [];
  for (const filename of V2_METHODOLOGY_PARTS) {
    const partUrl = new URL(`/v2/methodology-parts/${filename}`, requestUrl);
    const response = await env.ASSETS.fetch(new Request(partUrl, { method: 'GET' }));
    if (!response.ok) {
      throw new Error(`Canonical methodology part unavailable: ${filename}`);
    }
    parts.push(await response.text());
  }
  const body = parts.join('');
  const response = new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'ETag': `"sha256-${V2_METHODOLOGY_HASH}"`,
      'X-Methodology-Version': '2.0',
      'X-Methodology-SHA256': V2_METHODOLOGY_HASH,
    },
  });
  return withSecurityHeaders(response);
}

function methodologyHashResponse(request) {
  return withSecurityHeaders(new Response(
    request.method === 'HEAD' ? null : `${V2_METHODOLOGY_HASH}  engine-v2-canonical.md\n`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    },
  ));
}

export default {
  async fetch(request, env) {
    try {
      const pathname = new URL(request.url).pathname;

      if (pathname === '/api/v2' || pathname.startsWith('/api/v2/')) {
        return await handleV2ApiRequest(request, env.DATABASE_URL);
      }

      if (pathname === '/v2/engine-v2-canonical.md') {
        return await canonicalMethodologyResponse(request, env);
      }

      if (pathname === '/v2/engine-v2-canonical.sha256') {
        return methodologyHashResponse(request);
      }

      if (pathname === '/healthz' || pathname.startsWith('/api/')) {
        return await handleApiRequest(request, env.DATABASE_URL);
      }

      if (request.method === 'GET' || request.method === 'HEAD') {
        return withSecurityHeaders(await env.ASSETS.fetch(request));
      }

      return jsonResponse(request, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
    } catch (error) {
      console.error('Unhandled Worker request error:', error);
      return jsonResponse(request, 500, { error: 'internal_server_error' });
    }
  },
};
