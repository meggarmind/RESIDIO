'use client';

import { useState, useEffect } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Pencil,
    Trash2,
    Search,
    User,
    HardHat,
    Briefcase,
    Truck,
    X
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

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

    // Calculate pagination
    const totalPages = Math.ceil((personnel.length || 0) / pageSize);
    const paginatedPersonnel = personnel.slice((page - 1) * pageSize, page * pageSize);

    return (
        <div className="space-y-4">
            {/* Integrated Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
                {/* Primary Search - flex-1 for maximum visibility */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, job title, email, or phone..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Filter Dropdown */}
                <Select value={typeFilter} onValueChange={(val) => setTypeFilter(val as PersonnelType | 'all')}>
                    <SelectTrigger className="w-[180px]">
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

                <PersonnelDialog onSuccess={fetchPersonnel} />
            </div>

            {/* Active Filter Badges */}
            {(typeFilter !== 'all' || searchTerm) && (
                <div className="flex items-center gap-2 mb-4">
                    {typeFilter !== 'all' && (
                        <Badge variant="secondary" className="gap-1">
                            Type: <span className="capitalize">{typeFilter}</span>
                            <button
                                onClick={() => setTypeFilter('all')}
                                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {searchTerm && (
                        <Badge variant="secondary" className="gap-1">
                            Search: {searchTerm}
                            <button
                                onClick={() => setSearchTerm('')}
                                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                            setTypeFilter('all');
                            setSearchTerm('');
                            setPage(1);
                        }}
                    >
                        Clear all
                    </Button>
                </div>
            )}

            {/* Table Wrapper */}
            <div className="rounded-xl border overflow-hidden shadow-soft animate-slide-up">
                <Table>
                    <TableHeader>
                        <TableRow interactive={false}>
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
                        ) : paginatedPersonnel.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No personnel found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedPersonnel.map((person) => (
                                <TableRow key={person.id} className="hover:bg-gray-50 dark:hover:bg-[#0F172A]">
                                    <TableCell>
                                        <div className="font-medium">{person.name}</div>
                                        {person.job_title && (
                                            <div className="text-xs text-muted-foreground">{person.job_title}</div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`flex w-fit items-center gap-1 rounded-full ${getTypeColor(person.type as PersonnelType)}`} variant="secondary">
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
                                        <Badge variant={person.status === 'active' ? 'default' : 'secondary'} className="rounded-full">
                                            {person.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8"
                                                onClick={() => {
                                                    setEditPersonnel(person);
                                                    setEditOpen(true);
                                                }}
                                                title="Edit"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 text-red-600"
                                                onClick={() => handleDelete(person.id)}
                                                title="Delete"
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

            {/* Pagination Footer */}
            {personnel.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                    {/* Left Section - Settings */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Rows per page</span>
                            <Select
                                value={pageSize.toString()}
                                onValueChange={(val) => {
                                    setPageSize(Number(val));
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-8 w-[70px] rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, personnel.length)} of {personnel.length} personnel
                        </p>
                    </div>

                    {/* Right Section - Navigation */}
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="h-8 w-9 p-0"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum: number;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (page <= 3) {
                                    pageNum = i + 1;
                                } else if (page >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = page - 2 + i;
                                }
                                return (
                                    <Button
                                        key={pageNum}
                                        variant={page === pageNum ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setPage(pageNum)}
                                        className="h-8 w-9 p-0"
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= totalPages}
                            className="h-8 w-9 p-0"
                        >
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            <PersonnelDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                personnel={editPersonnel}
                onSuccess={fetchPersonnel}
                trigger={null}
            />
        </div>
    );
}
