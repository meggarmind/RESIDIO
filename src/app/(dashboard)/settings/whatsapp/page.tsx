import Link from 'next/link';
import { getWhatsAppForcePin, getWhatsAppPrivacyNotice } from '@/actions/whatsapp/identity';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { getWhatsAppEnabled, getWhatsAppPilotRoster, getWhatsAppPilotSettings } from '@/actions/whatsapp/pilot';
import { getWhatsAppDeliveryProblems, getWhatsAppHealth, getWhatsAppStatementFlags, getWhatsAppSurveySummary } from '@/actions/whatsapp/admin-console';
import { getWhatsAppConnectionStatus, getWhatsAppOverrideNumbers, type WhatsAppConnectionStatus } from '@/actions/whatsapp/connection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForcePinToggle } from '@/app/(dashboard)/settings/whatsapp/force-pin-toggle';
import { AssistantText } from '@/app/(dashboard)/settings/whatsapp/assistant-text';
import { getWhatsAppAssistantText } from '@/actions/whatsapp/assistant-settings';
import { getResidentRollForwardBalance } from '@/actions/whatsapp/balance-setting';
import { RollForwardBalanceToggle } from '@/app/(dashboard)/settings/whatsapp/roll-forward-balance-toggle';
import { OptInImport } from '@/app/(dashboard)/settings/whatsapp/opt-in-import';
import { PrivacyNoticeSettings } from '@/app/(dashboard)/settings/whatsapp/privacy-notice-settings';
import { PilotControls } from '@/app/(dashboard)/settings/whatsapp/pilot-controls';
import { ConnectionSettings } from '@/app/(dashboard)/settings/whatsapp/connection-settings';
import { WhatsAppEnabledToggle } from '@/app/(dashboard)/settings/whatsapp/whatsapp-enabled-toggle';
import { OperationsConsole, type DeliveryProblem, type Health, type StatementFlag, type SurveySummary } from '@/app/(dashboard)/settings/whatsapp/operations-console';

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
  hasWahaApiKey: false,
  hasWahaWebhookSecret: false,
  wahaBaseUrl: null,
  wahaSession: null,
  templateContentSids: null,
};

export default async function WhatsAppOperationsPage() {
  const [forcePinResult, healthResult, pilotResult, connectionResult, overrideNumbersResult, whatsappEnabledResult, pilotRosterResult, deliveryProblemsResult, assistantTextResult, statementFlagsResult, privacyNoticeResult, surveyResult, rollForwardResult] = await Promise.all([
    getWhatsAppForcePin(),
    getWhatsAppHealth(),
    getWhatsAppPilotSettings(),
    getWhatsAppConnectionStatus(),
    getWhatsAppOverrideNumbers(),
    getWhatsAppEnabled(),
    getWhatsAppPilotRoster(),
    getWhatsAppDeliveryProblems(),
    getWhatsAppAssistantText(),
    getWhatsAppStatementFlags(),
    getWhatsAppPrivacyNotice(),
    getWhatsAppSurveySummary(),
    getResidentRollForwardBalance(),
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
          <ConnectionSettings initial={connectionResult.data || DISCONNECTED_STATUS} siteUrl={siteUrl} overrideNumbers={overrideNumbersResult.data} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>WhatsApp channel</CardTitle><CardDescription>Master on/off switch. Distinct from rollout mode below, which chooses who receives messages once this is on.</CardDescription></CardHeader>
        <CardContent className="flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground">When off, no WhatsApp message can be sent regardless of rollout mode.</p><WhatsAppEnabledToggle initialValue={whatsappEnabledResult.data === true} /></CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Rollout and pilot controls</CardTitle><CardDescription>Keep WhatsApp disabled until a defined pilot is verified. Promotion is audited.</CardDescription></CardHeader><CardContent><PilotControls initial={pilotResult.data || { mode: 'disabled', residentIds: [], streetId: '', outboundDailyCap: 100, outboundBurstCap: 20, outboundBurstWindowMinutes: 10, financialLookupDailyCap: 500, sessionRetentionDays: 1, processedMessageRetentionDays: 2, surveyResponseRetentionDays: 90, outboundSendRetentionDays: 90 }} roster={pilotRosterResult.data} rosterError={pilotRosterResult.error} /></CardContent></Card>
      <p className="text-sm text-muted-foreground">
        Sent messages, the opt-in registry, pending contacts, active sessions, the disclosure log and clearance copies not sent are on{' '}
        <Link href="/system/whatsapp-monitoring" className="underline">System &gt; WhatsApp Monitoring</Link>.
      </p>
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
        <Card>
          <CardHeader><CardTitle>Resident balance</CardTitle><CardDescription>Show residents the roll-forward balance: What I owe, statement PDFs and the portal, signed as owed or in credit.</CardDescription></CardHeader>
          <CardContent className="flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground">Leave off until legacy charges are invoiced, or residents with uninvoiced legacy payments see false credit. Admin statements always use it.</p><RollForwardBalanceToggle initialValue={rollForwardResult.data === true} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Assistant replies</CardTitle><CardDescription>Text the resident bot sends. Estate phone, email and office hours come from Settings &gt; Estate info.</CardDescription></CardHeader>
          <CardContent><AssistantText initial={assistantTextResult.data || { paymentInstructions: '', keywordSynonyms: '' }} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Privacy notice</CardTitle><CardDescription>Residents confirm their identity and accept this notice before the assistant uses their records. Each decision is logged with the version.</CardDescription></CardHeader>
          <CardContent><PrivacyNoticeSettings initial={privacyNoticeResult.data || { version: '', text: '' }} /></CardContent>
        </Card>
        <OperationsConsole
          deliveryProblems={(deliveryProblemsResult.data || []) as DeliveryProblem[]}
          statementFlags={(statementFlagsResult.data || []) as StatementFlag[]}
          survey={(surveyResult.data || undefined) as SurveySummary | undefined}
          health={(healthResult.data || { inboundToday: 0, outboundToday: 0, deliveryFailuresToday: 0, templateErrorsToday: 0, capLimitEventsToday: 0 }) as Health}
        />
      </details>
    </div>
  );
}
