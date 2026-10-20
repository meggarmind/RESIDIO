'use client';

import { useDevelopmentLevyProfiles } from '@/hooks/use-billing';
import { useCurrentDevelopmentLevyProfileId, useSetCurrentDevelopmentLevyProfileId, useGenerateRetroactiveLevies } from '@/hooks/use-settings';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { SettingEffect } from '@/components/settings/setting-effect';
import { previewRetroactiveLevies } from '@/actions/billing/generate-levies';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const NONE_VALUE = '_none';

export default function DevelopmentLeviesPage() {
    const { hasPermission, hasAnyPermission } = useAuth();
    // Each control is gated on the permission its action enforces.
    const canSetProfile = hasAnyPermission([PERMISSIONS.SETTINGS_MANAGE_BILLING, PERMISSIONS.BILLING_MANAGE_PROFILES]);
    const canGenerate = hasPermission(PERMISSIONS.BILLING_CREATE_INVOICE);
    const { data: developmentLevyProfiles } = useDevelopmentLevyProfiles();
    const { data: currentDevLevyId } = useCurrentDevelopmentLevyProfileId();
    const setCurrentDevLevyMutation = useSetCurrentDevelopmentLevyProfileId();
    const generateLeviesMutation = useGenerateRetroactiveLevies();

    return (
        <div className="space-y-6">
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
                                <SettingEffect>the Development Levy report. Levy generation charges every active one-time rate card, whichever is selected here, and invoices already issued are not changed.</SettingEffect>
                            </div>
                            <Select
                                value={currentDevLevyId || NONE_VALUE}
                                onValueChange={(value) => setCurrentDevLevyMutation.mutate(value === NONE_VALUE ? null : value)}
                                disabled={!canSetProfile || setCurrentDevLevyMutation.isPending}
                            >
                                <SelectTrigger className="w-full sm:w-[280px]">
                                    <SelectValue placeholder="Select a Development Levy" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE_VALUE}>
                                        <span className="text-muted-foreground">None (disabled)</span>
                                    </SelectItem>
                                    {developmentLevyProfiles?.filter(p => p.is_active).map((profile) => {
                                        const total = profile.items?.reduce((sum: number, item: { amount?: number }) => sum + (item.amount || 0), 0) || 0;
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
                            <div className="flex items-center gap-2 text-sm text-success">
                                <CheckCircle className="h-4 w-4" />
                                <span>Development Levy is active for new houses</span>
                            </div>
                        )}
                        {!currentDevLevyId && (
                            <div className="text-sm text-warning">
                                No Development Levy selected - new houses will not be charged automatically
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Retroactive Levy Generation */}
            {canGenerate && (
            <div>
                <h3 className="text-lg font-medium">Retroactive Levy Generation</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Generate outstanding one-time levies for existing houses that haven&apos;t been charged yet.
                </p>
                <ConfirmAction
                    trigger={
                        <Button variant="outline" disabled={generateLeviesMutation.isPending}>
                            {generateLeviesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Generate Retroactive Levies
                        </Button>
                    }
                    title="Generate retroactive levies?"
                    description={
                        <>
                            <p>A levy invoice is created for each active house whose billable resident has not been charged a one-time rate card yet, and is paid from the resident&apos;s wallet where it can be. This cannot be undone here: each invoice has to be voided by hand.</p>
                            <p>Running it again is safe: a house already charged for a rate card is skipped.</p>
                        </>
                    }
                    confirmLabel="Generate levies"
                    destructive
                    loadPreview={previewRetroactiveLevies}
                    renderPreview={(preview) => (
                        <ul className="space-y-1">
                            {!preview.autoGenerateEnabled ? (
                                <li className="text-destructive">Auto-Generate Levies is off in Billing Settings, so this run will create nothing.</li>
                            ) : (
                                <li><strong>{preview.invoices}</strong> levy invoice(s) for <strong>{preview.houses}</strong> house(s), <strong>{formatCurrency(preview.totalAmount)}</strong> in total.</li>
                            )}
                            <li>{preview.housesChecked} active house(s) checked; {preview.alreadyCharged} levy charge(s) already made are skipped.</li>
                        </ul>
                    )}
                    onConfirm={() => generateLeviesMutation.mutate()}
                />
            </div>
            )}
        </div>
    );
}
