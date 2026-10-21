'use client';

import { useState } from 'react';
import { useHouseTypes, useCreateHouseType, useUpdateHouseType } from '@/hooks/use-reference';
import { useBillingProfiles } from '@/hooks/use-billing';
import type { HouseType } from '@/types/database';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
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
import { Loader2, Pencil, Home } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { CrudTable } from '@/components/settings/crud-table';

export function HouseTypesList() {
    const { hasPermission } = useAuth();
    const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_REFERENCE);
    const { data: typesData, isLoading } = useHouseTypes();
    const { data: billingProfiles } = useBillingProfiles();
    const createMutation = useCreateHouseType();
    const updateMutation = useUpdateHouseType();

    const [isDialogOpen, setIsDialogOpen] = useState(false);

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

        try {
            const payload = {
                name: newName,
                description: newDesc || undefined,
                max_residents: parseInt(maxResidents) || 5,
                billing_profile_id: selectedProfileId === 'none' ? undefined : selectedProfileId,
            };

            if (editingId) {
                await updateMutation.mutateAsync({ id: editingId, data: payload });
            } else {
                await createMutation.mutateAsync(payload);
            }
            resetForm();
            setIsDialogOpen(false);
        } catch {
            // Error already handled by mutation hooks
        }
    };

    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const openEdit = (type: HouseType) => {
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
            <CrudTable
                title="House Types"
                addLabel="Add Type"
                onAdd={openCreate}
                canManage={canManage}
                rows={typesData}
                rowLabel={(type) => type.name}
                isLoading={isLoading}
                columns={[
                    { header: 'Name', cell: (type) => type.name, className: 'font-medium' },
                    { header: 'Description', cell: (type) => type.description || '-' },
                    {
                        header: 'Billing Rate',
                        cell: (type) => type.billing_profile?.name || <span className="text-muted-foreground text-xs">Not Set</span>,
                    },
                    { header: 'Max Res.', cell: (type) => type.max_residents, className: 'text-right' },
                ]}
                actions={[{ icon: Pencil, label: 'Edit', onClick: openEdit }]}
                empty={{
                    icon: Home,
                    title: 'No house types yet',
                    description: 'House types set the billing rate and resident limit for each house.',
                }}
            />

            {canManage && (
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
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
                                                {billingProfiles?.map((profile) => (
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
            )}
        </div>
    );
}
