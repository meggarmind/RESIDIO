'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateWhatsAppTemplateContentSids } from '@/actions/whatsapp/connection';
import { WHATSAPP_TEMPLATE_NAMES } from '@/lib/whatsapp/templates';

// Fixed, human-readable labels for the fixed set of approved template
// names. Deliberately NOT an editable field: the template names
// themselves are the approved-sender allowlist enforced in
// src/lib/notifications/send.ts, and only the Twilio Content SID each one
// maps to is admin-editable (see updateWhatsAppTemplateContentSids() for
// the full reasoning). Adding or renaming a template name is a code
// change to src/lib/whatsapp/templates.ts, not a settings-page edit.
const TEMPLATE_LABELS: Record<string, string> = {
  [WHATSAPP_TEMPLATE_NAMES.invoiceReminder]: 'Invoice reminder',
  [WHATSAPP_TEMPLATE_NAMES.paymentReceived]: 'Payment received',
  [WHATSAPP_TEMPLATE_NAMES.announcement]: 'Announcement',
};

const TEMPLATE_NAMES = Object.values(WHATSAPP_TEMPLATE_NAMES);

export function TemplateContentSids({ initial }: { initial: Record<string, string> | null }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const name of TEMPLATE_NAMES) {
      seed[name] = initial?.[name] || '';
    }
    return seed;
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateWhatsAppTemplateContentSids(values);
      setMessage(result.error || 'Template content SIDs saved');
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">Twilio template content SIDs</p>
        <p className="text-xs text-muted-foreground">
          Map each approved WhatsApp template to its Twilio Content SID. Template names are fixed
          and enforced by the approved-sender allowlist; only the SID is editable here.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATE_NAMES.map((name) => (
          <label key={name} className="space-y-1 text-sm">
            <span className="text-muted-foreground">{TEMPLATE_LABELS[name] || name}</span>
            <Input
              value={values[name] || ''}
              onChange={(event) => setValues((previous) => ({ ...previous, [name]: event.target.value }))}
              placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={isPending} onClick={save}>
          Save template content SIDs
        </Button>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>
    </div>
  );
}
