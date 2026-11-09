import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
/** Suppress CLI output. An explicit ignored diagnostic path may retain a private import error. */
export async function quietCommand(
  program: string,
  args: string[],
  input?: string,
  privateFailurePath?: string
) {
  const child = spawn(program, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (c) => {
    stdout += c;
  });
  child.stderr.on('data', (c) => {
    stderr += c;
  });
  child.stdin.end(input);
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (c) => resolve(c ?? 1));
  });
  if (code) {
    if (privateFailurePath) await writeFile(privateFailurePath, stdout + stderr, { mode: 0o600 });
    const category = /404|not found|does not exist/i.test(stdout + stderr)
      ? 'not_found'
      : /timeout|timed out/i.test(stdout + stderr)
        ? 'timeout'
        : 'command_failed';
    throw new Error(`${program} failed (${code}; ${category}); output suppressed`);
  }
  return stdout;
}
