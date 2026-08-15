'use server';

import { z } from 'zod';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { InvoiceGenerationRequestSchema } from '@/lib/billing/invoice-generation';
import { prepareInvoiceGenerationRunCore } from '@/lib/billing/invoice-generation-run-service';
import { canCancelInvoiceGenerationRun, canRetryInvoiceGenerationRun } from '@/lib/billing/invoice-generation-run-policy';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';

const runIdSchema = z.string().uuid();
const candidateIdsSchema = z.array(z.string().uuid()).min(1);
const readRun = async (id: string) => createAdminClient().from('invoice_generation_runs').select('*').eq('id', id).single();

export async function prepareInvoiceGenerationRun(input: z.input<typeof InvoiceGenerationRequestSchema>) {
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const request = InvoiceGenerationRequestSchema.parse(input);
  const prepared = await prepareInvoiceGenerationRunCore(request, auth.userId);
  if (!prepared.data || prepared.error) return { data: null, error: prepared.error || 'Could not create invoice generation run' };
  await logAudit({ action: 'GENERATE', entityType: 'invoice_generation_run', entityId: prepared.data.id, entityDisplay: `Invoice generation run ${prepared.data.id.slice(0, 8)}`, newValues: { request, total_amount: prepared.data.totalAmount, status: prepared.data.status, candidate_count: prepared.data.candidateCount }, description: 'Prepared invoice generation run' });
  return { data: { id: prepared.data.id, total_amount: prepared.data.totalAmount, status: prepared.data.status }, error: null };
}

export async function approveInvoiceGenerationRun(runId: string, confirmation: string) {
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const id = runIdSchema.parse(runId); const supabase = createAdminClient();
  const rpc = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: { run: unknown; approval_id: string } | null; error: { message: string } | null }> };
  const approved = await rpc.rpc('approve_invoice_generation_run', { p_run_id: id, p_approver_id: auth.userId, p_confirmation: confirmation });
  if (approved.error || !approved.data) return { data: null, error: approved.error?.message || 'Could not approve run' };
  await logAudit({ action: 'APPROVE', entityType: 'invoice_generation_run', entityId: id, entityDisplay: `Invoice generation run ${id.slice(0, 8)}`, newValues: { approval_id: approved.data.approval_id, status: 'queued' }, description: 'Approved invoice generation run' });
  return { data: approved.data.run, error: null };
}

export async function cancelInvoiceGenerationRun(runId: string) {
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const id = runIdSchema.parse(runId); const { data: run, error: runError } = await readRun(id);
  if (runError || !run) return { data: null, error: runError?.message || 'Run not found' };
  if (!canCancelInvoiceGenerationRun(run.status)) return { data: null, error: 'Only queued or processing runs can be cancelled' };
  const supabase = createAdminClient();
  const cancelled = await supabase.from('invoice_generation_candidates').update({ status: 'cancelled' }).eq('run_id', id).eq('status', 'pending');
  if (cancelled.error) return { data: null, error: cancelled.error.message };
  const updated = await supabase.from('invoice_generation_runs').update({ status: 'cancelled' }).eq('id', id).select('*').single();
  if (updated.error) return { data: null, error: updated.error.message };
  await logAudit({ action: 'UPDATE', entityType: 'invoice_generation_run', entityId: id, entityDisplay: `Invoice generation run ${id.slice(0, 8)}`, newValues: { status: 'cancelled' }, description: 'Cancelled pending invoice generation candidates' });
  return { data: updated.data, error: null };
}

export async function retryFailedInvoiceGenerationCandidates(runId: string, candidateIds?: string[]) {
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const id = runIdSchema.parse(runId); const { data: run, error: runError } = await readRun(id);
  if (runError || !run) return { data: null, error: runError?.message || 'Run not found' };
  if (!canRetryInvoiceGenerationRun(run.status, run.failed_count)) return { data: null, error: 'Only completed error runs with failed candidates can be retried' };
  const supabase = createAdminClient();
  let query = supabase.from('invoice_generation_candidates').update({ status: 'pending', error_message: null, processed_at: null }).eq('run_id', id).eq('status', 'failed');
  if (candidateIds) query = query.in('id', candidateIdsSchema.parse(candidateIds));
  const retried = await query.select('id');
  if (retried.error) return { data: null, error: retried.error.message };
  const updated = await supabase.from('invoice_generation_runs').update({ status: 'queued', completed_at: null }).eq('id', id).select('*').single();
  if (updated.error) return { data: null, error: updated.error.message };
  await logAudit({ action: 'UPDATE', entityType: 'invoice_generation_run', entityId: id, entityDisplay: `Invoice generation run ${id.slice(0, 8)}`, newValues: { retried_candidate_ids: retried.data.map((candidate) => candidate.id) }, description: 'Retried failed invoice generation candidates' });
  return { data: updated.data, error: null };
}

export async function getInvoiceGenerationRun(runId: string) {
  const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const id = runIdSchema.parse(runId); const supabase = await createServerSupabaseClient();
  const result = await supabase.from('invoice_generation_runs').select('*, invoice_generation_candidates(*), invoice_generation_approvals(*)').eq('id', id).single();
  return { data: result.data, error: result.error?.message || null };
}

export async function listInvoiceGenerationRuns() {
  const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const supabase = await createServerSupabaseClient(); const result = await supabase.from('invoice_generation_runs').select('*').order('requested_at', { ascending: false }).limit(100);
  return { data: result.data, error: result.error?.message || null };
}
