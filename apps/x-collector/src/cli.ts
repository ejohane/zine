#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { XTimelineCaptureSchema } from '@zine/x-archive-schema';
import { startReceiver } from './receiver';
import { uploadCapture } from './upload';

type Args = { _: string[]; [key: string]: string | boolean | string[] };

function parseArgs(argv: string[]): Args {
  const result: Args = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]!;
    if (!value.startsWith('--')) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index++;
    } else {
      result[key] = true;
    }
  }
  return result;
}

async function readInput(path: string | boolean | undefined): Promise<unknown> {
  const text = typeof path === 'string' ? await readFile(path, 'utf8') : await Bun.stdin.text();
  return JSON.parse(text) as unknown;
}

function usage(): never {
  console.error(`Usage:
  bun run --cwd apps/x-collector validate [--file capture.json]
  bun run --cwd apps/x-collector upload [--file capture.json] [--api-url URL] [--token TOKEN]
  bun run --cwd apps/x-collector receive --count 500 [--port 4319] [--api-url URL] [--token TOKEN]

Environment:
  ZINE_X_ARCHIVE_API_URL   defaults to https://x-archive-api.myzine.app
  ZINE_X_ARCHIVE_TOKEN     PAT with x-archive:write and preferably x-archive:read`);
  process.exit(2);
}

const args = parseArgs(Bun.argv.slice(2));
const command = args._[0];
if (command !== 'validate' && command !== 'upload' && command !== 'receive') usage();

try {
  if (command === 'receive') {
    const token =
      (typeof args.token === 'string' ? args.token : undefined) ?? process.env.ZINE_X_ARCHIVE_TOKEN;
    if (!token) throw new Error('ZINE_X_ARCHIVE_TOKEN or --token is required');
    const requestedCount = typeof args.count === 'string' ? Number.parseInt(args.count, 10) : 500;
    if (!Number.isFinite(requestedCount) || requestedCount < 1 || requestedCount > 100_000) {
      throw new Error('--count must be between 1 and 100000');
    }
    const port = typeof args.port === 'string' ? Number.parseInt(args.port, 10) : 4319;
    const apiUrl =
      (typeof args['api-url'] === 'string' ? args['api-url'] : undefined) ??
      process.env.ZINE_X_ARCHIVE_API_URL ??
      'https://x-archive-api.myzine.app';
    const receiver = startReceiver({ requestedCount, apiUrl, token, port });
    console.log(
      JSON.stringify({
        ready: true,
        receiverUrl: receiver.url,
        runId: receiver.runId,
        requestedCount,
      })
    );
    const result = await receiver.completed;
    console.log(JSON.stringify({ success: true, ...result }, null, 2));
    process.exit(0);
  }

  const raw = await readInput(typeof args.file === 'string' ? args.file : undefined);
  const capture = XTimelineCaptureSchema.parse(raw);
  if (command === 'validate') {
    console.log(
      JSON.stringify(
        {
          valid: true,
          runId: capture.runId,
          requestedCount: capture.requestedCount,
          collectedCount: capture.items.length,
          canonicalPosts: capture.posts.length,
          excludedAds: capture.excludedAds,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const apiUrl =
    (typeof args['api-url'] === 'string' ? args['api-url'] : undefined) ??
    process.env.ZINE_X_ARCHIVE_API_URL ??
    'https://x-archive-api.myzine.app';
  const token =
    (typeof args.token === 'string' ? args.token : undefined) ?? process.env.ZINE_X_ARCHIVE_TOKEN;
  if (!token) throw new Error('ZINE_X_ARCHIVE_TOKEN or --token is required');
  const chunkSize =
    typeof args['chunk-size'] === 'string' ? Number.parseInt(args['chunk-size'], 10) : undefined;

  const result = await uploadCapture(capture, {
    apiUrl,
    token,
    chunkSize,
    verify: args['no-verify'] !== true,
  });
  console.log(JSON.stringify({ success: true, ...result }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      null,
      2
    )
  );
  process.exit(1);
}
