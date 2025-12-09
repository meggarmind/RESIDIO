<<<<<<< HEAD
'use client';

import { useState } from 'react';
import { useHouseTypes } from '@/hooks/use-reference';
import { useBillingProfiles } from '@/hooks/use-billing';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createHouseType } from '@/actions/reference/create-house-type';
import { updateHouseType } from '@/actions/reference/update-house-type';
import { toast } from 'sonner';
import { Plus, Loader2, Edit } from 'lucide-react';

export function HouseTypesList() {
    const { data: typesData, isLoading, refetch } = useHouseTypes();
    const { data: billingProfiles } = useBillingProfiles();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [maxResidents, setMaxResidents] = useState('5');
    const [selectedProfileId, setSelectedProfileId] = useState<string>('');

    const resetForm = () => {
        setEditingId(null);
        setNewName('');
        setNewDesc('');
        setMaxResidents('5');
        setSelectedProfileId('');
    };

    const handleCreateOrUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setIsSubmitting(true);
        try {
            const payload = {
                name: newName,
                description: newDesc || undefined,
                max_residents: parseInt(maxResidents) || 5,
                billing_profile_id: selectedProfileId === 'none' ? undefined : selectedProfileId,
            };

            let result;
            if (editingId) {
                result = await updateHouseType(editingId, payload);
            } else {
                result = await createHouseType(payload);
            }

            if (!result.error) {
                toast.success(`House type ${editingId ? 'updated' : 'created'} successfully`);
                resetForm();
                setIsDialogOpen(false);
                refetch();
            } else {
                toast.error(result.error || `Failed to ${editingId ? 'update' : 'create'} house type`);
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openEdit = (type: any) => {
        setEditingId(type.id);
        setNewName(type.name);
        setNewDesc(type.description || '');
        setMaxResidents(type.max_residents.toString());
        setSelectedProfileId(type.billing_profile_id || 'none');
        setIsDialogOpen(true);
    };

    const openCreate = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">House Types</h3>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button size="sm" onClick={openCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Type
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Edit House Type' : 'Add New House Type'}</DialogTitle>
                            <DialogDescription>
                                {editingId ? 'Update details and billing profile for this house type.' : 'Define a new type of house and assign a default billing profile.'}
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateOrUpdate}>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">Name</Label>
                                    <Input
                                        id="name"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="col-span-3"
                                        placeholder="e.g. 4-Bedroom Duplex"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="description" className="text-right">Description</Label>
                                    <Input
                                        id="description"
                                        value={newDesc}
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        className="col-span-3"
                                        placeholder="Optional details"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="maxResidents" className="text-right">Max Res.</Label>
                                    <Input
                                        id="maxResidents"
                                        type="number"
                                        value={maxResidents}
                                        onChange={(e) => setMaxResidents(e.target.value)}
                                        className="col-span-3"
                                        min="1"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="billingProfile" className="text-right">Billing Profile</Label>
                                    <div className="col-span-3">
                                        <Select
                                            value={selectedProfileId}
                                            onValueChange={setSelectedProfileId}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a profile (optional)" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">None</SelectItem>
                                                {billingProfiles?.map((profile: any) => (
                                                    <SelectItem key={profile.id} value={profile.id}>
                                                        {profile.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {editingId ? 'Update' : 'Create'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Billing Rate</TableHead>
                            <TableHead className="text-right">Max Res.</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
                            </TableRow>
                        ) : typesData?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">No house types found.</TableCell>
                            </TableRow>
                        ) : (
                            typesData?.map((type) => (
                                <TableRow key={type.id}>
                                    <TableCell className="font-medium">{type.name}</TableCell>
                                    <TableCell>{type.description || '-'}</TableCell>
                                    <TableCell>
                                        {type.billing_profile?.name || <span className="text-muted-foreground text-xs">Not Set</span>}
                                    </TableCell>
                                    <TableCell className="text-right">{type.max_residents}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(type)}>
                                            <Edit className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
=======
'use client';

import { useState } from 'react';
import { useHouseTypes } from '@/hooks/use-reference';
import { useBillingProfiles } from '@/hooks/use-billing';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createHouseType } from '@/actions/reference/create-house-type';
import { updateHouseType } from '@/actions/reference/update-house-type';
import { toast } from 'sonner';
import { Plus, Loader2, Edit } from 'lucide-react';

export function HouseTypesList() {
    const { data: typesData, isLoading, refetch } = useHouseTypes();
    const { data: billingProfiles } = useBillingProfiles();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [maxResidents, setMaxResidents] = useState('5');
    const [selectedProfileId, setSelectedProfileId] = useState<string>('');

    const resetForm = () => {
        setEditingId(null);
        setNewName('');
        setNewDesc('');
        setMaxResidents('5');
        setSelectedProfileId('');
    };

    const handleCreateOrUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setIsSubmitting(true);
        try {
            const payload = {
                name: newName,
                description: newDesc || undefined,
                max_residents: parseInt(maxResidents) || 5,
                billing_profile_id: selectedProfileId === 'none' ? undefined : selectedProfileId,
            };

            let result;
            if (editingId) {
                result = await updateHouseType(editingId, payload);
            } else {
                result = await createHouseType(payload);
            }

            if (!result.error) {
                toast.success(`House type ${editingId ? 'updated' : 'created'} successfully`);
                resetForm();
                setIsDialogOpen(false);
                refetch();
            } else {
                toast.error(result.error || `Failed to ${editingId ? 'update' : 'create'} house type`);
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openEdit = (type: any) => {
        setEditingId(type.id);
        setNewName(type.name);
        setNewDesc(type.description || '');
        setMaxResidents(type.max_residents.toString());
        setSelectedProfileId(type.billing_profile_id || 'none');
        setIsDialogOpen(true);
    };

    const openCreate = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">House Types</h3>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button size="sm" onClick={openCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Type
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Edit House Type' : 'Add New House Type'}</DialogTitle>
                            <DialogDescription>
                                {editingId ? 'Update details and billing profile for this house type.' : 'Define a new type of house and assign a default billing profile.'}
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateOrUpdate}>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">Name</Label>
                                    <Input
                                        id="name"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="col-span-3"
                                        placeholder="e.g. 4-Bedroom Duplex"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="description" className="text-right">Description</Label>
                                    <Input
                                        id="description"
                                        value={newDesc}
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        className="col-span-3"
                                        placeholder="Optional details"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="maxResidents" className="text-right">Max Res.</Label>
                                    <Input
                                        id="maxResidents"
                                        type="number"
                                        value={maxResidents}
                                        onChange={(e) => setMaxResidents(e.target.value)}
                                        className="col-span-3"
                                        min="1"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="billingProfile" className="text-right">Billing Profile</Label>
                                    <div className="col-span-3">
                                        <Select
                                            value={selectedProfileId}
                                            onValueChange={setSelectedProfileId}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a profile (optional)" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">None</SelectItem>
                                                {billingProfiles?.map((profile: any) => (
                                                    <SelectItem key={profile.id} value={profile.id}>
                                                        {profile.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {editingId ? 'Update' : 'Create'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Billing Rate</TableHead>
                            <TableHead className="text-right">Max Res.</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
                            </TableRow>
                        ) : typesData?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">No house types found.</TableCell>
                            </TableRow>
                        ) : (
                            typesData?.map((type) => (
                                <TableRow key={type.id}>
                                    <TableCell className="font-medium">{type.name}</TableCell>
                                    <TableCell>{type.description || '-'}</TableCell>
                                    <TableCell>
                                        {type.billing_profile?.name || <span className="text-muted-foreground text-xs">Not Set</span>}
                                    </TableCell>
                                    <TableCell className="text-right">{type.max_residents}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(type)}>
                                            <Edit className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
>>>>>>> 6e226d0165174a5da4cc17bd5b203b6a46c531a4
