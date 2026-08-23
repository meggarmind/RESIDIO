'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, FileBarChart, Loader2, Play, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { getHouses } from '@/actions/houses/get-houses';
import { getStreets } from '@/actions/reference/get-streets';
import { getResidents } from '@/actions/residents/get-residents';
import { getLateFeeSettings } from '@/actions/billing/apply-late-fees';
import {
  useGenerateInvoicesPreview,
  useInvoiceGenerationRun,
  useApproveInvoiceGenerationRun,
  usePrepareInvoiceGenerationRun,
  useProcessInvoiceGenerationRun,
} from '@/hooks/use-billing';
import { formatCurrency } from '@/lib/utils';

type GenerationMode = 'selected_month' | 'backfill';
type ScopeType = 'estate' | 'house' | 'street' | 'resident';

interface GenerateInvoicesDialogProps {
  open: boolean;
  onClose: () => void;
}

const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthStart = (month: string) => `${month}-01`;

export function GenerateInvoicesDialog({ open, onClose }: GenerateInvoicesDialogProps) {
  const [mode, setMode] = useState<GenerationMode>('selected_month');
  const [targetMonth, setTargetMonth] = useState(currentMonth);
  const [fromMonth, setFromMonth] = useState('');
  const [scopeType, setScopeType] = useState<ScopeType>('estate');
  const [scopeId, setScopeId] = useState('');
  const [houses, setHouses] = useState<Array<{ id: string; house_number: string; street?: { name: string } | null }>>([]);
  const [streets, setStreets] = useState<Array<{ id: string; name: string }>>([]);
  const [residents, setResidents] = useState<Array<{ id: string; first_name: string; last_name: string; resident_code?: string | null }>>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [walletAllocation, setWalletAllocation] = useState(true);
  const [sendEmails, setSendEmails] = useState(true);
  const [assessLateFees, setAssessLateFees] = useState(true);
  const [lateFeeEnabled, setLateFeeEnabled] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [preview, setPreview] = useState<NonNullable<Awaited<ReturnType<typeof useGenerateInvoicesPreview>>['data']> | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const previewMutation = useGenerateInvoicesPreview();
  const prepareMutation = usePrepareInvoiceGenerationRun();
  const processMutation = useProcessInvoiceGenerationRun();
  const runQuery = useInvoiceGenerationRun(runId);
  const run = runQuery.data;

  const requiresConfirmation = mode === 'backfill';
  const confirmationText = confirmationCode;
  const confirmationMatches = !requiresConfirmation || confirmation.trim().toUpperCase() === confirmationCode.toUpperCase();
  const scopeError = scopeType !== 'estate' && !scopeId.trim();
  const previewKey = useMemo(() => JSON.stringify({ mode, targetMonth, fromMonth, scopeType, scopeId, walletAllocation, sendEmails, assessLateFees }), [mode, targetMonth, fromMonth, scopeType, scopeId, walletAllocation, sendEmails, assessLateFees]);

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  useEffect(() => {
    if (!open) return;
    getLateFeeSettings()
      .then((settings) => {
        setLateFeeEnabled(settings.enabled);
        if (!settings.enabled) {
          setAssessLateFees(false);
        }
      })
      .catch((err) => console.error('Failed to load late fee settings', err));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (scopeType === 'house' && houses.length === 0) {
      setScopeLoading(true);
      getHouses({ limit: 200 })
        .then((res) => {
          if (!res.error && res.data) setHouses(res.data);
        })
        .catch((err) => console.error('Failed to load houses', err))
        .finally(() => setScopeLoading(false));
    } else if (scopeType === 'street' && streets.length === 0) {
      setScopeLoading(true);
      getStreets()
        .then((res) => {
          if (!res.error && res.data) setStreets(res.data);
        })
        .catch((err) => console.error('Failed to load streets', err))
        .finally(() => setScopeLoading(false));
    } else if (scopeType === 'resident' && residents.length === 0) {
      setScopeLoading(true);
      getResidents({ limit: 200 })
        .then((res) => {
          if (!res.error && res.data) setResidents(res.data);
        })
        .catch((err) => console.error('Failed to load residents', err))
        .finally(() => setScopeLoading(false));
    }
  }, [open, scopeType, houses.length, streets.length, residents.length]);

  const handleModeChange = (nextMode: GenerationMode) => {
    setMode(nextMode);
    if (nextMode === 'backfill') {
      setWalletAllocation(false);
      setSendEmails(false);
      setAssessLateFees(false);
    } else {
      setWalletAllocation(true);
      setSendEmails(true);
      setAssessLateFees(true);
    }
    setPreview(null);
    setConfirmation('');
  };

  useEffect(() => {
    const currentRun = run;
    if (!runId || !currentRun || (currentRun.status !== 'queued' && currentRun.status !== 'processing') || processMutation.isPending) return;
    const timer = window.setTimeout(() => processMutation.mutate(runId), 1200);
    return () => window.clearTimeout(timer);
  }, [runId, run, processMutation]);

  if (!open) return null;

  const handlePreview = async () => {
    if (scopeError || (mode === 'backfill' && !fromMonth)) return;
    try {
      const result = await previewMutation.mutateAsync({
        targetDate: new Date(monthStart(targetMonth)),
        mode,
        fromMonth: mode === 'backfill' ? monthStart(fromMonth) : undefined,
        houseId: scopeType === 'house' ? scopeId.trim() : undefined,
        streetId: scopeType === 'street' ? scopeId.trim() : undefined,
        residentId: scopeType === 'resident' ? scopeId.trim() : undefined,
        walletAllocation,
        sendEmails,
        assessLateFees,
      });
      setPreview(result);
      setConfirmationCode(generateRandomCode());
      setConfirmation('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview failed');
    }
  };

  const handlePrepare = async () => {
    if (!preview || !confirmationMatches || scopeError) return;
    try {
      const prepared = await prepareMutation.mutateAsync({
        mode,
        targetMonth: monthStart(targetMonth),
        fromMonth: mode === 'backfill' ? monthStart(fromMonth) : undefined,
        houseId: scopeType === 'house' ? scopeId.trim() : undefined,
        streetId: scopeType === 'street' ? scopeId.trim() : undefined,
        residentId: scopeType === 'resident' ? scopeId.trim() : undefined,
        walletAllocation,
        sendEmails,
        assessLateFees,
        confirmation: requiresConfirmation ? confirmation.trim() : undefined,
        trigger: 'manual',
      });
      setRunId(prepared.id);
      if (prepared.status === 'queued') processMutation.mutate(prepared.id);
      toast.success(`Invoice run ${prepared.id.slice(0, 8)} prepared`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare invoice run');
    }
  };

  const isTerminal = Boolean(run && !['queued', 'processing', 'awaiting_approval'].includes(run.status));
  const previewItems = preview?.preview || [];
  const newItems = previewItems.filter((item) => item.isNew);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 pt-[6vh]" onClick={onClose}>
      <div className="w-full max-w-3xl p-4" onClick={(event) => event.stopPropagation()}>
        <Card className="overflow-hidden shadow-2xl">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg"><FileBarChart className="h-5 w-5" />Generate Invoices</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Prepare a reviewable financial run. Nothing is written during preview.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>

          <CardContent className="max-h-[76vh] space-y-5 overflow-y-auto p-5">
            {!runId && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-medium">
                    Billing mode
                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={mode} onChange={(event) => handleModeChange(event.target.value as GenerationMode)}>
                      <option value="selected_month">Selected month</option>
                      <option value="backfill">Historical backfill</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-sm font-medium">
                    Through month
                    <input className="h-9 w-full rounded-md border bg-background px-3 text-sm" type="month" value={targetMonth} onChange={(event) => { setTargetMonth(event.target.value); setPreview(null); }} />
                  </label>
                </div>

                {mode === 'backfill' && (
                  <label className="block max-w-sm space-y-1.5 text-sm font-medium">
                    From month
                    <input className="h-9 w-full rounded-md border bg-background px-3 text-sm" type="month" value={fromMonth} onChange={(event) => { setFromMonth(event.target.value); setPreview(null); }} />
                  </label>
                )}

                <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
                  <div>
                    <p className="text-sm font-medium">Scope</p>
                    <p className="text-xs text-muted-foreground">Scope narrows candidates; eligibility rules still apply.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                    <select className="h-9 rounded-md border bg-background px-3 text-sm" value={scopeType} onChange={(event) => { setScopeType(event.target.value as ScopeType); setScopeId(''); setPreview(null); }}>
                      <option value="estate">Entire estate</option>
                      <option value="house">House</option>
                      <option value="street">Street</option>
                      <option value="resident">Resident</option>
                    </select>
                    {scopeType === 'house' && (
                      <SearchableSelect
                        options={houses.map((h) => ({
                          value: h.id,
                          label: `${h.house_number}${h.street?.name ? `, ${h.street.name}` : ''}`,
                        }))}
                        value={scopeId}
                        onValueChange={(val) => { setScopeId(val); setPreview(null); }}
                        placeholder={scopeLoading ? 'Loading houses...' : 'Select house...'}
                        searchPlaceholder="Search house number or street..."
                        disabled={scopeLoading}
                      />
                    )}
                    {scopeType === 'street' && (
                      <SearchableSelect
                        options={streets.map((s) => ({
                          value: s.id,
                          label: s.name,
                        }))}
                        value={scopeId}
                        onValueChange={(val) => { setScopeId(val); setPreview(null); }}
                        placeholder={scopeLoading ? 'Loading streets...' : 'Select street...'}
                        searchPlaceholder="Search street name..."
                        disabled={scopeLoading}
                      />
                    )}
                    {scopeType === 'resident' && (
                      <SearchableSelect
                        options={residents.map((r) => ({
                          value: r.id,
                          label: `${r.first_name} ${r.last_name}${r.resident_code ? ` (${r.resident_code})` : ''}`,
                        }))}
                        value={scopeId}
                        onValueChange={(val) => { setScopeId(val); setPreview(null); }}
                        placeholder={scopeLoading ? 'Loading residents...' : 'Select resident...'}
                        searchPlaceholder="Search resident name or code..."
                        disabled={scopeLoading}
                      />
                    )}
                  </div>
                  {scopeError && <p className="text-xs text-destructive">Enter a scope ID or choose entire estate.</p>}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ['wallet', walletAllocation, setWalletAllocation, 'Wallet allocation'],
                    ['email', sendEmails, setSendEmails, 'Resident emails'],
                    ...(lateFeeEnabled ? [['lateFees', assessLateFees, setAssessLateFees, 'Assess late fees']] : []),
                  ].map(([key, checked, setter, label]) => (
                    <label key={String(key)} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => { (setter as (value: boolean) => void)(event.target.checked); setPreview(null); }} />
                      {String(label)}
                    </label>
                  ))}
                </div>

                {mode === 'backfill' && <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100"><AlertCircle className="h-4 w-4 shrink-0" />Backfills default all side effects off. Turn them on only after reviewing the exact preview.</div>}

                <Button variant="outline" className="w-full" onClick={handlePreview} disabled={previewMutation.isPending || scopeError || (mode === 'backfill' && !fromMonth)}>
                  {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}Preview exact request
                </Button>

                {preview && <div key={previewKey} className="space-y-4 rounded-lg border bg-background p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="New invoices" value={String(preview.summary.newInvoices)} />
                    <Metric label="Amount" value={formatCurrency(preview.summary.totalAmount)} />
                    <Metric label="Wallet impact" value={formatCurrency(preview.summary.totalWalletDeductions)} />
                    <Metric label="Candidates" value={String(preview.preview.length)} />
                  </div>
                  <div className="flex flex-wrap gap-2"><Badge variant="secondary">{preview.summary.eligibleHouses} houses</Badge><Badge variant="secondary">{preview.summary.totalResidents} residents</Badge><Badge variant="outline">{preview.summary.existingInvoices} existing</Badge></div>
                  {preview.summary.warnings.length > 0 && (
                    <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
                      {preview.summary.warnings.map((warning) => (
                        <p key={warning} className="flex gap-2">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {warning}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{newItems.length} new candidate(s) will be prepared. Existing invoices are skipped by the database business key.</p>
                  {requiresConfirmation && (
                    <label className="block space-y-1.5 text-sm font-medium">
                      Type security code <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-bold">{confirmationText}</code> to confirm
                      <input className="h-9 w-full rounded-md border bg-background px-3 text-sm font-mono uppercase" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={confirmationText} />
                    </label>
                  )}
                  <Button className="w-full" onClick={handlePrepare} disabled={prepareMutation.isPending || !confirmationMatches || preview.summary.newInvoices === 0}>
                    {prepareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Prepare durable run
                  </Button>
                </div>}
              </>
            )}

            {runId && run && <RunProgress run={run} isTerminal={isTerminal} onClose={onClose} />}
            {runId && !run && <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading durable run…</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border bg-muted/30 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>;
}

function RunProgress({ run, isTerminal, onClose }: { run: NonNullable<ReturnType<typeof useInvoiceGenerationRun>['data']>; isTerminal: boolean; onClose: () => void }) {
  const approveRun = useApproveInvoiceGenerationRun();
  const [approvalConfirmation, setApprovalConfirmation] = useState('');
  const summary = (run.result_summary || {}) as Record<string, unknown>;
  const total = run.candidate_count || 0;
  const processed = (run.created_count || 0) + (run.skipped_count || 0) + (run.failed_count || 0) + (run.cancelled_count || 0);
  const progress = total ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return <div className="space-y-5">
    <div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Durable run</p><h3 className="mt-1 text-xl font-semibold">{run.id.slice(0, 8)}</h3></div><Badge variant={run.status === 'completed' ? 'default' : run.status === 'completed_with_errors' ? 'destructive' : 'secondary'}>{run.status.replaceAll('_', ' ')}</Badge></div>
    <div className="space-y-2"><div className="flex justify-between text-xs text-muted-foreground"><span>Candidate progress</span><span>{processed}/{total || '—'} · {progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Created" value={String(run.created_count || 0)} /><Metric label="Skipped" value={String(run.skipped_count || 0)} /><Metric label="Failed" value={String(run.failed_count || 0)} /><Metric label="Email sent" value={String(summary.email_sent || 0)} /></div>
    {run.status === 'awaiting_approval' && <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100"><div className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0" />This run is waiting for an authorized approver.</div><input className="h-9 w-full rounded-md border border-amber-300 bg-background px-3 text-sm text-foreground" value={approvalConfirmation} onChange={(event) => setApprovalConfirmation(event.target.value)} placeholder="Re-enter the typed confirmation" /><Button size="sm" onClick={() => approveRun.mutate({ runId: run.id, confirmation: approvalConfirmation })} disabled={!approvalConfirmation.trim() || approveRun.isPending}>{approveRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Approve and queue</Button></div>}
    {run.failed_count > 0 && <p className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />Failed candidates remain retryable from generation history.</p>}
    {isTerminal && <Button className="w-full" onClick={onClose}><CheckCircle2 className="mr-2 h-4 w-4" />Close run details</Button>}
    {!isTerminal && <p className="text-center text-xs text-muted-foreground">This window stays open while bounded work advances. You can safely leave and return to history.</p>}
  </div>;
}
