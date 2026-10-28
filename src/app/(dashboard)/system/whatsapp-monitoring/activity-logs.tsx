'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { JumpSection } from '@/components/settings/settings-sections-provider';
import { DisputedContactActions, PendingContactActions } from '@/app/(dashboard)/settings/whatsapp/pending-contact-actions';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SessionReset } from '@/app/(dashboard)/settings/whatsapp/session-reset';
import { IssueLinkCode, IssueSetupCode } from '@/app/(dashboard)/settings/whatsapp/issue-code';
import { PinReset } from '@/app/(dashboard)/settings/whatsapp/pin-reset';
import { consentState, formatDate, maskPhone, personName, propertyName, type Disclosure, type OptIn, type Pending, type Session } from '@/app/(dashboard)/settings/whatsapp/operations-console';

// Moved from Settings > WhatsApp (#1228): these are logs to watch, not settings.
// The opt-in CSV import stays in Settings.
export function filterOptIns(rows: OptIn[], search: string, state: string) {
  return rows.filter((row) => {
    const haystack = `${row.phone_number} ${personName(row.resident)} ${row.resident?.resident_code || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (state === 'all' || consentState(row) === state);
  });
}

export function filterDisclosureLogs(rows: Disclosure[], search: string, date: string) {
  return rows.filter((row) => {
    const haystack = `${row.phone_number} ${personName(row.resident)} ${row.resident?.resident_code || ''} ${propertyName(row.house)} ${row.menu_item}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (!date || row.created_at.startsWith(date));
  });
}

export function WhatsAppActivityLogs({ optIns, pending, sessions, disclosures }: { optIns: OptIn[]; pending: Pending[]; sessions: Session[]; disclosures: Disclosure[] }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.WHATSAPP_MANAGE);
  const [optInSearch, setOptInSearch] = useState('');
  const [optInState, setOptInState] = useState('all');
  const [disclosureSearch, setDisclosureSearch] = useState('');
  const [disclosureDate, setDisclosureDate] = useState('');
  const filteredOptIns = useMemo(() => filterOptIns(optIns, optInSearch, optInState), [optIns, optInSearch, optInState]);
  const filteredDisclosures = useMemo(() => filterDisclosureLogs(disclosures, disclosureSearch, disclosureDate), [disclosures, disclosureSearch, disclosureDate]);

  return <div className="space-y-6">
    <JumpSection id="opt-ins" title="Opt-ins"><Card><CardHeader><CardTitle>Opt-in registry</CardTitle><CardDescription>{filteredOptIns.length} of {optIns.length} consent records</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Input className="max-w-sm" placeholder="Search Resident, number, code" value={optInSearch} onChange={(event) => setOptInSearch(event.target.value)} /><select className="h-9 rounded-md border bg-background px-2 text-sm" value={optInState} onChange={(event) => setOptInState(event.target.value)}><option value="all">All consent states</option><option value="opted_in">Opted in</option><option value="opted_out">Opted out</option><option value="deactivated">Deactivated</option></select></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Resident</th><th className="pb-2 pr-4">Number</th><th className="pb-2 pr-4">Consent</th><th className="pb-2 pr-4">Opted in</th><th className="pb-2 pr-4">Updated</th>{canManage ? <th className="pb-2">Actions</th> : null}</tr></thead><tbody>{filteredOptIns.map((row) => <tr key={`${row.phone_number}-${row.resident?.resident_code}`} className="border-b last:border-0"><td className="py-3 pr-4">{personName(row.resident)}</td><td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td><td className="py-3 pr-4"><Badge variant={consentState(row) === 'opted_in' ? 'default' : 'secondary'}>{{ opted_in: 'Opted in', opted_out: 'Opted out', deactivated: 'Deactivated' }[consentState(row)]}</Badge></td><td className="py-3 pr-4 text-xs text-muted-foreground">{row.opted_in_at ? formatDate(row.opted_in_at) : '-'}</td><td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.updated_at)}</td>{canManage ? <td className="py-3"><div className="flex flex-wrap gap-2"><IssueLinkCode residentId={row.resident_id} residentName={personName(row.resident)} /><IssueSetupCode residentId={row.resident_id} residentName={personName(row.resident)} /><PinReset residentId={row.resident_id} residentName={personName(row.resident)} /></div></td> : null}</tr>)}</tbody></table></div></CardContent></Card></JumpSection>
    <JumpSection id="pending-contacts" title="Pending contacts"><Card><CardHeader><CardTitle>Pending contacts</CardTitle><CardDescription>Review unrostered numbers, and numbers whose holder said they are not the registered resident (disputed: no details shown until cleared).</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Number</th><th className="pb-2 pr-4">State</th><th className="pb-2 pr-4">First seen</th><th className="pb-2 pr-4">Last seen</th><th className="pb-2">Actions</th></tr></thead><tbody>{pending.map((row) => <tr key={row.phone_number} className="border-b last:border-0"><td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td><td className="py-3 pr-4"><Badge variant={row.status === 'disputed' ? 'destructive' : 'secondary'}>{row.status}</Badge></td><td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.first_seen_at)}</td><td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.last_seen_at)}</td><td className="py-3">{canManage && row.status === 'pending' ? <PendingContactActions phoneNumber={row.phone_number} /> : canManage && row.status === 'disputed' ? <DisputedContactActions phoneNumber={row.phone_number} /> : null}</td></tr>)}</tbody></table></div></CardContent></Card></JumpSection>
    <JumpSection id="sessions" title="Sessions"><Card><CardHeader><CardTitle>Active sessions</CardTitle><CardDescription>Inspect session state and reset a conversation when support requires it.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Resident</th><th className="pb-2 pr-4">Number</th><th className="pb-2 pr-4">Node</th><th className="pb-2 pr-4">PIN</th><th className="pb-2 pr-4">Property</th><th className="pb-2 pr-4">Expires</th>{canManage ? <th className="pb-2">Action</th> : null}</tr></thead><tbody>{sessions.map((row) => <tr key={row.phone_number} className="border-b last:border-0"><td className="py-3 pr-4">{personName(row.resident)}</td><td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td><td className="py-3 pr-4">{row.current_node}</td><td className="py-3 pr-4">{row.pin_authenticated ? 'Authenticated' : 'Not authenticated'}</td><td className="py-3 pr-4">{propertyName(row.house)}</td><td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.expires_at)}</td>{canManage ? <td className="py-3"><SessionReset phoneNumber={row.phone_number} /></td> : null}</tr>)}</tbody></table></div></CardContent></Card></JumpSection>
    <JumpSection id="disclosure-log" title="Disclosure log"><Card><CardHeader><CardTitle>Disclosure log</CardTitle><CardDescription>Financial menu access metadata only. Amounts and balances are intentionally excluded.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2"><Input className="max-w-sm" placeholder="Search Resident, number, property, menu" value={disclosureSearch} onChange={(event) => setDisclosureSearch(event.target.value)} /><Input className="w-40" type="date" aria-label="Disclosure date" value={disclosureDate} onChange={(event) => setDisclosureDate(event.target.value)} /></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Resident</th><th className="pb-2 pr-4">Number</th><th className="pb-2 pr-4">Property</th><th className="pb-2 pr-4">Menu item</th><th className="pb-2 pr-4">Channel</th><th className="pb-2">Timestamp</th></tr></thead><tbody>{filteredDisclosures.map((row) => <tr key={row.created_at + row.phone_number} className="border-b last:border-0"><td className="py-3 pr-4">{personName(row.resident)}</td><td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td><td className="py-3 pr-4">{propertyName(row.house)}</td><td className="py-3 pr-4">{row.menu_item}</td><td className="py-3 pr-4">{row.channel || 'chat'}</td><td className="py-3 text-xs text-muted-foreground">{formatDate(row.created_at)}</td></tr>)}</tbody></table></div></CardContent></Card></JumpSection>
  </div>;
}
