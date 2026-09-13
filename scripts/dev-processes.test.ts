import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function eventually(check: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await Bun.sleep(25);
  }
  throw new Error('Process lifecycle did not settle');
}

test('SIGTERM to the non-TTY orchestrator releases descendant services and preserves unrelated processes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zine-processes-'));
  const portFile = join(root, 'port');
  const serverFile = join(root, 'server.mjs');
  writeFileSync(
    serverFile,
    `import {writeFileSync} from 'node:fs';
const server = Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('ready')});
writeFileSync(process.env.PORT_FILE,String(server.port));`
  );
  const unrelated = Bun.spawn(['sleep', '60']);
  const stack = Bun.spawn(
    [
      'bash',
      '-c',
      'source "$LIFECYCLE"; bash -c \'"$BUN_BIN" "$SERVER_FILE" & wait\' & SERVICES_PID=$!; wait "$SERVICES_PID"',
    ],
    {
      env: {
        ...process.env,
        LIFECYCLE: join(import.meta.dir, 'dev-processes.sh'),
        BUN_BIN: process.execPath,
        SERVER_FILE: serverFile,
        PORT_FILE: portFile,
      },
      stdout: 'ignore',
      stderr: 'ignore',
    }
  );
  try {
    let port = '';
    await eventually(() => {
      try {
        port = readFileSync(portFile, 'utf8');
        return !!port;
      } catch {
        return false;
      }
    });
    expect((await fetch(`http://127.0.0.1:${port}`)).status).toBe(200);
    stack.kill('SIGTERM');
    expect(await stack.exited).toBe(143);
    await eventually(async () => {
      try {
        await fetch(`http://127.0.0.1:${port}`);
        return false;
      } catch {
        return true;
      }
    });
    expect(unrelated.exitCode).toBeNull();
  } finally {
    stack.kill();
    unrelated.kill();
    await Promise.all([stack.exited, unrelated.exited]);
    rmSync(root, { recursive: true, force: true });
  }
}, 10000);
