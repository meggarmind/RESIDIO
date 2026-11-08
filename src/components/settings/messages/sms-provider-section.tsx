'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { getSmsProviderStatus, type SmsProviderStatus } from '@/actions/settings/sms-provider';
import { updateSetting } from '@/actions/settings/update-setting';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SMS_PROVIDER_SETTING_KEY, isSmsProviderName, type SmsProviderName } from '@/lib/sms/providers/types';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';

const QUERY_KEY = ['sms-provider-status'];

/**
 * SMS provider of /settings/sending (#1462). The choice is stored as the `sms_provider` setting;
 * the credentials stay in the server environment, so only "set" or "missing" shows here.
 */
export function SmsProviderSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getSmsProviderStatus();
      if (result.error || !result.data) throw new Error(result.error || 'Failed to load');
      return result.data;
    },
  });

  if (isLoading || error || !data) {
    return (
      <SettingsSection
        id="sms-provider"
        title="SMS provider"
        summary={isLoading ? 'Loading' : 'Could not load the SMS provider'}
        permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
        defaultCollapsed
        // While loading, keep the footer (disabled) so its height is reserved and the page does not jump when the form arrives.
        instant={!isLoading}
      >
        <div className="p-4 md:p-5">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error instanceof Error ? error.message : 'Failed to load the SMS provider.'}</AlertDescription>
            </Alert>
          )}
        </div>
      </SettingsSection>
    );
  }

  // Keyed on the stored value so fresh server data re-initialises the form.
  return <ProviderForm key={data.provider} data={data} />;
}

function ProviderForm({ data }: { data: SmsProviderStatus }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SmsProviderName>(data.provider);

  const save = useMutation({
    mutationFn: async () => {
      const result = await updateSetting(SMS_PROVIDER_SETTING_KEY, selected, {
        category: 'notifications',
        description: 'Active SMS provider',
      });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success('SMS provider saved');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const labelOf = (name: SmsProviderName) => data.providers.find((p) => p.name === name)?.label ?? name;
  const selectedMissing = data.providers.find((p) => p.name === selected)?.configured === false;

  return (
    <SettingsSection
      id="sms-provider"
      title="SMS provider"
      summary={`${labelOf(data.provider)}${data.smsSwitchedOn ? '' : ' (SMS is switched off)'}`}
      permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
      defaultCollapsed
      isDirty={selected !== data.provider}
      isSaving={save.isPending}
      onSave={() => save.mutateAsync()}
      onDiscard={() => setSelected(data.provider)}
    >
      {!data.smsSwitchedOn && (
        <div className="px-4 pt-4 md:px-5">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              SMS is switched off. This choice applies when SMS is switched on.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <SettingsRow rowId="sms-provider-choice" stacked>
        {({ labelId, helpId }) => (
          <div className="space-y-3">
            <RadioGroup
              aria-labelledby={labelId}
              aria-describedby={helpId}
              value={selected}
              onValueChange={(value) => {
                if (isSmsProviderName(value)) setSelected(value);
              }}
              disabled={save.isPending}
            >
              {data.providers.map((provider) => {
                const inputId = `sms-provider-${provider.name}`;
                return (
                  <div key={provider.name} className="flex flex-wrap items-center gap-3">
                    <RadioGroupItem id={inputId} value={provider.name} />
                    <Label htmlFor={inputId} className="font-medium">
                      {provider.label}
                    </Label>
                    <Badge variant={provider.configured ? 'success' : 'warning'}>
                      {provider.configured ? (
                        <>
                          <CheckCircle2 aria-hidden="true" />
                          Credentials set
                        </>
                      ) : (
                        <>
                          <AlertCircle aria-hidden="true" />
                          Credentials missing on the server
                        </>
                      )}
                    </Badge>
                  </div>
                );
              })}
            </RadioGroup>
            {selectedMissing && (
              <p role="alert" className="text-sm text-warning">
                {labelOf(selected)} has no credentials on the server. SMS sends fail until they are set.
              </p>
            )}
          </div>
        )}
      </SettingsRow>
    </SettingsSection>
  );
}
