import { describe, expect, it } from 'vitest';
import { callGemini, GEMINI_FALLBACK_MODEL, GEMINI_MODEL } from './Gemini';

/**
 * Shapes the rejection the way the Gen AI SDK reports it.
 *
 * @param status HTTP status the API answered with.
 * @param message Body the SDK puts on the error message.
 * @returns An error carrying the status the library reads.
 */
const apiError = (status: number, message: string) => Object.assign(new Error(message), { status });

const QUOTA_MESSAGE =
  '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for metric: generate_content_free_tier_requests, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier"}}';

describe(callGemini, () => {
  it('answers from the primary model when it is available', async () => {
    const seen: string[] = [];

    const { result, model } = await callGemini(async (id) => {
      seen.push(id);

      return await Promise.resolve('ok');
    });

    expect(result).toBe('ok');
    expect(model).toBe(GEMINI_MODEL);
    expect(seen).toStrictEqual([GEMINI_MODEL]);
  });

  it('falls back to the second model when the primary has no quota left', async () => {
    const seen: string[] = [];

    const { result, model } = await callGemini(async (id) => {
      seen.push(id);

      if (id === GEMINI_MODEL) {
        throw apiError(429, QUOTA_MESSAGE);
      }

      return await Promise.resolve('from fallback');
    });

    expect(result).toBe('from fallback');
    expect(model).toBe(GEMINI_FALLBACK_MODEL);
    // A spent quota is not retried: waiting cannot refill it.
    expect(seen).toStrictEqual([GEMINI_MODEL, GEMINI_FALLBACK_MODEL]);
  });

  it('gives up when both models are out of quota', async () => {
    await expect(
      callGemini(() => {
        throw apiError(429, QUOTA_MESSAGE);
      }),
    ).rejects.toThrow(QUOTA_MESSAGE);
  });

  it('propagates an error that another model would not fix', async () => {
    const seen: string[] = [];

    await expect(
      callGemini((id) => {
        seen.push(id);

        throw apiError(400, 'Invalid request');
      }),
    ).rejects.toThrow('Invalid request');

    expect(seen).toStrictEqual([GEMINI_MODEL]);
  });
});
