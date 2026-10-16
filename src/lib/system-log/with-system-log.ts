import { recordSystemAction, type SystemActionOutcome } from '@/lib/system-log/recorder';

/**
 * Handle given to the wrapped handler so it can describe the run (#538). Counts and ids only
 * in `summary`; `error` must already be a sanitised message or Error.
 */
export interface SystemLogRun {
  summary: Record<string, unknown>;
  outcome?: SystemActionOutcome;
  error?: unknown;
}

/**
 * Run a sessionless handler (a cron route) and leave exactly one System Action Log row for it.
 *
 * Behaviour-preserving: the handler's response is returned untouched, a handler exception is
 * recorded and then rethrown, and `recordSystemAction` never throws, so a logging failure cannot
 * change the outcome. Without an explicit `run.outcome`, a response with status >= 500 is a
 * failure and anything else a success. Call only after authentication has passed.
 */
export async function withSystemLog<T extends { status: number }>(
  source: string,
  action: string,
  handler: (run: SystemLogRun) => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  const run: SystemLogRun = { summary: {} };
  let response: T;
  try {
    response = await handler(run);
  } catch (error) {
    await recordSystemAction({
      source,
      action,
      outcome: 'failure',
      summary: run.summary,
      error: run.error ?? error,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
  await recordSystemAction({
    source,
    action,
    outcome: run.outcome ?? (response.status >= 500 ? 'failure' : 'success'),
    summary: run.summary,
    error: run.error,
    durationMs: Date.now() - startedAt,
  });
  return response;
}
