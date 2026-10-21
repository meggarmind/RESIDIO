'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, Info, Loader2, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { previewLateFees } from '@/actions/billing/apply-late-fees';
import {
  useApplyLateFees,
  useApproveLateFeeWaiver,
  useLateFeeWaivers,
  usePendingWaiverCount,
  useRejectLateFeeWaiver,
} from '@/hooks/use-billing';
import { useBillingSettings, useUpdateSetting } from '@/hooks/use-settings';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { formatCurrency } from '@/lib/utils';
import type { LateFeeWaiverWithDetails } from '@/types/database';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';
import { ControlWithEffect } from '@/components/settings/billing/row-effect';

const EXISTING_INVOICES_EFFECT =
  'existing overdue invoices too: the next run, manual or automatic, uses the values saved here for every overdue invoice that does not carry a late fee yet. Invoices that already carry one are not changed.';

const ordinal = (day: number) => `${day}${day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}`;

/** Late fees of Billing rules (from the old Late Fees page). Settings act at once; "Apply Late Fees Now" stays behind ConfirmAction. */
export function LateFeesSection() {
  const { hasPermission, hasAnyPermission } = useAuth();
  // Each control is gated on the permission its action enforces.
  const canEdit = hasAnyPermission([PERMISSIONS.SETTINGS_MANAGE_BILLING, PERMISSIONS.BILLING_MANAGE_PROFILES]);
  const canApply = hasPermission(PERMISSIONS.BILLING_APPLY_LATE_FEES);
  const canReview = hasPermission(PERMISSIONS.BILLING_APPROVE_LATE_FEE_WAIVER);
  const { data: settings, isLoading: settingsLoading } = useBillingSettings();
  const updateSettingMutation = useUpdateSetting();
  const applyLateFeesMutation = useApplyLateFees();

  const [waiverReviewNotes, setWaiverReviewNotes] = useState('');
  const [reviewingWaiverId, setReviewingWaiverId] = useState<string | null>(null);

  const { data: pendingWaiverCount } = usePendingWaiverCount();
  // Only fetch the list once the row will show.
  const { data: waivers, isLoading: waiversLoading } = useLateFeeWaivers(
    { status: 'pending' },
    { enabled: (pendingWaiverCount ?? 0) > 0 },
  );
  const approveWaiverMutation = useApproveLateFeeWaiver();
  const rejectWaiverMutation = useRejectLateFeeWaiver();

  const settingsMap =
    settings?.reduce(
      (acc, s) => {
        let value = s.value;
        if (typeof value === 'string') {
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
        }
        acc[s.key] = value;
        return acc;
      },
      {} as Record<string, unknown>,
    ) || {};

  const handleSettingToggle = (key: string, currentValue: boolean) => {
    updateSettingMutation.mutate({ key, value: !currentValue });
  };
  const busy = !canEdit || updateSettingMutation.isPending;

  const getLateFeeEnabled = (): boolean => settingsMap.late_fee_enabled === true;

  const getLateFeeType = (): 'percentage' | 'fixed' => {
    const value = settingsMap.late_fee_type;
    if (typeof value === 'string') {
      const parsed = value.replace(/"/g, '');
      return parsed === 'fixed' ? 'fixed' : 'percentage';
    }
    return 'percentage';
  };

  const getLateFeeAmount = (): number => {
    const value = settingsMap.late_fee_amount;
    if (typeof value === 'string') {
      return parseFloat(value.replace(/"/g, '')) || 5;
    }
    if (typeof value === 'number') return value;
    return 5;
  };

  const getGracePeriodDays = (): number => {
    const value = settingsMap.grace_period_days;
    if (typeof value === 'string') {
      return parseInt(value.replace(/"/g, '')) || 7;
    }
    if (typeof value === 'number') return value;
    return 7;
  };

  const getLateFeeAutoApply = (): boolean => settingsMap.late_fee_auto_apply === true;

  const getLateFeeApplicationDay = (): number => {
    const value = settingsMap.late_fee_application_day;
    if (typeof value === 'string') {
      return parseInt(value.replace(/"/g, '')) || 5;
    }
    if (typeof value === 'number') return value;
    return 5;
  };

  const commitSetting = (key: string) => (value: number) => updateSettingMutation.mutate({ key, value: String(value) });

  const waiverTypeBadge = (waiver: LateFeeWaiverWithDetails) => (
    <Badge variant={waiver.waiver_type === 'full' ? 'default' : 'secondary'}>
      {waiver.waiver_type === 'full' ? 'Full' : `Partial (${formatCurrency(waiver.waiver_amount || 0)})`}
    </Badge>
  );

  const closeReview = () => {
    setReviewingWaiverId(null);
    setWaiverReviewNotes('');
  };

  const reviewControls = (waiver: LateFeeWaiverWithDetails) =>
    reviewingWaiverId === waiver.id ? (
      <div className="flex flex-col gap-2 md:items-end">
        <Textarea
          placeholder="Review notes (optional)"
          aria-label={`Review notes for ${waiver.invoice?.invoice_number ?? 'this waiver'}`}
          value={waiverReviewNotes}
          onChange={(e) => setWaiverReviewNotes(e.target.value)}
          className="h-16 w-full text-sm md:w-48"
        />
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 text-success md:min-h-8"
            onClick={() => {
              approveWaiverMutation.mutate({ waiverId: waiver.id, notes: waiverReviewNotes });
              closeReview();
            }}
            disabled={approveWaiverMutation.isPending}
          >
            <Check className="mr-1 h-4 w-4" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 text-destructive md:min-h-8"
            onClick={() => {
              rejectWaiverMutation.mutate({ waiverId: waiver.id, notes: waiverReviewNotes });
              closeReview();
            }}
            disabled={rejectWaiverMutation.isPending}
          >
            <X className="mr-1 h-4 w-4" />
            Reject
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11 md:min-h-8" onClick={closeReview}>
            Cancel
          </Button>
        </div>
      </div>
    ) : (
      <Button size="sm" variant="outline" className="min-h-11 md:min-h-8" onClick={() => setReviewingWaiverId(waiver.id)}>
        Review
      </Button>
    );

  const pending = pendingWaiverCount ?? 0;
  const enabled = getLateFeeEnabled();
  const summary = settingsLoading
    ? 'Loading late fee settings'
    : `${
        enabled
          ? `On, ${getLateFeeType() === 'percentage' ? `${getLateFeeAmount()}%` : formatCurrency(getLateFeeAmount())} after ${getGracePeriodDays()} days${
              getLateFeeAutoApply() ? `, applied on the ${ordinal(getLateFeeApplicationDay())}` : ''
            }`
          : 'Off'
      }${pending > 0 ? `, ${pending} waiver ${pending === 1 ? 'request' : 'requests'} pending` : ''}`;

  return (
    <SettingsSection id="late-fees" title="Late fees" summary={summary} instant>
      {settingsLoading ? (
        <div className="p-4 md:p-5">
          <SettingsSkeleton rows={6} />
        </div>
      ) : (
        <>
          <SettingsRow rowId="late-fee-enabled">
            {({ controlId }) => (
              <ControlWithEffect effect={EXISTING_INVOICES_EFFECT}>
                <Switch
                  id={controlId}
                  checked={enabled}
                  onCheckedChange={() => handleSettingToggle('late_fee_enabled', enabled)}
                  disabled={busy}
                />
              </ControlWithEffect>
            )}
          </SettingsRow>

          {enabled && (
            <>
              <SettingsRow rowId="late-fee-type">
                {({ controlId }) => (
                  <ControlWithEffect effect={EXISTING_INVOICES_EFFECT}>
                    <Select
                      value={getLateFeeType()}
                      onValueChange={(value) => updateSettingMutation.mutate({ key: 'late_fee_type', value })}
                      disabled={busy}
                    >
                      <SelectTrigger id={controlId} className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage of invoice</SelectItem>
                        <SelectItem value="fixed">Fixed amount (₦)</SelectItem>
                      </SelectContent>
                    </Select>
                  </ControlWithEffect>
                )}
              </SettingsRow>

              <SettingsRow rowId="late-fee-amount">
                {({ controlId }) => (
                  <ControlWithEffect effect={EXISTING_INVOICES_EFFECT}>
                    {getLateFeeType() === 'percentage' ? (
                      <NumericSettingInput
                        id={controlId}
                        min={0.1}
                        max={100}
                        unit="%"
                        value={getLateFeeAmount()}
                        disabled={!canEdit}
                        onCommit={commitSetting('late_fee_amount')}
                      />
                    ) : (
                      <NumericSettingInput
                        id={controlId}
                        min={1}
                        max={10000000}
                        unit="₦"
                        unitPosition="prefix"
                        className="w-32 text-right"
                        value={getLateFeeAmount()}
                        disabled={!canEdit}
                        onCommit={commitSetting('late_fee_amount')}
                      />
                    )}
                  </ControlWithEffect>
                )}
              </SettingsRow>

              <SettingsRow rowId="grace-period-days">
                {({ controlId }) => (
                  <ControlWithEffect effect={EXISTING_INVOICES_EFFECT}>
                    <NumericSettingInput
                      id={controlId}
                      min={1}
                      max={30}
                      integer
                      unit="days"
                      value={getGracePeriodDays()}
                      disabled={!canEdit}
                      onCommit={commitSetting('grace_period_days')}
                    />
                  </ControlWithEffect>
                )}
              </SettingsRow>

              <SettingsRow rowId="late-fee-auto-apply">
                {({ controlId }) => (
                  <ControlWithEffect effect="when late fees are added without anyone clicking. Each run charges every eligible overdue invoice.">
                    <Switch
                      id={controlId}
                      checked={getLateFeeAutoApply()}
                      onCheckedChange={() => handleSettingToggle('late_fee_auto_apply', getLateFeeAutoApply())}
                      disabled={busy}
                    />
                  </ControlWithEffect>
                )}
              </SettingsRow>

              {getLateFeeAutoApply() && (
                <SettingsRow rowId="late-fee-application-day">
                  {({ controlId }) => (
                    <Select
                      value={String(getLateFeeApplicationDay())}
                      onValueChange={(value) => updateSettingMutation.mutate({ key: 'late_fee_application_day', value })}
                      disabled={busy}
                    >
                      <SelectTrigger id={controlId} className="w-[180px]">
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={String(day)}>
                            {ordinal(day)} of month
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </SettingsRow>
              )}

              {canApply && (
                <SettingsRow rowId="apply-late-fees-now">
                  <div className="flex w-full flex-col gap-3 md:items-end">
                    <ConfirmAction
                      trigger={
                        <Button variant="outline" disabled={applyLateFeesMutation.isPending}>
                          {applyLateFeesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Apply Late Fees Now
                        </Button>
                      }
                      title="Apply late fees now?"
                      description={
                        <>
                          <p>Late fees are added to residents&apos; invoices straight away. This cannot be undone here: a fee can only be removed through a waiver.</p>
                          <p>Running it again is safe: invoices that already carry a late fee are skipped.</p>
                        </>
                      }
                      confirmLabel="Apply late fees"
                      destructive
                      loadPreview={previewLateFees}
                      renderPreview={(preview) => (
                        <ul className="space-y-1">
                          <li><strong>{preview.eligible}</strong> invoice(s) will be charged, <strong>{formatCurrency(preview.totalLateFees)}</strong> in total.</li>
                          <li>{preview.skippedAlreadyApplied} already carry a late fee and {preview.skippedWaiver} have a pending waiver; these are skipped.</li>
                          <li>Rule: {preview.lateFeeType === 'fixed' ? formatCurrency(preview.lateFeeRate) : `${preview.lateFeeRate}%`} on invoices more than {preview.gracePeriodDays} day(s) overdue.</li>
                          {!preview.enabled && <li className="text-destructive">Late fees are switched off, so the run will stop without charging anything.</li>}
                        </ul>
                      )}
                      onConfirm={() => applyLateFeesMutation.mutate()}
                    />
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        <p>This will calculate and add late fees to all invoices that are overdue past the grace period.</p>
                      </AlertDescription>
                    </Alert>
                  </div>
                </SettingsRow>
              )}
            </>
          )}

          {pending > 0 && (
            <SettingsRow rowId="late-fee-waivers" stacked>
              {waiversLoading ? (
                <SettingsSkeleton className="w-full" />
              ) : (waivers?.data?.length ?? 0) === 0 ? (
                <p className="w-full py-4 text-center text-muted-foreground">No pending waiver requests</p>
              ) : (
                <div className="w-full rounded-md border">
                  <Table stack>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Resident</TableHead>
                        <TableHead>Late Fee</TableHead>
                        <TableHead>Waiver Type</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Requested</TableHead>
                        {canReview && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {waivers?.data?.map((waiver: LateFeeWaiverWithDetails) => (
                        <TableRow key={waiver.id} interactive={false}>
                          <TableCell label="Invoice" className="font-medium">{waiver.invoice?.invoice_number}</TableCell>
                          <TableCell label="Resident">
                            {waiver.resident?.first_name} {waiver.resident?.last_name}
                          </TableCell>
                          <TableCell label="Late fee">{formatCurrency(waiver.original_late_fee)}</TableCell>
                          <TableCell label="Waiver type">{waiverTypeBadge(waiver)}</TableCell>
                          <TableCell label="Reason" className="max-w-[200px] truncate max-md:max-w-none max-md:break-words" title={waiver.reason}>
                            {waiver.reason}
                          </TableCell>
                          <TableCell label="Requested">
                            {formatDistanceToNow(new Date(waiver.created_at), { addSuffix: true })}
                          </TableCell>
                          {canReview && <TableCell className="text-right max-md:justify-end">{reviewControls(waiver)}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SettingsRow>
          )}
        </>
      )}
    </SettingsSection>
  );
}
