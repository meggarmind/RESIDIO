'use client';

import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  useAutoGenerateEnabled,
  useInvoiceGenerationDay,
  useUpdateAutoGenerateEnabled,
  useUpdateInvoiceGenerationDay,
} from '@/hooks/use-billing';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';
import { ControlWithEffect } from '@/components/settings/billing/row-effect';

const ordinal = (day: number) => `${day}${day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}`;

/** Invoices & due dates of Billing rules (from the old Invoice Generation page). Controls act at once. */
export function InvoiceGenerationSection() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.SETTINGS_MANAGE_BILLING);
  const { data: generationDay, isLoading: generationDayLoading } = useInvoiceGenerationDay();
  const updateGenerationDayMutation = useUpdateInvoiceGenerationDay();
  const { data: autoGenerateEnabled, isLoading: autoGenerateLoading } = useAutoGenerateEnabled();
  const updateAutoGenerateMutation = useUpdateAutoGenerateEnabled();
  const isLoading = generationDayLoading || autoGenerateLoading;
  const day = generationDay || 2;

  const summary = isLoading
    ? 'Loading invoice settings'
    : autoGenerateEnabled
      ? `Automatic, on the ${ordinal(day)} of each month`
      : 'Automatic generation is off';

  return (
    <SettingsSection id="invoices" title="Invoices & due dates" summary={summary} instant>
      {isLoading ? (
        <div className="p-4 md:p-5">
          <SettingsSkeleton rows={3} />
        </div>
      ) : (
        <>
          <SettingsRow rowId="auto-generate-invoices">
            {({ controlId }) => (
              <ControlWithEffect effect="future monthly runs only. Invoices already issued are not changed.">
                <Switch
                  id={controlId}
                  checked={autoGenerateEnabled === true}
                  onCheckedChange={(checked) => updateAutoGenerateMutation.mutate(checked)}
                  disabled={!canEdit || updateAutoGenerateMutation.isPending}
                />
              </ControlWithEffect>
            )}
          </SettingsRow>
          <SettingsRow rowId="generation-day">
            {({ controlId }) => (
              <ControlWithEffect effect="future monthly runs only. Invoices already issued are not changed.">
                <Select
                  value={String(day)}
                  onValueChange={(value) => updateGenerationDayMutation.mutate(parseInt(value))}
                  disabled={!canEdit || updateGenerationDayMutation.isPending}
                >
                  <SelectTrigger id={controlId} className="min-h-11 w-[180px] md:min-h-9">
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => {
                      const note = d === 2 ? ' (default)' : d === 3 ? ' (recommended)' : '';
                      return (
                        <SelectItem key={d} value={String(d)}>
                          {ordinal(d)} of month{note}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </ControlWithEffect>
            )}
          </SettingsRow>
          <div className="space-y-3 border-t px-4 py-4 md:px-5">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <p>
                  Invoices are generated automatically each day at 6 AM UTC. The system only generates on the configured day.
                  Bank statements typically arrive on the 2nd or 3rd of each month.
                </p>
              </AlertDescription>
            </Alert>
            {autoGenerateEnabled ? (
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle className="h-4 w-4" />
                <span>Auto-generation is active - invoices will be created on the {ordinal(day)} of each month</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" />
                <span>Auto-generation is disabled - invoices must be generated manually from the Billing page</span>
              </div>
            )}
          </div>
        </>
      )}
    </SettingsSection>
  );
}
