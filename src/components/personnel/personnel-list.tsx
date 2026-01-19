'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
    MoreHorizontal,
    Pencil,
    Trash2,
    Search,
    Filter,
    User,
    HardHat,
    Briefcase,
    Truck
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { getPersonnel, deletePersonnel } from '@/actions/personnel/actions';
import { Personnel, PersonnelType } from '@/types/database';
import { PersonnelDialog } from './personnel-dialog';

export function PersonnelList() {
    const [personnel, setPersonnel] = useState<Personnel[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<PersonnelType | 'all'>('all');

    // Dialog states
    const [editPersonnel, setEditPersonnel] = useState<Personnel | undefined>(undefined);
    const [editOpen, setEditOpen] = useState(false);

    const fetchPersonnel = async () => {
        setLoading(true);
        try {
            const { data, error } = await getPersonnel({
                search: searchTerm || undefined,
                type: typeFilter !== 'all' ? typeFilter : undefined,
            });
            if (error) throw new Error(error);
            setPersonnel(data || []);
        } catch (error) {
            console.error(error);
            toast.error('Failed to fetch personnel');
        } finally {
            setLoading(false);
        }
    };

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchPersonnel();
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, typeFilter]);

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this personnel record?')) return;

        try {
            const { success, error } = await deletePersonnel(id);
            if (!success) throw new Error(error || 'Failed to delete');
            toast.success('Personnel deleted successfully');
            fetchPersonnel();
        } catch (error) {
            console.error(error);
            toast.error('Failed to delete personnel');
        }
    }

    const getTypeIcon = (type: PersonnelType) => {
        switch (type) {
            case 'staff': return <User className="h-4 w-4" />;
            case 'contractor': return <HardHat className="h-4 w-4" />;
            case 'vendor': return <Briefcase className="h-4 w-4" />;
            case 'supplier': return <Truck className="h-4 w-4" />;
            default: return <User className="h-4 w-4" />;
        }
    };

    const getTypeColor = (type: PersonnelType) => {
        switch (type) {
            case 'staff': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
            case 'contractor': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
            case 'vendor': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
            case 'supplier': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search name, job title..."
                            className="pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Select value={typeFilter} onValueChange={(val) => setTypeFilter(val as PersonnelType | 'all')}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="contractor">Contractors</SelectItem>
                            <SelectItem value="vendor">Vendors</SelectItem>
                            <SelectItem value="supplier">Suppliers</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <PersonnelDialog onSuccess={fetchPersonnel} />
            </div>

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name / Role</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Contact Info</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                                </TableRow>
                            ))
                        ) : personnel.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No personnel found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            personnel.map((person) => (
                                <TableRow key={person.id}>
                                    <TableCell>
                                        <div className="font-medium">{person.name}</div>
                                        {person.job_title && (
                                            <div className="text-xs text-muted-foreground">{person.job_title}</div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`flex w-fit items-center gap-1 ${getTypeColor(person.type as PersonnelType)}`} variant="secondary">
                                            {getTypeIcon(person.type as PersonnelType)}
                                            <span className="capitalize">{person.type}</span>
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1 text-sm">
                                            {person.email && <div className="flex items-center gap-2">{person.email}</div>}
                                            {person.phone && <div className="flex items-center gap-2">{person.phone}</div>}
                                            {!person.email && !person.phone && <span className="text-muted-foreground italic">No contact info</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={person.status === 'active' ? 'default' : 'secondary'}>
                                            {person.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <span className="sr-only">Open menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => {
                                                    setEditPersonnel(person);
                                                    setEditOpen(true);
                                                }}>
                                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => handleDelete(person.id)}>
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <PersonnelDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                personnel={editPersonnel}
                onSuccess={fetchPersonnel}
                trigger={<></>}
            />
        </div>
    );
}
