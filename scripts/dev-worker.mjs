// Keep injected classifier credentials in memory, outside CLI args and .dev.vars.
import { spawn } from 'node:child_process';

if (!process.env.TYPESAFE_API_KEY) {
  const child = spawn(
    'bun',
    [
      'wrangler',
      'dev',
      '--var',
      'ENVIRONMENT:development',
      '--ip',
      '0.0.0.0',
      '--port',
      process.env.WORKER_PORT || '8787',
      '--inspector-port',
      process.env.WORKER_INSPECTOR_PORT || '9230',
    ],
    { stdio: 'inherit' }
  );
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code ?? 1));
} else {
  // Wrangler's API avoids exposing the key as a command-line binding or secret file.
  const { unstable_dev } = await import('wrangler');
  try {
    const worker = await unstable_dev('src/index.ts', {
      config: 'wrangler.toml',
      local: true,
      ip: '0.0.0.0',
      port: Number(process.env.WORKER_PORT || 8787),
      inspectorPort: Number(process.env.WORKER_INSPECTOR_PORT || 9230),
      persist: true,
      logLevel: 'error',
      vars: {
        ENVIRONMENT: 'development',
        AUTO_TAGGING_ENABLED: process.env.AUTO_TAGGING_ENABLED || 'false',
        TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
      },
      experimental: { disableExperimentalWarning: true, watch: true },
    });
    console.log(`Worker with in-memory classifier binding ready on port ${worker.port}`);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
      process.on(signal, async () => {
        await worker.stop();
        process.exit(0);
      });
    await worker.waitUntilExit();
  } catch {
    console.error('Local Worker startup failed. Check configuration and service availability.');
    process.exitCode = 1;
  }
}
