'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { AccountStatusBadge, ResidentRoleBadge } from '@/components/residents/status-badge';
import { useResidents } from '@/hooks/use-residents';
import { useStreets } from '@/hooks/use-reference';
import { Users, Plus, Search, Eye, Pencil, UserPlus, ChevronDown, X } from 'lucide-react';
import type { ResidentSearchParams } from '@/lib/validators/resident';
import type { AccountStatus, ResidentRole } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';

const ALL_VALUE = '_all';

export function ResidentsTable() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AccountStatus | typeof ALL_VALUE>(ALL_VALUE);
  const [streetId, setStreetId] = useState<string>(ALL_VALUE);
  const [selectedRoles, setSelectedRoles] = useState<ResidentRole[]>([]);
  const [page, setPage] = useState(1);

  const toggleRole = (role: ResidentRole) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const params: Partial<ResidentSearchParams> = {
    search: search || undefined,
    status: status === ALL_VALUE ? undefined : status as AccountStatus,
    street_id: streetId === ALL_VALUE ? undefined : streetId,
    resident_role: selectedRoles.length > 0 ? selectedRoles : undefined,
    page,
    limit: 20,
  };

  const { data, isLoading, error } = useResidents(params);
  const { data: streets } = useStreets();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Error loading residents: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>

        <Select value={status} onValueChange={(v) => setStatus(v as AccountStatus | typeof ALL_VALUE)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <Select value={streetId} onValueChange={setStreetId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Streets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Streets</SelectItem>
            {streets?.map((street) => (
              <SelectItem key={street.id} value={street.id}>
                {street.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[200px] justify-between">
              {selectedRoles.length === 0
                ? 'All Roles'
                : selectedRoles.length === 1
                  ? RESIDENT_ROLE_LABELS[selectedRoles[0]]
                  : `${selectedRoles.length} roles`}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[200px]">
            {selectedRoles.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => setSelectedRoles([])}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear selection
                </Button>
                <DropdownMenuSeparator />
              </>
            )}
            {Object.entries(RESIDENT_ROLE_LABELS).map(([value, label]) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={selectedRoles.includes(value as ResidentRole)}
                onCheckedChange={() => toggleRole(value as ResidentRole)}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button onClick={() => router.push('/residents/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Resident
        </Button>
      </div>

      {/* Active Role Filters */}
      {selectedRoles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtering by:</span>
          {selectedRoles.map(role => (
            <Badge
              key={role}
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80"
              onClick={() => toggleRole(role)}
            >
              {RESIDENT_ROLE_LABELS[role]}
              <X className="ml-1 h-3 w-3" />
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-muted-foreground"
            onClick={() => setSelectedRoles([])}
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12">
                  <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <UserPlus className="size-12 text-muted-foreground" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold">No residents yet</h3>
                      <p className="text-sm text-muted-foreground max-w-md">
                        Get started by adding your first resident to the system
                      </p>
                    </div>
                    <Button onClick={() => router.push('/residents/new')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Resident
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((resident) => {
                // Show first active house assignment (role-based billing determines responsibility, not primary flag)
                const activeHouse = resident.resident_houses?.find(
                  (rh) => rh.is_active
                );
                const address = activeHouse
                  ? `${activeHouse.house?.house_number} ${activeHouse.house?.street?.name}`
                  : '-';

                return (
                  <TableRow key={resident.id}>
                    <TableCell>
                      <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                        {resident.resident_code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {resident.first_name} {resident.last_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{resident.phone_primary}</TableCell>
                    <TableCell>{address}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {resident.resident_houses?.filter(rh => rh.is_active).length ? (
                          resident.resident_houses
                            .filter(rh => rh.is_active)
                            .map((rh) => (
                              <ResidentRoleBadge key={rh.id} role={rh.resident_role} />
                            ))
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Unassigned
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AccountStatusBadge status={resident.account_status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/residents/${resident.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/residents/${resident.id}?edit=true`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.count > 20 && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, data.count)} of {data.count} residents
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 20 >= data.count}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}