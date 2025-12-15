'use client';

import { useState } from 'react';
import { useStreets, useUpdateStreet, useDuplicateStreet, useDeleteStreet } from '@/hooks/use-reference';
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
import { createStreet } from '@/actions/reference/create-street';
import { toast } from 'sonner';
import { Plus, Loader2, Pencil, Copy, Trash2 } from 'lucide-react';
import type { Street } from '@/types/database';

export function StreetsList() {
    const { data: streetsData, isLoading, refetch } = useStreets();
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
                setIsDialogOpen(false);
                resetForm();
            } else {
                // Create new street
                const result = await createStreet({
                    name: formName,
                    short_name: formShortName || undefined,
                    description: formDesc || undefined,
                });

                if (!result.error) {
                    toast.success('Street created successfully');
                    setIsDialogOpen(false);
                    resetForm();
                    refetch();
                } else {
                    toast.error(result.error || 'Failed to create street');
                }
            }
        } catch (error) {
            // Error already handled by mutation hook for updates
            if (!isEditing) {
                toast.error('An unexpected error occurred');
            }
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
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Streets</h3>
                <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
                    <DialogTrigger asChild>
                        <Button size="sm" onClick={openCreateDialog}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Street
                        </Button>
                    </DialogTrigger>
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
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Long Name</TableHead>
                            <TableHead>Short Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead className="w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    Loading streets...
                                </TableCell>
                            </TableRow>
                        ) : streetsData?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No streets found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            streetsData?.map((street) => (
                                <TableRow key={street.id}>
                                    <TableCell className="font-medium">{street.name}</TableCell>
                                    <TableCell>{street.short_name || '-'}</TableCell>
                                    <TableCell>{street.description || '-'}</TableCell>
                                    <TableCell>
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                street.is_active
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}
                                        >
                                            {street.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => openEditDialog(street)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => handleDuplicate(street.id)}
                                                disabled={duplicateMutation.isPending}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                onClick={() => openDeleteDialog(street)}
                                                disabled={deleteMutation.isPending}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

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
