'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Input } from '@/components/ui/input';
import { ResidentPicker } from '@/components/residents/resident-picker';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  createRecipientGroup,
  deleteRecipientGroup,
  setRecipientGroupMembers,
  updateRecipientGroup,
} from '@/actions/groups/recipient-groups';
import type { RecipientGroup } from '@/lib/groups/recipient-groups';
import type { ResidentOption } from '@/lib/residents/resident-options';

type Props = { groups: RecipientGroup[]; residentOptions: ResidentOption[]; residentOptionsError: string | null };

export function GroupsManager({ groups, residentOptions, residentOptionsError }: Props) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.GROUPS_MANAGE);
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await createRecipientGroup({ name, description });
      setMessage(result.error || 'Group created');
      if (!result.error) {
        setName('');
        setDescription('');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>New group</CardTitle>
            <CardDescription>Members are residents. Add them after the group is created.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input aria-label="Group name" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} className="sm:max-w-xs" />
            <Input aria-label="Group description" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Button type="button" size="sm" disabled={isPending || !name.trim()} onClick={create}>Create group</Button>
          </CardContent>
          {message && <p className="px-6 pb-4 text-xs text-muted-foreground">{message}</p>}
        </Card>
      )}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No groups yet.</p>
      ) : (
        groups.map((group) => (
          // Keyed on the saved state so router.refresh() remounts the card with fresh server data.
          <GroupCard key={`${group.id}:${group.name}:${group.description}:${group.members.map((m) => m.residentId).join(',')}`} group={group} canManage={canManage} residentOptions={residentOptions} residentOptionsError={residentOptionsError} />
        ))
      )}
    </div>
  );
}

function GroupCard({ group, canManage, residentOptions, residentOptionsError }: {
  group: RecipientGroup;
  canManage: boolean;
  residentOptions: ResidentOption[];
  residentOptionsError: string | null;
}) {
  const router = useRouter();
  const savedIds = group.members.map((member) => member.residentId);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [memberIds, setMemberIds] = useState(savedIds);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const savedKey = savedIds.join(',');
  const warnings = Object.fromEntries(group.members.flatMap((member) => (member.warning ? [[member.residentId, member.warning]] : [])));
  const detailsChanged = name.trim() !== group.name || (description.trim() || null) !== (group.description ?? null);
  const membersChanged = memberIds.join(',') !== savedKey;

  function run(action: () => Promise<{ error: string | null }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.error || done);
      if (!result.error) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />{group.name}</CardTitle>
          {group.description && <CardDescription>{group.description}</CardDescription>}
          {group.usedBy.length > 0 && <p className="text-xs text-muted-foreground">Used by: {group.usedBy.join(', ')}</p>}
        </div>
        {canManage && (
          <ConfirmAction
            trigger={<Button type="button" size="sm" variant="outline" disabled={isPending} aria-label={`Delete ${group.name}`}><Trash2 className="h-4 w-4" /></Button>}
            title={`Delete ${group.name}?`}
            description={group.usedBy.length > 0
              ? `Used by: ${group.usedBy.join(', ')}. Select another group there before deleting this one.`
              : 'The group and its member list are removed. Residents are not affected.'}
            confirmLabel="Delete group"
            destructive
            onConfirm={() => run(() => deleteRecipientGroup(group.id), 'Group deleted')}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input aria-label={`Name of ${group.name}`} value={name} onChange={(e) => setName(e.target.value)} className="sm:max-w-xs" />
            <Input aria-label={`Description of ${group.name}`} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Button type="button" size="sm" variant="outline" disabled={isPending || !detailsChanged || !name.trim()} onClick={() => run(() => updateRecipientGroup(group.id, { name, description }), 'Group renamed')}>Save name</Button>
          </div>
        )}
        <div className="space-y-2">
          <span className="text-sm text-muted-foreground">Members ({group.members.length})</span>
          <ResidentPicker options={residentOptions} value={memberIds} onChange={setMemberIds} disabled={!canManage} error={residentOptionsError} triggerLabel="Add members" warnings={warnings} />
          {group.members.some((member) => member.inactive) && (
            <p className="text-xs text-muted-foreground">Moved-out and deactivated members stay listed but are skipped when sending.</p>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" disabled={isPending || !membersChanged} onClick={() => run(() => setRecipientGroupMembers(group.id, memberIds), 'Members saved')}>Save members</Button>
            {message && <span className="text-xs text-muted-foreground">{message}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
