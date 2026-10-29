'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { promoteWhatsAppPilotToEstate, updateWhatsAppPilotSettings, type PilotRoster } from '@/actions/whatsapp/pilot';
import { PilotResidentsTable } from '@/app/(dashboard)/settings/whatsapp/pilot-residents-table';
import type { WhatsAppRolloutMode } from '@/lib/whatsapp/rollout';

export function PilotControls({ initial, roster, rosterError, groupAvailable = false }: { initial: {
  mode: WhatsAppRolloutMode;
  residentIds: string[];
  streetId: string;
  outboundDailyCap: number;
  outboundBurstCap: number;
  outboundBurstWindowMinutes: number;
  financialLookupDailyCap: number;
  sessionRetentionDays: number;
  processedMessageRetentionDays: number;
  surveyResponseRetentionDays: number;
  outboundSendRetentionDays: number;
}; roster: PilotRoster; rosterError?: string | null; groupAvailable?: boolean }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.WHATSAPP_MANAGE);
  const [mode, setMode] = useState(initial.mode);
  const [residentIds, setResidentIds] = useState(initial.residentIds);
  const [streetId, setStreetId] = useState(initial.streetId);
  const [outboundCap, setOutboundCap] = useState(String(initial.outboundDailyCap));
  const [lookupCap, setLookupCap] = useState(String(initial.financialLookupDailyCap));
  const [burstCap, setBurstCap] = useState(String(initial.outboundBurstCap));
  const [burstWindow, setBurstWindow] = useState(String(initial.outboundBurstWindowMinutes));
  const [sessionRetentionDays, setSessionRetentionDays] = useState(String(initial.sessionRetentionDays));
  const [processedMessageRetentionDays, setProcessedMessageRetentionDays] = useState(
    String(initial.processedMessageRetentionDays)
  );
  const [surveyRetentionDays, setSurveyRetentionDays] = useState(String(initial.surveyResponseRetentionDays));
  const [outboundSendRetentionDays, setOutboundSendRetentionDays] = useState(String(initial.outboundSendRetentionDays));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savedPilot, setSavedPilot] = useState({ residentIds: initial.residentIds, streetId: initial.streetId });
  const pilotChanged = streetId !== savedPilot.streetId || residentIds.join() !== savedPilot.residentIds.join();

  function save() {
    startTransition(async () => {
      const result = await updateWhatsAppPilotSettings({
        mode,
        residentIds,
        streetId: streetId.trim(),
        outboundDailyCap: Number(outboundCap),
        outboundBurstCap: Number(burstCap),
        outboundBurstWindowMinutes: Number(burstWindow),
        financialLookupDailyCap: Number(lookupCap),
        sessionRetentionDays: Number(sessionRetentionDays),
        processedMessageRetentionDays: Number(processedMessageRetentionDays),
        surveyResponseRetentionDays: Number(surveyRetentionDays),
        outboundSendRetentionDays: Number(outboundSendRetentionDays),
      });
      if (!result.error) setSavedPilot({ residentIds, streetId: streetId.trim() });
      setMessage(result.error || 'Pilot controls saved');
    });
  }

  function promote() {
    startTransition(async () => setMessage((await promoteWhatsAppPilotToEstate()).error || 'Pilot promoted estate-wide'));
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Rollout mode</span><select value={mode} onChange={(event) => setMode(event.target.value as WhatsAppRolloutMode)} className="h-9 w-full rounded-md border bg-background px-3"><option value="disabled">Disabled</option><option value="pilot">Pilot</option><option value="estate">Estate-wide</option>{groupAvailable || mode === 'group' ? <option value="group">Estate group members</option> : null}</select>{mode === 'group' ? <span className="block text-xs text-muted-foreground">Only members of the estate group and pilot-list residents can use the bot, and WhatsApp messages to residents go only to them.</span> : null}</label>
        <div className="sm:col-span-2"><PilotResidentsTable roster={roster.residents} streets={roster.streets} error={rosterError} residentIds={residentIds} onResidentIdsChange={setResidentIds} streetId={streetId} onStreetIdChange={setStreetId} disabled={!canManage} /></div>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Daily outbound cap</span><Input type="number" min="0" value={outboundCap} onChange={(event) => setOutboundCap(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Burst cap</span><Input type="number" min="0" value={burstCap} onChange={(event) => setBurstCap(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Burst window (minutes)</span><Input type="number" min="1" value={burstWindow} onChange={(event) => setBurstWindow(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Daily financial lookup cap</span><Input type="number" min="0" value={lookupCap} onChange={(event) => setLookupCap(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Session retention (days)</span><Input type="number" min="1" max="30" value={sessionRetentionDays} onChange={(event) => setSessionRetentionDays(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Processed message retention (days)</span><Input type="number" min="1" max="30" value={processedMessageRetentionDays} onChange={(event) => setProcessedMessageRetentionDays(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Survey answer retention (days)</span><Input type="number" min="1" max="365" value={surveyRetentionDays} onChange={(event) => setSurveyRetentionDays(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Outbound send record retention (days)</span><Input type="number" min="1" max="365" value={outboundSendRetentionDays} onChange={(event) => setOutboundSendRetentionDays(event.target.value)} /></label>
      </div>
      <div className="flex items-center gap-3"><Button type="button" size="sm" disabled={isPending || !canManage} onClick={save}>Save rollout controls</Button>{mode === 'pilot' ? <Button type="button" size="sm" variant="outline" disabled={isPending || !canManage} onClick={promote}>Promote estate-wide</Button> : null}{pilotChanged ? <span className="text-xs text-amber-600">Pilot list changed. Save to apply.</span> : null}{message ? <span className="text-xs text-muted-foreground">{message}</span> : null}</div>
    </div>
  );
}
