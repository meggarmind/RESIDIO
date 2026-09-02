'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@/components/ui/switch';
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
  const [enabled, setEnabled] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  function handleChange(nextValue: boolean) {
    const previousValue = enabled;
    setEnabled(nextValue);
    startTransition(async () => {
      const result = await setWhatsAppEnabled(nextValue);
      if (!result.success) setEnabled(previousValue);
    });
  }

  return (
    <Switch
      checked={enabled}
      disabled={isPending}
      onCheckedChange={handleChange}
      aria-label="Enable the WhatsApp channel"
    />
  );
}
