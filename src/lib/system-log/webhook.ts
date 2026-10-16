import { recordSystemAction, type SystemActionOutcome } from '@/lib/system-log/recorder';

/**
 * Webhook rows for the System Action Log (#538). Call ONLY after the delivery's signature or
 * secret has been verified: unauthenticated internet traffic must leave no row. Counts and ids
 * only, never a body, payload, phone number, email or token. Never throws (the recorder
 * does not), so it cannot change the response.
 */
export async function recordWebhookDelivery(entry: {
  provider: string;
  action: string;
  outcome: SystemActionOutcome;
  summary?: Record<string, unknown>;
  error?: unknown;
}): Promise<void> {
  await recordSystemAction({
    source: `webhook:${entry.provider}`,
    action: entry.action,
    outcome: entry.outcome,
    summary: entry.summary,
    error: entry.error,
  });
}

export interface InboundBatchResult {
  accepted: boolean;
  processedCount: number;
  duplicateCount: number;
  ignoredCount: number;
  error?: string;
}

/**
 * Record a verified batch of inbound messages: a failure always, a success only when something
 * was actually processed. Duplicate-only and ignored-only deliveries changed nothing and are
 * not recorded.
 */
export async function recordInboundBatch(
  provider: string,
  result: InboundBatchResult,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (result.accepted && result.processedCount === 0) return;
  await recordWebhookDelivery({
    provider,
    action: 'inbound_messages',
    outcome: result.accepted ? 'success' : 'failure',
    summary: {
      processed: result.processedCount,
      duplicates: result.duplicateCount,
      ignored: result.ignoredCount,
      ...extra,
    },
    error: result.error,
  });
}
