import { getWhatsAppOptIns, getWhatsAppPendingContacts } from '@/actions/whatsapp/identity';
import { getWhatsAppClearanceCopyFailures, getWhatsAppDisclosureLogs, getWhatsAppSessions } from '@/actions/whatsapp/admin-console';
import type { Disclosure, OptIn, Pending, Session } from '@/app/(dashboard)/settings/whatsapp/operations-console';
import { ClearanceCopyFailures, type ClearanceCopyFailure } from '@/app/(dashboard)/system/whatsapp-monitoring/clearance-copy-failures';
import { MonitorRefresh } from '@/app/(dashboard)/system/whatsapp-monitoring/monitor-refresh';
import { OutboundSendsList } from '@/app/(dashboard)/system/whatsapp-monitoring/outbound-sends-list';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';
import { JumpSection } from '@/components/settings/settings-sections-provider';
import { WhatsAppActivityLogs } from '@/app/(dashboard)/system/whatsapp-monitoring/activity-logs';

// Live system state, so it lives under /system, not /settings (ADR-0004, #1228).
export default async function WhatsAppMonitoringPage() {
  const [optInResult, pendingResult, sessionsResult, disclosuresResult, clearanceCopyFailuresResult] = await Promise.all([
    getWhatsAppOptIns(),
    getWhatsAppPendingContacts(),
    getWhatsAppSessions(),
    getWhatsAppDisclosureLogs(),
    getWhatsAppClearanceCopyFailures(),
  ]);

  return (
    <SettingsMergedPage
      title="WhatsApp activity"
      description="Watch WhatsApp sends, opt-ins, contacts, sessions and disclosures. Set an auto-refresh interval, or refresh now."
      actions={<MonitorRefresh />}
    >
      <JumpSection id="sent-messages" title="Sent messages"><OutboundSendsList /></JumpSection>
      <WhatsAppActivityLogs
        optIns={(optInResult.data || []) as OptIn[]}
        pending={(pendingResult.data || []) as Pending[]}
        sessions={(sessionsResult.data || []) as Session[]}
        disclosures={(disclosuresResult.data || []) as Disclosure[]}
      />
      <JumpSection id="clearance-copies" title="Clearance copies">
        <ClearanceCopyFailures rows={(clearanceCopyFailuresResult.data || []) as ClearanceCopyFailure[]} />
      </JumpSection>
    </SettingsMergedPage>
  );
}
