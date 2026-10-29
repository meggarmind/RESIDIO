import { getCommsEnvironment } from '@/lib/comms-override/environment';
import { getSettingValueAsService } from '@/lib/settings/service';
import { resolveWhatsAppConfig, type WhatsAppConfigResult } from '@/lib/whatsapp/config';
import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';
import { ESTATE_GROUP_SETTING } from '@/lib/whatsapp/group-sync';
import { recordOutboundSend } from '@/lib/whatsapp/outbound-sends';
import { sendWahaGroupText } from '@/lib/whatsapp/providers/waha';
import { createSendPolicyFacts, evaluateGroupSendPolicy } from '@/lib/whatsapp/send-policy';
import type { WhatsAppSendResult } from '@/lib/whatsapp/types';

/**
 * Posting an estate-wide announcement to the estate WhatsApp group (#1328, parent #1323). NOT a
 * server action. It neither checks a permission nor writes an audit entry: the publish callers do.
 *
 * `checkEstateGroupPost` runs before the announcement is published, so a refusal leaves it a draft
 * and sends nothing. Group sends do not pass the comms override (`src/lib/comms-override/resolver.ts`),
 * so outside production only a group listed in `whatsapp_test_group_ids` is allowed (owner decision 8).
 */

export const TEST_GROUP_IDS_SETTING = 'whatsapp_test_group_ids';

export interface EstateGroupTarget {
  config: WahaWhatsAppConfig;
  groupId: string;
}

export type EstateGroupCheck = { ok: true; target: EstateGroupTarget } | { ok: false; error: string };

/** Everything the group post reads and sends through, so tests can run against a fake. */
export interface GroupPostFacts {
  resolveConfig(): Promise<WhatsAppConfigResult>;
  getEstateGroupId(): Promise<string>;
  getTestGroupIds(): Promise<string[]>;
  isProduction(): boolean;
  evaluatePolicy(): ReturnType<typeof evaluateGroupSendPolicy>;
  send(config: WahaWhatsAppConfig, groupId: string, text: string): Promise<WhatsAppSendResult>;
  record(groupId: string, providerMessageId: string): Promise<void>;
}

export const NOT_WAHA_ERROR = 'Posting to the estate group needs WAHA as the active WhatsApp provider.';
export const NO_GROUP_ERROR = 'No estate WhatsApp group is set. Choose one in Settings > WhatsApp.';
export const NOT_TEST_GROUP_ERROR =
  'Outside production, an announcement can only be posted to a test group. Untick "Post to estate group" or add the group to whatsapp_test_group_ids.';

/** A JSON list of ids, or one comma-separated string. */
function parseGroupIds(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return items.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

export function createGroupPostFacts(): GroupPostFacts {
  return {
    resolveConfig: () => resolveWhatsAppConfig(),
    async getEstateGroupId() {
      const value = await getSettingValueAsService(ESTATE_GROUP_SETTING);
      return typeof value === 'string' ? value.trim() : '';
    },
    getTestGroupIds: async () => parseGroupIds(await getSettingValueAsService(TEST_GROUP_IDS_SETTING)),
    isProduction: () => getCommsEnvironment().isProduction,
    evaluatePolicy: () => evaluateGroupSendPolicy(createSendPolicyFacts()),
    send: (config, groupId, text) => sendWahaGroupText(config, groupId, text),
    // Recorded as a notification with no queue id, so the send caps count it.
    record: (groupId, providerMessageId) =>
      recordOutboundSend({ purpose: 'notification', provider: 'waha', providerMessageId, phoneNumber: groupId }),
  };
}

/** Whether a group post can go out now. Refuses rather than guesses. */
export async function checkEstateGroupPost(facts: GroupPostFacts = createGroupPostFacts()): Promise<EstateGroupCheck> {
  const resolved = await facts.resolveConfig();
  if (resolved.status !== 'ok' || resolved.config.provider !== 'waha') {
    return { ok: false, error: NOT_WAHA_ERROR };
  }

  const groupId = await facts.getEstateGroupId();
  if (!groupId) return { ok: false, error: NO_GROUP_ERROR };

  if (!facts.isProduction() && !(await facts.getTestGroupIds()).includes(groupId)) {
    // A group id is not personal data; it says which group was refused.
    console.warn('[announcements] Estate group post refused outside production: not a test group', { groupId });
    return { ok: false, error: NOT_TEST_GROUP_ERROR };
  }

  const policy = await facts.evaluatePolicy();
  if (policy.outcome !== 'allow') return { ok: false, error: policy.message };

  return { ok: true, target: { config: resolved.config, groupId } };
}

/** Sends the text to the group and records the send. */
export async function sendEstateGroupPost(
  target: EstateGroupTarget,
  text: string,
  facts: GroupPostFacts = createGroupPostFacts()
): Promise<{ messageId: string; error: null } | { messageId: null; error: string }> {
  const sent = await facts.send(target.config, target.groupId, text);
  if (!sent.success || !sent.messageId) {
    return { messageId: null, error: sent.error || 'The estate group post failed' };
  }
  await facts.record(target.groupId, sent.messageId);
  return { messageId: sent.messageId, error: null };
}
