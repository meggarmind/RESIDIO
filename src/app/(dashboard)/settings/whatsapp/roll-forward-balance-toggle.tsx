'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { setResidentRollForwardBalance } from '@/actions/whatsapp/balance-setting';

export function RollForwardBalanceToggle({ initialValue }: { initialValue: boolean }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.WHATSAPP_MANAGE);
  const [enabled, setEnabled] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  function handleChange(nextValue: boolean) {
    const previousValue = enabled;
    setEnabled(nextValue);
    startTransition(async () => {
      const result = await setResidentRollForwardBalance(nextValue);
      if (!result.success) {
        setEnabled(previousValue);
        toast.error(result.error || 'Failed to update the resident balance setting');
      }
    });
  }

  return (
    <Switch
      checked={enabled}
      disabled={isPending || !canManage}
      onCheckedChange={handleChange}
      aria-label="Show residents the roll-forward balance"
    />
  );
}
