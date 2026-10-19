'use client';

import { useState } from 'react';
import { useStreets, useCreateStreet, useUpdateStreet, useDuplicateStreet, useDeleteStreet } from '@/hooks/use-reference';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Pencil, Copy, Trash2, MapPin } from 'lucide-react';
import type { Street } from '@/types/database';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { ActiveStatusBadge } from '@/components/settings/settings-states';
import { CrudTable } from '@/components/settings/crud-table';

export function StreetsList() {
    const { hasPermission } = useAuth();
    const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_REFERENCE);
    const { data: streetsData, isLoading } = useStreets();
    const createMutation = useCreateStreet();
    const updateMutation = useUpdateStreet();
    const duplicateMutation = useDuplicateStreet();
    const deleteMutation = useDeleteStreet();

    // Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [streetToDelete, setStreetToDelete] = useState<Street | null>(null);

    // Form state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formShortName, setFormShortName] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formIsActive, setFormIsActive] = useState(true);

    const isEditing = editingId !== null;

    const resetForm = () => {
        setEditingId(null);
        setFormName('');
        setFormShortName('');
        setFormDesc('');
        setFormIsActive(true);
    };

    const openCreateDialog = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    const openEditDialog = (street: Street) => {
        setEditingId(street.id);
        setFormName(street.name);
        setFormShortName(street.short_name || '');
        setFormDesc(street.description || '');
        setFormIsActive(street.is_active);
        setIsDialogOpen(true);
    };

    const handleDialogClose = (open: boolean) => {
        if (!open) {
            resetForm();
        }
        setIsDialogOpen(open);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName.trim()) return;

        setIsSubmitting(true);
        try {
            if (isEditing) {
                // Update existing street
                await updateMutation.mutateAsync({
                    id: editingId!,
                    data: {
                        name: formName,
                        short_name: formShortName || undefined,
                        description: formDesc || undefined,
                        is_active: formIsActive,
                    }
                });
            } else {
                // Create new street
                await createMutation.mutateAsync({
                    name: formName,
                    short_name: formShortName || undefined,
                    description: formDesc || undefined,
                });
            }
            setIsDialogOpen(false);
            resetForm();
        } catch {
            // Error already handled by mutation hooks
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDuplicate = async (id: string) => {
        await duplicateMutation.mutateAsync(id);
    };

    const openDeleteDialog = (street: Street) => {
        setStreetToDelete(street);
        setDeleteDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!streetToDelete) return;
        await deleteMutation.mutateAsync(streetToDelete.id);
        setDeleteDialogOpen(false);
        setStreetToDelete(null);
    };

    return (
        <div className="space-y-4">
            <CrudTable
                title="Streets"
                addLabel="Add Street"
                onAdd={openCreateDialog}
                canManage={canManage}
                rows={streetsData}
                rowLabel={(street) => `street ${street.name}`}
                isLoading={isLoading}
                columns={[
                    { header: 'Long Name', cell: (street) => street.name, className: 'font-medium' },
                    { header: 'Short Name', cell: (street) => street.short_name || '-' },
                    { header: 'Description', cell: (street) => street.description || '-' },
                    { header: 'Status', cell: (street) => <ActiveStatusBadge active={street.is_active} />, className: 'w-[100px]' },
                ]}
                actions={[
                    { icon: Pencil, label: 'Edit', onClick: openEditDialog },
                    { icon: Copy, label: 'Duplicate', onClick: (street) => handleDuplicate(street.id), disabled: duplicateMutation.isPending },
                    { icon: Trash2, label: 'Delete', onClick: openDeleteDialog, disabled: deleteMutation.isPending, destructive: true },
                ]}
                empty={{
                    icon: MapPin,
                    title: 'No streets yet',
                    description: 'Streets group houses for billing and reports.',
                }}
            />

            {canManage && (
                <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {isEditing ? 'Edit Street' : 'Add New Street'}
                            </DialogTitle>
                            <DialogDescription>
                                {isEditing
                                    ? 'Update the street details below.'
                                    : 'Create a new street in the estate.'}
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit}>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">
                                        Long Name*
                                    </Label>
                                    <Input
                                        id="name"
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        className="col-span-3"
                                        placeholder="e.g. Oak Avenue"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="short_name" className="text-right">
                                        Short Name
                                    </Label>
                                    <Input
                                        id="short_name"
                                        value={formShortName}
                                        onChange={(e) => setFormShortName(e.target.value)}
                                        className="col-span-3"
                                        placeholder="e.g. Oak Ave"
                                        maxLength={50}
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="description" className="text-right">
                                        Description
                                    </Label>
                                    <Input
                                        id="description"
                                        value={formDesc}
                                        onChange={(e) => setFormDesc(e.target.value)}
                                        className="col-span-3"
                                        placeholder="Optional details"
                                    />
                                </div>
                                {isEditing && (
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="is_active" className="text-right">
                                            Active
                                        </Label>
                                        <div className="col-span-3 flex items-center gap-2">
                                            <Switch
                                                id="is_active"
                                                checked={formIsActive}
                                                onCheckedChange={setFormIsActive}
                                            />
                                            <span className="text-sm text-muted-foreground">
                                                {formIsActive ? 'Street is active' : 'Street is inactive'}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isSubmitting || updateMutation.isPending}>
                                    {(isSubmitting || updateMutation.isPending) && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {isEditing ? 'Save Changes' : 'Create'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Street</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{streetToDelete?.name}&quot;? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setStreetToDelete(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleteMutation.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
