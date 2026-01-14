'use client';

import { BillingProfileForm } from '@/components/billing/billing-profile-form';
import { BillingProfileEditDialog } from '@/components/billing/billing-profile-edit-dialog';
import { useBillingProfiles, useDeleteBillingProfile, useDevelopmentLevyProfiles, useDuplicateBillingProfile, useInvoiceGenerationDay, useUpdateInvoiceGenerationDay, useAutoGenerateEnabled, useUpdateAutoGenerateEnabled, useLateFeeWaivers, usePendingWaiverCount, useApproveLateFeeWaiver, useRejectLateFeeWaiver } from '@/hooks/use-billing';
import { useBillingSettings, useUpdateSetting, useGenerateRetroactiveLevies, useCurrentDevelopmentLevyProfileId, useSetCurrentDevelopmentLevyProfileId } from '@/hooks/use-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Building, Users, Clock, Loader2, Pencil, Landmark, CheckCircle, Copy, AlertTriangle, Info, DollarSign, Bell, CalendarClock, FileX2, Check, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useMemo } from 'react';
import { BILLABLE_ROLE_OPTIONS, BILLING_TARGET_LABELS } from '@/types/database';
import { useApplyLateFees } from '@/hooks/use-billing';
import { formatDistanceToNow } from 'date-fns';
import type { LateFeeWaiverWithDetails } from '@/types/database';

const NONE_VALUE = '_none';

export default function BillingSettingsPage() {
    const { data: profiles, isLoading } = useBillingProfiles();
    const { data: settings, isLoading: settingsLoading } = useBillingSettings();
    const { data: developmentLevyProfiles } = useDevelopmentLevyProfiles();
    const { data: currentDevLevyId } = useCurrentDevelopmentLevyProfileId();
    const setCurrentDevLevyMutation = useSetCurrentDevelopmentLevyProfileId();
    const deleteMutation = useDeleteBillingProfile();
    const duplicateMutation = useDuplicateBillingProfile();
    const updateSettingMutation = useUpdateSetting();
    const generateLeviesMutation = useGenerateRetroactiveLevies();
    const applyLateFeesMutation = useApplyLateFees();
    const { data: generationDay, isLoading: generationDayLoading } = useInvoiceGenerationDay();
    const updateGenerationDayMutation = useUpdateInvoiceGenerationDay();
    const { data: autoGenerateEnabled, isLoading: autoGenerateLoading } = useAutoGenerateEnabled();
    const updateAutoGenerateMutation = useUpdateAutoGenerateEnabled();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editProfileId, setEditProfileId] = useState<string | null>(null);
    const [waiverReviewNotes, setWaiverReviewNotes] = useState('');
    const [reviewingWaiverId, setReviewingWaiverId] = useState<string | null>(null);

    // Late fee waiver hooks
    const { data: waivers, isLoading: waiversLoading } = useLateFeeWaivers({ status: 'pending' });
    const { data: pendingWaiverCount } = usePendingWaiverCount();
    const approveWaiverMutation = useApproveLateFeeWaiver();
    const rejectWaiverMutation = useRejectLateFeeWaiver();

    // Reminder days options
    const REMINDER_DAY_OPTIONS = [
        { value: 1, label: '1 day before' },
        { value: 3, label: '3 days before' },
        { value: 7, label: '7 days before' },
        { value: 14, label: '14 days before' },
        { value: 30, label: '30 days before' },
    ];

    // Parse settings into a lookup
    const settingsMap = settings?.reduce((acc, s) => {
        let value = s.value;
        if (typeof value === 'string') {
            if (value === 'true') value = true;
            else if (value === 'false') value = false;
        }
        acc[s.key] = value;
        return acc;
    }, {} as Record<string, any>) || {};

    const handleSettingToggle = (key: string, currentValue: boolean) => {
        updateSettingMutation.mutate({ key, value: !currentValue });
    };

    const handleNumberSettingChange = (key: string, value: number) => {
        // Clamp the value to valid range
        const clampedValue = Math.min(Math.max(value, 1), 90);
        updateSettingMutation.mutate({ key, value: String(clampedValue) });
    };

    // Parse due window days from settings (stored as JSON string with quotes)
    const getDueWindowDays = (): number => {
        const value = settingsMap.invoice_due_window_days;
        if (typeof value === 'string') {
            return parseInt(value.replace(/"/g, '')) || 30;
        }
        if (typeof value === 'number') return value;
        return 30;
    };

    // Parse late fee settings
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

    const getPaymentReminderDays = (): number[] => {
        const value = settingsMap.payment_reminder_days;
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [7, 3, 1];
            } catch {
                return [7, 3, 1];
            }
        }
        return [7, 3, 1];
    };

    const handleReminderDayToggle = (day: number) => {
        const currentDays = getPaymentReminderDays();
        const newDays = currentDays.includes(day)
            ? currentDays.filter(d => d !== day)
            : [...currentDays, day].sort((a, b) => b - a);
        updateSettingMutation.mutate({ key: 'payment_reminder_days', value: newDays });
    };

    const handleLateFeeAmountChange = (value: number | undefined) => {
        updateSettingMutation.mutate({ key: 'late_fee_amount', value: value || 0 });
    };

    if (isLoading || settingsLoading) return <div>Loading settings...</div>;

    // Helper to get role labels
    const getRoleLabels = (roles: string[] | null) => {
        if (!roles || roles.length === 0) return null;
        return roles.map(role => {
            const found = BILLABLE_ROLE_OPTIONS.find(o => o.value === role);
            return found?.label || role;
        });
    };

    return (
        <div className="space-y-8">
            {/* Billing Settings Section */}
            <div>
                <h3 className="text-lg font-medium">Billing Settings</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Configure how billing works across the estate.
                </p>
                <Card>
                    <CardContent className="pt-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="bill_vacant_houses">Bill Vacant Houses</Label>
                                <p className="text-sm text-muted-foreground">
                                    Bill non-resident landlords for vacant properties
                                </p>
                            </div>
                            <Switch
                                id="bill_vacant_houses"
                                checked={settingsMap.bill_vacant_houses === true}
                                onCheckedChange={() => handleSettingToggle('bill_vacant_houses', settingsMap.bill_vacant_houses === true)}
                                disabled={updateSettingMutation.isPending}
                            />
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="auto_generate_levies">Auto-Generate Levies</Label>
                                <p className="text-sm text-muted-foreground">
                                    Automatically generate one-time levies when a house is created
                                </p>
                            </div>
                            <Switch
                                id="auto_generate_levies"
                                checked={settingsMap.auto_generate_levies !== false}
                                onCheckedChange={() => handleSettingToggle('auto_generate_levies', settingsMap.auto_generate_levies !== false)}
                                disabled={updateSettingMutation.isPending}
                            />
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="pro_rata_first_month">Pro-Rata First Month</Label>
                                <p className="text-sm text-muted-foreground">
                                    Apply pro-rata calculation for the first billing month
                                </p>
                            </div>
                            <Switch
                                id="pro_rata_first_month"
                                checked={settingsMap.pro_rata_first_month !== false}
                                onCheckedChange={() => handleSettingToggle('pro_rata_first_month', settingsMap.pro_rata_first_month !== false)}
                                disabled={updateSettingMutation.isPending}
                            />
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="invoice_due_window_days">Invoice Due Window</Label>
                                <p className="text-sm text-muted-foreground">
                                    Days from invoice issue date until payment is due (1-90)
                                </p>
                            </div>
                            <Input
                                id="invoice_due_window_days"
                                type="number"
                                min={1}
                                max={90}
                                value={getDueWindowDays()}
                                onChange={(e) => handleNumberSettingChange('invoice_due_window_days', parseInt(e.target.value) || 30)}
                                className="w-20 text-center"
                                disabled={updateSettingMutation.isPending}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

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
                            </div>
                            <Switch
                                id="late_fee_enabled"
                                checked={getLateFeeEnabled()}
                                onCheckedChange={() => handleSettingToggle('late_fee_enabled', getLateFeeEnabled())}
                                disabled={updateSettingMutation.isPending}
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
                                    </div>
                                    <Select
                                        value={getLateFeeType()}
                                        onValueChange={(value) => updateSettingMutation.mutate({ key: 'late_fee_type', value })}
                                        disabled={updateSettingMutation.isPending}
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
                                    </div>
                                    {getLateFeeType() === 'percentage' ? (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                id="late_fee_amount"
                                                type="number"
                                                min={0}
                                                max={100}
                                                step={0.5}
                                                value={getLateFeeAmount()}
                                                onChange={(e) => handleLateFeeAmountChange(parseFloat(e.target.value))}
                                                className="w-20 text-center"
                                                disabled={updateSettingMutation.isPending}
                                            />
                                            <span className="text-muted-foreground">%</span>
                                        </div>
                                    ) : (
                                        <CurrencyInput
                                            value={getLateFeeAmount()}
                                            onValueChange={handleLateFeeAmountChange}
                                            className="w-32 text-right"
                                            disabled={updateSettingMutation.isPending}
                                        />
                                    )}
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="grace_period_days">Grace Period (days)</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Days after due date before late fee applies
                                        </p>
                                    </div>
                                    <Input
                                        id="grace_period_days"
                                        type="number"
                                        min={0}
                                        max={30}
                                        value={getGracePeriodDays()}
                                        onChange={(e) => handleNumberSettingChange('grace_period_days', parseInt(e.target.value) || 7)}
                                        className="w-20 text-center"
                                        disabled={updateSettingMutation.isPending}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="late_fee_auto_apply">Auto-Apply Late Fees</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Automatically apply late fees on the configured day
                                        </p>
                                    </div>
                                    <Switch
                                        id="late_fee_auto_apply"
                                        checked={getLateFeeAutoApply()}
                                        onCheckedChange={() => handleSettingToggle('late_fee_auto_apply', getLateFeeAutoApply())}
                                        disabled={updateSettingMutation.isPending}
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
                                                disabled={updateSettingMutation.isPending}
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

                                <Separator />

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label>Apply Late Fees</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Manually apply late fees to all eligible overdue invoices
                                            </p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            onClick={() => applyLateFeesMutation.mutate()}
                                            disabled={applyLateFeesMutation.isPending}
                                        >
                                            {applyLateFeesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Apply Late Fees Now
                                        </Button>
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
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                            ) : (waivers?.data?.length ?? 0) === 0 ? (
                                <p className="text-center text-muted-foreground py-8">No pending waiver requests</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Invoice</TableHead>
                                            <TableHead>Resident</TableHead>
                                            <TableHead>Late Fee</TableHead>
                                            <TableHead>Waiver Type</TableHead>
                                            <TableHead>Reason</TableHead>
                                            <TableHead>Requested</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
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
                                                <TableCell>
                                                    <Badge variant={waiver.waiver_type === 'full' ? 'default' : 'secondary'}>
                                                        {waiver.waiver_type === 'full' ? 'Full' : `Partial (${formatCurrency(waiver.waiver_amount || 0)})`}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="max-w-[200px] truncate" title={waiver.reason}>
                                                    {waiver.reason}
                                                </TableCell>
                                                <TableCell>
                                                    {formatDistanceToNow(new Date(waiver.created_at), { addSuffix: true })}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {reviewingWaiverId === waiver.id ? (
                                                        <div className="flex items-center gap-2 justify-end">
                                                            <Textarea
                                                                placeholder="Review notes (optional)"
                                                                value={waiverReviewNotes}
                                                                onChange={(e) => setWaiverReviewNotes(e.target.value)}
                                                                className="w-48 h-16 text-xs"
                                                            />
                                                            <div className="flex flex-col gap-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="text-green-600"
                                                                    onClick={() => {
                                                                        approveWaiverMutation.mutate({ waiverId: waiver.id, notes: waiverReviewNotes });
                                                                        setReviewingWaiverId(null);
                                                                        setWaiverReviewNotes('');
                                                                    }}
                                                                    disabled={approveWaiverMutation.isPending}
                                                                >
                                                                    <Check className="h-3 w-3" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="text-red-600"
                                                                    onClick={() => {
                                                                        rejectWaiverMutation.mutate({ waiverId: waiver.id, notes: waiverReviewNotes });
                                                                        setReviewingWaiverId(null);
                                                                        setWaiverReviewNotes('');
                                                                    }}
                                                                    disabled={rejectWaiverMutation.isPending}
                                                                >
                                                                    <X className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    setReviewingWaiverId(null);
                                                                    setWaiverReviewNotes('');
                                                                }}
                                                            >
                                                                Cancel
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => setReviewingWaiverId(waiver.id)}
                                                        >
                                                            Review
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Payment Reminders */}
            <div>
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Payment Reminders
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Configure when to send payment reminder notifications.
                </p>
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="space-y-4">
                            <Label>Send reminders before due date:</Label>
                            <div className="grid gap-3">
                                {REMINDER_DAY_OPTIONS.map((option) => {
                                    const isChecked = getPaymentReminderDays().includes(option.value);
                                    return (
                                        <div key={option.value} className="flex items-center space-x-3">
                                            <Checkbox
                                                id={`reminder-${option.value}`}
                                                checked={isChecked}
                                                onCheckedChange={() => handleReminderDayToggle(option.value)}
                                                disabled={updateSettingMutation.isPending}
                                            />
                                            <Label
                                                htmlFor={`reminder-${option.value}`}
                                                className="font-normal cursor-pointer"
                                            >
                                                {option.label}
                                            </Label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <AlertDescription className="text-amber-800 dark:text-amber-200">
                                Email notifications will be implemented in Phase 9. For now, this configuration stores your preferences.
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>
            </div>

            {/* Invoice Generation */}
            <div>
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <CalendarClock className="h-5 w-5" />
                    Invoice Generation
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Configure automated monthly invoice generation.
                </p>
                <Card>
                    <CardContent className="pt-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="auto_generate_invoices">Auto-Generate Invoices</Label>
                                <p className="text-sm text-muted-foreground">
                                    Automatically generate monthly invoices on the configured day
                                </p>
                            </div>
                            <Switch
                                id="auto_generate_invoices"
                                checked={autoGenerateEnabled === true}
                                onCheckedChange={(checked) => updateAutoGenerateMutation.mutate(checked)}
                                disabled={updateAutoGenerateMutation.isPending || autoGenerateLoading}
                            />
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="generation_day">Generation Day</Label>
                                <p className="text-sm text-muted-foreground">
                                    Day of the month when invoices are generated
                                </p>
                            </div>
                            <Select
                                value={String(generationDay || 2)}
                                onValueChange={(value) => updateGenerationDayMutation.mutate(parseInt(value))}
                                disabled={updateGenerationDayMutation.isPending || generationDayLoading}
                            >
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select day" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => {
                                        const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
                                        const note = day === 2 ? ' (default)' : day === 3 ? ' (recommended)' : '';
                                        return (
                                            <SelectItem key={day} value={String(day)}>
                                                {day}{suffix} of month{note}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>

                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                                Invoices are generated automatically each day at 6 AM UTC. The system only generates on the configured day.
                                Bank statements typically arrive on the 2nd or 3rd of each month.
                            </AlertDescription>
                        </Alert>

                        {autoGenerateEnabled && (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                <span>Auto-generation is active - invoices will be created on the {generationDay || 2}{generationDay === 1 ? 'st' : generationDay === 2 ? 'nd' : generationDay === 3 ? 'rd' : 'th'} of each month</span>
                            </div>
                        )}
                        {!autoGenerateEnabled && (
                            <div className="text-sm text-amber-600 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                <span>Auto-generation is disabled - invoices must be generated manually from the Billing page</span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Development Levy Settings */}
            <div>
                <h3 className="text-lg font-medium">Development Levy</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Select which Development Levy profile automatically applies to new houses.
                </p>
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="current_dev_levy">Current Development Levy</Label>
                                <p className="text-sm text-muted-foreground">
                                    This profile will be applied to all newly created houses
                                </p>
                            </div>
                            <Select
                                value={currentDevLevyId || NONE_VALUE}
                                onValueChange={(value) => setCurrentDevLevyMutation.mutate(value === NONE_VALUE ? null : value)}
                                disabled={setCurrentDevLevyMutation.isPending}
                            >
                                <SelectTrigger className="w-[280px]">
                                    <SelectValue placeholder="Select a Development Levy" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE_VALUE}>
                                        <span className="text-muted-foreground">None (disabled)</span>
                                    </SelectItem>
                                    {developmentLevyProfiles?.filter(p => p.is_active).map((profile) => {
                                        const total = profile.items?.reduce((sum: number, item: any) => sum + (item.amount || 0), 0) || 0;
                                        return (
                                            <SelectItem key={profile.id} value={profile.id}>
                                                {profile.name} - {formatCurrency(total)}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        {currentDevLevyId && (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                <span>Development Levy is active for new houses</span>
                            </div>
                        )}
                        {!currentDevLevyId && (
                            <div className="text-sm text-amber-600">
                                No Development Levy selected - new houses will not be charged automatically
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Retroactive Levy Generation */}
            <div>
                <h3 className="text-lg font-medium">Retroactive Levy Generation</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Generate outstanding one-time levies for existing houses that haven&apos;t been charged yet.
                </p>
                <Button
                    variant="outline"
                    onClick={() => generateLeviesMutation.mutate()}
                    disabled={generateLeviesMutation.isPending}
                >
                    {generateLeviesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate Retroactive Levies
                </Button>
            </div>

            <Separator />

            {/* Billing Profiles Section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-medium">Billing Profiles (Rate Cards)</h3>
                        <p className="text-sm text-muted-foreground">
                            Define the standard rates for different types of units or residents.
                        </p>
                    </div>
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button>Create Profile</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Create Billing Profile</DialogTitle>
                                <DialogDescription>
                                    Set up a new rate card. This can be assigned to House Types or specific roles.
                                </DialogDescription>
                            </DialogHeader>
                            <BillingProfileForm onSuccess={() => setIsCreateOpen(false)} />
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="grid gap-4">
                    {profiles?.map((profile: any) => {
                        const roleLabels = getRoleLabels(profile.applicable_roles);
                        const isCurrentDevLevy = profile.is_development_levy && profile.id === currentDevLevyId;
                        return (
                            <Card key={profile.id} className={isCurrentDevLevy ? 'border-green-300 bg-green-50/30' : ''}>
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <CardTitle className="text-base">{profile.name}</CardTitle>
                                                {profile.is_development_levy && (
                                                    <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">
                                                        <Landmark className="h-3 w-3 mr-1" />
                                                        Development Levy
                                                    </Badge>
                                                )}
                                                {isCurrentDevLevy && (
                                                    <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100">
                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                        Current
                                                    </Badge>
                                                )}
                                                {profile.is_one_time && !profile.is_development_levy && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        One-Time
                                                    </Badge>
                                                )}
                                                {!profile.is_active && (
                                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                                        Inactive
                                                    </Badge>
                                                )}
                                            </div>
                                            <CardDescription>{profile.description}</CardDescription>
                                            <div className="flex items-center gap-2 mt-2">
                                                {profile.target_type === 'house' ? (
                                                    <Badge variant="outline" className="text-xs">
                                                        <Building className="h-3 w-3 mr-1" />
                                                        Property
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs">
                                                        <Users className="h-3 w-3 mr-1" />
                                                        Role-Based
                                                    </Badge>
                                                )}
                                                {roleLabels && (
                                                    <div className="flex gap-1">
                                                        {roleLabels.map((label, i) => (
                                                            <Badge key={i} variant="secondary" className="text-xs">
                                                                {label}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => setEditProfileId(profile.id)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => duplicateMutation.mutate(profile.id)}
                                                disabled={duplicateMutation.isPending}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive h-8 w-8"
                                                onClick={async () => {
                                                    if (confirm('Delete this profile? This might affect automated billing.')) {
                                                        await deleteMutation.mutateAsync(profile.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {profile.items?.map((item: any) => (
                                            <div key={item.id} className="flex justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                                                <span>{item.name}</span>
                                                <span className="font-medium">
                                                    {formatCurrency(item.amount)}
                                                    <span className="text-xs text-muted-foreground ml-1">/{item.frequency}</span>
                                                </span>
                                            </div>
                                        ))}
                                        {(!profile.items || profile.items.length === 0) && (
                                            <p className="text-sm text-muted-foreground italic">No items defined</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}

                    {(!profiles || profiles.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                            No billing profiles found. Create one to get started.
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Dialog */}
            <BillingProfileEditDialog
                profileId={editProfileId}
                open={!!editProfileId}
                onOpenChange={(open) => !open && setEditProfileId(null)}
            />
        </div>
    );
}
