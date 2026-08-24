'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PendingContactActions } from '@/app/(dashboard)/settings/whatsapp/pending-contact-actions';
import { SessionReset } from '@/app/(dashboard)/settings/whatsapp/session-reset';

export type Person = { first_name: string; last_name: string; resident_code: string } | null;
export type Property = { house_number: string; street: { name: string } | null } | null;
export type OptIn = { phone_number: string; opted_in: boolean; source: string; opted_in_at: string | null; opted_out_at: string | null; updated_at: string; resident: Person };
export type Pending = { phone_number: string; status: string; source: string; first_seen_at: string; last_seen_at: string; resident: Person };
export type Session = { phone_number: string; current_node: string; pin_authenticated: boolean; selected_house_id: string | null; expires_at: string; updated_at: string; resident: Person; house: Property };
export type Disclosure = { phone_number: string; menu_item: string; pin_authenticated: boolean; created_at: string; resident: Person; house: Property };
export type Health = { inboundToday: number; outboundToday: number; deliveryFailuresToday: number; templateErrorsToday: number; capLimitEventsToday: number };

function maskPhone(phone: string) { return phone.length < 7 ? phone : `${phone.slice(0, 4)}****${phone.slice(-3)}`; }
function personName(person: Person) { return person ? `${person.first_name} ${person.last_name}` : 'Unknown'; }
function propertyName(property: Property) { return property ? `${property.house_number}${property.street ? `, ${property.street.name}` : ''}` : 'Estate-wide'; }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export function filterOptIns(rows: OptIn[], search: string, state: string) {
  return rows.filter((row) => {
    const haystack = `${row.phone_number} ${personName(row.resident)} ${row.resident?.resident_code || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (state === 'all' || (row.opted_in ? 'opted_in' : 'opted_out') === state);
  });
}

export function filterDisclosureLogs(rows: Disclosure[], search: string, date: string) {
  return rows.filter((row) => {
    const haystack = `${row.phone_number} ${personName(row.resident)} ${row.resident?.resident_code || ''} ${propertyName(row.house)} ${row.menu_item}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (!date || row.created_at.startsWith(date));
  });
}

export function OperationsConsole({ optIns, pending, sessions, disclosures, health }: { optIns: OptIn[]; pending: Pending[]; sessions: Session[]; disclosures: Disclosure[]; health: Health }) {
  const [optInSearch, setOptInSearch] = useState('');
  const [optInState, setOptInState] = useState('all');
  const [disclosureSearch, setDisclosureSearch] = useState('');
  const [disclosureDate, setDisclosureDate] = useState('');
  const filteredOptIns = useMemo(() => filterOptIns(optIns, optInSearch, optInState), [optIns, optInSearch, optInState]);
  const filteredDisclosures = useMemo(() => filterDisclosureLogs(disclosures, disclosureSearch, disclosureDate), [disclosures, disclosureSearch, disclosureDate]);

  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Bot health</CardTitle><CardDescription>Today in UTC. Counts contain no resident financial values.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">{[['Inbound', health.inboundToday], ['Outbound', health.outboundToday], ['Delivery failures', health.deliveryFailuresToday], ['Template errors', health.templateErrorsToday], ['Cap/limit events', health.capLimitEventsToday]].map(([label, value]) => <div key={label} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Opt-in registry</CardTitle><CardDescription>{filteredOptIns.length} of {optIns.length} consent records</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Input className="max-w-sm" placeholder="Search Resident, number, code" value={optInSearch} onChange={(event) => setOptInSearch(event.target.value)} /><select className="h-9 rounded-md border bg-background px-2 text-sm" value={optInState} onChange={(event) => setOptInState(event.target.value)}><option value="all">All consent states</option><option value="opted_in">Opted in</option><option value="opted_out">Opted out</option></select></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Resident</th><th className="pb-2 pr-4">Number</th><th className="pb-2 pr-4">Consent</th><th className="pb-2 pr-4">Opted in</th><th className="pb-2">Updated</th></tr></thead><tbody>{filteredOptIns.map((row) => <tr key={`${row.phone_number}-${row.resident?.resident_code}`} className="border-b last:border-0"><td className="py-3 pr-4">{personName(row.resident)}</td><td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td><td className="py-3 pr-4"><Badge variant={row.opted_in ? 'default' : 'secondary'}>{row.opted_in ? 'Opted in' : 'Opted out'}</Badge></td><td className="py-3 pr-4 text-xs text-muted-foreground">{row.opted_in_at ? formatDate(row.opted_in_at) : '-'}</td><td className="py-3 text-xs text-muted-foreground">{formatDate(row.updated_at)}</td></tr>)}</tbody></table></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Pending contacts</CardTitle><CardDescription>Review unrostered numbers without financial data.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Number</th><th className="pb-2 pr-4">State</th><th className="pb-2 pr-4">First seen</th><th className="pb-2 pr-4">Last seen</th><th className="pb-2">Actions</th></tr></thead><tbody>{pending.map((row) => <tr key={row.phone_number} className="border-b last:border-0"><td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td><td className="py-3 pr-4"><Badge variant="secondary">{row.status}</Badge></td><td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.first_seen_at)}</td><td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.last_seen_at)}</td><td className="py-3">{row.status === 'pending' ? <PendingContactActions phoneNumber={row.phone_number} /> : null}</td></tr>)}</tbody></table></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Active sessions</CardTitle><CardDescription>Inspect session state and reset a conversation when support requires it.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Resident</th><th className="pb-2 pr-4">Number</th><th className="pb-2 pr-4">Node</th><th className="pb-2 pr-4">PIN</th><th className="pb-2 pr-4">Property</th><th className="pb-2 pr-4">Expires</th><th className="pb-2">Action</th></tr></thead><tbody>{sessions.map((row) => <tr key={row.phone_number} className="border-b last:border-0"><td className="py-3 pr-4">{personName(row.resident)}</td><td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td><td className="py-3 pr-4">{row.current_node}</td><td className="py-3 pr-4">{row.pin_authenticated ? 'Authenticated' : 'Not authenticated'}</td><td className="py-3 pr-4">{propertyName(row.house)}</td><td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.expires_at)}</td><td className="py-3"><SessionReset phoneNumber={row.phone_number} /></td></tr>)}</tbody></table></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Disclosure log</CardTitle><CardDescription>Financial menu access metadata only. Amounts and balances are intentionally excluded.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Input className="max-w-sm" placeholder="Search Resident, number, property, menu" value={disclosureSearch} onChange={(event) => setDisclosureSearch(event.target.value)} /><Input className="w-40" type="date" aria-label="Disclosure date" value={disclosureDate} onChange={(event) => setDisclosureDate(event.target.value)} /></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Resident</th><th className="pb-2 pr-4">Number</th><th className="pb-2 pr-4">Property</th><th className="pb-2 pr-4">Menu item</th><th className="pb-2">Timestamp</th></tr></thead><tbody>{filteredDisclosures.map((row) => <tr key={row.created_at + row.phone_number} className="border-b last:border-0"><td className="py-3 pr-4">{personName(row.resident)}</td><td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td><td className="py-3 pr-4">{propertyName(row.house)}</td><td className="py-3 pr-4">{row.menu_item}</td><td className="py-3 text-xs text-muted-foreground">{formatDate(row.created_at)}</td></tr>)}</tbody></table></div></CardContent></Card>
  </div>;
}
