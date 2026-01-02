'use client';

import { use, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HouseForm } from '@/components/houses/house-form';
import { HousePaymentStatus } from '@/components/houses/house-payment-status';
import { OccupancyBadge, AccountStatusBadge, ResidentRoleBadge } from '@/components/residents/status-badge';
import { useHouse, useDeleteHouse, useOwnershipHistory } from '@/hooks/use-houses';
import { useResidents, useAssignHouse, useUnassignHouse, useMoveOutLandlord, useUpdateResidentHouse, useSwapResidentRoles, useTransferOwnership, useRemoveOwnership } from '@/hooks/use-residents';
import { Home, Pencil, Trash2, Users, ArrowLeft, Plus, Link2, Loader2, DoorOpen, AlertTriangle, SquarePen, ArrowUp, ArrowRightLeft, History, Calendar, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import type { ResidentRole, ResidentHouse, Resident } from '@/types/database';
import { PRIMARY_ROLE_OPTIONS, SECONDARY_ROLE_OPTIONS, RESIDENT_ROLE_LABELS } from '@/types/database';
import { requiresSponsor } from '@/lib/validators/resident';

// House state for Add New form context
type HouseState = 'empty' | 'has_tenant' | 'has_resident_landlord' | 'has_non_resident_landlord';

interface HouseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function HouseDetailPage({ params }: HouseDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === 'true';

  // Link Existing Resident dialog state
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [selectedResidentId, setSelectedResidentId] = useState('');
  const [selectedRole, setSelectedRole] = useState<ResidentRole>('resident_landlord');
  const [moveInDate, setMoveInDate] = useState(new Date().toISOString().split('T')[0]);
  const [sponsorResidentId, setSponsorResidentId] = useState('');

  // Remove/MoveOut dialog state
  const [removeDialogResident, setRemoveDialogResident] = useState<{
    id: string;
    name: string;
    role: ResidentRole;
  } | null>(null);
  const [moveOutDialogResident, setMoveOutDialogResident] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Edit dialog state
  const [editDialogResident, setEditDialogResident] = useState<{
    id: string;
    name: string;
    role: ResidentRole;
    sponsorId: string | null;
  } | null>(null);
  const [editRole, setEditRole] = useState<ResidentRole>('co_resident');
  const [editSponsorId, setEditSponsorId] = useState('');

  // Promote dialog state
  const [promoteDialogResident, setPromoteDialogResident] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Transfer ownership dialog state
  const [transferDialogOwner, setTransferDialogOwner] = useState<{
    id: string;
    name: string;
    role: ResidentRole;
  } | null>(null);
  const [transferNewOwnerId, setTransferNewOwnerId] = useState('');
  const [transferNewOwnerRole, setTransferNewOwnerRole] = useState<'non_resident_landlord' | 'developer'>('non_resident_landlord');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferNotes, setTransferNotes] = useState('');

  // Remove ownership dialog state
  const [removeOwnershipDialogOwner, setRemoveOwnershipDialogOwner] = useState<{
    id: string;
    name: string;
    role: ResidentRole;
  } | null>(null);

  const { data: house, isLoading, error } = useHouse(id);
  // Reduced limit for performance - consider async search for large estates
  const { data: residentsData, isLoading: residentsLoading } = useResidents({ limit: 500 });
  const deleteMutation = useDeleteHouse();
  const assignMutation = useAssignHouse();
  const unassignMutation = useUnassignHouse();
  const moveOutMutation = useMoveOutLandlord();
  const updateResidentHouseMutation = useUpdateResidentHouse();
  const swapRolesMutation = useSwapResidentRoles();
  const transferOwnershipMutation = useTransferOwnership();
  const removeOwnershipMutation = useRemoveOwnership();
  const { data: ownershipHistory, isLoading: historyLoading } = useOwnershipHistory(id);

  // Compute derived values - MUST be before any conditional returns (React Rules of Hooks)
  const activeResidents = house?.resident_houses?.filter(rh => rh.is_active) ?? [];
  const linkedResidentIds = useMemo(() => new Set(activeResidents.map(rh => rh.resident.id)), [activeResidents]);

  // Validation 1: Check if a landlord (resident or non-resident) already exists
  const hasLandlord = useMemo(() => {
    return activeResidents.some(rh =>
      rh.resident_role === 'resident_landlord' || rh.resident_role === 'non_resident_landlord'
    );
  }, [activeResidents]);

  // Validation 2: Check if house has any primary resident
  const hasPrimaryResident = useMemo(() => {
    return activeResidents.some(rh =>
      ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'].includes(rh.resident_role)
    );
  }, [activeResidents]);

  // Validation 3: Check if resident landlord exists specifically
  const hasResidentLandlord = useMemo(() => {
    return activeResidents.some(rh => rh.resident_role === 'resident_landlord');
  }, [activeResidents]);

  // Validation 4: Check if tenant exists
  const hasTenant = useMemo(() => {
    return activeResidents.some(rh => rh.resident_role === 'tenant');
  }, [activeResidents]);

  // Check if resident landlord or tenant exists (for hiding move-in date)
  const hasResidentLandlordOrTenant = hasResidentLandlord || hasTenant;

  // Get the primary residing resident (tenant or resident_landlord) for promote functionality
  const primaryResidingResident = useMemo(() => {
    return activeResidents.find(rh =>
      rh.resident_role === 'tenant' || rh.resident_role === 'resident_landlord'
    );
  }, [activeResidents]);

  // Determine house state for Add New form
  const houseState: HouseState = useMemo(() => {
    if (activeResidents.length === 0) return 'empty';
    if (hasResidentLandlord) return 'has_resident_landlord';
    if (hasTenant) return 'has_tenant';
    if (hasLandlord) return 'has_non_resident_landlord';
    return 'empty';
  }, [activeResidents.length, hasResidentLandlord, hasTenant, hasLandlord]);

  // Filter role options based on house state
  const filteredRoleOptions = useMemo(() => {
    // If resident_landlord exists, only secondary roles are allowed
    if (hasResidentLandlord) {
      return SECONDARY_ROLE_OPTIONS;
    }
    // If tenant exists, only secondary roles are allowed
    if (hasTenant) {
      return SECONDARY_ROLE_OPTIONS;
    }
    // If any landlord exists (non_resident), exclude landlord roles from primary options
    if (hasLandlord) {
      return PRIMARY_ROLE_OPTIONS.filter(role =>
        role.value !== 'resident_landlord' && role.value !== 'non_resident_landlord'
      );
    }
    return PRIMARY_ROLE_OPTIONS;
  }, [hasLandlord, hasResidentLandlord, hasTenant]);

  // Filter available residents (not already linked to this house)
  // If primary resident exists, exclude residents who are already tenants elsewhere
  const availableResidents = useMemo(() => {
    const baseList = (residentsData?.data ?? []).filter(r => !linkedResidentIds.has(r.id));

    if (hasPrimaryResident) {
      // Filter out residents who are already tenants in another house
      return baseList.filter(r => {
        const hasTenantRoleElsewhere = r.resident_houses?.some(
          rh => rh.is_active && rh.resident_role === 'tenant'
        );
        return !hasTenantRoleElsewhere;
      });
    }

    return baseList;
  }, [residentsData?.data, linkedResidentIds, hasPrimaryResident]);

  // Get sponsors (primary residents of this house) for domestic_staff and caretaker
  const availableSponsors = useMemo(() => {
    if (!requiresSponsor(selectedRole)) return [];
    return activeResidents
      .filter(rh => ['non_resident_landlord', 'resident_landlord', 'tenant'].includes(rh.resident_role))
      .map(rh => rh.resident);
  }, [activeResidents, selectedRole]);

  // Count secondary residents (for cascade removal warning)
  const secondaryResidents = useMemo(() => {
    return activeResidents.filter(rh =>
      ['co_resident', 'household_member', 'domestic_staff', 'caretaker'].includes(rh.resident_role)
    );
  }, [activeResidents]);

  // Handle removing a resident
  const handleRemoveResident = async (residentId: string, residentRole: ResidentRole) => {
    try {
      const result = await unassignMutation.mutateAsync({
        residentId,
        houseId: id,
      });
      const cascadeCount = result.cascadeRemovedCount;
      if (cascadeCount && cascadeCount > 0) {
        toast.success(`Resident removed along with ${cascadeCount} secondary resident(s)`);
      } else {
        toast.success('Resident removed successfully');
      }
      setRemoveDialogResident(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove resident');
    }
  };

  // Handle moving out resident landlord (converts to non-resident landlord)
  const handleMoveOutLandlord = async (residentId: string) => {
    try {
      const result = await moveOutMutation.mutateAsync({
        residentId,
        houseId: id,
      });
      const movedOut = result.movedOutResidents;
      if (movedOut && movedOut > 0) {
        toast.success(`Resident Landlord converted to Non-Resident Landlord. ${movedOut} secondary resident(s) also removed.`);
      } else {
        toast.success('Resident Landlord converted to Non-Resident Landlord');
      }
      setMoveOutDialogResident(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to move out landlord');
    }
  };

  // Handle opening edit dialog
  const handleOpenEditDialog = (rh: {
    resident: { id: string; first_name: string; last_name: string };
    resident_role: string;
    sponsor_resident_id: string | null;
  }) => {
    const role = rh.resident_role as ResidentRole;
    setEditDialogResident({
      id: rh.resident.id,
      name: `${rh.resident.first_name} ${rh.resident.last_name}`,
      role,
      sponsorId: rh.sponsor_resident_id,
    });
    setEditRole(role);
    setEditSponsorId(rh.sponsor_resident_id || '');
  };

  // Handle updating resident assignment
  const handleUpdateResidentHouse = async () => {
    if (!editDialogResident) return;

    try {
      await updateResidentHouseMutation.mutateAsync({
        residentId: editDialogResident.id,
        houseId: id,
        data: {
          resident_role: editRole !== editDialogResident.role ? editRole : undefined,
          sponsor_resident_id: requiresSponsor(editRole) ? editSponsorId : null,
        },
      });
      toast.success('Resident assignment updated');
      setEditDialogResident(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update resident assignment');
    }
  };

  // Get available sponsors for edit dialog
  const editAvailableSponsors = useMemo(() => {
    if (!requiresSponsor(editRole)) return [];
    return activeResidents
      .filter(rh => ['non_resident_landlord', 'resident_landlord', 'tenant'].includes(rh.resident_role))
      .map(rh => rh.resident);
  }, [activeResidents, editRole]);

  // Get available new owners for transfer (all residents except current owner)
  const availableNewOwners = useMemo(() => {
    if (!transferDialogOwner) return [];
    return (residentsData?.data ?? []).filter(r => r.id !== transferDialogOwner.id);
  }, [residentsData?.data, transferDialogOwner]);

  // Handle promoting a co_resident (role swap with primary)
  const handlePromoteResident = async (promoteResidentId: string) => {
    if (!primaryResidingResident) {
      toast.error('No primary residing resident to swap with');
      return;
    }

    try {
      await swapRolesMutation.mutateAsync({
        houseId: id,
        promoteResidentId,
        demoteResidentId: primaryResidingResident.resident.id,
      });
      const primaryRole = RESIDENT_ROLE_LABELS[primaryResidingResident.resident_role as ResidentRole];
      toast.success(`Resident promoted to ${primaryRole}`);
      setPromoteDialogResident(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to promote resident');
    }
  };

  // Handle opening transfer ownership dialog
  const handleOpenTransferDialog = (rh: {
    resident: { id: string; first_name: string; last_name: string };
    resident_role: string;
  }) => {
    const role = rh.resident_role as ResidentRole;
    setTransferDialogOwner({
      id: rh.resident.id,
      name: `${rh.resident.first_name} ${rh.resident.last_name}`,
      role,
    });
    setTransferNewOwnerId('');
    setTransferNewOwnerRole('non_resident_landlord');
    setTransferDate(new Date().toISOString().split('T')[0]);
    setTransferNotes('');
  };

  const handleOpenRemoveOwnershipDialog = (rh: {
    resident: { id: string; first_name: string; last_name: string };
    resident_role: string;
  }) => {
    const role = rh.resident_role as ResidentRole;
    setRemoveOwnershipDialogOwner({
      id: rh.resident.id,
      name: `${rh.resident.first_name} ${rh.resident.last_name}`,
      role,
    });
  };

  const handleRemoveOwnership = async () => {
    if (!removeOwnershipDialogOwner) return;

    try {
      await removeOwnershipMutation.mutateAsync({
        houseId: id,
        ownerId: removeOwnershipDialogOwner.id,
      });
      toast.success('Ownership removed successfully. House is now vacant.');
      setRemoveOwnershipDialogOwner(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove ownership');
    }
  };

  // Handle transfer ownership
  const handleTransferOwnership = async () => {
    if (!transferDialogOwner || !transferNewOwnerId) {
      toast.error('Please select a new owner');
      return;
    }

    try {
      await transferOwnershipMutation.mutateAsync({
        houseId: id,
        currentOwnerId: transferDialogOwner.id,
        newOwnerId: transferNewOwnerId,
        newOwnerRole: transferNewOwnerRole,
        transferDate,
        transferNotes: transferNotes || undefined,
      });
      toast.success('Ownership transferred successfully');
      setTransferDialogOwner(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to transfer ownership');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this house?')) return;

    try {
      await deleteMutation.mutateAsync(id);
      toast.success('House deleted successfully');
      router.push('/houses');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete house');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !house) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">House not found</p>
        <Button variant="outline" asChild>
          <Link href="/houses">Back to Houses</Link>
        </Button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/houses/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit House</h1>
            <p className="text-muted-foreground">Update property details.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              House Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HouseForm house={house} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Reset link dialog form
  const handleLinkDialogOpen = (open: boolean) => {
    setIsLinkDialogOpen(open);
    if (open) {
      setSelectedResidentId('');
      // Set default role based on house state
      const defaultRole = (hasResidentLandlord || hasTenant)
        ? 'co_resident'  // Default to secondary role when primary exists
        : (filteredRoleOptions[0]?.value ?? 'tenant');
      setSelectedRole(defaultRole as ResidentRole);
      setMoveInDate(new Date().toISOString().split('T')[0]);
      setSponsorResidentId('');
    }
  };

  // Handle linking existing resident
  const handleLinkResident = async () => {
    if (!selectedResidentId) {
      toast.error('Please select a resident');
      return;
    }

    // Validate sponsor for roles that require it
    if (requiresSponsor(selectedRole) && !sponsorResidentId) {
      toast.error(`${RESIDENT_ROLE_LABELS[selectedRole]} must have a sponsor`);
      return;
    }

    try {
      await assignMutation.mutateAsync({
        residentId: selectedResidentId,
        data: {
          house_id: id,
          resident_role: selectedRole,
          move_in_date: moveInDate,
          sponsor_resident_id: requiresSponsor(selectedRole) ? sponsorResidentId : null,
        },
      });
      toast.success('Resident linked successfully');
      setIsLinkDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link resident');
    }
  };

  const showSponsorField = requiresSponsor(selectedRole);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/houses">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {house.house_number} {house.street?.name}
            </h1>
            <p className="text-muted-foreground">
              {house.house_type?.name ?? 'No type specified'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/houses/${id}?edit=true`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending || activeResidents.length > 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Property Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">House Number</span>
              <span className="font-medium">{house.house_number}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Street</span>
              <span className="font-medium">{house.street?.name}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{house.house_type?.name ?? '-'}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <OccupancyBadge isOccupied={house.is_occupied} />
            </div>
            {house.notes && (
              <>
                <Separator />
                <div>
                  <span className="text-muted-foreground block mb-2">Notes</span>
                  <p className="text-sm">{house.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Residents ({activeResidents.length})
                </CardTitle>
                <CardDescription>
                  People currently assigned to this property
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Dialog open={isLinkDialogOpen} onOpenChange={handleLinkDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Link2 className="h-4 w-4 mr-2" />
                      Link Existing
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Link Existing Resident</DialogTitle>
                      <DialogDescription>
                        Assign an existing resident to this house.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>Resident</Label>
                        <Select
                          value={selectedResidentId}
                          onValueChange={setSelectedResidentId}
                          disabled={residentsLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={residentsLoading ? "Loading..." : "Select a resident"} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableResidents.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.first_name} {r.last_name} ({r.resident_code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Role</Label>
                        <Select
                          value={selectedRole}
                          onValueChange={(v) => {
                            setSelectedRole(v as ResidentRole);
                            setSponsorResidentId('');
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredRoleOptions.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {showSponsorField && (
                        <div className="grid gap-2">
                          <Label>Sponsor *</Label>
                          <Select
                            value={sponsorResidentId}
                            onValueChange={setSponsorResidentId}
                            disabled={availableSponsors.length === 0}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={
                                availableSponsors.length === 0
                                  ? "No sponsors available"
                                  : "Select a sponsor"
                              } />
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
                            {RESIDENT_ROLE_LABELS[selectedRole]} must be sponsored by a primary resident
                          </p>
                        </div>
                      )}
                      {!hasResidentLandlordOrTenant && (
                        <div className="grid gap-2">
                          <Label>Move-in Date</Label>
                          <Input
                            type="date"
                            value={moveInDate}
                            onChange={(e) => setMoveInDate(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={handleLinkResident}
                        disabled={!selectedResidentId || assignMutation.isPending}
                      >
                        {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Link Resident
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/residents/new?house_id=${id}&house_state=${houseState}`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add New
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activeResidents.length === 0 ? (
              <p className="text-muted-foreground text-sm">No residents assigned</p>
            ) : (
              <div className="space-y-4">
                {activeResidents.map((rh) => {
                  const role = rh.resident_role as ResidentRole;
                  const residentName = `${rh.resident.first_name} ${rh.resident.last_name}`;

                  // Determine which action buttons to show based on role
                  const showRemoveButton = role === 'tenant' ||
                    ['co_resident', 'household_member', 'domestic_staff', 'caretaker'].includes(role);
                  const showMoveOutButton = role === 'resident_landlord';
                  // Edit button only for secondary roles
                  const showEditButton = ['co_resident', 'household_member', 'domestic_staff', 'caretaker'].includes(role);
                  // Promote button only for co_resident when there's a primary residing resident
                  const showPromoteButton = role === 'co_resident' && primaryResidingResident;
                  // Transfer button will be added in Phase 5
                  const showTransferButton = role === 'non_resident_landlord' || role === 'developer';

                  return (
                    <div key={rh.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Link
                          href={`/residents/${rh.resident.id}`}
                          className="font-medium hover:underline"
                        >
                          {residentName}
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          <ResidentRoleBadge role={role} />
                          <AccountStatusBadge status={rh.resident.account_status} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Move Out button for Resident Landlord */}
                        {showMoveOutButton && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setMoveOutDialogResident({
                              id: rh.resident.id,
                              name: residentName,
                            })}
                            disabled={moveOutMutation.isPending}
                          >
                            <DoorOpen className="h-4 w-4 mr-1" />
                            Move Out
                          </Button>
                        )}

                        {/* Promote button for Co-Resident */}
                        {showPromoteButton && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPromoteDialogResident({
                              id: rh.resident.id,
                              name: residentName,
                            })}
                            disabled={swapRolesMutation.isPending}
                            className="text-muted-foreground hover:text-green-600"
                            title="Promote to primary role"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                        )}

                        {/* Edit button for Secondary roles */}
                        {showEditButton && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditDialog(rh)}
                            disabled={updateResidentHouseMutation.isPending}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <SquarePen className="h-4 w-4" />
                          </Button>
                        )}

                        {/* Remove button for Tenant and Secondary roles */}
                        {showRemoveButton && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRemoveDialogResident({
                              id: rh.resident.id,
                              name: residentName,
                              role,
                            })}
                            disabled={unassignMutation.isPending}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}

                        {/* Transfer button for Non-Resident Landlord/Developer */}
                        {showTransferButton && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenTransferDialog(rh)}
                            disabled={transferOwnershipMutation.isPending}
                          >
                            <ArrowRightLeft className="h-4 w-4 mr-1" />
                            Transfer
                          </Button>
                        )}

                        {/* Remove Ownership button for Non-Resident Landlord/Developer */}
                        {showTransferButton && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenRemoveOwnershipDialog(rh)}
                            disabled={removeOwnershipMutation.isPending}
                            className="text-destructive hover:text-destructive"
                          >
                            <UserMinus className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Status */}
      <HousePaymentStatus houseId={id} />

      {/* Ownership & Occupancy History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Ownership & Occupancy History
          </CardTitle>
          <CardDescription>
            Timeline of ownership changes, move-ins, move-outs, and role changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !ownershipHistory || ownershipHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No history records yet
            </p>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

              <div className="space-y-6">
                {ownershipHistory.map((record, index) => {
                  const isFirst = index === 0;
                  const eventLabels: Record<string, string> = {
                    'house_added': 'Added to Portal',
                    'ownership_start': 'Ownership Started',
                    'ownership_transfer': 'Ownership Transferred',
                    'ownership_end': 'Ownership Ended',
                    'move_in': 'Move In',
                    'move_out': 'Move Out',
                    'role_change': 'Role Changed',
                  };
                  const eventColors: Record<string, string> = {
                    'house_added': 'bg-indigo-500',
                    'ownership_start': 'bg-green-500',
                    'ownership_transfer': 'bg-blue-500',
                    'ownership_end': 'bg-red-500',
                    'move_in': 'bg-emerald-500',
                    'move_out': 'bg-amber-500',
                    'role_change': 'bg-purple-500',
                  };

                  // Check if this is a house_added event (no resident)
                  const isHouseAddedEvent = record.event_type === 'house_added' || !record.resident;

                  return (
                    <div key={record.id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div className={`absolute left-2.5 w-3 h-3 rounded-full ${eventColors[record.event_type] || 'bg-gray-500'} ${isFirst ? 'ring-2 ring-offset-2 ring-offset-background ring-primary' : ''}`} />

                      <div className="bg-muted/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">
                            {eventLabels[record.event_type] || record.event_type}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {/* Show date range for ownership_start and move_in events */}
                            {(record.event_type === 'ownership_start' || record.event_type === 'move_in') ? (
                              <span>
                                {new Date(record.event_date).toLocaleDateString()}
                                {' - '}
                                {record.end_date
                                  ? new Date(record.end_date).toLocaleDateString()
                                  : <span className="text-green-600 dark:text-green-400">Present</span>
                                }
                              </span>
                            ) : (
                              new Date(record.event_date).toLocaleDateString()
                            )}
                          </div>
                        </div>

                        {/* Show resident info only if there's a resident (not for house_added) */}
                        {!isHouseAddedEvent && record.resident && (
                          <div className="flex items-center gap-2 mb-2">
                            <Link
                              href={`/residents/${record.resident.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {record.resident.entity_type === 'corporate' && record.resident.company_name
                                ? record.resident.company_name
                                : `${record.resident.first_name} ${record.resident.last_name}`
                              }
                            </Link>
                            {record.resident_role && (
                              <ResidentRoleBadge role={record.resident_role as ResidentRole} />
                            )}
                            {record.is_current && (
                              <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                        )}

                        {/* For house_added events, show a simple description */}
                        {isHouseAddedEvent && (
                          <p className="text-sm text-muted-foreground mb-2">
                            House added to Residio portal
                          </p>
                        )}

                        {record.previous_role && (
                          <p className="text-sm text-muted-foreground mb-1">
                            Previous role: {RESIDENT_ROLE_LABELS[record.previous_role as ResidentRole]}
                          </p>
                        )}

                        {record.notes && !isHouseAddedEvent && (
                          <p className="text-sm text-muted-foreground">
                            {record.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove Resident Confirmation Dialog */}
      <AlertDialog
        open={!!removeDialogResident}
        onOpenChange={(open) => !open && setRemoveDialogResident(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {removeDialogResident?.role === 'tenant' && secondaryResidents.length > 0 && (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Remove Resident
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {removeDialogResident?.role === 'tenant' && secondaryResidents.length > 0 ? (
                  <>
                    <span className="block mb-3">
                      Removing <strong>{removeDialogResident?.name}</strong> (Tenant) will also remove
                      the following <strong>{secondaryResidents.length}</strong> secondary resident(s):
                    </span>
                    <ul className="list-disc list-inside mb-3 text-sm">
                      {secondaryResidents.map(sr => (
                        <li key={sr.id}>
                          {sr.resident.first_name} {sr.resident.last_name} ({RESIDENT_ROLE_LABELS[sr.resident_role as ResidentRole]})
                        </li>
                      ))}
                    </ul>
                    <span className="block">This action cannot be undone.</span>
                  </>
                ) : (
                  <>
                    Are you sure you want to remove <strong>{removeDialogResident?.name}</strong> from this house?
                    This action cannot be undone.
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeDialogResident && handleRemoveResident(
                removeDialogResident.id,
                removeDialogResident.role
              )}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unassignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {removeDialogResident?.role === 'tenant' && secondaryResidents.length > 0
                ? `Remove All (${secondaryResidents.length + 1})`
                : 'Remove'
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Out Landlord Confirmation Dialog */}
      <AlertDialog
        open={!!moveOutDialogResident}
        onOpenChange={(open) => !open && setMoveOutDialogResident(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {secondaryResidents.length > 0 && (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Move Out - Convert to Non-Resident Landlord
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <span className="block mb-3">
                  <strong>{moveOutDialogResident?.name}</strong> will no longer reside at this property
                  but will retain ownership as a Non-Resident Landlord.
                </span>
                {secondaryResidents.length > 0 && (
                  <>
                    <span className="block mb-2 text-amber-600 dark:text-amber-400">
                      The following {secondaryResidents.length} secondary resident(s) will also be removed:
                    </span>
                    <ul className="list-disc list-inside mb-3 text-sm">
                      {secondaryResidents.map(sr => (
                        <li key={sr.id}>
                          {sr.resident.first_name} {sr.resident.last_name} ({RESIDENT_ROLE_LABELS[sr.resident_role as ResidentRole]})
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <span className="block text-sm text-muted-foreground">
                  The house status will change to "Vacant - Landlord assigned".
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => moveOutDialogResident && handleMoveOutLandlord(moveOutDialogResident.id)}
            >
              {moveOutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Move Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Resident Assignment Dialog */}
      <Dialog
        open={!!editDialogResident}
        onOpenChange={(open) => !open && setEditDialogResident(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Resident Assignment</DialogTitle>
            <DialogDescription>
              Update assignment details for {editDialogResident?.name}
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
                  if (!requiresSponsor(v as ResidentRole)) {
                    setEditSponsorId('');
                  }
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
                <Select
                  value={editSponsorId}
                  onValueChange={setEditSponsorId}
                  disabled={editAvailableSponsors.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      editAvailableSponsors.length === 0
                        ? "No sponsors available"
                        : "Select a sponsor"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {editAvailableSponsors.map((sponsor) => (
                      <SelectItem key={sponsor.id} value={sponsor.id}>
                        {sponsor.first_name} {sponsor.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {RESIDENT_ROLE_LABELS[editRole]} must be sponsored by a primary resident
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogResident(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateResidentHouse}
              disabled={updateResidentHouseMutation.isPending || (requiresSponsor(editRole) && !editSponsorId)}
            >
              {updateResidentHouseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote Resident Confirmation Dialog */}
      <AlertDialog
        open={!!promoteDialogResident}
        onOpenChange={(open) => !open && setPromoteDialogResident(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote Resident</AlertDialogTitle>
            <AlertDialogDescription>
              {primaryResidingResident && (
                <>
                  <p className="mb-3">
                    Promote <strong>{promoteDialogResident?.name}</strong> to{' '}
                    <strong>{RESIDENT_ROLE_LABELS[primaryResidingResident.resident_role as ResidentRole]}</strong>?
                  </p>
                  <p className="mb-3">
                    <strong>{primaryResidingResident.resident.first_name} {primaryResidingResident.resident.last_name}</strong>{' '}
                    will be demoted to <strong>Co-Resident</strong>.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This is a role swap - both residents will remain at this house with their roles exchanged.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => promoteDialogResident && handlePromoteResident(promoteDialogResident.id)}
              className="bg-green-600 hover:bg-green-700"
            >
              {swapRolesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Promote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Ownership Dialog */}
      <Dialog
        open={!!transferDialogOwner}
        onOpenChange={(open) => !open && setTransferDialogOwner(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              Transfer ownership from {transferDialogOwner?.name} to a new owner.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>New Owner Type</Label>
              <Select
                value={transferNewOwnerRole}
                onValueChange={(v) => setTransferNewOwnerRole(v as 'non_resident_landlord' | 'developer')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select new owner type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_resident_landlord">Non-Resident Landlord</SelectItem>
                  <SelectItem value="developer">Developer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>New Owner</Label>
              <Select
                value={transferNewOwnerId}
                onValueChange={setTransferNewOwnerId}
                disabled={residentsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={residentsLoading ? "Loading..." : "Select new owner"} />
                </SelectTrigger>
                <SelectContent>
                  {availableNewOwners.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.first_name} {r.last_name} ({r.resident_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Transfer Date</Label>
              <Input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="e.g., Sale reference, deed number"
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTransferDialogOwner(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransferOwnership}
              disabled={!transferNewOwnerId || transferOwnershipMutation.isPending}
            >
              {transferOwnershipMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer Ownership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Ownership Confirmation Dialog */}
      <AlertDialog
        open={!!removeOwnershipDialogOwner}
        onOpenChange={(open) => !open && setRemoveOwnershipDialogOwner(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove Ownership
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-3">
                  Are you sure you want to remove <strong>{removeOwnershipDialogOwner?.name}</strong> as the{' '}
                  {removeOwnershipDialogOwner?.role && RESIDENT_ROLE_LABELS[removeOwnershipDialogOwner.role]}?
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
    </div>
  );
}
