import { handleApiRequest, jsonResponse, securityHeaders } from './directory-api.js';
import { handleV2ApiRequest } from './directory-v2-api.js';

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders)) {
    secured.headers.set(name, value);
  }
  return secured;
}

export default {
  async fetch(request, env) {
    try {
      const pathname = new URL(request.url).pathname;

      if (pathname === '/api/v2' || pathname.startsWith('/api/v2/')) {
        return await handleV2ApiRequest(request, env.DATABASE_URL);
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
