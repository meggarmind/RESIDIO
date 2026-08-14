'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { importWhatsAppOptIns } from '@/actions/whatsapp/identity';

export function OptInImport() {
  const [value, setValue] = useState('resident_code,phone_number\n');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await importWhatsAppOptIns(value);
      setMessage(result.data
        ? `${result.data.imported} imported, ${result.data.duplicates} duplicate(s), ${result.data.errors.length} error(s)`
        : result.error);
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={4}
        aria-label="WhatsApp opt-in import rows"
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={isPending || !value.trim()} onClick={submit}>
          Import opt-ins
        </Button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}
