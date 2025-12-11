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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HouseForm } from '@/components/houses/house-form';
import { OccupancyBadge, AccountStatusBadge, ResidentRoleBadge } from '@/components/residents/status-badge';
import { useHouse, useDeleteHouse } from '@/hooks/use-houses';
import { useResidents, useAssignHouse } from '@/hooks/use-residents';
import { Home, Pencil, Trash2, Users, ArrowLeft, Plus, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ResidentRole } from '@/types/database';
import { PRIMARY_ROLE_OPTIONS, RESIDENT_ROLE_LABELS } from '@/types/database';
import { requiresSponsor } from '@/lib/validators/resident';

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

  const { data: house, isLoading, error } = useHouse(id);
  const { data: residentsData, isLoading: residentsLoading } = useResidents({ limit: 1000 });
  const deleteMutation = useDeleteHouse();
  const assignMutation = useAssignHouse();

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

  // Validation 3: Check if resident landlord or tenant exists (for hiding move-in date)
  const hasResidentLandlordOrTenant = useMemo(() => {
    return activeResidents.some(rh =>
      rh.resident_role === 'resident_landlord' || rh.resident_role === 'tenant'
    );
  }, [activeResidents]);

  // Filter role options: exclude landlord roles if landlord already exists
  const filteredRoleOptions = useMemo(() => {
    if (hasLandlord) {
      return PRIMARY_ROLE_OPTIONS.filter(role =>
        role.value !== 'resident_landlord' && role.value !== 'non_resident_landlord'
      );
    }
    return PRIMARY_ROLE_OPTIONS;
  }, [hasLandlord]);

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
      // Set default role to first available option from filtered list
      const defaultRole = filteredRoleOptions[0]?.value ?? 'tenant';
      setSelectedRole(defaultRole);
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
          is_billing_responsible: false,
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
                  <Link href={`/residents/new?house_id=${id}`}>
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
                {activeResidents.map((rh) => (
                  <div key={rh.id} className="flex items-center justify-between">
                    <div>
                      <Link
                        href={`/residents/${rh.resident.id}`}
                        className="font-medium hover:underline"
                      >
                        {rh.resident.first_name} {rh.resident.last_name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <ResidentRoleBadge role={rh.resident_role} />
                      </div>
                    </div>
                    <AccountStatusBadge status={rh.resident.account_status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
