import { createAdminClient } from '@/lib/supabase/server';

/**
 * The System Action Log recorder (#538): records what an automated, sessionless process
 * (a cron run or a webhook) did. Distinct from the audit recorder, which attributes a change
 * to a signed-in user.
 *
 * Summaries MUST contain counts and ids only. Redaction below is a safety net, not a licence
 * to pass request bodies, payloads or user data. Like the audit recorder, `recordSystemAction`
 * never throws: logging must not break the job being logged.
 *
 * Deliberately NOT a 'use server' module.
 */

export type SystemActionOutcome = 'success' | 'partial' | 'failure';

export interface SystemActionEntry {
  /** Origin, e.g. `cron:process-notifications` or `webhook:paystack`. */
  source: string;
  action: string;
  outcome: SystemActionOutcome;
  /** Counts and ids only. */
  summary?: Record<string, unknown>;
  error?: unknown;
  durationMs?: number;
}

export interface SystemActionRow {
  source: string;
  action: string;
  outcome: SystemActionOutcome;
  summary: Record<string, unknown>;
  error_message: string | null;
  duration_ms: number | null;
}

export interface SystemLogSink {
  insert(row: SystemActionRow): Promise<{ error: { message: string } | null }>;
}

/**
 * The real sink: the admin client writing into `system_action_log`.
 *
 * The table is not in `database.generated.ts` until `db:types` is rerun against the cloud
 * database after the migration is applied, so the cast is confined to this one wrapper
 * (same approach as `toAccessClient` in `@/lib/auth/access`).
 */
export function createSystemLogSink(): SystemLogSink {
  return {
    async insert(row) {
      type UntypedInsert = {
        from: (table: string) => {
          insert: (value: SystemActionRow) => PromiseLike<{ error: { message: string } | null }>;
        };
      };
      const client = createAdminClient() as unknown as UntypedInsert;
      const { error } = await client.from('system_action_log').insert(row);
      return { error: error ? { message: error.message } : null };
    },
  };
}

const REDACTED_KEY = /secret|token|password|authorization|api[_-]?key|cookie|signature|body|payload|raw/i;
const MAX_STRING = 200;
const MAX_ARRAY = 50;
const MAX_DEPTH = 5;
const MAX_ERROR_MESSAGE = 500;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function redact(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return truncate(value, MAX_STRING);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = REDACTED_KEY.test(key) ? '[redacted]' : redact(child, depth + 1);
  }
  return out;
}

/**
 * Make a summary safe to store: secret-looking keys are replaced with `'[redacted]'` at any
 * depth, strings are cut to 200 characters, arrays to 50 items, and nesting beyond 5 levels
 * becomes `'[truncated]'`.
 */
export function redactSummary(value: Record<string, unknown>): Record<string, unknown> {
  return redact(value, 0) as Record<string, unknown>;
}

/** The error's message only (never a stack, never the object), truncated to 500 characters. */
export function redactError(error: unknown): string | null {
  if (error === undefined || error === null) return null;
  let message: string;
  if (error instanceof Error) message = error.message;
  else if (typeof error === 'string') message = error;
  else if (typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    message = (error as { message: string }).message;
  } else message = 'Unknown error';
  return truncate(message, MAX_ERROR_MESSAGE);
}

/** Record what a cron run or webhook did. Never throws. */
export async function recordSystemAction(
  entry: SystemActionEntry,
  sink?: SystemLogSink
): Promise<{ recorded: boolean }> {
  try {
    const row: SystemActionRow = {
      source: entry.source,
      action: entry.action,
      outcome: entry.outcome,
      summary: redactSummary(entry.summary ?? {}),
      error_message: redactError(entry.error),
      duration_ms: entry.durationMs ?? null,
    };
    const { error } = await (sink ?? createSystemLogSink()).insert(row);

    if (error) {
      console.error('[SystemLog] Failed to record system action:', {
        source: entry.source,
        action: entry.action,
        error: error.message,
      });
      return { recorded: false };
    }
    return { recorded: true };
  } catch (error) {
    console.error('[SystemLog] Unexpected error:', {
      source: entry.source,
      action: entry.action,
      error: error instanceof Error ? error.message : String(error),
    });
    return { recorded: false };
  }
}
