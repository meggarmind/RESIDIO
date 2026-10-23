/**
 * WhatsApp Send Policy: the ordered checks an outbound WhatsApp message must
 * pass before it reaches a Provider (kill switch, rollout audience, caps,
 * WhatsApp Opt-in, template approval).
 *
 * `evaluateSendPolicy` is pure decision logic over a `SendPolicyFacts` seam;
 * `createSendPolicyFacts` is the real adapter. Every fact is read lazily, only
 * when its check is reached, so an earlier refusal never runs later reads.
 */

import { getSettingResultAsService, getSettingValueAsService } from '@/lib/settings/service';
import type { SettingReadResult } from '@/lib/settings/service';
import { createAdminClient } from '@/lib/supabase/server';
import { isApprovedWhatsAppTemplateName } from '@/lib/whatsapp';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { lagosMidnight, lagosParts } from '@/lib/whatsapp/assistant-format';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';

export interface SendPolicyInput {
  recipientId: string;
  recipientPhone: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
  /** A free-form message (certificate, receipt) has no template; only the template check is skipped. */
  freeForm?: boolean;
}

export type SendDecision =
  | {
      outcome: 'allow';
      normalizedPhone: string;
      template: { name: string; languageCode: string; parameters: string[] };
    }
  | { outcome: 'refuse'; reason: string; message: string }
  | { outcome: 'defer'; reason: string; message: string };

export interface SendPolicyFacts {
  getWhatsAppEnabled(): Promise<SettingReadResult>;
  isRecipientInRollout(recipientId: string): Promise<boolean>;
  getNumberSetting(key: string): Promise<unknown>;
  countWhatsAppSentSince(sinceIso: string): Promise<{ count: number | null; failed: boolean }>;
  findOptIn(residentId: string, normalizedPhone: string): Promise<{ found: boolean; failed: boolean }>;
  normalizePhone(phone: string): string;
  isApprovedTemplateName(name: unknown): boolean;
  now(): Date;
}

function refuse(reason: string, message: string): SendDecision {
  return { outcome: 'refuse', reason, message };
}

function defer(reason: string, message: string): SendDecision {
  return { outcome: 'defer', reason, message };
}

export async function evaluateSendPolicy(
  input: SendPolicyInput,
  facts: SendPolicyFacts
): Promise<SendDecision> {
  // Kill switch. Fails CLOSED (#134): absent and error are blocked with
  // distinct messages because the operator fix for each differs.
  const enabled = await facts.getWhatsAppEnabled();
  if (enabled.status === 'absent') {
    return refuse('whatsapp_not_enabled', 'WhatsApp is not enabled in system settings');
  }
  if (enabled.status === 'error') {
    return refuse('whatsapp_enablement_unverified', 'WhatsApp enablement could not be verified');
  }
  if (enabled.value !== true) {
    return refuse('whatsapp_disabled', 'WhatsApp notifications are disabled in system settings');
  }

  if (!input.recipientPhone) {
    return refuse('no_recipient_phone', 'No recipient phone number provided');
  }

  if (!(await facts.isRecipientInRollout(input.recipientId))) {
    return refuse('outside_rollout', 'WhatsApp recipient is outside the active rollout audience');
  }

  // Daily cap.
  const configuredDailyCap = await facts.getNumberSetting('whatsapp_outbound_daily_cap');
  const dailyCap =
    typeof configuredDailyCap === 'number' && Number.isInteger(configuredDailyCap)
      ? configuredDailyCap
      : 100;
  if (dailyCap <= 0) {
    return refuse('daily_cap_zero', 'WhatsApp outbound notifications are capped at zero');
  }

  const { year, month, day } = lagosParts(facts.now());
  const startOfDay = lagosMidnight(year, month, day);
  const daily = await facts.countWhatsAppSentSince(startOfDay.toISOString());
  if (daily.failed) {
    return refuse('daily_cap_unverified', 'Unable to verify WhatsApp outbound limit');
  }
  if ((daily.count || 0) >= dailyCap) {
    return defer('daily_limit_reached', 'WhatsApp daily outbound limit reached');
  }

  // Burst cap.
  const configuredBurstCap = await facts.getNumberSetting('whatsapp_outbound_burst_cap');
  const burstCap =
    typeof configuredBurstCap === 'number' && Number.isInteger(configuredBurstCap)
      ? configuredBurstCap
      : 20;
  const configuredBurstWindow = await facts.getNumberSetting('whatsapp_outbound_burst_window_minutes');
  const burstWindow =
    typeof configuredBurstWindow === 'number' &&
    Number.isInteger(configuredBurstWindow) &&
    configuredBurstWindow > 0
      ? configuredBurstWindow
      : 10;
  if (burstCap <= 0) {
    return refuse('burst_cap_zero', 'WhatsApp outbound burst limit reached');
  }
  const burstStart = new Date(facts.now().getTime() - burstWindow * 60 * 1000).toISOString();
  const burst = await facts.countWhatsAppSentSince(burstStart);
  if (burst.failed) {
    return refuse('burst_cap_unverified', 'Unable to verify WhatsApp burst limit');
  }
  if ((burst.count || 0) >= burstCap) {
    return defer('burst_limit_reached', 'WhatsApp outbound burst limit reached');
  }

  // WhatsApp Opt-in.
  const normalizedPhone = facts.normalizePhone(input.recipientPhone);
  const optIn = await facts.findOptIn(input.recipientId, normalizedPhone);
  if (optIn.failed) {
    return refuse('consent_unverified', 'Unable to verify WhatsApp consent');
  }
  if (!optIn.found) {
    return refuse('no_opt_in', 'WhatsApp recipient has not opted in');
  }

  if (input.freeForm) {
    return { outcome: 'allow', normalizedPhone, template: { name: '', languageCode: 'en_US', parameters: [] } };
  }

  // Template approval.
  const whatsappTemplate = input.metadata?.whatsapp_template;
  if (typeof whatsappTemplate !== 'object' || whatsappTemplate === null) {
    return refuse('template_missing', 'WhatsApp proactive sends require an approved template');
  }
  const template = whatsappTemplate as Record<string, unknown>;
  const templateName = template.name;
  if (!facts.isApprovedTemplateName(templateName)) {
    return refuse('template_not_approved', 'WhatsApp template is not approved for proactive delivery');
  }

  return {
    outcome: 'allow',
    normalizedPhone,
    template: {
      name: String(templateName),
      languageCode: String(template.languageCode || 'en_US'),
      parameters: Array.isArray(template.parameters) ? (template.parameters as unknown[]).map(String) : [],
    },
  };
}

export function createSendPolicyFacts(): SendPolicyFacts {
  return {
    // Service-role reads (see #136): this runs from cron with no user session.
    getWhatsAppEnabled: () => getSettingResultAsService('whatsapp_enabled'),
    isRecipientInRollout: (recipientId) => isWhatsAppRecipientAllowed(recipientId),
    getNumberSetting: (key) => getSettingValueAsService(key),
    // Queued sends are counted from notification_history; every other accepted notification send
    // (resident sends, sendImmediate) from whatsapp_outbound_sends, so no message is counted twice.
    async countWhatsAppSentSince(sinceIso) {
      const admin = createAdminClient();
      const [queued, direct] = await Promise.all([
        admin.from('notification_history').select('id', { count: 'exact', head: true })
          .eq('channel', 'whatsapp').eq('status', 'sent').not('queue_id', 'is', null).gte('sent_at', sinceIso),
        admin.from('whatsapp_outbound_sends').select('id', { count: 'exact', head: true })
          .eq('purpose', 'notification').is('notification_queue_id', null).gte('created_at', sinceIso),
      ]);
      if (queued.error || direct.error) return { count: null, failed: true };
      return { count: (queued.count ?? 0) + (direct.count ?? 0), failed: false };
    },
    async findOptIn(residentId, normalizedPhone) {
      const { data, error } = await createAdminClient()
        .from('whatsapp_optins')
        .select('id')
        .eq('resident_id', residentId)
        .eq('phone_number', normalizedPhone)
        .eq('opted_in', true)
        .is('deactivated_at', null)
        .maybeSingle();
      return { found: Boolean(data), failed: Boolean(error) };
    },
    normalizePhone: (phone) => normalizePhoneNumber(phone),
    isApprovedTemplateName: (name) => isApprovedWhatsAppTemplateName(name),
    now: () => new Date(),
  };
}
