'use client';

import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { previewRetroactiveLevies } from '@/actions/billing/generate-levies';
import { useDevelopmentLevyProfiles } from '@/hooks/use-billing';
import {
  useCurrentDevelopmentLevyProfileId,
  useGenerateRetroactiveLevies,
  useSetCurrentDevelopmentLevyProfileId,
} from '@/hooks/use-settings';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { formatCurrency } from '@/lib/utils';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { ControlWithEffect } from '@/components/settings/billing/row-effect';

const NONE_VALUE = '_none';

/** Levies of Billing rules (from the old Development Levies page). The retroactive run stays behind ConfirmAction. */
export function LeviesSection() {
  const { hasPermission, hasAnyPermission } = useAuth();
  // Each control is gated on the permission its action enforces.
  const canSetProfile = hasAnyPermission([PERMISSIONS.SETTINGS_MANAGE_BILLING, PERMISSIONS.BILLING_MANAGE_PROFILES]);
  const canGenerate = hasPermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  const { data: developmentLevyProfiles } = useDevelopmentLevyProfiles();
  const { data: currentDevLevyId } = useCurrentDevelopmentLevyProfileId();
  const setCurrentDevLevyMutation = useSetCurrentDevelopmentLevyProfileId();
  const generateLeviesMutation = useGenerateRetroactiveLevies();
  const current = developmentLevyProfiles?.find((profile) => profile.id === currentDevLevyId);

  return (
    <SettingsSection
      id="levies"
      title="Levies"
      summary={currentDevLevyId ? `New houses are charged ${current?.name ?? 'the selected development levy'}` : 'No development levy selected'}
      instant
    >
      <SettingsRow rowId="current-dev-levy">
        {({ controlId }) => (
          <ControlWithEffect effect="the Development Levy report. Levy generation charges every active one-time rate card, whichever is selected here, and invoices already issued are not changed.">
            <Select
              value={currentDevLevyId || NONE_VALUE}
              onValueChange={(value) => setCurrentDevLevyMutation.mutate(value === NONE_VALUE ? null : value)}
              disabled={!canSetProfile || setCurrentDevLevyMutation.isPending}
            >
              <SelectTrigger id={controlId} className="w-full sm:w-[280px]">
                <SelectValue placeholder="Select a Development Levy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  <span className="text-muted-foreground">None (disabled)</span>
                </SelectItem>
                {developmentLevyProfiles
                  ?.filter((p) => p.is_active)
                  .map((profile) => {
                    const total = profile.items?.reduce((sum: number, item: { amount?: number }) => sum + (item.amount || 0), 0) || 0;
                    return (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name} - {formatCurrency(total)}
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
            {currentDevLevyId ? (
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle className="h-4 w-4" />
                <span>Development Levy is active for new houses</span>
              </div>
            ) : (
              <p className="text-sm text-warning">
                No Development Levy selected - new houses will not be charged automatically
              </p>
            )}
          </ControlWithEffect>
        )}
      </SettingsRow>

      {canGenerate && (
        <SettingsRow rowId="retroactive-levies">
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
                  <li className="text-destructive">Auto-Generate Levies is off in General, so this run will create nothing.</li>
                ) : (
                  <li><strong>{preview.invoices}</strong> levy invoice(s) for <strong>{preview.houses}</strong> house(s), <strong>{formatCurrency(preview.totalAmount)}</strong> in total.</li>
                )}
                <li>{preview.housesChecked} active house(s) checked; {preview.alreadyCharged} levy charge(s) already made are skipped.</li>
                {preview.warnings.map((warning) => (
                  <li key={warning} className="text-destructive">{warning}</li>
                ))}
              </ul>
            )}
            onConfirm={() => generateLeviesMutation.mutate()}
          />
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
