import { setTimeout as delay } from 'node:timers/promises';
import { GoogleGenAI } from '@google/genai';
import { Env } from './Env';

/** Used whenever `GEMINI_MODEL` is unset. */
const DEFAULT_MODEL = 'gemini-3.6-flash';

/**
 * Model used by the AI features. No caller depends on the id, so swapping it
 * is a one-line change in `.env`.
 *
 * It is worth swapping while diagnosing landmark accuracy: if a stronger
 * model places the points well on an image where this one does not, the limit
 * is the model rather than the wording of the prompt, and that tells you
 * which one to go and fix. `gemini-3.1-pro-preview` is the only Pro text
 * model this API exposes — the `*-pro-image` entries generate images and
 * cannot do this job. Pro is slower and spends a separate, smaller daily
 * allowance, so it is a diagnostic rather than a default.
 */
export const GEMINI_MODEL = Env.GEMINI_MODEL ?? DEFAULT_MODEL;

/**
 * Used when the primary is saturated or its allowance is spent. It is faster
 * but measurably less precise — 1.46 % mean landmark error against 0.80 % — and
 * it carries its own daily quota, so it doubles the budget as a side effect.
 */
export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

/** Statuses that mean "the model is busy" rather than "the request is wrong". */
const OVERLOAD_STATUSES = new Set([429, 503]);

/** Lowest status treated as a transient server-side fault worth retrying. */
const SERVER_FAULT_STATUS = 500;
const RATE_LIMIT_STATUS = 429;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 1200;

// Google answers 429 for two situations that need opposite handling: the model
// is momentarily busy, or the key has spent its allowance. Only the first is
// worth retrying, and only the second is worth telling the user to stop.
const QUOTA_MARKER = 'RESOURCE_EXHAUSTED';
const DAILY_QUOTA_MARKER = 'PerDay';
const RETRY_DELAY_PATTERN = /retry in ([\d.]+)s/iu;

let client: GoogleGenAI | null = null;

/**
 * Reports whether the server holds an API key, so callers can degrade
 * gracefully instead of throwing.
 * @returns `true` when `GEMINI_API_KEY` is set.
 */
export const isGeminiConfigured = (): boolean => Boolean(Env.GEMINI_API_KEY);

/**
 * Returns a lazily created, reused Gen AI client.
 * @returns The shared client instance.
 * @throws {Error} When `GEMINI_API_KEY` is missing. Guard with `isGeminiConfigured`.
 */
export const getGeminiClient = (): GoogleGenAI => {
  const apiKey = Env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  client ??= new GoogleGenAI({ apiKey });

  return client;
};

const readStatus = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const status = new Map<string, unknown>(Object.entries(error)).get('status');

  return typeof status === 'number' ? status : null;
};

/**
 * Tells a temporary capacity problem apart from a real failure, so the caller
 * can invite the user to retry instead of reporting a broken feature.
 * @param error The rejection thrown by the SDK.
 * @returns `true` when Google reported the model as busy or rate limited.
 */
export const isOverloadError = (error: unknown): boolean => {
  const status = readStatus(error);

  return status !== null && OVERLOAD_STATUSES.has(status);
};

const readMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Tells an exhausted allowance apart from a busy model. Both arrive as 429, but
 * only this one keeps failing however long the user waits, so the UI has to say
 * something different.
 * @param error The rejection thrown by the SDK.
 * @returns `true` when the key has spent its quota for the period.
 */
export const isQuotaError = (error: unknown): boolean => {
  if (readStatus(error) !== RATE_LIMIT_STATUS) {
    return false;
  }

  return readMessage(error).includes(QUOTA_MARKER);
};

/**
 * Reports whether the exhausted allowance is the per-day one, which no amount
 * of waiting within the session will clear.
 * @param error The rejection thrown by the SDK.
 * @returns `true` when the daily quota is the one that ran out.
 */
export const isDailyQuotaError = (error: unknown): boolean =>
  isQuotaError(error) && readMessage(error).includes(DAILY_QUOTA_MARKER);

/**
 * Extracts how long Google asked us to wait.
 * @param error The rejection thrown by the SDK.
 * @returns Whole seconds, or `null` when the API did not say.
 */
export const retryAfterSeconds = (error: unknown): number | null => {
  const found = RETRY_DELAY_PATTERN.exec(readMessage(error));
  const seconds = found?.[1] === undefined ? Number.NaN : Number(found[1]);

  return Number.isFinite(seconds) ? Math.ceil(seconds) : null;
};

// Every 5xx plus a busy model: transient on Google's side, so worth another
// attempt. A spent quota is not — retrying it three times only makes the button
// hang for ten seconds before reporting the same thing.
const isRetryableError = (error: unknown): boolean => {
  const status = readStatus(error);

  if (isQuotaError(error)) {
    return false;
  }

  return status !== null && (status === RATE_LIMIT_STATUS || status >= SERVER_FAULT_STATUS);
};

/**
 * Summarises a rejection for the log. The SDK attaches a multi-kilobyte stack
 * that buries the one line that matters: what the API actually said.
 * @param error The rejection thrown by the SDK.
 * @returns A single readable line.
 */
export const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name} (${readStatus(error) ?? 'no status'}): ${error.message}`;
  }

  return String(error);
};

/**
 * Runs a Gen AI call, retrying the transient capacity errors Google returns
 * under load. Anything else propagates on the first attempt. Recursive rather
 * than a loop, because retries are inherently sequential.
 * @param run Thunk performing the actual SDK call.
 * @param count Attempt number, starting at one. Callers leave it alone.
 * @returns Whatever the thunk resolves to.
 * @throws {Error} The last error when every attempt fails.
 */
const attempt = async <T>(run: () => Promise<T>, count = 1): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (!isRetryableError(error) || count >= MAX_ATTEMPTS) {
      throw error;
    }

    await delay(BACKOFF_MS * count);

    return await attempt(run, count + 1);
  }
};

/**
 * Runs a Gen AI call on the primary model and falls back to the secondary when
 * Google reports the primary as unavailable. A saturated model is the common
 * way this feature fails, and it is not something the user can wait out, so the
 * answer is a second model rather than a longer spinner.
 *
 * @param run Thunk performing the SDK call for a given model id.
 * @returns The result and the model that produced it.
 * @throws {Error} The last error when both models fail.
 */
export const callGemini = async <T>(
  run: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> => {
  try {
    return { result: await attempt(async () => await run(GEMINI_MODEL)), model: GEMINI_MODEL };
  } catch (error) {
    if (!isOverloadError(error)) {
      throw error;
    }

    return {
      result: await attempt(async () => await run(GEMINI_FALLBACK_MODEL)),
      model: GEMINI_FALLBACK_MODEL,
    };
  }
};
