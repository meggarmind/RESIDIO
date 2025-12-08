'use client';

import { useState } from 'react';
import { useStreets } from '@/hooks/use-reference'; // Assuming specific hook or use generic React Query
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
import { createStreet } from '@/actions/reference/create-street';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';

export function StreetsList() {
    const { data: streetsData, isLoading, refetch } = useStreets();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newStreetName, setNewStreetName] = useState('');
    const [newStreetDesc, setNewStreetDesc] = useState('');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStreetName.trim()) return;

        setIsSubmitting(true);
        try {
            const result = await createStreet({
                name: newStreetName,
                description: newStreetDesc || undefined,
            });

            if (!result.error) {
                toast.success('Street created successfully');
                setNewStreetName('');
                setNewStreetDesc('');
                setIsDialogOpen(false);
                refetch();
            } else {
                toast.error(result.error || 'Failed to create street');
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
                <h3 className="text-lg font-medium">Streets</h3>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Street
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Street</DialogTitle>
                            <DialogDescription>
                                Create a new street in the estate.
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
                                        value={newStreetName}
                                        onChange={(e) => setNewStreetName(e.target.value)}
                                        className="col-span-3"
                                        placeholder="e.g. Oak Avenue"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="description" className="text-right">
                                        Description
                                    </Label>
                                    <Input
                                        id="description"
                                        value={newStreetDesc}
                                        onChange={(e) => setNewStreetDesc(e.target.value)}
                                        className="col-span-3"
                                        placeholder="Optional details"
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
                            <TableHead className="w-[100px]">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">
                                    Loading streets...
                                </TableCell>
                            </TableRow>
                        ) : streetsData?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center">
                                    No streets found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            streetsData?.map((street) => (
                                <TableRow key={street.id}>
                                    <TableCell className="font-medium">{street.name}</TableCell>
                                    <TableCell>{street.description || '-'}</TableCell>
                                    <TableCell>
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${street.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {street.is_active ? 'Active' : 'Inactive'}
                                        </span>
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
