'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { setWhatsAppAssistantText, type WhatsAppAssistantText } from '@/actions/whatsapp/assistant-settings';

const FIELDS: Array<{ field: keyof WhatsAppAssistantText; label: string; help: string; placeholder: string }> = [
  {
    field: 'paymentInstructions',
    label: 'Payment instructions',
    help: 'Sent when a resident chooses How to pay. Leave empty to hide How to pay.',
    placeholder: 'Pay into Palm Estate, Bank name, account 0123456789. Use your house number as the narration.',
  },
  {
    field: 'keywordSynonyms',
    label: 'Extra keywords',
    help: 'One per line as "phrase = item". Items: owe, payments, statement, wallet, pay, notices, contact.',
    placeholder: 'service charge = owe\ndues = owe',
  },
];

export function AssistantText({ initial }: { initial: WhatsAppAssistantText }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.WHATSAPP_MANAGE);
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function save(field: keyof WhatsAppAssistantText) {
    startTransition(async () => {
      const result = await setWhatsAppAssistantText(field, values[field]);
      if (!result.success) {
        toast.error(result.error || 'Failed to save');
        return;
      }
      setSaved((current) => ({ ...current, [field]: result.data ?? '' }));
      setValues((current) => ({ ...current, [field]: result.data ?? '' }));
      toast.success('Saved');
    });
  }

  return (
    <div className="space-y-5">
      {FIELDS.map(({ field, label, help, placeholder }) => (
        <div key={field} className="space-y-2">
          <Label htmlFor={`assistant-${field}`}>{label}</Label>
          <Textarea
            id={`assistant-${field}`}
            rows={4}
            placeholder={placeholder}
            value={values[field]}
            disabled={!canManage || isPending}
            aria-describedby={`assistant-${field}-help`}
            onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={`assistant-${field}-help`} className="text-xs text-muted-foreground">{help}</p>
            {canManage ? (
              <Button size="sm" variant="outline" disabled={isPending || values[field] === saved[field]} onClick={() => save(field)}>
                Save
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
