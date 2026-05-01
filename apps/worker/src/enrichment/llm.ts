import type { Bindings } from '../types';
import { logger } from '../lib/logger';
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

function getEnrichmentModel(env: Bindings): string {
  return env.ENRICHMENT_MODEL || DEFAULT_ENRICHMENT_MODEL;
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

function parseModelResponse(response: unknown): EnrichmentModelOutput {
  const direct = EnrichmentModelOutputSchema.safeParse(response);
  if (direct.success) return direct.data;

  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    const nestedResponse = EnrichmentModelOutputSchema.safeParse(record.response);
    if (nestedResponse.success) return nestedResponse.data;

    const nestedResult = EnrichmentModelOutputSchema.safeParse(record.result);
    if (nestedResult.success) return nestedResult.data;
  }

  const text = getResponseText(response);
  if (!text) {
    throw new EnrichmentModelValidationError('Workers AI response did not include JSON text');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(text)) as unknown;
  } catch (error) {
    throw new EnrichmentModelValidationError(
      `Workers AI response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const validated = EnrichmentModelOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new EnrichmentModelValidationError(
      `Workers AI JSON failed schema validation: ${validated.error.message}`
    );
  }

  return validated.data;
}

function buildJsonModeSchema() {
  return {
    type: 'json_schema',
    json_schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'summary',
        'classification',
        'topics',
        'entities',
        'suggestedTags',
        'userContext',
        'confidence',
      ],
      properties: {
        summary: {
          type: 'object',
          required: ['short', 'detail'],
          properties: {
            short: { type: 'string' },
            detail: { type: 'string' },
          },
        },
        classification: {
          type: 'object',
          required: [
            'primaryCategory',
            'secondaryCategories',
            'intent',
            'difficulty',
            'evergreenScore',
            'timeSensitivity',
          ],
          properties: {
            primaryCategory: { type: 'string' },
            secondaryCategories: { type: 'array', items: { type: 'string' } },
            intent: { type: 'string' },
            difficulty: { type: 'string' },
            evergreenScore: { type: 'number' },
            timeSensitivity: { type: 'string' },
          },
        },
        topics: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'confidence'],
            properties: {
              name: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
        },
        entities: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'type', 'confidence'],
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
        },
        suggestedTags: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'kind', 'confidence'],
            properties: {
              name: { type: 'string' },
              kind: { type: 'string', enum: ['topic', 'entity', 'intent', 'format'] },
              confidence: { type: 'number' },
            },
          },
        },
        userContext: {
          type: 'object',
          required: ['inferredSaveIntent', 'reasonToRevisit'],
          properties: {
            inferredSaveIntent: { type: 'string' },
            reasonToRevisit: { type: 'string' },
          },
        },
        confidence: {
          type: 'object',
          required: ['overall', 'summary', 'classification', 'tags'],
          properties: {
            overall: { type: 'number' },
            summary: { type: 'number' },
            classification: { type: 'number' },
            tags: { type: 'number' },
          },
        },
      },
    },
  };
}
async function runQwen(env: Bindings, input: unknown): Promise<unknown> {
  const ai = env.AI as unknown as WorkersAIRun | undefined;
  if (!ai) {
    throw new Error('Workers AI binding is not configured');
  }

  return ai.run(getEnrichmentModel(env), input);
}

export async function enrichWithQwen(
  env: Bindings,
  input: EnrichmentPromptInput
): Promise<EnrichmentModelOutput> {
  const messages = buildEnrichmentMessages(input);
  const request = {
    messages,
    response_format: buildJsonModeSchema(),
    max_tokens: 1800,
  };

  try {
    return parseModelResponse(await runQwen(env, request));
  } catch (error) {
    llmLogger.warn('Initial enrichment response invalid; retrying with repair prompt', {
      error,
    });

    const repairRequest = {
      ...request,
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'Retry. Return only valid JSON matching the schema exactly. No markdown or commentary.',
        },
      ],
    };

    return parseModelResponse(await runQwen(env, repairRequest));
  }
}
