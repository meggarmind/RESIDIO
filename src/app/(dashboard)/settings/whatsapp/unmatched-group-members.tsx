'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { Button } from '@/components/ui/button';
import type { GroupMembersReport } from '@/actions/whatsapp/group-members-report';

// "dd mmm yyyy": a month name cannot be misread as day-first or month-first.
const shortDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** Resident search by the last 10 digits, which match both +234... and 0... as stored. */
export function findResidentHref(phone: string): string {
  return `/residents?search=${encodeURIComponent(phone.replace(/\D/g, '').slice(-10))}`;
}

export function UnmatchedGroupMembers({ report, error }: { report: GroupMembersReport | null; error?: string | null }) {
  const { hasPermission } = useAuth();
  const canFind = hasPermission(PERMISSIONS.RESIDENTS_VIEW);

  // Visibility follows access: the page loads this with `whatsapp.manage`, so a refusal is the reason to show.
  if (!report || !hasPermission(PERMISSIONS.WHATSAPP_MANAGE)) {
    return <p className="text-sm text-muted-foreground">{error || 'Seeing the group members that are not on record needs the manage WhatsApp permission.'}</p>;
  }
  if (!report.groupChosen) return <p className="text-sm text-muted-foreground">Choose the estate group above to see its members.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {report.matchedCount} {report.matchedCount === 1 ? 'member matches' : 'members match'} a resident record.{' '}
        {report.unmatched.length} {report.unmatched.length === 1 ? 'member does' : 'members do'} not. These numbers get no bot access until they match a record.
        Add the number as the primary or secondary phone of the resident. Numbers not matched are removed after {report.retentionDays} days.
      </p>
      {report.unmatched.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every current member matches a resident record.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Phone</th>
                <th className="py-2 pr-4 font-medium">Role in group</th>
                <th className="py-2 pr-4 font-medium">First seen</th>
                <th className="py-2 pr-4 font-medium">Last seen</th>
                <th className="py-2 font-medium"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {report.unmatched.map((member) => (
                <tr key={member.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{member.phone ?? 'Number hidden by WhatsApp'}</td>
                  <td className="py-2 pr-4 capitalize">{member.role}</td>
                  <td className="py-2 pr-4">{shortDate(member.firstSeen)}</td>
                  <td className="py-2 pr-4">{shortDate(member.lastSeen)}</td>
                  <td className="py-2 text-right">
                    {canFind && member.phone ? (
                      <Button asChild size="sm" variant="outline"><Link href={findResidentHref(member.phone)}>Find resident</Link></Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
