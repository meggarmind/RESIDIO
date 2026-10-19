'use client';

import { useBillingSettings, useUpdateSetting } from '@/hooks/use-settings';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { SettingEffect } from '@/components/settings/setting-effect';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bell, AlertTriangle } from 'lucide-react';

export default function BillingSettingsPage() {
    const { data: settings, isLoading: settingsLoading } = useBillingSettings();
    const updateSettingMutation = useUpdateSetting();

    const REMINDER_DAY_OPTIONS = [
        { value: 1, label: '1 day before' },
        { value: 3, label: '3 days before' },
        { value: 7, label: '7 days before' },
        { value: 14, label: '14 days before' },
        { value: 30, label: '30 days before' },
    ];

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

    // The stored value; 30 only when nothing is stored, matching invoice generation's default.
    const getDueWindowDays = (): number => {
        const value = settingsMap.invoice_due_window_days;
        if (typeof value === 'string') {
            return parseInt(value.replace(/"/g, '')) || 30;
        }
        if (typeof value === 'number') return value;
        return 30;
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

    if (settingsLoading) return <div>Loading settings...</div>;

    return (
        <div className="space-y-6">
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
                                    Bill property owners for vacant properties
                                </p>
                                <SettingEffect>future invoice runs only. Invoices already issued are not changed.</SettingEffect>
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
                                <Label htmlFor="bill_under_renovation_houses">Bill Houses Under Renovation</Label>
                                <p className="text-sm text-muted-foreground">
                                    Bill property owners for properties under renovation
                                </p>
                                <SettingEffect>future invoice runs only. Invoices already issued are not changed.</SettingEffect>
                            </div>
                            <Switch
                                id="bill_under_renovation_houses"
                                checked={settingsMap.bill_under_renovation_houses === true}
                                onCheckedChange={() => handleSettingToggle('bill_under_renovation_houses', settingsMap.bill_under_renovation_houses === true)}
                                disabled={updateSettingMutation.isPending}
                            />
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="bill_under_construction_houses">Bill Houses Under Construction</Label>
                                <p className="text-sm text-muted-foreground">
                                    Bill property owners for properties under construction
                                </p>
                                <SettingEffect>future invoice runs only. Invoices already issued are not changed.</SettingEffect>
                            </div>
                            <Switch
                                id="bill_under_construction_houses"
                                checked={settingsMap.bill_under_construction_houses === true}
                                onCheckedChange={() => handleSettingToggle('bill_under_construction_houses', settingsMap.bill_under_construction_houses === true)}
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
                                <SettingEffect>levies charged from now on when a house is created or a resident is assigned, and Generate Retroactive Levies, which creates nothing while this is off. Levy invoices already issued are not changed.</SettingEffect>
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
                                <SettingEffect>nothing at present: invoice generation does not read this setting.</SettingEffect>
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
                                <SettingEffect>invoices and levies created after the change. Due dates already set are not changed.</SettingEffect>
                            </div>
                            <NumericSettingInput
                                id="invoice_due_window_days"
                                min={1}
                                max={90}
                                integer
                                unit="days"
                                value={getDueWindowDays()}
                                onCommit={(value) => updateSettingMutation.mutate({ key: 'invoice_due_window_days', value: String(value) })}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

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
        </div>
    );
}
