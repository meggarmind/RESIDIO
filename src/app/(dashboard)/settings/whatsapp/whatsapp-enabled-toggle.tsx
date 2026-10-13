'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { setWhatsAppEnabled } from '@/actions/whatsapp/pilot';

/**
 * Master on/off switch for the WhatsApp channel -- distinct from the
 * rollout mode in PilotControls, which chooses WHO receives messages once
 * the channel is live. This decides WHETHER the channel runs at all.
 *
 * src/lib/notifications/send.ts gates every WhatsApp send on this exact
 * setting and (issue #134) now fails CLOSED when it is absent or
 * unreadable, so this control is the only way to turn WhatsApp sending on.
 */
export function WhatsAppEnabledToggle({ initialValue }: { initialValue: boolean }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.WHATSAPP_MANAGE);
  const [enabled, setEnabled] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  function handleChange(nextValue: boolean) {
    const previousValue = enabled;
    setEnabled(nextValue);
    startTransition(async () => {
      const result = await setWhatsAppEnabled(nextValue);
      if (!result.success) {
        setEnabled(previousValue);
        toast.error(result.error || 'Failed to update WhatsApp channel setting');
      }
    });
  }

  return (
    <Switch
      checked={enabled}
      disabled={isPending || !canManage}
      onCheckedChange={handleChange}
      aria-label="Enable the WhatsApp channel"
    />
  );
}
