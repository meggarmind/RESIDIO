'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResidentPicker } from '@/components/residents/resident-picker';
import { pilotMembers, rosterToOptions, type PilotOptInState, type PilotRosterResident, type PilotRosterStreet } from '@/lib/whatsapp/pilot-roster';

type Filter = 'all' | 'by_name' | 'by_street' | 'not_opted_in';

const CONSENT: Record<PilotOptInState, { label: string; variant: 'success' | 'secondary' | 'warning' | 'outline' }> = {
  opted_in: { label: 'Opted in', variant: 'success' },
  opted_out: { label: 'Opted out', variant: 'warning' },
  deactivated: { label: 'Deactivated', variant: 'secondary' },
  none: { label: 'No consent', variant: 'outline' },
};

/**
 * The pilot list as a table (#801): who the pilot bot answers, their house, role and WhatsApp
 * consent, with search, a filter, add and remove. Changes stay local until the parent saves.
 */
export function PilotResidentsTable({ roster, streets, error, residentIds, onResidentIdsChange, streetId, onStreetIdChange, disabled }: {
  roster: PilotRosterResident[];
  streets: PilotRosterStreet[];
  error?: string | null;
  residentIds: string[];
  onResidentIdsChange: (residentIds: string[]) => void;
  streetId: string;
  onStreetIdChange: (streetId: string) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const options = useMemo(() => rosterToOptions(roster), [roster]);
  const members = useMemo(() => pilotMembers(roster, residentIds, streetId), [roster, residentIds, streetId]);
  const streetName = streets.find((street) => street.id === streetId)?.name;
  const optedIn = members.filter((member) => member.resident?.optIn === 'opted_in').length;
  const byStreetCount = members.filter((member) => member.byStreet && !member.byName).length;

  const term = search.trim().toLowerCase();
  const visible = members.filter((member) => {
    if (filter === 'by_name' && !member.byName) return false;
    if (filter === 'by_street' && !member.byStreet) return false;
    if (filter === 'not_opted_in' && member.resident?.optIn === 'opted_in') return false;
    if (!term) return true;
    const resident = member.resident;
    const haystack = resident
      ? `${resident.name} ${resident.code} ${resident.houses.map((house) => `${house.label} ${house.role}`).join(' ')}`
      : member.id;
    return haystack.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm sm:max-w-sm">
        <span className="text-muted-foreground">Pilot street</span>
        <select value={streetId} onChange={(event) => onStreetIdChange(event.target.value)} disabled={disabled} className="h-9 w-full rounded-md border bg-background px-3">
          <option value="">No pilot street</option>
          {streetId && !streetName ? <option value={streetId}>Unknown street ({streetId.slice(0, 8)})</option> : null}
          {streets.map((street) => <option key={street.id} value={street.id}>{street.name}</option>)}
        </select>
        <span className="block text-xs text-muted-foreground">Everyone with an active house on this street is in the pilot.</span>
      </label>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">Pilot residents</span>
          <span className="text-xs text-muted-foreground" data-testid="pilot-summary">
            {members.length} in pilot: {residentIds.length} chosen by name{streetName ? `, ${byStreetCount} more from ${streetName}` : ''}. {optedIn} opted in.
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, code, house or role" aria-label="Search pilot residents" className="sm:max-w-xs" />
          <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="Filter pilot residents" className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="all">All</option>
            <option value="by_name">Chosen by name</option>
            <option value="by_street">From pilot street</option>
            <option value="not_opted_in">Not opted in</option>
          </select>
          <div className="sm:ml-auto">
            <ResidentPicker options={options} value={residentIds} onChange={onResidentIdsChange} disabled={disabled} error={error} triggerLabel="Add pilot residents" hideSelected />
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2">Resident</th>
                <th className="px-3 py-2">House and role</th>
                <th className="px-3 py-2">WhatsApp</th>
                <th className="px-3 py-2">Consent</th>
                <th className="px-3 py-2">In pilot by</th>
                <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">{members.length === 0 ? 'No pilot residents yet. Add residents or choose a pilot street.' : 'No pilot residents match the search.'}</td></tr>
              ) : visible.map(({ id, resident, byName, byStreet }) => {
                const name = resident?.name ?? `Unknown resident (${id.slice(0, 8)})`;
                const consent = CONSENT[resident?.optIn ?? 'none'];
                return (
                  <tr key={id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{name}</div>
                      {resident?.code ? <div className="text-xs text-muted-foreground">{resident.code}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      {resident && resident.houses.length > 0
                        ? resident.houses.map((house, index) => <div key={index}>{house.label}{house.role ? <span className="text-muted-foreground"> · {house.role}</span> : null}</div>)
                        : <span className="text-muted-foreground">No active house</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{resident?.phone ?? '-'}</td>
                    <td className="px-3 py-2"><Badge variant={consent.variant}>{consent.label}</Badge></td>
                    <td className="px-3 py-2 text-xs">{[byName ? 'Name' : null, byStreet ? 'Street' : null].filter(Boolean).join(' + ')}</td>
                    <td className="px-3 py-2 text-right">
                      {byName && !disabled ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => onResidentIdsChange(residentIds.filter((value) => value !== id))} aria-label={`Remove ${name}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {byStreetCount > 0 ? <p className="text-xs text-muted-foreground">To remove a street member, change the pilot street.</p> : null}
      </div>
    </div>
  );
}
