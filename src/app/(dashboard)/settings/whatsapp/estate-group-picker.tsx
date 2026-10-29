'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { listEstateGroups, saveEstateGroup, type EstateGroupSelection } from '@/actions/whatsapp/estate-group';
import type { WahaGroup } from '@/lib/whatsapp/providers/waha';

export function EstateGroupPicker({ initial, error }: { initial: EstateGroupSelection | null; error?: string | null }) {
  const [groups, setGroups] = useState<WahaGroup[] | null>(null);
  const [saved, setSaved] = useState(initial?.groupId ?? '');
  const [selected, setSelected] = useState(initial?.groupId ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Visibility follows access: the page loads this with `whatsapp.manage`, so a refusal is the reason to show.
  if (!initial) return <p className="text-sm text-muted-foreground">{error || 'Managing the estate group needs the manage WhatsApp permission.'}</p>;
  if (!initial.wahaActive) return <p className="text-sm text-muted-foreground">The estate group needs WAHA as the active WhatsApp provider.</p>;

  function load() {
    startTransition(async () => {
      const result = await listEstateGroups();
      setGroups(result.data);
      setMessage(result.error);
    });
  }

  function save() {
    startTransition(async () => {
      const result = await saveEstateGroup(selected);
      if (!result.error) setSaved(selected);
      setMessage(result.error || 'Estate group saved');
    });
  }

  // A saved group the list does not show (not loaded yet) stays selectable by its id.
  const options = groups ?? (saved ? [{ id: saved, name: saved }] : []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">The WhatsApp group whose members are kept in sync with WAHA. Pick the bot&apos;s own estate group.</p>
      <div className="flex flex-wrap items-center gap-3">
        <select value={selected} onChange={(event) => setSelected(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" aria-label="Estate group">
          <option value="">No group chosen</option>
          {options.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={load}>Load groups</Button>
        <Button type="button" size="sm" disabled={isPending || selected === saved} onClick={save}>Save estate group</Button>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
