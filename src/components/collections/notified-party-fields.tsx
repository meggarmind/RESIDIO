'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { NotifiedPartyInput } from '@/actions/collections/collections';
import type { NotifiedChannel } from '@/lib/collections/ledger';

export const EMPTY_NOTIFIED_PARTY: NotifiedPartyInput = { name: '', email: '', sms_phone: '', whatsapp_phone: '', channels: [] };

const CHANNELS: Array<{ channel: NotifiedChannel; label: string; field: 'email' | 'sms_phone' | 'whatsapp_phone'; placeholder: string; type: string }> = [
  { channel: 'email', label: 'Email', field: 'email', placeholder: 'name@example.com', type: 'email' },
  { channel: 'whatsapp', label: 'WhatsApp', field: 'whatsapp_phone', placeholder: '0803 000 0000', type: 'tel' },
  { channel: 'sms', label: 'SMS', field: 'sms_phone', placeholder: '0803 000 0000', type: 'tel' },
];

/** Name, contacts and the channels to use for one notified party (item purchase only, owner decision 9). */
export function NotifiedPartyFields({ value, onChange, idPrefix }: {
  value: NotifiedPartyInput;
  onChange: (value: NotifiedPartyInput) => void;
  idPrefix: string;
}) {
  const channels = value.channels ?? [];
  const toggle = (channel: NotifiedChannel, on: boolean) =>
    onChange({ ...value, channels: on ? [...channels, channel] : channels.filter((c) => c !== channel) });

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input id={`${idPrefix}-name`} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Security supervisor" />
      </div>
      {CHANNELS.map(({ channel, label, field, placeholder, type }) => (
        <div key={channel} className="grid grid-cols-[auto_1fr] items-center gap-3">
          <div className="flex min-w-24 items-center gap-2">
            <Checkbox id={`${idPrefix}-${channel}`} checked={channels.includes(channel)} onCheckedChange={(checked) => toggle(channel, checked === true)} />
            <Label htmlFor={`${idPrefix}-${channel}`} className="font-normal">{label}</Label>
          </div>
          <Input
            aria-label={`${label} for the notified party`}
            type={type}
            value={(value[field] as string | null | undefined) ?? ''}
            onChange={(e) => onChange({ ...value, [field]: e.target.value })}
            placeholder={placeholder}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        The message gives the payer&apos;s name, the item, quantity, amount, date, receipt number and reference, never the payer&apos;s phone or email.
        WhatsApp reaches only a number that has opted in. SMS is not available yet.
      </p>
    </div>
  );
}
