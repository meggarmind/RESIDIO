import { getWhatsAppDeliveryProblems, getWhatsAppHealth, getWhatsAppStatementFlags, getWhatsAppSurveySummary } from '@/actions/whatsapp/admin-console';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';
import { BotHealthSections, type DeliveryProblem, type Health, type StatementFlag, type SurveySummary } from '@/app/(dashboard)/system/whatsapp-bot-health/bot-health-sections';

// Read-only, so it lives in Oversight, not on Settings > WhatsApp (#1273). Guarded by whatsapp.view in ROUTE_PERMISSIONS.
export default async function WhatsAppBotHealthPage() {
  const [healthResult, surveyResult, deliveryProblemsResult, statementFlagsResult] = await Promise.all([
    getWhatsAppHealth(),
    getWhatsAppSurveySummary(),
    getWhatsAppDeliveryProblems(),
    getWhatsAppStatementFlags(),
  ]);

  return (
    <SettingsMergedPage
      title="WhatsApp bot health"
      description="Today's bot counts, resident feedback, undelivered messages and statements waiting for an email."
    >
      <BotHealthSections
        deliveryProblems={(deliveryProblemsResult.data || []) as DeliveryProblem[]}
        statementFlags={(statementFlagsResult.data || []) as StatementFlag[]}
        survey={(surveyResult.data || undefined) as SurveySummary | undefined}
        health={(healthResult.data || { inboundToday: 0, outboundToday: 0, deliveryFailuresToday: 0, templateErrorsToday: 0, capLimitEventsToday: 0 }) as Health}
      />
    </SettingsMergedPage>
  );
}
