'use client';

import { useBillingSettings, useUpdateSetting } from '@/hooks/use-settings';
import { useApplyLateFees, useLateFeeWaivers, usePendingWaiverCount, useApproveLateFeeWaiver, useRejectLateFeeWaiver } from '@/hooks/use-billing';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DollarSign, FileX2, Info, Loader2, Check, X } from 'lucide-react';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { SettingEffect } from '@/components/settings/setting-effect';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { previewLateFees } from '@/actions/billing/apply-late-fees';
import { formatCurrency } from '@/lib/utils';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { LateFeeWaiverWithDetails } from '@/types/database';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsSkeleton } from '@/components/settings/settings-states';

export default function LateFeesPage() {
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
    // Only fetch the list once the card will show.
    const { data: waivers, isLoading: waiversLoading } = useLateFeeWaivers(
        { status: 'pending' },
        { enabled: (pendingWaiverCount ?? 0) > 0 }
    );
    const approveWaiverMutation = useApproveLateFeeWaiver();
    const rejectWaiverMutation = useRejectLateFeeWaiver();

    const settingsMap = settings?.reduce((acc, s) => {
        let value = s.value;
        if (typeof value === 'string') {
            if (value === 'true') value = true;
            else if (value === 'false') value = false;
        }
        acc[s.key] = value;
        return acc;
    }, {} as Record<string, unknown>) || {};

    const handleSettingToggle = (key: string, currentValue: boolean) => {
        updateSettingMutation.mutate({ key, value: !currentValue });
    };

    const getLateFeeEnabled = (): boolean => {
        return settingsMap.late_fee_enabled === true;
    };

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

    const getLateFeeAutoApply = (): boolean => {
        return settingsMap.late_fee_auto_apply === true;
    };

    const getLateFeeApplicationDay = (): number => {
        const value = settingsMap.late_fee_application_day;
        if (typeof value === 'string') {
            return parseInt(value.replace(/"/g, '')) || 5;
        }
        if (typeof value === 'number') return value;
        return 5;
    };

    const commitSetting = (key: string) => (value: number) => updateSettingMutation.mutate({ key, value: String(value) });

    const EXISTING_INVOICES_EFFECT = 'existing overdue invoices too: the next run, manual or automatic, uses the values saved here for every overdue invoice that does not carry a late fee yet. Invoices that already carry one are not changed.';

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
            <Button
                size="sm"
                variant="outline"
                className="min-h-11 md:min-h-8"
                onClick={() => setReviewingWaiverId(waiver.id)}
            >
                Review
            </Button>
        );

    if (settingsLoading) return <SettingsSkeleton rows={6} />;

    return (
        <div className="space-y-6">
            {/* Late Fee Configuration */}
            <div>
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Late Fee Configuration
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Configure penalties for overdue payments.
                </p>
                <Card>
                    <CardContent className="pt-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="late_fee_enabled">Enable Late Fees</Label>
                                <p className="text-sm text-muted-foreground">
                                    Apply late fee charges to overdue invoices
                                </p>
                                <SettingEffect>{EXISTING_INVOICES_EFFECT}</SettingEffect>
                            </div>
                            <Switch
                                id="late_fee_enabled"
                                checked={getLateFeeEnabled()}
                                onCheckedChange={() => handleSettingToggle('late_fee_enabled', getLateFeeEnabled())}
                                disabled={!canEdit || updateSettingMutation.isPending}
                            />
                        </div>

                        {getLateFeeEnabled() && (
                            <>
                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="late_fee_type">Late Fee Type</Label>
                                        <p className="text-sm text-muted-foreground">
                                            How the late fee is calculated
                                        </p>
                                        <SettingEffect>{EXISTING_INVOICES_EFFECT}</SettingEffect>
                                    </div>
                                    <Select
                                        value={getLateFeeType()}
                                        onValueChange={(value) => updateSettingMutation.mutate({ key: 'late_fee_type', value })}
                                        disabled={!canEdit || updateSettingMutation.isPending}
                                    >
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="percentage">Percentage of invoice</SelectItem>
                                            <SelectItem value="fixed">Fixed amount (₦)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="late_fee_amount">
                                            Late Fee Amount {getLateFeeType() === 'percentage' ? '(%)' : '(₦)'}
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            {getLateFeeType() === 'percentage'
                                                ? 'Percentage of the invoice total to charge'
                                                : 'Fixed amount to add to the invoice'}
                                        </p>
                                        <SettingEffect>{EXISTING_INVOICES_EFFECT}</SettingEffect>
                                    </div>
                                    {getLateFeeType() === 'percentage' ? (
                                        <NumericSettingInput
                                            id="late_fee_amount"
                                            min={0.1}
                                            max={100}
                                            unit="%"
                                            value={getLateFeeAmount()}
                                            disabled={!canEdit}
                                            onCommit={commitSetting('late_fee_amount')}
                                        />
                                    ) : (
                                        <NumericSettingInput
                                            id="late_fee_amount"
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
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="grace_period_days">Grace Period (days)</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Days after due date before late fee applies (1-30). The late fee run treats 0 as 7, so 0 is not accepted.
                                        </p>
                                        <SettingEffect>{EXISTING_INVOICES_EFFECT}</SettingEffect>
                                    </div>
                                    <NumericSettingInput
                                        id="grace_period_days"
                                        min={1}
                                        max={30}
                                        integer
                                        unit="days"
                                        value={getGracePeriodDays()}
                                        disabled={!canEdit}
                                        onCommit={commitSetting('grace_period_days')}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="late_fee_auto_apply">Auto-Apply Late Fees</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Automatically apply late fees on the configured day
                                        </p>
                                        <SettingEffect>when late fees are added without anyone clicking. Each run charges every eligible overdue invoice.</SettingEffect>
                                    </div>
                                    <Switch
                                        id="late_fee_auto_apply"
                                        checked={getLateFeeAutoApply()}
                                        onCheckedChange={() => handleSettingToggle('late_fee_auto_apply', getLateFeeAutoApply())}
                                        disabled={!canEdit || updateSettingMutation.isPending}
                                    />
                                </div>

                                {getLateFeeAutoApply() && (
                                    <>
                                        <Separator />
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-0.5">
                                                <Label htmlFor="late_fee_application_day">Application Day</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Day of the month to auto-apply late fees
                                                </p>
                                            </div>
                                            <Select
                                                value={String(getLateFeeApplicationDay())}
                                                onValueChange={(value) => updateSettingMutation.mutate({ key: 'late_fee_application_day', value })}
                                                disabled={!canEdit || updateSettingMutation.isPending}
                                            >
                                                <SelectTrigger className="w-[180px]">
                                                    <SelectValue placeholder="Select day" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => {
                                                        const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
                                                        return (
                                                            <SelectItem key={day} value={String(day)}>
                                                                {day}{suffix} of month
                                                            </SelectItem>
                                                        );
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                )}

                                {canApply && (
                                <>
                                <Separator />

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label>Apply Late Fees</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Manually apply late fees to all eligible overdue invoices
                                            </p>
                                        </div>
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
                                    </div>
                                    <Alert>
                                        <Info className="h-4 w-4" />
                                        <AlertDescription>
                                            This will calculate and add late fees to all invoices that are overdue past the grace period.
                                        </AlertDescription>
                                    </Alert>
                                </div>
                                </>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Late Fee Waiver Requests */}
            {(pendingWaiverCount ?? 0) > 0 && (
                <div>
                    <h3 className="text-lg font-medium flex items-center gap-2">
                        <FileX2 className="h-5 w-5" />
                        Late Fee Waiver Requests
                        <Badge variant="secondary" className="ml-2">{pendingWaiverCount} pending</Badge>
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Review and approve/reject late fee waiver requests.
                    </p>
                    <Card>
                        <CardContent className="pt-6">
                            {waiversLoading ? (
                                <SettingsSkeleton />
                            ) : (waivers?.data?.length ?? 0) === 0 ? (
                                <p className="text-center text-muted-foreground py-8">No pending waiver requests</p>
                            ) : (
                                <>
                                {/* Phone: one stacked card per request (#788). */}
                                <ul className="space-y-3 md:hidden">
                                    {waivers?.data?.map((waiver: LateFeeWaiverWithDetails) => (
                                        <li key={waiver.id} className="space-y-2 rounded-md border p-3 text-sm">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="font-medium">{waiver.invoice?.invoice_number}</p>
                                                    <p className="text-muted-foreground">
                                                        {waiver.resident?.first_name} {waiver.resident?.last_name}
                                                    </p>
                                                </div>
                                                <span className="font-medium">{formatCurrency(waiver.original_late_fee)}</span>
                                            </div>
                                            {waiverTypeBadge(waiver)}
                                            <p className="break-words">{waiver.reason}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(waiver.created_at), { addSuffix: true })}
                                            </p>
                                            {canReview && reviewControls(waiver)}
                                        </li>
                                    ))}
                                </ul>
                                <div className="hidden md:block">
                                <Table>
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
                                            <TableRow key={waiver.id}>
                                                <TableCell className="font-medium">
                                                    {waiver.invoice?.invoice_number}
                                                </TableCell>
                                                <TableCell>
                                                    {waiver.resident?.first_name} {waiver.resident?.last_name}
                                                </TableCell>
                                                <TableCell>
                                                    {formatCurrency(waiver.original_late_fee)}
                                                </TableCell>
                                                <TableCell>{waiverTypeBadge(waiver)}</TableCell>
                                                <TableCell className="max-w-[200px] truncate" title={waiver.reason}>
                                                    {waiver.reason}
                                                </TableCell>
                                                <TableCell>
                                                    {formatDistanceToNow(new Date(waiver.created_at), { addSuffix: true })}
                                                </TableCell>
                                                {canReview && <TableCell className="text-right">{reviewControls(waiver)}</TableCell>}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
