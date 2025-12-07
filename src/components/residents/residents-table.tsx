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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AccountStatusBadge } from '@/components/residents/status-badge';
import { useResidents } from '@/hooks/use-residents';
import { useStreets } from '@/hooks/use-reference';
import { Users, Plus, Search, Eye, Pencil } from 'lucide-react';
import type { ResidentSearchParams } from '@/lib/validators/resident';
import type { AccountStatus } from '@/types/database';

export function ResidentsTable() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AccountStatus | ''>('');
  const [streetId, setStreetId] = useState<string>('');
  const [page, setPage] = useState(1);

  const params: Partial<ResidentSearchParams> = {
    search: search || undefined,
    status: status as AccountStatus || undefined,
    street_id: streetId || undefined,
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

        <Select value={status} onValueChange={(v) => setStatus(v as AccountStatus | '')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
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
            <SelectItem value="">All Streets</SelectItem>
            {streets?.map((street) => (
              <SelectItem key={street.id} value={street.id}>
                {street.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => router.push('/residents/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Resident
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No residents found
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((resident) => {
                const primaryHouse = resident.resident_houses?.find(
                  (rh) => rh.is_primary && rh.is_active
                );
                const address = primaryHouse
                  ? `${primaryHouse.house?.house_number} ${primaryHouse.house?.street?.name}`
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
