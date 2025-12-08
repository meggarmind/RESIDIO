'use client';

import { useState } from 'react';
import { useHouseTypes } from '@/hooks/use-reference';
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
import { createHouseType } from '@/actions/reference/create-house-type';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';

export function HouseTypesList() {
    const { data: typesData, isLoading, refetch } = useHouseTypes();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [maxResidents, setMaxResidents] = useState('5');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setIsSubmitting(true);
        try {
            const result = await createHouseType({
                name: newName,
                description: newDesc || undefined,
                max_residents: parseInt(maxResidents) || 5,
            });

            if (!result.error) {
                toast.success('House type created successfully');
                setNewName('');
                setNewDesc('');
                setMaxResidents('5');
                setIsDialogOpen(false);
                refetch();
            } else {
                toast.error(result.error || 'Failed to create house type');
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">House Types</h3>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Type
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New House Type</DialogTitle>
                            <DialogDescription>
                                Define a new type of house (e.g., Duplex, Bungalow).
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreate}>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">
                                        Name
                                    </Label>
                                    <Input
                                        id="name"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="col-span-3"
                                        placeholder="e.g. 4-Bedroom Duplex"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="description" className="text-right">
                                        Description
                                    </Label>
                                    <Input
                                        id="description"
                                        value={newDesc}
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        className="col-span-3"
                                        placeholder="Optional details"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="maxResidents" className="text-right">
                                        Max Residents
                                    </Label>
                                    <Input
                                        id="maxResidents"
                                        type="number"
                                        value={maxResidents}
                                        onChange={(e) => setMaxResidents(e.target.value)}
                                        className="col-span-3"
                                        min="1"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create
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
                            <TableHead className="text-right">Max Res.</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">
                                    Loading house types...
                                </TableCell>
                            </TableRow>
                        ) : typesData?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">
                                    No house types found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            typesData?.map((type) => (
                                <TableRow key={type.id}>
                                    <TableCell className="font-medium">{type.name}</TableCell>
                                    <TableCell>{type.description || '-'}</TableCell>
                                    <TableCell className="text-right">{type.max_residents}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
