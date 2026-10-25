'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, FileBarChart, Loader2, Play, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
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

type ResidentOption = { id: string; name: string; detail: string };

const RESIDENT_SEARCH_MIN_CHARS = 2;
const RESIDENT_SEARCH_DEBOUNCE_MS = 250;

const SCOPE_ERROR: Record<ScopeType, string> = {
  estate: '',
  house: 'Choose a house',
  street: 'Choose a street',
  resident: 'Choose a resident',
};

const monthStart = (month: string) => `${month}-01`;

export function GenerateInvoicesDialog({ open, onClose }: GenerateInvoicesDialogProps) {
  const [mode, setMode] = useState<GenerationMode>('selected_month');
  const [targetMonth, setTargetMonth] = useState(currentMonth);
  const [fromMonth, setFromMonth] = useState('');
  const [scopeType, setScopeType] = useState<ScopeType>('estate');
  const [scopeId, setScopeId] = useState('');
  const [streets, setStreets] = useState<Array<{ id: string; name: string }>>([]);
  const [houseStreetId, setHouseStreetId] = useState('');
  const [streetHouses, setStreetHouses] = useState<Array<{ id: string; house_number: string }>>([]);
  const [housesLoading, setHousesLoading] = useState(false);
  const [residentQuery, setResidentQuery] = useState('');
  const [residentSearch, setResidentSearch] = useState<{ query: string; options: ResidentOption[]; error: string | null } | null>(null);
  const [selectedResident, setSelectedResident] = useState<ResidentOption | null>(null);
  const latestHouseStreet = useRef('');
  const [attempted, setAttempted] = useState(false);
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
  const debouncedResidentQuery = useDebounce(residentQuery.trim(), RESIDENT_SEARCH_DEBOUNCE_MS);
  const residentQueryReady = residentQuery.trim().length >= RESIDENT_SEARCH_MIN_CHARS;
  const residentSettled = residentSearch?.query === residentQuery.trim();
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

  const loadStreets = (nextScopeType: ScopeType) => {
    if ((nextScopeType !== 'house' && nextScopeType !== 'street') || streets.length > 0) return;
    setScopeLoading(true);
    getStreets()
      .then((res) => {
        if (!res.error && res.data) setStreets(res.data);
      })
      .catch((err) => console.error('Failed to load streets', err))
      .finally(() => setScopeLoading(false));
  };

  const handleScopeTypeChange = (nextScopeType: ScopeType) => {
    setScopeType(nextScopeType);
    setScopeId('');
    latestHouseStreet.current = '';
    setHouseStreetId('');
    setStreetHouses([]);
    setResidentQuery('');
    setResidentSearch(null);
    setSelectedResident(null);
    setAttempted(false);
    setPreview(null);
    loadStreets(nextScopeType);
  };

  const handleHouseStreetChange = (streetId: string) => {
    latestHouseStreet.current = streetId;
    setHouseStreetId(streetId);
    setScopeId('');
    setStreetHouses([]);
    setPreview(null);
    setHousesLoading(true);
    getHouses({ street_id: streetId, limit: 500 })
      .then((res) => {
        // Ignore a response for a street the admin has already moved off.
        if (latestHouseStreet.current === streetId && !res.error && res.data) setStreetHouses(res.data);
      })
      .catch((err) => console.error('Failed to load houses', err))
      .finally(() => setHousesLoading(false));
  };

  useEffect(() => {
    if (scopeType !== 'resident' || scopeId) return;
    if (debouncedResidentQuery.length < RESIDENT_SEARCH_MIN_CHARS) return;
    let cancelled = false;
    const query = debouncedResidentQuery;
    getResidents({ search: query, limit: 20 })
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setResidentSearch({ query, options: [], error: res.error });
          return;
        }
        setResidentSearch({
          query,
          error: null,
          options: res.data.map((r) => {
            const link = r.resident_houses?.find((rh) => rh.is_primary) ?? r.resident_houses?.[0];
            const house = link?.house;
            const houseLabel = house ? `${house.house_number}${house.street?.name ? `, ${house.street.name}` : ''}` : 'No house';
            return {
              id: r.id,
              name: `${r.first_name} ${r.last_name}`,
              detail: `${r.resident_code ? `${r.resident_code} · ` : ''}${houseLabel}`,
            };
          }),
        });
      })
      .catch((err) => {
        console.error('Failed to search residents', err);
        if (!cancelled) setResidentSearch({ query, options: [], error: 'Search failed' });
      });
    return () => { cancelled = true; };
  }, [debouncedResidentQuery, scopeType, scopeId]);

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
    setAttempted(true);
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
    setAttempted(true);
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
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-w-3xl gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
        <Card className="overflow-hidden shadow-2xl">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold"><FileBarChart className="h-5 w-5" aria-hidden="true" />Generate Invoices</DialogTitle>
                <DialogDescription className="mt-1 text-xs">Prepare a reviewable financial run. Nothing is written during preview.</DialogDescription>
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
                    <Select value={mode} onValueChange={(value) => handleModeChange(value as GenerationMode)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="selected_month">Selected month</SelectItem>
                        <SelectItem value="backfill">Historical backfill</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Select value={scopeType} onValueChange={(value) => handleScopeTypeChange(value as ScopeType)}>
                      <SelectTrigger className="w-full" aria-label="Scope"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="estate">Entire estate</SelectItem>
                        <SelectItem value="house">House</SelectItem>
                        <SelectItem value="street">Street</SelectItem>
                        <SelectItem value="resident">Resident</SelectItem>
                      </SelectContent>
                    </Select>
                    {scopeType === 'house' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SearchableSelect
                          options={streets.map((st) => ({ value: st.id, label: st.name }))}
                          value={houseStreetId}
                          onValueChange={handleHouseStreetChange}
                          placeholder={scopeLoading ? 'Loading streets...' : 'Street'}
                          searchPlaceholder="Search street name..."
                          disabled={scopeLoading}
                        />
                        <SearchableSelect
                          options={streetHouses.map((h) => ({ value: h.id, label: h.house_number }))}
                          value={scopeId}
                          onValueChange={(val) => { setScopeId(val); setPreview(null); }}
                          placeholder={housesLoading ? 'Loading houses...' : 'House No.'}
                          searchPlaceholder="Search house number..."
                          emptyMessage="No houses on this street."
                          disabled={!houseStreetId || housesLoading}
                        />
                      </div>
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
                      <div className="space-y-2">
                        {selectedResident ? (
                          <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                            <span className="min-w-0 truncate">{selectedResident.name} <span className="text-xs text-muted-foreground">{selectedResident.detail}</span></span>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Change resident" onClick={() => { setSelectedResident(null); setScopeId(''); setResidentQuery(''); setPreview(null); }}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : (
                          <>
                            <Input value={residentQuery} onChange={(event) => setResidentQuery(event.target.value)} placeholder="Search resident name or code..." aria-label="Search resident" autoComplete="off" />
                            {residentQueryReady && (
                              <div className="max-h-48 overflow-y-auto rounded-md border bg-background text-sm">
                                {!residentSettled && <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching…</p>}
                                {residentSettled && residentSearch.error && <p role="alert" className="p-3 text-xs text-destructive">Could not search residents: {residentSearch.error}</p>}
                                {residentSettled && !residentSearch.error && residentSearch.options.length === 0 && <p className="p-3 text-xs text-muted-foreground">No matches</p>}
                                {residentSettled && !residentSearch.error && residentSearch.options.map((r) => (
                                  <button key={r.id} type="button" className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted" onClick={() => { setSelectedResident(r); setScopeId(r.id); setPreview(null); }}>
                                    <span>{r.name}</span>
                                    <span className="text-xs text-muted-foreground">{r.detail}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {attempted && scopeError && <p role="alert" className="text-xs text-destructive">{SCOPE_ERROR[scopeType]}</p>}
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

                <Button variant="outline" className="w-full" onClick={handlePreview} disabled={previewMutation.isPending || (mode === 'backfill' && !fromMonth)}>
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
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border bg-muted/30 p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>;
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
