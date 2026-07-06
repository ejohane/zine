import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'storybook-static');
const port = Number(process.env.STORYBOOK_STATIC_PORT ?? process.env.PORT ?? 6007);
const host = process.env.STORYBOOK_STATIC_HOST ?? '127.0.0.1';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function resolveRequestPath(requestUrl) {
  let pathname;

  try {
    const url = new URL(requestUrl ?? '/', `http://${host}:${port}`);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const normalizedPath = path
    .normalize(pathname)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  const filePath = path.resolve(root, normalizedPath === '/' ? 'index.html' : normalizedPath);
  const relativePath = path.relative(root, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url);

  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const stats = statSync(filePath);

    if (!stats.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Length': stats.size,
      'Content-Type': contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
