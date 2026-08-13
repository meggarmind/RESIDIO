'use server';

import { z } from 'zod';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { InvoiceGenerationRequestSchema, resolveBillableCandidates, resolveInvoiceGenerationEligibility, type BillingProfileVersion, type GenerationHouse, type GenerationProfile } from '@/lib/billing/invoice-generation';
import { getSystemSetting } from '@/lib/settings/get-system-setting';
import { canCancelInvoiceGenerationRun, canRetryInvoiceGenerationRun } from '@/lib/billing/invoice-generation-run-policy';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';

const runIdSchema = z.string().uuid();
const candidateIdsSchema = z.array(z.string().uuid()).min(1);
const readRun = async (id: string) => createAdminClient().from('invoice_generation_runs').select('*').eq('id', id).single();

export async function prepareInvoiceGenerationRun(input: z.input<typeof InvoiceGenerationRequestSchema>) {
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const request = InvoiceGenerationRequestSchema.parse(input);
  const supabase = createAdminClient();
  const [dualSetting, thresholdSetting] = await Promise.all([
    getSystemSetting(supabase, 'invoice_generation_dual_approval_enabled'),
    getSystemSetting(supabase, 'invoice_generation_high_value_threshold'),
  ]);
  const { data: houses, error: housesError } = await supabase.from('houses').select('id, house_number, street_id, house_type_id, billing_profile_id, property_status, is_active, resident_houses(resident_id, resident_role, move_in_date, is_active, resident:residents!resident_id(id, first_name, last_name, account_status))').eq('is_active', true);
  if (housesError) return { data: null, error: housesError.message };
  const houseTypeIds = [...new Set((houses || []).map((house) => house.house_type_id).filter((id): id is string => Boolean(id)))];
  const { data: houseTypes, error: typeError } = houseTypeIds.length ? await supabase.from('house_types').select('id, billing_profile_id').in('id', houseTypeIds) : { data: [], error: null };
  if (typeError) return { data: null, error: typeError.message };
  const profileForType = new Map((houseTypes || []).map((item) => [item.id, item.billing_profile_id]));
  const profileIds = [...new Set((houses || []).map((house) => house.billing_profile_id || profileForType.get(house.house_type_id || '')).filter((id): id is string => Boolean(id)))];
  const [{ data: profiles, error: profileError }, { data: versions, error: versionError }, billVacant, billRenovation, billConstruction, dueWindow] = await Promise.all([
    profileIds.length ? supabase.from('billing_profiles').select('id, name, target_type, applicable_roles, is_one_time').in('id', profileIds).eq('is_active', true) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? supabase.from('billing_profile_versions').select('id, billing_profile_id, effective_from, billing_profile_version_items(id, name, amount, frequency, is_mandatory)').in('billing_profile_id', profileIds) : Promise.resolve({ data: [], error: null }),
    getSystemSetting(supabase, 'bill_vacant_houses'), getSystemSetting(supabase, 'bill_under_renovation_houses'), getSystemSetting(supabase, 'bill_under_construction_houses'), getSystemSetting(supabase, 'invoice_due_window_days'),
  ]);
  if (profileError || versionError) return { data: null, error: profileError?.message || versionError?.message || 'Could not load billing profiles' };
  const resolution = resolveBillableCandidates({ request, profiles: (profiles || []).filter((profile) => !profile.is_one_time).map((profile) => ({ id: profile.id, name: profile.name, targetType: profile.target_type as GenerationProfile['targetType'], applicableRoles: profile.applicable_roles as GenerationProfile['applicableRoles'] })), versions: (versions || []).map((version) => ({ id: version.id, billingProfileId: version.billing_profile_id, effectiveFrom: version.effective_from, items: (version.billing_profile_version_items || []).map((item) => ({ id: item.id, name: item.name, amount: Number(item.amount), frequency: item.frequency, isMandatory: item.is_mandatory })) })) as BillingProfileVersion[], houses: (houses || []).map((house) => ({ id: house.id, label: house.house_number, streetId: house.street_id, billingProfileId: house.billing_profile_id || profileForType.get(house.house_type_id || '') || null, propertyStatus: house.property_status || 'occupied', isActive: house.is_active, residents: (house.resident_houses || []).map((link) => { const resident = Array.isArray(link.resident) ? link.resident[0] : link.resident; return { id: link.resident_id, name: resident ? `${resident.first_name} ${resident.last_name}` : 'Unknown', accountStatus: resident?.account_status || 'inactive', role: link.resident_role, moveInDate: link.move_in_date, isActive: link.is_active }; }) })) as GenerationHouse[], eligibility: resolveInvoiceGenerationEligibility({ billVacantHouses: billVacant, billUnderRenovation: billRenovation, billUnderConstruction: billConstruction, dueWindowDays: dueWindow }) });
  const totalAmount = resolution.candidates.reduce((total, candidate) => total + candidate.amountDue, 0);
  const status = Boolean(dualSetting) && request.mode === 'backfill' && totalAmount >= (Number(thresholdSetting) || 1_000_000) ? 'awaiting_approval' : 'queued';
  const created = await supabase.from('invoice_generation_runs').insert({ requested_by: auth.userId, scope: { mode: request.mode, targetMonth: request.targetMonth, fromMonth: request.fromMonth, houseId: request.houseId, streetId: request.streetId, residentId: request.residentId, trigger: request.trigger }, options: { walletAllocation: request.walletAllocation, sendEmails: request.sendEmails, assessLateFees: request.assessLateFees, confirmation: request.confirmation }, status, candidate_count: resolution.candidates.length, skipped_count: resolution.skips.length, total_amount: totalAmount, result_summary: { skips: resolution.skips } }).select('id, total_amount, status').single();
  if (created.error || !created.data) return { data: null, error: created.error?.message || 'Could not create invoice generation run' };
  if (resolution.candidates.length) {
    const inserted = await supabase.from('invoice_generation_candidates').insert(resolution.candidates.map((candidate) => ({ run_id: created.data.id, resident_id: candidate.residentId, house_id: candidate.houseId, billing_profile_id: candidate.billingProfileId, billing_profile_version_id: candidate.billingProfileVersionId, period_start: candidate.periodStart, period_end: candidate.periodEnd, due_date: candidate.dueDate, amount_due: candidate.amountDue, rate_snapshot: { items: candidate.invoiceItems }, invoice_items: candidate.invoiceItems, wallet_allocation_requested: request.walletAllocation })));
    if (inserted.error) {
      await supabase.from('invoice_generation_runs').delete().eq('id', created.data.id);
      return { data: null, error: inserted.error.message };
    }
  }
  const result = created;
  await logAudit({ action: 'GENERATE', entityType: 'invoice_generation_run', entityId: result.data.id, entityDisplay: `Invoice generation run ${result.data.id.slice(0, 8)}`, newValues: { request, total_amount: result.data.total_amount, status: result.data.status }, description: 'Prepared invoice generation run' });
  return { data: result.data, error: null };
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
