'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useResidents, useAssignHouse } from '@/hooks/use-residents';
import { requiresSponsor, sponsorRolesFor, describeSponsorRoles } from '@/lib/validators/resident';
import { PRIMARY_ROLE_OPTIONS, SECONDARY_ROLE_OPTIONS, RESIDENT_ROLE_LABELS } from '@/types/database';
import type { ResidentRole } from '@/types/database';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ActiveResidentHouse } from '@/components/houses/residents-tab';

interface LinkResidentDialogProps {
  houseId: string;
  activeResidents: ActiveResidentHouse[];
  triggerClassName?: string;
}

const today = () => new Date().toISOString().split('T')[0];

export function LinkResidentDialog({ houseId, activeResidents, triggerClassName }: LinkResidentDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedResidentId, setSelectedResidentId] = useState('');
  const [selectedRole, setSelectedRole] = useState<ResidentRole>('resident_landlord');
  const [moveInDate, setMoveInDate] = useState(today());
  const [sponsorResidentId, setSponsorResidentId] = useState('');

  // The 500-row list only feeds this dialog, so load it only while the dialog is open (#784).
  const { data: residentsData, isLoading: residentsLoading } = useResidents({ limit: 500 }, { enabled: open });
  const assignMutation = useAssignHouse();

  const roles = activeResidents.map((rh) => rh.resident_role);
  const hasResidentLandlord = roles.includes('resident_landlord');
  const hasTenant = roles.includes('tenant');
  const hasLandlord = hasResidentLandlord || roles.includes('non_resident_landlord');
  const hasPrimaryResident = roles.some((r) => ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'].includes(r));

  const filteredRoleOptions = useMemo(() => {
    // A residing primary (owner-occupier or renter) leaves only secondary roles.
    if (hasResidentLandlord || hasTenant) return SECONDARY_ROLE_OPTIONS;
    if (hasLandlord) {
      return PRIMARY_ROLE_OPTIONS.filter(
        (role) => role.value !== 'resident_landlord' && role.value !== 'non_resident_landlord'
      );
    }
    return PRIMARY_ROLE_OPTIONS;
  }, [hasLandlord, hasResidentLandlord, hasTenant]);

  // Residents not already linked here; with a primary present, exclude renters of another house.
  const availableResidents = useMemo(() => {
    const linkedIds = new Set(activeResidents.map((rh) => rh.resident.id));
    const baseList = (residentsData?.data ?? []).filter((r) => !linkedIds.has(r.id));
    if (!hasPrimaryResident) return baseList;
    return baseList.filter(
      (r) => !r.resident_houses?.some((rh) => rh.is_active && rh.resident_role === 'tenant')
    );
  }, [residentsData?.data, activeResidents, hasPrimaryResident]);

  const availableSponsors = requiresSponsor(selectedRole)
    ? activeResidents
        .filter((rh) => sponsorRolesFor(selectedRole).includes(rh.resident_role))
        .map((rh) => rh.resident)
    : [];
  // An occupant (co_resident) defaults to the house's resident as sponsor (#1067); a house has at most one
  const effectiveSponsorId = sponsorResidentId ||
    (selectedRole === 'co_resident' && availableSponsors.length === 1 ? availableSponsors[0].id : '');

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSelectedResidentId('');
      const defaultRole = hasResidentLandlord || hasTenant ? 'co_resident' : (filteredRoleOptions[0]?.value ?? 'tenant');
      setSelectedRole(defaultRole as ResidentRole);
      setMoveInDate(today());
      setSponsorResidentId('');
    }
  };

  const handleLinkResident = async () => {
    if (!selectedResidentId) {
      toast.error('Please select a resident');
      return;
    }
    if (requiresSponsor(selectedRole) && !effectiveSponsorId) {
      toast.error(`${RESIDENT_ROLE_LABELS[selectedRole]} must have a sponsor`);
      return;
    }

    try {
      await assignMutation.mutateAsync({
        residentId: selectedResidentId,
        data: {
          house_id: houseId,
          resident_role: selectedRole,
          move_in_date: moveInDate,
          sponsor_resident_id: requiresSponsor(selectedRole) ? effectiveSponsorId : null,
        },
      });
      toast.success('Resident linked successfully');
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link resident');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={triggerClassName}>
          <Link2 className="h-4 w-4 mr-2" />
          Link Existing
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Existing Resident</DialogTitle>
          <DialogDescription>Assign an existing resident to this house.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Resident</Label>
            <SearchableSelect
              options={availableResidents.map((r) => ({
                value: r.id,
                label: `${r.first_name} ${r.last_name} (${r.resident_code})`,
              }))}
              value={selectedResidentId}
              onValueChange={setSelectedResidentId}
              placeholder={residentsLoading ? 'Loading...' : 'Search a resident...'}
              searchPlaceholder="Search by name or code..."
              emptyMessage="No residents available."
            />
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
          {requiresSponsor(selectedRole) && (
            <div className="grid gap-2">
              <Label>Sponsor *</Label>
              <Select
                value={effectiveSponsorId}
                onValueChange={setSponsorResidentId}
                disabled={availableSponsors.length === 0}
              >
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
                {RESIDENT_ROLE_LABELS[selectedRole]} must be sponsored by the {describeSponsorRoles(selectedRole)} of this house
              </p>
            </div>
          )}
          {/* No move-in date once an owner-occupier or renter lives here. */}
          {!(hasResidentLandlord || hasTenant) && (
            <div className="grid gap-2">
              <Label>Move-in Date</Label>
              <Input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleLinkResident} disabled={!selectedResidentId || assignMutation.isPending}>
            {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Link Resident
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
