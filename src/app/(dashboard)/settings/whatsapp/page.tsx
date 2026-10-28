import Link from 'next/link';
import { getWhatsAppForcePin, getWhatsAppPrivacyNotice } from '@/actions/whatsapp/identity';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { getWhatsAppEnabled, getWhatsAppPilotRoster, getWhatsAppPilotSettings } from '@/actions/whatsapp/pilot';
import { getWhatsAppDeliveryProblems, getWhatsAppHealth, getWhatsAppStatementFlags, getWhatsAppSurveySummary } from '@/actions/whatsapp/admin-console';
import { getWhatsAppConnectionStatus, getWhatsAppOverrideNumbers, type WhatsAppConnectionStatus } from '@/actions/whatsapp/connection';
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

  const botNote = residentBotActive ? '' : 'Resident bot inactive. ';
  const connection = connectionResult.data || DISCONNECTED_STATUS;
  const pilot = pilotResult.data || { mode: 'disabled', residentIds: [], streetId: '', outboundDailyCap: 100, outboundBurstCap: 20, outboundBurstWindowMinutes: 10, financialLookupDailyCap: 500, sessionRetentionDays: 1, processedMessageRetentionDays: 2, surveyResponseRetentionDays: 90, outboundSendRetentionDays: 90 };

  return (
    <SettingsMergedPage description="Admin-only consent, identity, session, disclosure, and bot health controls.">
      <SettingsSection
        id="connection"
        title="Connection"
        summary="Connect Meta, Twilio, Chatmaid or WAHA without a redeploy."
        instant
      >
        <SettingsRow rowId="whatsapp-provider" stacked>
          <div className="w-full">
            <ConnectionSettings initial={connection} siteUrl={siteUrl} overrideNumbers={overrideNumbersResult.data} />
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        id="channel"
        title="Channel"
        summary="Master on/off switch. Distinct from rollout mode below, which chooses who receives messages once this is on."
        instant
      >
        <SettingsRow rowId="whatsapp-enabled">
          <WhatsAppEnabledToggle initialValue={whatsappEnabledResult.data === true} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        id="rollout"
        title="Rollout"
        summary="Keep WhatsApp disabled until a defined pilot is verified. Promotion is audited."
        instant
      >
        <SettingsRow rowId="whatsapp-rollout" stacked>
          <div className="w-full">
            <PilotControls initial={pilot} roster={pilotRosterResult.data} rosterError={pilotRosterResult.error} />
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection id="pin-policy" title="PIN policy" summary={`${botNote}Require a PIN before any financial answer.`} instant>
        <SettingsRow rowId="whatsapp-force-pin">
          <ForcePinToggle initialValue={forcePinResult.data === true} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection id="opt-ins" title="Opt-ins" summary={`${botNote}Load approved resident consent records from CSV.`} instant>
        <SettingsRow rowId="whatsapp-opt-in-import" stacked>
          <div className="w-full">
            <OptInImport />
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection id="balance" title="Resident balance" summary={`${botNote}Show residents the roll-forward balance.`} instant>
        <SettingsRow rowId="whatsapp-roll-forward-balance">
          <RollForwardBalanceToggle initialValue={rollForwardResult.data === true} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection id="assistant" title="Assistant replies" summary={`${botNote}Text the resident bot sends.`} instant>
        <SettingsRow rowId="whatsapp-assistant-text" stacked>
          <div className="w-full space-y-3">
            <p className="text-sm text-muted-foreground">
              Estate phone, email and office hours come from{' '}
              <Link href="/settings/estate#assistant" className="underline">Estate Profile &gt; Assistant</Link>.
            </p>
            <AssistantText initial={assistantTextResult.data || { paymentInstructions: '', keywordSynonyms: '' }} />
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection id="privacy" title="Privacy notice" summary={`${botNote}The notice residents accept before the assistant uses their records.`} instant>
        <SettingsRow rowId="whatsapp-privacy-notice" stacked>
          <div className="w-full">
            <PrivacyNoticeSettings initial={privacyNoticeResult.data || { version: '', text: '' }} />
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        id="monitoring"
        title="Monitoring (moving)"
        summary="Delivery problems, statement flags, survey and bot health. These cards are moving to their own area."
        instant
      >
        <SettingsRow rowId="whatsapp-monitoring" stacked>
          <div className="w-full space-y-3">
            <p className="text-sm text-muted-foreground">
              Sent messages, the opt-in registry, pending contacts, active sessions, the disclosure log and clearance copies not sent are on{' '}
              <Link href="/system/whatsapp-monitoring" className="underline">Oversight &gt; WhatsApp activity</Link>.
            </p>
            <OperationsConsole
              deliveryProblems={(deliveryProblemsResult.data || []) as DeliveryProblem[]}
              statementFlags={(statementFlagsResult.data || []) as StatementFlag[]}
              survey={(surveyResult.data || undefined) as SurveySummary | undefined}
              health={(healthResult.data || { inboundToday: 0, outboundToday: 0, deliveryFailuresToday: 0, templateErrorsToday: 0, capLimitEventsToday: 0 }) as Health}
            />
          </div>
        </SettingsRow>
      </SettingsSection>
    </SettingsMergedPage>
  );
}
