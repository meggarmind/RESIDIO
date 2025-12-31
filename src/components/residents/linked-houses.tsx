'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAssignHouse, useUnassignHouse, useResidents } from '@/hooks/use-residents';
import { useHousesWithRoles } from '@/hooks/use-houses';
import { toast } from 'sonner';
import { Home, Plus, Trash2, Loader2 } from 'lucide-react';
import type { ResidentWithHouses, ResidentRole } from '@/types/database';
import { PRIMARY_ROLE_OPTIONS, SECONDARY_ROLE_OPTIONS, CORPORATE_ROLE_OPTIONS, RESIDENT_ROLE_LABELS } from '@/types/database';
import { requiresSponsor } from '@/lib/validators/resident';
import { ResidentRoleBadge } from './status-badge';
import { formatPropertyDisplay, getPropertyShortname } from '@/lib/utils';

interface LinkedHousesProps {
    resident: ResidentWithHouses;
}

export function LinkedHouses({ resident }: LinkedHousesProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedHouseId, setSelectedHouseId] = useState('');
    const [selectedRole, setSelectedRole] = useState<ResidentRole>('co_resident');
    const [moveInDate, setMoveInDate] = useState(new Date().toISOString().split('T')[0]);
    const [sponsorResidentId, setSponsorResidentId] = useState<string>('');

    const { data: housesData } = useHousesWithRoles({ limit: 100 });
    const { data: residentsData } = useResidents({ limit: 1000 });
    const assignMutation = useAssignHouse();
    const unassignMutation = useUnassignHouse();

    const activeHouses = resident.resident_houses?.filter((rh) => rh.is_active) ?? [];
    const linkedHouseIds = new Set(activeHouses.map(rh => rh.house_id));

    // Determine if resident is primary or secondary type
    const isPrimaryResident = resident.resident_type === 'primary';
    const isCorporate = resident.entity_type === 'corporate';

    // Role options based on resident type and entity type
    const roleOptions = useMemo(() => {
        if (!isPrimaryResident) {
            // Secondary residents must be individuals
            if (isCorporate) return [];
            return SECONDARY_ROLE_OPTIONS;
        }
        // Primary residents
        if (isCorporate) {
            // Corporate can only be Non-Resident Landlord or Developer
            return CORPORATE_ROLE_OPTIONS;
        }
        return PRIMARY_ROLE_OPTIONS;
    }, [isPrimaryResident, isCorporate]);

    // Filter houses based on selected role
    const availableHouses = useMemo(() => {
        const allHouses = housesData?.data ?? [];
        // Filter out houses already linked
        const unlinkedHouses = allHouses.filter(h => !linkedHouseIds.has(h.id));

        // For landlord roles, filter out houses that already have ANY landlord
        // Only one landlord (resident or non-resident) is allowed per house
        if (selectedRole === 'resident_landlord' || selectedRole === 'non_resident_landlord') {
            return unlinkedHouses.filter(house =>
                !house.activeRoles.includes('resident_landlord') &&
                !house.activeRoles.includes('non_resident_landlord') &&
                // Also exclude houses with tenants if assigning resident_landlord
                (selectedRole === 'non_resident_landlord' || !house.activeRoles.includes('tenant'))
            );
        }
        // For tenant, filter out houses with resident_landlord or existing tenant
        if (selectedRole === 'tenant') {
            return unlinkedHouses.filter(house =>
                !house.activeRoles.includes('resident_landlord') &&
                !house.activeRoles.includes('tenant')
            );
        }
        return unlinkedHouses;
    }, [housesData?.data, linkedHouseIds, selectedRole]);

    // Get sponsors (primary residents of selected house) for domestic_staff and caretaker
    const availableSponsors = useMemo(() => {
        if (!selectedHouseId || !requiresSponsor(selectedRole)) {
            return [];
        }
        const allResidents = residentsData?.data ?? [];
        // Filter residents who are non_resident_landlord, resident_landlord, or tenant of the selected house
        return allResidents.filter(r => {
            if (r.id === resident.id) return false;
            const residentWithHouses = r as typeof resident;
            return residentWithHouses.resident_houses?.some(
                rh => rh.house_id === selectedHouseId &&
                      rh.is_active &&
                      ['non_resident_landlord', 'resident_landlord', 'tenant'].includes(rh.resident_role)
            );
        });
    }, [selectedHouseId, selectedRole, residentsData?.data, resident.id]);

    // Check if selected house is occupied (has resident_landlord or tenant)
    const isSelectedHouseOccupied = useMemo(() => {
        if (!selectedHouseId) return false;
        const selectedHouse = housesData?.data?.find(h => h.id === selectedHouseId);
        if (!selectedHouse) return false;

        // Check activeRoles for occupying roles
        const hasOccupyingRole = selectedHouse.activeRoles.some(role =>
            role === 'resident_landlord' || role === 'tenant'
        );

        // Fallback: check is_occupied field if house has active residents assigned
        // This handles cases where activeRoles might not be populated correctly
        return hasOccupyingRole || selectedHouse.is_occupied;
    }, [selectedHouseId, housesData?.data]);

    // Reset form when dialog opens
    const handleDialogOpen = (open: boolean) => {
        setIsDialogOpen(open);
        if (open) {
            setSelectedHouseId('');
            // Set default role based on resident type and entity type
            const defaultRole = isPrimaryResident
                ? (isCorporate ? 'non_resident_landlord' : 'resident_landlord')
                : 'co_resident';
            setSelectedRole(defaultRole as ResidentRole);
            setMoveInDate(new Date().toISOString().split('T')[0]);
            setSponsorResidentId('');
        }
    };

    // Show sponsor field if role requires it
    const showSponsorField = requiresSponsor(selectedRole);

    const handleAssign = async () => {
        if (!selectedHouseId) return;

        // Validate resident ID exists
        if (!resident?.id) {
            toast.error('Resident data is missing. Please refresh the page.');
            console.error('[LinkedHouses] handleAssign: resident.id is missing', { resident });
            return;
        }

        // Validate sponsor for roles that require it
        if (showSponsorField && !sponsorResidentId) {
            toast.error(`${RESIDENT_ROLE_LABELS[selectedRole]} must have a sponsor`);
            return;
        }

        console.log('[LinkedHouses] handleAssign: calling assignMutation', { residentId: resident.id, selectedHouseId });

        try {
            await assignMutation.mutateAsync({
                residentId: resident.id,
                data: {
                    house_id: selectedHouseId,
                    resident_role: selectedRole,
                    move_in_date: isSelectedHouseOccupied ? undefined : moveInDate,
                    sponsor_resident_id: showSponsorField ? sponsorResidentId : null,
                },
            });
            toast.success('House linked successfully');
            setIsDialogOpen(false);
            setSelectedHouseId('');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to link house');
        }
    };

    const handleUnassign = async (houseId: string) => {
        if (!confirm('Are you sure you want to unlink this house?')) return;

        try {
            await unassignMutation.mutateAsync({
                residentId: resident.id,
                houseId,
            });
            toast.success('House unlinked successfully');
        } catch (error) {
            toast.error('Failed to unlink house');
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Home className="h-5 w-5" />
                            House Assignments ({activeHouses.length})
                        </CardTitle>
                        <CardDescription>Properties linked to this resident</CardDescription>
                    </div>
                    <Dialog open={isDialogOpen} onOpenChange={handleDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                                <Plus className="h-4 w-4 mr-2" />
                                Link House
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Link House</DialogTitle>
                                <DialogDescription>Assign this resident to another house.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label>Role</Label>
                                    <Select value={selectedRole} onValueChange={(v) => {
                                        setSelectedRole(v as ResidentRole);
                                        setSponsorResidentId(''); // Reset sponsor when role changes
                                    }}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {roleOptions.map((role) => (
                                                <SelectItem key={role.value} value={role.value}>
                                                    {role.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>House</Label>
                                    <Select value={selectedHouseId} onValueChange={(v) => {
                                        setSelectedHouseId(v);
                                        setSponsorResidentId(''); // Reset sponsor when house changes
                                    }}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a house" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableHouses.map((h) => {
                                                const hasResidentLandlord = h.activeRoles.includes('resident_landlord');
                                                const hasTenant = h.activeRoles.includes('tenant');
                                                const hasNonResidentLandlord = h.activeRoles.includes('non_resident_landlord');
                                                const hasDeveloper = h.activeRoles.includes('developer');
                                                let status = '';
                                                if (hasResidentLandlord) status = ' (Owner-Occupied)';
                                                else if (hasNonResidentLandlord && hasTenant) status = ' (Tenanted)';
                                                else if (hasNonResidentLandlord) status = ' (Vacant - Landlord assigned)';
                                                else if (hasDeveloper) status = ' (Developer Inventory)';
                                                else if (h.is_occupied) status = ' (Occupied)';

                                                const displayName = formatPropertyDisplay(h, 'full');
                                                return (
                                                    <SelectItem key={h.id} value={h.id}>
                                                        {displayName}{status}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Sponsor selection for domestic_staff and caretaker */}
                                {showSponsorField && (
                                    <div className="grid gap-2">
                                        <Label>Sponsor *</Label>
                                        <Select
                                            value={sponsorResidentId}
                                            onValueChange={setSponsorResidentId}
                                            disabled={!selectedHouseId || availableSponsors.length === 0}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={
                                                    !selectedHouseId
                                                        ? "Select a house first"
                                                        : availableSponsors.length === 0
                                                            ? "No sponsors available"
                                                            : "Select a sponsor"
                                                } />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableSponsors.map((sponsor) => (
                                                    <SelectItem key={sponsor.id} value={sponsor.id}>
                                                        {sponsor.first_name} {sponsor.last_name} ({sponsor.resident_code})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            {RESIDENT_ROLE_LABELS[selectedRole]} must be sponsored by a landlord, owner-occupier, or tenant
                                        </p>
                                    </div>
                                )}

                                {!isSelectedHouseOccupied && (
                                    <div className="grid gap-2">
                                        <Label>Move In Date</Label>
                                        <Input type="date" value={moveInDate} onChange={e => setMoveInDate(e.target.value)} />
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button onClick={handleAssign} disabled={!selectedHouseId || assignMutation.isPending}>
                                    {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Link House
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                {activeHouses.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No house assignments</p>
                ) : (
                    <div className="space-y-4">
                        {activeHouses.map((rh) => (
                            <div key={rh.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/houses/${rh.house.id}`}
                                            className="font-medium hover:underline flex items-center gap-1"
                                        >
                                            <Home className="h-3 w-3" />
                                            <span className="font-mono text-sm font-semibold bg-muted px-1.5 py-0.5 rounded">
                                                {getPropertyShortname(rh.house)}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {rh.house?.street?.name}
                                            </span>
                                        </Link>
                                    </div>

                                    <div className="flex items-center gap-2 mt-1">
                                        <ResidentRoleBadge role={rh.resident_role} />
                                        <span className="text-sm text-muted-foreground">
                                            Since {new Date(rh.move_in_date).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleUnassign(rh.house.id)}
                                    className="text-muted-foreground hover:text-destructive"
                                    disabled={unassignMutation.isPending}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
