'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { promoteWhatsAppPilotToEstate, updateWhatsAppPilotSettings } from '@/actions/whatsapp/pilot';
import type { WhatsAppRolloutMode } from '@/lib/whatsapp/rollout';

export function PilotControls({ initial }: { initial: {
  mode: WhatsAppRolloutMode;
  residentIds: string[];
  streetId: string;
  outboundDailyCap: number;
  outboundBurstCap: number;
  outboundBurstWindowMinutes: number;
  financialLookupDailyCap: number;
  sessionRetentionDays: number;
  processedMessageRetentionDays: number;
} }) {
  const [mode, setMode] = useState(initial.mode);
  const [residentIds, setResidentIds] = useState(initial.residentIds.join(','));
  const [streetId, setStreetId] = useState(initial.streetId);
  const [outboundCap, setOutboundCap] = useState(String(initial.outboundDailyCap));
  const [lookupCap, setLookupCap] = useState(String(initial.financialLookupDailyCap));
  const [burstCap, setBurstCap] = useState(String(initial.outboundBurstCap));
  const [burstWindow, setBurstWindow] = useState(String(initial.outboundBurstWindowMinutes));
  const [sessionRetentionDays, setSessionRetentionDays] = useState(String(initial.sessionRetentionDays));
  const [processedMessageRetentionDays, setProcessedMessageRetentionDays] = useState(
    String(initial.processedMessageRetentionDays)
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateWhatsAppPilotSettings({
        mode,
        residentIds: residentIds.split(',').map((value) => value.trim()).filter(Boolean),
        streetId: streetId.trim(),
        outboundDailyCap: Number(outboundCap),
        outboundBurstCap: Number(burstCap),
        outboundBurstWindowMinutes: Number(burstWindow),
        financialLookupDailyCap: Number(lookupCap),
        sessionRetentionDays: Number(sessionRetentionDays),
        processedMessageRetentionDays: Number(processedMessageRetentionDays),
      });
      setMessage(result.error || 'Pilot controls saved');
    });
  }

  function promote() {
    startTransition(async () => setMessage((await promoteWhatsAppPilotToEstate()).error || 'Pilot promoted estate-wide'));
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Rollout mode</span><select value={mode} onChange={(event) => setMode(event.target.value as WhatsAppRolloutMode)} className="h-9 w-full rounded-md border bg-background px-3"><option value="disabled">Disabled</option><option value="pilot">Pilot</option><option value="estate">Estate-wide</option></select></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Pilot street ID</span><Input value={streetId} onChange={(event) => setStreetId(event.target.value)} placeholder="Optional" /></label>
        <label className="space-y-1 text-sm sm:col-span-2"><span className="text-muted-foreground">Pilot resident IDs</span><Input value={residentIds} onChange={(event) => setResidentIds(event.target.value)} placeholder="Comma-separated UUIDs" /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Daily outbound cap</span><Input type="number" min="0" value={outboundCap} onChange={(event) => setOutboundCap(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Burst cap</span><Input type="number" min="0" value={burstCap} onChange={(event) => setBurstCap(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Burst window (minutes)</span><Input type="number" min="1" value={burstWindow} onChange={(event) => setBurstWindow(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Daily financial lookup cap</span><Input type="number" min="0" value={lookupCap} onChange={(event) => setLookupCap(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Session retention (days)</span><Input type="number" min="1" max="30" value={sessionRetentionDays} onChange={(event) => setSessionRetentionDays(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Processed message retention (days)</span><Input type="number" min="1" max="30" value={processedMessageRetentionDays} onChange={(event) => setProcessedMessageRetentionDays(event.target.value)} /></label>
      </div>
      <div className="flex items-center gap-3"><Button type="button" size="sm" disabled={isPending} onClick={save}>Save rollout controls</Button>{mode === 'pilot' ? <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={promote}>Promote estate-wide</Button> : null}{message ? <span className="text-xs text-muted-foreground">{message}</span> : null}</div>
    </div>
  );
}
