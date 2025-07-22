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
    
    // API routes
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
    
    // Try to serve static assets first
    if (!env.ASSETS) {
      console.error('ASSETS binding is not available - this indicates a deployment configuration issue');
      // For SPA routes, try to serve a basic HTML fallback instead of erroring
      if (!url.pathname.includes('.')) {
        return new Response(`
          <!DOCTYPE html>
          <html>
            <head><title>Loading...</title></head>
            <body>
              <div>The application is loading. If this message persists, there may be a deployment issue.</div>
              <script>setTimeout(() => location.reload(), 3000);</script>
            </body>
          </html>
        `, {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        });
      }
      return new Response('Server configuration error - ASSETS binding missing', { status: 500 });
    }
    
    try {
      const asset = await env.ASSETS.fetch(request);
      
      // If asset found, add appropriate cache headers
      if (asset.status !== 404) {
        const response = new Response(asset.body, asset);
        
        // Cache static assets (JS, CSS, images) for 1 hour
        if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/)) {
          response.headers.set('Cache-Control', 'public, max-age=3600');
        }
        
        return response;
      }
    } catch (error) {
      console.error('Error fetching asset:', error);
      // Continue to SPA routing logic
    }
    
    // For SPA routing, serve index.html for client-side routes
    // This handles all routes that don't have file extensions (like /test1, /test2, etc.)
    const isStaticAsset = url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|json|txt|xml|pdf)$/);
    const isClientSideRoute = !isStaticAsset;
    
    if (isClientSideRoute) {
      try {
        const indexRequest = new Request(`${url.origin}/index.html`, {
          method: 'GET',
        });
        
        if (!env.ASSETS) {
          console.error('ASSETS binding is not available for SPA routing');
          return new Response('Server configuration error', { status: 500 });
        }
        
        const indexAsset = await env.ASSETS.fetch(indexRequest);
        
        if (indexAsset.ok) {
          // Clone the response to avoid stream consumption issues
          const indexContent = await indexAsset.text();
          return new Response(indexContent, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
              'X-Deployment-Time': new Date().toISOString(),
              'X-Build-Version': env.BUILD_TIME || 'dev',
            },
          });
        }
      } catch (error) {
        console.error('Error serving index.html:', error);
      }
    }
    
    return new Response('Not found', { status: 404 });
  },
};

interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  BUILD_TIME?: string;
}