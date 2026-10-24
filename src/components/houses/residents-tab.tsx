'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Can, useCan } from '@/components/auth/can';
import { LinkResidentDialog } from '@/components/houses/link-resident-dialog';
import { TransferOwnershipDialog } from '@/components/houses/transfer-ownership-dialog';
import { ResidentRow, type ResidentAction } from '@/components/houses/resident-row';
import { useUnassignHouse, useUpdateResidentHouse, useSwapResidentRoles, useRemoveOwnership } from '@/hooks/use-residents';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { requiresSponsor, sponsorRolesFor, describeSponsorRoles } from '@/lib/validators/resident';
import { SECONDARY_ROLE_OPTIONS, RESIDENT_ROLE_LABELS } from '@/types/database';
import type { HouseWithResidents, ResidentRole } from '@/types/database';
import { AlertTriangle, Loader2, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';

// Both wizards pull in @react-pdf/renderer and only render after a click, so keep
// them out of this page's initial bundle (#464).
const MoveOutWizard = dynamic(
  () => import('@/components/residents/move-out-wizard').then((m) => ({ default: m.MoveOutWizard })),
  { ssr: false }
);
const OwnerMoveOutWizard = dynamic(
  () => import('@/components/residents/owner-move-out-wizard').then((m) => ({ default: m.OwnerMoveOutWizard })),
  { ssr: false }
);

export type ActiveResidentHouse = HouseWithResidents['resident_houses'][number];

const SECONDARY_ROLES = ['co_resident', 'household_member', 'domestic_staff', 'caretaker'];
const SPONSOR_ROLES = ['non_resident_landlord', 'resident_landlord', 'tenant'];
const targetClass = 'min-h-11 md:min-h-0 md:h-8';

interface ResidentsTabProps {
  house: HouseWithResidents;
  activeResidents: ActiveResidentHouse[];
}

export function ResidentsTab({ house, activeResidents }: ResidentsTabProps) {
  const houseId = house.id;
  const canAssignResident = useCan(PERMISSIONS.HOUSES_ASSIGN_RESIDENT);
  const canUpdateHouse = useCan(PERMISSIONS.HOUSES_UPDATE);
  const unassignMutation = useUnassignHouse();
  const swapRolesMutation = useSwapResidentRoles();
  const removeOwnershipMutation = useRemoveOwnership();

  // Which row action is open, and for whom. Form state lives in the dialog components.
  const [open, setOpen] = useState<{ action: ResidentAction; rh: ActiveResidentHouse } | null>(null);
  const close = () => setOpen(null);
  const target = open
    ? {
        id: open.rh.resident.id,
        name: `${open.rh.resident.first_name} ${open.rh.resident.last_name}`,
        role: open.rh.resident_role as ResidentRole,
      }
    : null;
  const isOpen = (action: ResidentAction) => open?.action === action;

  // The tenant or owner-occupier an Occupant swaps roles with on Promote.
  const primaryResidingResident = activeResidents.find(
    (rh) => rh.resident_role === 'tenant' || rh.resident_role === 'resident_landlord'
  );
  const secondaryResidents = activeResidents.filter((rh) => SECONDARY_ROLES.includes(rh.resident_role));
  const houseAddress = `${house.short_name || house.house_number}, ${house.street?.name || ''}`;

  const handleRemoveResident = async () => {
    if (!target) return;
    try {
      const result = await unassignMutation.mutateAsync({ residentId: target.id, houseId });
      const cascadeCount = result.cascadeRemovedCount;
      toast.success(
        cascadeCount && cascadeCount > 0
          ? `Resident removed along with ${cascadeCount} secondary resident(s)`
          : 'Resident removed successfully'
      );
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove resident');
    }
  };

  const handlePromote = async () => {
    if (!target) return;
    if (!primaryResidingResident) {
      toast.error('No primary residing resident to swap with');
      return;
    }
    try {
      await swapRolesMutation.mutateAsync({
        houseId,
        promoteResidentId: target.id,
        demoteResidentId: primaryResidingResident.resident.id,
      });
      toast.success(`Resident promoted to ${RESIDENT_ROLE_LABELS[primaryResidingResident.resident_role as ResidentRole]}`);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to promote resident');
    }
  };

  const handleRemoveOwnership = async () => {
    if (!target) return;
    try {
      await removeOwnershipMutation.mutateAsync({ houseId, ownerId: target.id });
      toast.success('Ownership removed successfully. House is now vacant.');
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove ownership');
    }
  };

  const removeCascades = target?.role === 'tenant' && secondaryResidents.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Residents ({activeResidents.length})
              </CardTitle>
              <CardDescription>People currently assigned to this property</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Can permission={PERMISSIONS.HOUSES_ASSIGN_RESIDENT}>
                <LinkResidentDialog houseId={houseId} activeResidents={activeResidents} triggerClassName={targetClass} />
              </Can>
              <Can permission={PERMISSIONS.RESIDENTS_CREATE}>
                <Button size="sm" variant="outline" asChild className={targetClass}>
                  <Link href={`/residents/new?house_id=${houseId}`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add New
                  </Link>
                </Button>
              </Can>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeResidents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No residents assigned</p>
          ) : (
            <div className="space-y-4">
              {activeResidents.map((rh) => (
                <ResidentRow
                  key={rh.id}
                  rh={rh}
                  canAssignResident={canAssignResident}
                  canUpdateHouse={canUpdateHouse}
                  canPromote={!!primaryResidingResident}
                  onAction={(action, row) => setOpen({ action, rh: row })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove Resident Confirmation Dialog */}
      <AlertDialog open={isOpen('remove')} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {removeCascades && <AlertTriangle className="h-5 w-5 text-amber-500" />}
              Remove Resident
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {removeCascades ? (
                  <>
                    <span className="block mb-3">
                      Removing <strong>{target?.name}</strong> (Renter) will also remove
                      the following <strong>{secondaryResidents.length}</strong> secondary resident(s):
                    </span>
                    <ul className="list-disc list-inside mb-3 text-sm">
                      {secondaryResidents.map((sr) => (
                        <li key={sr.id}>
                          {sr.resident.first_name} {sr.resident.last_name} ({RESIDENT_ROLE_LABELS[sr.resident_role as ResidentRole]})
                        </li>
                      ))}
                    </ul>
                    <span className="block">This action cannot be undone.</span>
                  </>
                ) : (
                  <>
                    Are you sure you want to remove <strong>{target?.name}</strong> from this house?
                    This action cannot be undone.
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveResident}
              disabled={unassignMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unassignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {removeCascades ? `Remove All (${secondaryResidents.length + 1})` : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isOpen('edit') && open && (
        <EditAssignmentDialog
          houseId={houseId}
          rh={open.rh}
          sponsors={activeResidents.filter((rh) => SPONSOR_ROLES.includes(rh.resident_role))}
          onClose={close}
        />
      )}

      {/* Promote Resident Confirmation Dialog */}
      <AlertDialog open={isOpen('promote')} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote Resident</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {primaryResidingResident && (
                  <>
                    <p className="mb-3">
                      Promote <strong>{target?.name}</strong> to{' '}
                      <strong>{RESIDENT_ROLE_LABELS[primaryResidingResident.resident_role as ResidentRole]}</strong>?
                    </p>
                    <p className="mb-3">
                      <strong>{primaryResidingResident.resident.first_name} {primaryResidingResident.resident.last_name}</strong>{' '}
                      will be demoted to <strong>Occupant</strong>.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      This is a role swap - both residents will remain at this house with their roles exchanged.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromote} disabled={swapRolesMutation.isPending}>
              {swapRolesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Promote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TransferOwnershipDialog
        key={isOpen('transfer') ? target?.id : 'closed'}
        houseId={houseId}
        owner={isOpen('transfer') ? target : null}
        onClose={close}
      />

      {/* Remove Ownership Confirmation Dialog */}
      <AlertDialog open={isOpen('remove-ownership')} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove Ownership
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-3">
                  Are you sure you want to remove <strong>{target?.name}</strong> as the{' '}
                  {target?.role && RESIDENT_ROLE_LABELS[target.role]}?
                </p>
                <p className="text-amber-600 dark:text-amber-400">
                  This will make the house completely vacant with no owner assigned.
                  Any secondary residents will also be removed.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveOwnership}
              disabled={removeOwnershipMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeOwnershipMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove Ownership
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Out Wizard for Renters */}
      {isOpen('tenant-move-out') && target && (
        <MoveOutWizard
          open
          onOpenChange={(next) => !next && close()}
          residentId={target.id}
          residentName={target.name}
          houseId={houseId}
          houseAddress={houseAddress}
          isSelfService={false}
        />
      )}

      {/* Owner Move Out Wizard for Owner-Occupiers */}
      {isOpen('owner-move-out') && target && (
        <OwnerMoveOutWizard
          open
          onOpenChange={(next) => !next && close()}
          residentId={target.id}
          residentName={target.name}
          houseId={houseId}
          houseAddress={houseAddress}
          secondaryResidentCount={secondaryResidents.length}
          isSelfService={false}
        />
      )}
    </>
  );
}

interface EditAssignmentDialogProps {
  houseId: string;
  rh: ActiveResidentHouse;
  sponsors: ActiveResidentHouse[];
  onClose: () => void;
}

function EditAssignmentDialog({ houseId, rh, sponsors, onClose }: EditAssignmentDialogProps) {
  const currentRole = rh.resident_role as ResidentRole;
  const [editRole, setEditRole] = useState<ResidentRole>(currentRole);
  const [editSponsorId, setEditSponsorId] = useState(rh.sponsor_resident_id || '');
  const updateMutation = useUpdateResidentHouse();
  const availableSponsors = requiresSponsor(editRole)
    ? sponsors.filter((s) => sponsorRolesFor(editRole).includes(s.resident_role as ResidentRole)).map((s) => s.resident)
    : [];
  // An occupant (co_resident) defaults to the house's resident as sponsor (#1067); a house has at most one
  const effectiveSponsorId = availableSponsors.some((s) => s.id === editSponsorId)
    ? editSponsorId
    : editRole === 'co_resident' && availableSponsors.length === 1 ? availableSponsors[0].id : '';

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        residentId: rh.resident.id,
        houseId,
        data: {
          resident_role: editRole !== currentRole ? editRole : undefined,
          sponsor_resident_id: requiresSponsor(editRole) ? effectiveSponsorId : null,
        },
      });
      toast.success('Resident assignment updated');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update resident assignment');
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Resident Assignment</DialogTitle>
          <DialogDescription>
            Update assignment details for {rh.resident.first_name} {rh.resident.last_name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select
              value={editRole}
              onValueChange={(v) => {
                setEditRole(v as ResidentRole);
                // Reset sponsor if new role doesn't require one
                if (!requiresSponsor(v as ResidentRole)) setEditSponsorId('');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {SECONDARY_ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {requiresSponsor(editRole) && (
            <div className="grid gap-2">
              <Label>Sponsor *</Label>
              <Select value={effectiveSponsorId} onValueChange={setEditSponsorId} disabled={availableSponsors.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={availableSponsors.length === 0 ? 'No sponsors available' : 'Select a sponsor'} />
                </SelectTrigger>
                <SelectContent>
                  {availableSponsors.map((sponsor) => (
                    <SelectItem key={sponsor.id} value={sponsor.id}>
                      {sponsor.first_name} {sponsor.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {RESIDENT_ROLE_LABELS[editRole]} must be sponsored by the {describeSponsorRoles(editRole)} of this house
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending || (requiresSponsor(editRole) && !effectiveSponsorId)}>
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
