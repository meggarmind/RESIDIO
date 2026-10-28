import { getWhatsAppOptIns, getWhatsAppPendingContacts } from '@/actions/whatsapp/identity';
import { getWhatsAppClearanceCopyFailures, getWhatsAppDisclosureLogs, getWhatsAppSessions } from '@/actions/whatsapp/admin-console';
import type { Disclosure, OptIn, Pending, Session } from '@/app/(dashboard)/settings/whatsapp/operations-console';
import { ClearanceCopyFailures, type ClearanceCopyFailure } from '@/app/(dashboard)/system/whatsapp-monitoring/clearance-copy-failures';
import { MonitorRefresh } from '@/app/(dashboard)/system/whatsapp-monitoring/monitor-refresh';
import { OutboundSendsList } from '@/app/(dashboard)/system/whatsapp-monitoring/outbound-sends-list';
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">WhatsApp activity</h3>
          <p className="text-sm text-muted-foreground">
            Watch WhatsApp sends, opt-ins, contacts, sessions and disclosures. Set an auto-refresh interval, or refresh now.
          </p>
        </div>
        <MonitorRefresh />
      </div>

      <OutboundSendsList />
      <WhatsAppActivityLogs
        optIns={(optInResult.data || []) as OptIn[]}
        pending={(pendingResult.data || []) as Pending[]}
        sessions={(sessionsResult.data || []) as Session[]}
        disclosures={(disclosuresResult.data || []) as Disclosure[]}
      />
      <ClearanceCopyFailures rows={(clearanceCopyFailuresResult.data || []) as ClearanceCopyFailure[]} />
    </div>
  );
}
