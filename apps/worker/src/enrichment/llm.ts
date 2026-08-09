import type { Bindings } from '../types';
import { logger } from '../lib/logger';
import type { z } from 'zod';
import { buildEnrichmentMessages } from './prompt';
import { EnrichmentModelOutputSchema } from './schema';
import {
  DEFAULT_ENRICHMENT_MODEL,
  type EnrichmentModelOutput,
  type EnrichmentPromptInput,
} from './types';

const llmLogger = logger.child('enrichment-llm');

export class EnrichmentModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrichmentModelValidationError';
  }
}

type WorkersAIRun = {
  run(model: string, input: unknown): Promise<unknown>;
};

function getEnrichmentModel(env: Bindings, modelOverride?: string): string {
  return modelOverride || env.ENRICHMENT_MODEL || DEFAULT_ENRICHMENT_MODEL;
}

function getResponseText(response: unknown): string | null {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return null;

  const record = response as Record<string, unknown>;
  if (typeof record.response === 'string') return record.response;
  if (typeof record.result === 'string') return record.result;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.output_text === 'string') return record.output_text;
  if (typeof record.content === 'string') return record.content;
  if (record.result && typeof record.result === 'object') {
    const nested = record.result as Record<string, unknown>;
    if (typeof nested.response === 'string') return nested.response;
    if (typeof nested.text === 'string') return nested.text;
    if (typeof nested.output_text === 'string') return nested.output_text;
    if (typeof nested.content === 'string') return nested.content;
  }
  if (Array.isArray(record.choices)) {
    for (const choice of record.choices) {
      if (!choice || typeof choice !== 'object') continue;
      const choiceRecord = choice as Record<string, unknown>;
      if (typeof choiceRecord.text === 'string') return choiceRecord.text;
      if (typeof choiceRecord.content === 'string') return choiceRecord.content;
      if (choiceRecord.message && typeof choiceRecord.message === 'object') {
        const message = choiceRecord.message as Record<string, unknown>;
        if (typeof message.content === 'string') return message.content;
      }
    }
  }

  return null;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function jsonTextCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates = [stripJsonFence(trimmed)];

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return [...new Set(candidates)];
}

function parseModelResponse<T>(response: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const direct = schema.safeParse(response);
  if (direct.success) return direct.data;

  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    const nestedResponse = schema.safeParse(record.response);
    if (nestedResponse.success) return nestedResponse.data;

    const nestedResult = schema.safeParse(record.result);
    if (nestedResult.success) return nestedResult.data;
  }

  const text = getResponseText(response);
  if (!text) {
    throw new EnrichmentModelValidationError('Workers AI response did not include JSON text');
  }

  let parsed: unknown;
  let parseError: unknown;
  for (const candidate of jsonTextCandidates(text)) {
    try {
      parsed = JSON.parse(candidate) as unknown;
      parseError = null;
      break;
    } catch (error) {
      parseError = error;
    }
  }
  if (parseError) {
    throw new EnrichmentModelValidationError(
      `Workers AI response was not valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    );
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new EnrichmentModelValidationError(
      `Workers AI JSON failed schema validation: ${validated.error.message}`
    );
  }

  return validated.data;
}

async function runQwen(env: Bindings, input: unknown, modelOverride?: string): Promise<unknown> {
  const ai = env.AI as unknown as WorkersAIRun | undefined;
  if (!ai) {
    throw new Error('Workers AI binding is not configured');
  }

  return ai.run(getEnrichmentModel(env, modelOverride), input);
}

export async function runStructuredJson<T>(
  env: Bindings,
  input: {
    messages: Array<{ role: string; content: string }>;
    schema: z.ZodType<T, z.ZodTypeDef, unknown>;
    maxTokens: number;
    repairPrompt: string;
    operation: string;
    model?: string;
  }
): Promise<T> {
  const request = {
    messages: input.messages,
    // Workers AI JSON schema mode can reject larger nested schemas before returning output.
    // Keep generation constrained to JSON and let the local Zod schema enforce the contract.
    response_format: { type: 'json_object' },
    max_tokens: input.maxTokens,
  };

  try {
    return parseModelResponse(await runQwen(env, request, input.model), input.schema);
  } catch (error) {
    llmLogger.warn(`${input.operation} response invalid; retrying with repair prompt`, {
      error,
    });

    return parseModelResponse(
      await runQwen(
        env,
        {
          ...request,
          messages: [
            ...input.messages,
            {
              role: 'user',
              content: input.repairPrompt,
            },
          ],
        },
        input.model
      ),
      input.schema
    );
  }
}

export async function enrichWithQwen(
  env: Bindings,
  input: EnrichmentPromptInput,
  modelOverride?: string
): Promise<EnrichmentModelOutput> {
  const messages = buildEnrichmentMessages(input);
  return runStructuredJson<EnrichmentModelOutput>(env, {
    messages,
    schema: EnrichmentModelOutputSchema,
    maxTokens: 1800,
    repairPrompt:
      'Retry. Return only one valid JSON object with top-level keys summary, classification, topics, entities, suggestedTags, userContext, and confidence. No markdown or commentary.',
    operation: 'Initial enrichment',
    model: modelOverride,
  });
}

export const llmInternals = { jsonTextCandidates, stripJsonFence };
