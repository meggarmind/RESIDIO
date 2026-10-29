'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  linkWhatsAppAdminNumber,
  setWhatsAppAdminCodeRequired,
  setWhatsAppAdminGlobalCodeRequired,
  unlinkWhatsAppAdminBinding,
} from '@/actions/whatsapp/admin-settings';
import { unlinkMyWhatsAppAdminNumber } from '@/actions/whatsapp/admin-access';
import { filterWhatsAppAdminRows, type WhatsAppAdminCandidate, type WhatsAppAdminFilter, type WhatsAppAdminRow } from '@/lib/whatsapp/admin-settings';

function formatDay(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)) : 'Never';
}

/**
 * Linked WhatsApp admins as a table (#1295), in the pilot table's layout: search, filter, badges.
 * A role manager sees every admin and can link, unlink and set the code switches; anyone else sees
 * only their own row and can unlink it.
 */
export function AdminsTable({ rows, candidates, canManage, viewerProfileId, globalCodeRequired }: {
  rows: WhatsAppAdminRow[];
  candidates: WhatsAppAdminCandidate[];
  canManage: boolean;
  viewerProfileId: string;
  globalCodeRequired: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<WhatsAppAdminFilter>('all');
  const [linking, setLinking] = useState(false);
  const [profileId, setProfileId] = useState('');
  const [phone, setPhone] = useState('');
  const [codeRequired, setCodeRequired] = useState(true);
  const [isPending, startTransition] = useTransition();
  const visible = useMemo(() => filterWhatsAppAdminRows(rows, search, filter), [rows, search, filter]);

  const run = (task: () => Promise<{ success: boolean; error: string | null }>, done: string, after?: () => void) =>
    startTransition(async () => {
      const result = await task();
      if (!result.success) toast.error(result.error || 'Something went wrong');
      else {
        toast.success(done);
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="text-sm">
          <div className="font-medium">Code required</div>
          <div className="text-xs text-muted-foreground">
            Off: no admin needs an authenticator code. On: a code is needed unless the admin&apos;s own switch is off.
          </div>
        </div>
        <Switch
          checked={globalCodeRequired}
          disabled={!canManage || isPending}
          aria-label="Code required for all admins"
          onCheckedChange={(value) => run(() => setWhatsAppAdminGlobalCodeRequired(value), value ? 'Code now required' : 'Code no longer required')}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, role or number" aria-label="Search linked admins" className="sm:max-w-xs" />
        <select value={filter} onChange={(event) => setFilter(event.target.value as WhatsAppAdminFilter)} aria-label="Filter linked admins" className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="all">All</option>
          <option value="code_off">Code off</option>
          <option value="ending">Link needs attention</option>
        </select>
        {canManage && (
          <Button type="button" size="sm" className="sm:ml-auto" onClick={() => setLinking(true)} disabled={candidates.length === 0}>
            Link a number for an admin
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Linked since</th>
              <th className="px-3 py-2">Link ends</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Code required</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-4 text-muted-foreground">{rows.length === 0 ? 'No WhatsApp number is linked.' : 'No linked admins match the search.'}</td></tr>
            ) : visible.map((row) => (
              <tr key={row.bindingId} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">{row.roleName}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.maskedNumber}</td>
                <td className="px-3 py-2">{formatDay(row.boundAt)}</td>
                <td className="px-3 py-2">{formatDay(row.endsAt)}</td>
                <td className="px-3 py-2">{formatDay(row.lastUsedAt)}</td>
                <td className="px-3 py-2">
                  <Switch
                    checked={row.codeRequired}
                    disabled={!canManage || isPending}
                    aria-label={`Code required for ${row.name}`}
                    onCheckedChange={(value) => run(() => setWhatsAppAdminCodeRequired(row.bindingId, value), `Code ${value ? 'required' : 'not required'} for ${row.name}`)}
                  />
                </td>
                <td className="px-3 py-2">
                  <Badge variant={row.status === 'active' ? 'success' : 'warning'}>{row.status === 'active' ? 'Active' : 'Needs attention'}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  {(canManage || row.profileId === viewerProfileId) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      aria-label={`Unlink ${row.name}`}
                      onClick={() => run(
                        () => (row.profileId === viewerProfileId ? unlinkMyWhatsAppAdminNumber() : unlinkWhatsAppAdminBinding(row.bindingId)),
                        'WhatsApp number unlinked'
                      )}
                    >
                      Unlink
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link a number for an admin</DialogTitle>
            <DialogDescription>The link is active at once. The admin gets an email saying a number was linked.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-muted-foreground">Admin account</span>
              <select value={profileId} onChange={(event) => setProfileId(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3">
                <option value="">Choose an admin</option>
                {candidates.map((candidate) => <option key={candidate.profileId} value={candidate.profileId}>{candidate.name} ({candidate.roleName})</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-muted-foreground">WhatsApp number</span>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="08012345678" inputMode="tel" />
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={codeRequired} onCheckedChange={(value) => setCodeRequired(value === true)} aria-label="Code required for this admin" />
              <span>Code required for this admin</span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinking(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={isPending || !profileId || !phone.trim()}
              onClick={() => run(
                () => linkWhatsAppAdminNumber({ profileId, phone, codeRequired }),
                'WhatsApp number linked',
                () => { setLinking(false); setProfileId(''); setPhone(''); setCodeRequired(true); }
              )}
            >
              Link number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
