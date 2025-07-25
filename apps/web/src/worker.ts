const testBookmarks = [
  { id: '1', title: 'GitHub - React' },
  { id: '2', title: 'TanStack Query Documentation' },
  { id: '3', title: 'Vite Documentation' },
  { id: '4', title: 'Cloudflare Workers' },
  { id: '5', title: 'TypeScript Handbook' },
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Log request for debugging in production
    console.log(`[${new Date().toISOString()}] ${request.method} ${url.pathname}`);
    
    // Handle API routes only - let ASSETS handle everything else including SPA routing
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/v1/bookmarks' && request.method === 'GET') {
        return new Response(JSON.stringify(testBookmarks), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new Response('Method not allowed', { status: 405 });
    }
    
    // Let Cloudflare Workers static assets handle everything else, including SPA routing
    // The not_found_handling = "single-page-application" configuration will automatically
    // serve index.html for navigation requests that don't match static assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    
    // Fallback if ASSETS binding is not available
    return new Response('Server configuration error - ASSETS binding missing', { status: 500 });
  },
};

interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  BUILD_TIME?: string;
}