<<<<<<< HEAD
'use client';

import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAssignHouse, useUnassignHouse } from '@/hooks/use-residents';
import { useHouses } from '@/hooks/use-houses';
import { toast } from 'sonner';
import { Home, Plus, Trash2, Loader2, Link as LinkIcon } from 'lucide-react';
import type { ResidentWithHouses } from '@/types/database';

interface LinkedHousesProps {
    resident: ResidentWithHouses;
}

export function LinkedHouses({ resident }: LinkedHousesProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedHouseId, setSelectedHouseId] = useState('');
    const [selectedRole, setSelectedRole] = useState('occupier');
    const [isPrimary, setIsPrimary] = useState(false);
    const [moveInDate, setMoveInDate] = useState(new Date().toISOString().split('T')[0]);

    const { data: housesData } = useHouses({ limit: 100 });
    const assignMutation = useAssignHouse();
    const unassignMutation = useUnassignHouse();

    const activeHouses = resident.resident_houses?.filter((rh) => rh.is_active) ?? [];
    const linkedHouseIds = new Set(activeHouses.map(rh => rh.house_id));

    // Check if resident already has a primary home
    const hasPrimary = activeHouses.some(rh => rh.is_primary);

    // Filter out houses already linked
    const availableHouses = housesData?.data.filter(h => !linkedHouseIds.has(h.id) && !h.is_occupied) ?? [];

    // Reset form when dialog opens
    const handleDialogOpen = (open: boolean) => {
        setIsDialogOpen(open);
        if (open) {
            setSelectedHouseId('');
            setSelectedRole('occupier');
            setIsPrimary(false); // Always reset to false, user can toggle if no primary exists
            setMoveInDate(new Date().toISOString().split('T')[0]);
        }
    };

    const handleAssign = async () => {
        if (!selectedHouseId) return;

        try {
            await assignMutation.mutateAsync({
                residentId: resident.id,
                data: {
                    house_id: selectedHouseId,
                    resident_role: selectedRole as any,
                    is_primary: isPrimary,
                    move_in_date: moveInDate,
                },
            });
            toast.success('House linked successfully');
            setIsDialogOpen(false);
            setSelectedHouseId('');
        } catch (error) {
            toast.error('Failed to link house');
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
                                    <Label>House</Label>
                                    <Select value={selectedHouseId} onValueChange={setSelectedHouseId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a house" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableHouses.map((h) => (
                                                <SelectItem key={h.id} value={h.id}>
                                                    {h.house_number} {h.street?.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Role</Label>
                                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="owner">Owner</SelectItem>
                                            <SelectItem value="tenant">Tenant</SelectItem>
                                            <SelectItem value="occupier">Occupier</SelectItem>
                                            <SelectItem value="family_member">Household Member</SelectItem>
                                            <SelectItem value="domestic_staff">Domestic Staff</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Move In Date</Label>
                                    <Input type="date" value={moveInDate} onChange={e => setMoveInDate(e.target.value)} />
                                </div>
                                <div className="flex items-center space-x-2 py-2">
                                    <Switch
                                        id="is-primary"
                                        checked={isPrimary}
                                        onCheckedChange={setIsPrimary}
                                        disabled={hasPrimary}
                                    />
                                    <Label htmlFor="is-primary" className={hasPrimary ? "text-muted-foreground" : ""}>
                                        Primary Residence {hasPrimary && "(Already Assigned)"}
                                    </Label>
                                </div>
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
                                            {rh.house?.house_number} {rh.house?.street?.name}
                                        </Link>
                                    </div>

                                    <p className="text-sm text-muted-foreground capitalize mt-1">
                                        {rh.resident_role.replace('_', ' ')}
                                        {rh.is_primary && ' (Primary)'}
                                        <span className="mx-1">•</span>
                                        Since {new Date(rh.move_in_date).toLocaleDateString()}
                                    </p>
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
=======
'use client';

import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAssignHouse, useUnassignHouse } from '@/hooks/use-residents';
import { useHouses } from '@/hooks/use-houses';
import { toast } from 'sonner';
import { Home, Plus, Trash2, Loader2, Link as LinkIcon } from 'lucide-react';
import type { ResidentWithHouses } from '@/types/database';

interface LinkedHousesProps {
    resident: ResidentWithHouses;
}

export function LinkedHouses({ resident }: LinkedHousesProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedHouseId, setSelectedHouseId] = useState('');
    const [selectedRole, setSelectedRole] = useState('occupier');
    const [isPrimary, setIsPrimary] = useState(false);
    const [moveInDate, setMoveInDate] = useState(new Date().toISOString().split('T')[0]);

    const { data: housesData } = useHouses({ limit: 100 });
    const assignMutation = useAssignHouse();
    const unassignMutation = useUnassignHouse();

    const activeHouses = resident.resident_houses?.filter((rh) => rh.is_active) ?? [];
    const linkedHouseIds = new Set(activeHouses.map(rh => rh.house_id));

    // Check if resident already has a primary home
    const hasPrimary = activeHouses.some(rh => rh.is_primary);

    // Filter out houses already linked
    const availableHouses = housesData?.data.filter(h => !linkedHouseIds.has(h.id) && !h.is_occupied) ?? [];

    // Reset form when dialog opens
    const handleDialogOpen = (open: boolean) => {
        setIsDialogOpen(open);
        if (open) {
            setSelectedHouseId('');
            setSelectedRole('occupier');
            setIsPrimary(false); // Always reset to false, user can toggle if no primary exists
            setMoveInDate(new Date().toISOString().split('T')[0]);
        }
    };

    const handleAssign = async () => {
        if (!selectedHouseId) return;

        try {
            await assignMutation.mutateAsync({
                residentId: resident.id,
                data: {
                    house_id: selectedHouseId,
                    resident_role: selectedRole as any,
                    is_primary: isPrimary,
                    move_in_date: moveInDate,
                },
            });
            toast.success('House linked successfully');
            setIsDialogOpen(false);
            setSelectedHouseId('');
        } catch (error) {
            toast.error('Failed to link house');
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
                                    <Label>House</Label>
                                    <Select value={selectedHouseId} onValueChange={setSelectedHouseId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a house" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableHouses.map((h) => (
                                                <SelectItem key={h.id} value={h.id}>
                                                    {h.house_number} {h.street?.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Role</Label>
                                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="owner">Owner</SelectItem>
                                            <SelectItem value="tenant">Tenant</SelectItem>
                                            <SelectItem value="occupier">Occupier</SelectItem>
                                            <SelectItem value="family_member">Household Member</SelectItem>
                                            <SelectItem value="domestic_staff">Domestic Staff</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Move In Date</Label>
                                    <Input type="date" value={moveInDate} onChange={e => setMoveInDate(e.target.value)} />
                                </div>
                                <div className="flex items-center space-x-2 py-2">
                                    <Switch
                                        id="is-primary"
                                        checked={isPrimary}
                                        onCheckedChange={setIsPrimary}
                                        disabled={hasPrimary}
                                    />
                                    <Label htmlFor="is-primary" className={hasPrimary ? "text-muted-foreground" : ""}>
                                        Primary Residence {hasPrimary && "(Already Assigned)"}
                                    </Label>
                                </div>
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
                                            {rh.house?.house_number} {rh.house?.street?.name}
                                        </Link>
                                    </div>

                                    <p className="text-sm text-muted-foreground capitalize mt-1">
                                        {rh.resident_role.replace('_', ' ')}
                                        {rh.is_primary && ' (Primary)'}
                                        <span className="mx-1">•</span>
                                        Since {new Date(rh.move_in_date).toLocaleDateString()}
                                    </p>
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
>>>>>>> 6e226d0165174a5da4cc17bd5b203b6a46c531a4
