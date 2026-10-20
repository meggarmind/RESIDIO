import { getWhatsAppForcePin, getWhatsAppOptIns, getWhatsAppPendingContacts } from '@/actions/whatsapp/identity';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { getWhatsAppEnabled, getWhatsAppPilotResidentOptions, getWhatsAppPilotSettings } from '@/actions/whatsapp/pilot';
import { getWhatsAppDisclosureLogs, getWhatsAppHealth, getWhatsAppSessions } from '@/actions/whatsapp/admin-console';
import { getWhatsAppConnectionStatus, type WhatsAppConnectionStatus } from '@/actions/whatsapp/connection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForcePinToggle } from '@/app/(dashboard)/settings/whatsapp/force-pin-toggle';
import { OptInImport } from '@/app/(dashboard)/settings/whatsapp/opt-in-import';
import { PilotControls } from '@/app/(dashboard)/settings/whatsapp/pilot-controls';
import { ConnectionSettings } from '@/app/(dashboard)/settings/whatsapp/connection-settings';
import { WhatsAppEnabledToggle } from '@/app/(dashboard)/settings/whatsapp/whatsapp-enabled-toggle';
import { OperationsConsole, type Disclosure, type Health, type OptIn, type Pending, type Session } from '@/app/(dashboard)/settings/whatsapp/operations-console';

const DISCONNECTED_STATUS: WhatsAppConnectionStatus = {
  connected: false,
  provider: null,
  phoneNumberId: null,
  fromNumber: null,
  apiVersion: null,
  updatedAt: null,
  updatedByName: null,
  hasAccessToken: false,
  hasVerifyToken: false,
  hasAppSecret: false,
  hasAuthToken: false,
  hasChatmaidApiKey: false,
  hasChatmaidWebhookSecret: false,
  templateContentSids: null,
};

export default async function WhatsAppOperationsPage() {
  const [optInResult, pendingResult, forcePinResult, sessionsResult, disclosuresResult, healthResult, pilotResult, connectionResult, whatsappEnabledResult, pilotResidentsResult] = await Promise.all([
    getWhatsAppOptIns(),
    getWhatsAppPendingContacts(),
    getWhatsAppForcePin(),
    getWhatsAppSessions(),
    getWhatsAppDisclosureLogs(),
    getWhatsAppHealth(),
    getWhatsAppPilotSettings(),
    getWhatsAppConnectionStatus(),
    getWhatsAppEnabled(),
    getWhatsAppPilotResidentOptions(),
  ]);

  // Fallback idiom matches src/actions/system/cron-status.ts.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  // The resident bot answers residents only when the channel is on and rollout is not disabled.
  const residentBotActive = whatsappEnabledResult.data === true && !!pilotResult.data && pilotResult.data.mode !== 'disabled';

  return (
    <div className="space-y-6">
      <SettingsPageHeader description="Admin-only consent, identity, session, disclosure, and bot health controls." />
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp connection</CardTitle>
          <CardDescription>Connect the Meta WhatsApp Cloud API or Twilio without a redeploy.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionSettings initial={connectionResult.data || DISCONNECTED_STATUS} siteUrl={siteUrl} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>WhatsApp channel</CardTitle><CardDescription>Master on/off switch. Distinct from rollout mode below, which chooses who receives messages once this is on.</CardDescription></CardHeader>
        <CardContent className="flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground">When off, no WhatsApp message can be sent regardless of rollout mode.</p><WhatsAppEnabledToggle initialValue={whatsappEnabledResult.data === true} /></CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Rollout and pilot controls</CardTitle><CardDescription>Keep WhatsApp disabled until a defined pilot is verified. Promotion is audited.</CardDescription></CardHeader><CardContent><PilotControls initial={pilotResult.data || { mode: 'disabled', residentIds: [], streetId: '', outboundDailyCap: 100, outboundBurstCap: 20, outboundBurstWindowMinutes: 10, financialLookupDailyCap: 50, sessionRetentionDays: 1, processedMessageRetentionDays: 2 }} residentOptions={pilotResidentsResult.data} residentOptionsError={pilotResidentsResult.error} /></CardContent></Card>
      <details open={residentBotActive} className="space-y-4 rounded-lg border p-4">
        <summary className="cursor-pointer text-lg font-semibold">
          Resident bot ({residentBotActive ? 'active' : 'inactive'})
          <span className="block text-sm font-normal text-muted-foreground">PIN policy, opt-ins, sessions and disclosures for the resident WhatsApp bot.</span>
        </summary>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Financial PIN policy</CardTitle><CardDescription>Require a PIN before any financial answer.</CardDescription></CardHeader>
            <CardContent className="flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground">Residents can still set a personal PIN when this is off.</p><ForcePinToggle initialValue={forcePinResult.data === true} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Import opt-ins</CardTitle><CardDescription>Load approved resident consent records from CSV.</CardDescription></CardHeader>
            <CardContent><OptInImport /></CardContent>
          </Card>
        </div>
        <OperationsConsole
          optIns={(optInResult.data || []) as OptIn[]}
          pending={(pendingResult.data || []) as Pending[]}
          sessions={(sessionsResult.data || []) as Session[]}
          disclosures={(disclosuresResult.data || []) as Disclosure[]}
          health={(healthResult.data || { inboundToday: 0, outboundToday: 0, deliveryFailuresToday: 0, templateErrorsToday: 0, capLimitEventsToday: 0 }) as Health}
        />
      </details>
    </div>
  );
}
