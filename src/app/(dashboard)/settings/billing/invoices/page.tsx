'use client';

import { useInvoiceGenerationDay, useUpdateInvoiceGenerationDay, useAutoGenerateEnabled, useUpdateAutoGenerateEnabled } from '@/hooks/use-billing';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SettingEffect } from '@/components/settings/setting-effect';
import { CalendarClock, Info, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsSkeleton } from '@/components/settings/settings-states';

export default function InvoiceGenerationPage() {
    const { hasPermission } = useAuth();
    const canEdit = hasPermission(PERMISSIONS.SETTINGS_MANAGE_BILLING);
    const { data: generationDay, isLoading: generationDayLoading } = useInvoiceGenerationDay();
    const updateGenerationDayMutation = useUpdateInvoiceGenerationDay();
    const { data: autoGenerateEnabled, isLoading: autoGenerateLoading } = useAutoGenerateEnabled();
    const updateAutoGenerateMutation = useUpdateAutoGenerateEnabled();

    if (generationDayLoading || autoGenerateLoading) return <SettingsSkeleton rows={3} />;

    return (
        <div className="space-y-6">
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
                                <SettingEffect>future monthly runs only. Invoices already issued are not changed.</SettingEffect>
                            </div>
                            <Switch
                                id="auto_generate_invoices"
                                checked={autoGenerateEnabled === true}
                                onCheckedChange={(checked) => updateAutoGenerateMutation.mutate(checked)}
                                disabled={!canEdit || updateAutoGenerateMutation.isPending || autoGenerateLoading}
                            />
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="generation_day">Generation Day</Label>
                                <p className="text-sm text-muted-foreground">
                                    Day of the month when invoices are generated
                                </p>
                                <SettingEffect>future monthly runs only. Invoices already issued are not changed.</SettingEffect>
                            </div>
                            <Select
                                value={String(generationDay || 2)}
                                onValueChange={(value) => updateGenerationDayMutation.mutate(parseInt(value))}
                                disabled={!canEdit || updateGenerationDayMutation.isPending || generationDayLoading}
                            >
                                <SelectTrigger id="generation_day" className="min-h-11 w-[180px] md:min-h-9">
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
                            <div className="flex items-center gap-2 text-sm text-success">
                                <CheckCircle className="h-4 w-4" />
                                <span>Auto-generation is active - invoices will be created on the {generationDay || 2}{generationDay === 1 ? 'st' : generationDay === 2 ? 'nd' : generationDay === 3 ? 'rd' : 'th'} of each month</span>
                            </div>
                        )}
                        {!autoGenerateEnabled && (
                            <div className="text-sm text-warning flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                <span>Auto-generation is disabled - invoices must be generated manually from the Billing page</span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
