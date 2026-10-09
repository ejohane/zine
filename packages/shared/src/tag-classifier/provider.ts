import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  POLICY_VERSION,
  RunSchema,
  questionsFor,
  type Catalog,
  type ClassifierInput,
} from './core';

export const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ResponseSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.object({ type: z.literal('noul'), noul: z.number().min(0).max(1) })),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});
export async function classify(
  input: ClassifierInput,
  catalog: Catalog,
  options: {
    apiKey?: string;
    model: string;
    price: number;
    fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  }
) {
  if (!options.apiKey?.trim())
    throw new Error(
      'TYPESAFE_API_KEY is missing. Launch through a configured secretsctl profile; never put the key in CLI arguments.'
    );
  const started = performance.now();
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        state: {
          title: input.title,
          description: input.description,
          text: input.text,
          contentType: input.contentType,
          publisher: input.publisher,
          creator: input.creator,
          coverage: input.coverage,
        },
        questions: questionsFor(catalog),
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error(
      'Jev request failed or timed out after 60 seconds. No result was saved; retry explicitly.'
    );
  }
  if (!response.ok) {
    const guidance =
      response.status === 401 || response.status === 403
        ? 'Check API access and credentials.'
        : response.status === 429 || response.status === 529
          ? `Retry later${response.headers.get('retry-after') ? ' (server supplied Retry-After)' : ''}.`
          : response.status === 422
            ? 'Input or questions exceed limits or failed validation; inspect the prepared input.'
            : 'Retry if temporary; check TypeSafe service status.';
    throw new Error(`Jev HTTP ${response.status}. ${guidance}`);
  }
  let parsed;
  try {
    parsed = ResponseSchema.parse(await response.json());
  } catch {
    throw new Error('Jev returned an invalid response. No result was saved.');
  }
  const probabilities = Object.fromEntries(
    Object.entries(parsed.answers).map(([id, answer]) => [id, answer.noul])
  );
  try {
    return RunSchema.parse({
      version: 1,
      policyVersion: POLICY_VERSION,
      catalog,
      input,
      inputHash: hash(input),
      catalogHash: hash(catalog),
      requestedModel: options.model,
      model: parsed.model,
      createdAt: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - started),
      usage: parsed.usage,
      pricePerMillionInputTokens: options.price,
      estimatedCostUsd: (parsed.usage.input_tokens / 1_000_000) * options.price,
      probabilities,
    });
  } catch {
    throw new Error('Jev response did not match the complete catalog. No result was saved.');
  }
}
