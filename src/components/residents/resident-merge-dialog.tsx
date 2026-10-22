'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Merge } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useMergeResidents, useResidentMergePreview, useResidentOptions } from '@/hooks/use-residents';
import { formatCurrency } from '@/lib/utils';
import type {
  ResidentContactChoices,
  ResidentMergeContact,
  ResidentMergePreview,
  ResidentMergeResult,
} from '@/actions/residents/merge-residents';

// Plain names for the preview's `table.column` keys; anything not listed falls back to the table name.
const COUNT_LABELS: Record<string, string> = {
  'resident_houses.resident_id': 'House links',
  'resident_houses.sponsor_resident_id': 'Sponsored house links',
  'profiles.resident_id': 'Portal login',
  'invoices.resident_id': 'Invoices',
  'payment_records.resident_id': 'Payments',
  'paystack_transactions.resident_id': 'Online (Paystack) payments',
  'wallet_transactions.wallet_id': 'Wallet transactions',
  'wallet_payment_batches.resident_id': 'Wallet payment batches',
  'late_fee_waivers.resident_id': 'Late fee waivers',
  'bank_statement_rows.matched_resident_id': 'Bank statement matches',
  'email_transactions.matched_resident_id': 'Email import matches',
  'expenses.resident_id': 'Expenses paid to the resident',
  'resident_payment_aliases.resident_id': 'Payment aliases',
  'whatsapp_optins.resident_id': 'WhatsApp opt-ins',
  'whatsapp_sessions.resident_id': 'WhatsApp links',
  'notification_preferences.resident_id': 'Notification preferences',
  'documents.resident_id': 'Documents',
  'entity_notes.entity_id': 'Notes',
  'security_contacts.resident_id': 'Security contacts',
};

function countLabel(key: string) {
  if (COUNT_LABELS[key]) return COUNT_LABELS[key];
  const table = key.split('.')[0].replace(/_/g, ' ');
  return table.charAt(0).toUpperCase() + table.slice(1);
}

type ContactField = 'email' | 'phone_primary' | 'phone_secondary';
const CONTACT_FIELDS: Array<{ field: ContactField; label: string }> = [
  { field: 'email', label: 'Email' },
  { field: 'phone_primary', label: 'Primary phone' },
  { field: 'phone_secondary', label: 'Secondary phone' },
];

type ContactOption = { value: string; label: string };

function contactOptions(field: ContactField, preview: ResidentMergePreview): ContactOption[] {
  const contact = preview.contact!;
  const show = (c: ResidentMergeContact, f: ContactField) => c[f] || 'None';
  const options: ContactOption[] = [
    { value: 'kept', label: `${show(contact.kept, field)} (record kept)` },
  ];
  if ((contact.duplicate[field] ?? null) !== (contact.kept[field] ?? null)) {
    options.push({ value: 'duplicate', label: `${show(contact.duplicate, field)} (duplicate)` });
  }
  if (field === 'phone_secondary' && contact.suggest_duplicate_phone_as_secondary) {
    options.push({ value: 'duplicate_phone_primary', label: `${contact.duplicate.phone_primary} (duplicate's primary phone)` });
  }
  return options;
}

interface ResidentMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resident: { id: string; first_name: string; last_name: string; resident_code: string };
  onMerged?: (result: ResidentMergeResult) => void;
}

export function ResidentMergeDialog({ open, onOpenChange, resident, onMerged }: ResidentMergeDialogProps) {
  const [otherId, setOtherId] = useState('');
  const [keepCurrent, setKeepCurrent] = useState(true);
  const [choices, setChoices] = useState<ResidentContactChoices>({});
  const [code, setCode] = useState('');

  const { data: optionsData } = useResidentOptions();
  const keptId = otherId ? (keepCurrent ? resident.id : otherId) : undefined;
  const duplicateId = otherId ? (keepCurrent ? otherId : resident.id) : undefined;
  const { data: preview, isLoading: previewLoading, error: previewError } = useResidentMergePreview(keptId, duplicateId);
  const mergeMutation = useMergeResidents();

  const options = (optionsData?.data ?? [])
    .filter((r) => r.id !== resident.id)
    .map((r) => ({ value: r.id, label: `${r.first_name} ${r.last_name}`, description: r.resident_code }));
  const other = optionsData?.data.find((r) => r.id === otherId);
  const keptCode = preview?.kept?.resident_code;
  const movedRows = Object.entries(preview?.counts ?? {}).filter(([, n]) => n > 0);
  const canConfirm = !!preview?.can_merge && !!keptCode && code.trim() === keptCode && !mergeMutation.isPending;

  const reset = () => {
    setOtherId('');
    setKeepCurrent(true);
    setChoices({});
    setCode('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleMerge = async () => {
    if (!keptId || !duplicateId) return;
    try {
      const result = await mergeMutation.mutateAsync({
        keptId,
        duplicateId,
        contactChoices: choices,
        confirmationCode: code.trim(),
      });
      toast.success(`Merged ${preview?.duplicate?.resident_code} into ${keptCode}`);
      if (result.whatsapp_pin_cleared && !result.kept_has_whatsapp_pin) {
        toast.info('The duplicate had a WhatsApp PIN. It was cleared, so the resident must set a new one.');
      }
      handleOpenChange(false);
      onMerged?.(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to merge residents');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge residents
          </DialogTitle>
          <DialogDescription>
            Move everything from a duplicate record into the record you keep, then archive the duplicate.
            This cannot be undone from the app.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label>Other record</Label>
            <SearchableSelect
              options={options}
              value={otherId}
              onValueChange={(value) => {
                setOtherId(value);
                setChoices({});
                setCode('');
              }}
              placeholder="Choose the other resident"
              searchPlaceholder="Search by name or code..."
              emptyMessage="No residents found."
            />
          </div>

          {otherId && (
            <div className="space-y-1.5">
              <Label>Record to keep</Label>
              <RadioGroup
                value={keepCurrent ? 'current' : 'other'}
                onValueChange={(value) => {
                  setKeepCurrent(value === 'current');
                  setChoices({});
                  setCode('');
                }}
                className="gap-2"
              >
                <label className="flex items-center gap-2">
                  <RadioGroupItem value="current" aria-label={`Keep ${resident.resident_code}`} />
                  {resident.first_name} {resident.last_name} ({resident.resident_code}), this record
                </label>
                <label className="flex items-center gap-2">
                  <RadioGroupItem value="other" aria-label={`Keep ${other?.resident_code ?? 'the other record'}`} />
                  {other ? `${other.first_name} ${other.last_name} (${other.resident_code})` : 'The other record'}
                </label>
              </RadioGroup>
            </div>
          )}

          {otherId && previewLoading && (
            <p className="flex items-center gap-2 text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking what will move…
            </p>
          )}

          {previewError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not check this merge</AlertTitle>
              <AlertDescription>{previewError.message}</AlertDescription>
            </Alert>
          )}

          {preview && preview.blockers.length > 0 && (
            <Alert variant="destructive" data-testid="merge-blockers">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>This merge cannot go ahead</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {preview.blockers.map((blocker) => (
                    <li key={blocker.code}>{blocker.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {preview?.can_merge && preview.kept && preview.duplicate && (
            <>
              {(preview.warnings?.possible_duplicate_payments.length || preview.warnings?.overlapping_invoices.length) ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Check before merging</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {preview.warnings!.possible_duplicate_payments.length > 0 && (
                        <li>
                          {preview.warnings!.possible_duplicate_payments.length} payment(s) on the duplicate have the same amount and date as a payment on the kept record. One may have been entered twice. Void the extra one first.
                        </li>
                      )}
                      {preview.warnings!.overlapping_invoices.length > 0 && (
                        <li>
                          {preview.warnings!.overlapping_invoices.length} invoice(s) cover the same house over overlapping periods on both records. The resident may have been billed twice.
                        </li>
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="rounded-md border bg-muted/40">
                <p className="px-3 pt-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What moves from {preview.duplicate.resident_code} to {preview.kept.resident_code}
                </p>
                {movedRows.length === 0 ? (
                  <p className="px-3 pb-2.5 text-muted-foreground">The duplicate has no linked records.</p>
                ) : (
                  <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0" data-testid="merge-counts">
                    {movedRows.map(([key, n]) => (
                      <div key={key} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <dt className="text-muted-foreground">{countLabel(key)}</dt>
                        <dd className="font-medium tabular-nums">{n}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {preview.wallets && (
                  <p className="border-t px-3 py-2">
                    Wallet: {formatCurrency(preview.wallets.duplicate_balance)} moves across. The kept wallet becomes{' '}
                    <span className="font-medium">{formatCurrency(preview.wallets.combined_balance)}</span>.
                  </p>
                )}
                {preview.account_balances && (
                  <p className="border-t px-3 py-2">
                    Account balance after the merge:{' '}
                    <span className="font-medium">{formatCurrency(preview.account_balances.combined_closing_balance)}</span>
                    {' '}(positive means owed, negative means credit).
                  </p>
                )}
              </div>

              {preview.contact && (
                <div className="space-y-3">
                  <p className="font-medium">Contact details to keep</p>
                  {CONTACT_FIELDS.map(({ field, label }) => {
                    const fieldOptions = contactOptions(field, preview);
                    if (fieldOptions.length < 2) return null;
                    return (
                      <fieldset key={field} className="space-y-1.5">
                        <legend className="text-muted-foreground">{label}</legend>
                        <RadioGroup
                          value={choices[field] ?? 'kept'}
                          onValueChange={(value) => setChoices((prev) => ({ ...prev, [field]: value }))}
                          className="gap-1.5"
                        >
                          {fieldOptions.map((option) => (
                            <label key={option.value} className="flex items-center gap-2 break-all">
                              <RadioGroupItem value={option.value} />
                              {option.label}
                            </label>
                          ))}
                        </RadioGroup>
                      </fieldset>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">
                    Every other detail stays as on the record kept.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="merge-confirm-code">
                  Type <span className="font-mono">{keptCode}</span>, the resident code of the record to keep, to confirm
                </Label>
                <Input
                  id="merge-confirm-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleMerge} disabled={!canConfirm}>
            {mergeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Merge residents
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
