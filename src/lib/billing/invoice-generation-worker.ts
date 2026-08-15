import { createAdminClient } from '@/lib/supabase/server';
import { queueInvoiceGeneratedEmail } from '@/lib/notifications/invoice-generation-email';

const CHUNK_LIMIT = 50;
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

export async function processInvoiceGenerationRunChunk(runId: string, actorId: string | null) {
  const supabase = createAdminClient();
  const rpc = supabase as unknown as RpcClient;
  const { data: run } = await supabase.from('invoice_generation_runs').select('options').eq('id', runId).single();
  const sendEmails = Boolean((run?.options as { sendEmails?: unknown } | null)?.sendEmails);
  const claimed = await rpc.rpc('claim_invoice_generation_candidates', { p_run_id: runId, p_limit: CHUNK_LIMIT });
  if (claimed.error) throw new Error(claimed.error.message);
  const candidateIds = (claimed.data as Array<{ candidate_id: string }> | null || []).map(({ candidate_id }) => candidate_id);
  const outcomes = await Promise.all(candidateIds.map(async (candidateId) => {
    const result = await rpc.rpc('create_generated_invoice', { p_candidate_id: candidateId, p_actor_id: actorId });
    if (result.error) return { candidateId, status: 'failed', error: result.error.message };
    const outcome: Record<string, unknown> = { candidateId, ...(result.data as Record<string, unknown>) };
    if (sendEmails && outcome.status === 'created' && typeof outcome.invoice_id === 'string') {
      const email = await queueInvoiceGeneratedEmail(outcome.invoice_id, candidateId);
      await supabase.from('invoice_generation_candidates').update({
        email_queue_id: email.queueId ?? null,
        email_status: email.status,
        outcome: { ...outcome, email },
      }).eq('id', candidateId);
      return { ...outcome, email };
    }
    return outcome;
  }));
  const refreshed = await rpc.rpc('refresh_invoice_generation_run', { p_run_id: runId });
  if (refreshed.error) throw new Error(refreshed.error.message);
  return { processed: candidateIds.length, outcomes, run: refreshed.data };
}
