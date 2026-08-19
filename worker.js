import { handleApiRequest, jsonResponse, securityHeaders } from './directory-api.js';

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders)) {
    secured.headers.set(name, value);
  }
  return secured;
}

function staticRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

export default {
  async fetch(request, env) {
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/healthz' || pathname.startsWith('/api/')) {
        return await handleApiRequest(request, env.DATABASE_URL);
      }

      if (request.method === 'GET' || request.method === 'HEAD') {
        if (pathname === '/rules' || pathname === '/rules/') {
          return withSecurityHeaders(await env.ASSETS.fetch(staticRequest(request, '/rules.html')));
        }
        if (pathname === '/engine-methodology') {
          return withSecurityHeaders(await env.ASSETS.fetch(staticRequest(request, '/engine-methodology.txt')));
        }
        return withSecurityHeaders(await env.ASSETS.fetch(request));
      }

      return jsonResponse(request, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
    } catch (error) {
      console.error('Unhandled Worker request error:', error);
      return jsonResponse(request, 500, { error: 'internal_server_error' });
    }
  },
};
