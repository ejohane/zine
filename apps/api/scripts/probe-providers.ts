import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existingProviderCredentials } from './provider-credentials';
import { extractSpotify } from '../src/providers/spotify';
import { extractYouTube } from '../src/providers/youtube';
import { extractWeb } from '../src/providers/web';
import { extractX } from '../src/providers/x';
import { ProviderError } from '../src/remote';
import type { Env } from '../src/types';

const credentials = await existingProviderCredentials();
const snapshot = JSON.parse(await readFile('.local-data/library-snapshot.json', 'utf8')) as {
  items: { provider: string; canonicalUrl: string }[];
};
const env = credentials as unknown as Env;
const result: {
  at: string;
  provider: string;
  input: 'real-library-reference';
  status: string;
  fields?: string[];
  components?: unknown;
  errorCode?: string;
}[] = [];
for (const provider of ['SPOTIFY', 'YOUTUBE', 'X', 'WEB', 'RSS', 'SUBSTACK'])
  for (const item of snapshot.items.filter((item) => item.provider === provider).slice(0, 3)) {
    try {
      const extraction =
        provider === 'SPOTIFY'
          ? await extractSpotify(env, item.canonicalUrl)
          : provider === 'YOUTUBE'
            ? await extractYouTube(env, item.canonicalUrl)
            : provider === 'X'
              ? await extractX(env, item.canonicalUrl)
              : await extractWeb(item.canonicalUrl);
      result.push({
        at: new Date().toISOString(),
        provider: provider.toLowerCase(),
        input: 'real-library-reference',
        status: 'extracted',
        fields: extraction.contributions.map((c) => c.field),
        components: extraction.components,
      });
    } catch (error) {
      result.push({
        at: new Date().toISOString(),
        provider: provider.toLowerCase(),
        input: 'real-library-reference',
        status: 'failed',
        errorCode: error instanceof ProviderError ? error.code : 'unexpected_error',
      });
    }
  }
await mkdir('evidence', { recursive: true });
await writeFile(
  'evidence/provider-probes.json',
  JSON.stringify(
    {
      scope: 'live provider calls using reusable client credentials; not full acceptance',
      results: result,
    },
    null,
    2
  )
);
console.log(JSON.stringify({ credentialNamesPresent: Object.keys(credentials), results: result }));
if (result.some((r) => r.status === 'failed')) process.exitCode = 1;
