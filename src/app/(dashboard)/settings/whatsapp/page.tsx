import { getWhatsAppForcePin, getWhatsAppOptIns, getWhatsAppPendingContacts } from '@/actions/whatsapp/identity';
import { getWhatsAppPilotSettings } from '@/actions/whatsapp/pilot';
import { getWhatsAppDisclosureLogs, getWhatsAppHealth, getWhatsAppSessions } from '@/actions/whatsapp/admin-console';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForcePinToggle } from '@/app/(dashboard)/settings/whatsapp/force-pin-toggle';
import { OptInImport } from '@/app/(dashboard)/settings/whatsapp/opt-in-import';
import { PilotControls } from '@/app/(dashboard)/settings/whatsapp/pilot-controls';
import { OperationsConsole, type Disclosure, type Health, type OptIn, type Pending, type Session } from '@/app/(dashboard)/settings/whatsapp/operations-console';

export default async function WhatsAppOperationsPage() {
  const [optInResult, pendingResult, forcePinResult, sessionsResult, disclosuresResult, healthResult, pilotResult] = await Promise.all([
    getWhatsAppOptIns(),
    getWhatsAppPendingContacts(),
    getWhatsAppForcePin(),
    getWhatsAppSessions(),
    getWhatsAppDisclosureLogs(),
    getWhatsAppHealth(),
    getWhatsAppPilotSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp Operations</h1>
        <p className="text-sm text-muted-foreground">Admin-only consent, identity, session, disclosure, and bot health controls.</p>
      </div>
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
      <Card><CardHeader><CardTitle>Rollout and pilot controls</CardTitle><CardDescription>Keep WhatsApp disabled until a defined pilot is verified. Promotion is audited.</CardDescription></CardHeader><CardContent><PilotControls initial={pilotResult.data || { mode: 'disabled', residentIds: [], streetId: '', outboundDailyCap: 100, outboundBurstCap: 20, outboundBurstWindowMinutes: 10, financialLookupDailyCap: 50 }} /></CardContent></Card>
      <OperationsConsole
        optIns={(optInResult.data || []) as OptIn[]}
        pending={(pendingResult.data || []) as Pending[]}
        sessions={(sessionsResult.data || []) as Session[]}
        disclosures={(disclosuresResult.data || []) as Disclosure[]}
        health={(healthResult.data || { inboundToday: 0, outboundToday: 0, deliveryFailuresToday: 0, templateErrorsToday: 0, capLimitEventsToday: 0 }) as Health}
      />
    </div>
  );
}
