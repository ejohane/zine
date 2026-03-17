import http from 'node:http';

const listenPort = Number.parseInt(process.env.ZINE_PROXY_PORT ?? '', 10);
const targetPort = Number.parseInt(process.env.ZINE_PROXY_TARGET_PORT ?? '', 10);
const listenHost = process.env.ZINE_PROXY_HOST?.trim() || '0.0.0.0';
const targetHost = process.env.ZINE_PROXY_TARGET_HOST?.trim() || '127.0.0.1';

if (!Number.isInteger(listenPort) || listenPort <= 0) {
  console.error('ZINE_PROXY_PORT must be set to a valid port');
  process.exit(1);
}

if (!Number.isInteger(targetPort) || targetPort <= 0) {
  console.error('ZINE_PROXY_TARGET_PORT must be set to a valid port');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const upstream = http.request(
    {
      hostname: targetHost,
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (error) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end(`Upstream proxy error: ${error.message}`);
  });

  req.on('aborted', () => {
    upstream.destroy();
  });

  req.pipe(upstream);
});

server.on('clientError', (error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  console.error(`[dev-proxy] client error: ${error.message}`);
});

server.listen(listenPort, listenHost, () => {
  console.log(
    `[dev-proxy] http://${listenHost}:${listenPort} -> http://${targetHost}:${targetPort}`
  );
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
