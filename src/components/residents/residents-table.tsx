'use client';

import { useState, memo, useCallback, useMemo, useEffect } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
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
import { Skeleton } from '@/components/ui/skeleton';
import { AccountStatusBadge, ResidentRoleBadge } from '@/components/residents/status-badge';
import { ContactVerificationBadge } from '@/components/residents/contact-verification-badge';
import { useResidents, useContactVerificationStats } from '@/hooks/use-residents';
import { useStreets } from '@/hooks/use-reference';
import { Users, Plus, Search, Eye, Pencil, UserPlus, ChevronDown, X, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import type { ResidentSearchParams, ContactVerificationFilter } from '@/lib/validators/resident';
import type { AccountStatus, ResidentRole, ResidentWithHouses } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';

const ALL_VALUE = '_all';

// Memoized row component to prevent unnecessary re-renders
// This significantly improves performance for large resident lists
const ResidentRow = memo(function ResidentRow({ resident }: { resident: ResidentWithHouses }) {
  // Show first active house assignment
  const activeHouse = resident.resident_houses?.find((rh) => rh.is_active);
  const address = activeHouse
    ? `${activeHouse.house?.house_number} ${activeHouse.house?.street?.name}`
    : '-';

  return (
    <TableRow>
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
      <TableCell>
        <ContactVerificationBadge
          emailVerifiedAt={resident.email_verified_at}
          phoneVerifiedAt={resident.phone_verified_at}
          hasEmail={!!resident.email}
        />
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
});

// Labels for contact verification filter
const CONTACT_VERIFICATION_LABELS: Record<ContactVerificationFilter | typeof ALL_VALUE, string> = {
  [ALL_VALUE]: 'All Verification',
  verified: 'Verified',
  unverified: 'Unverified',
  incomplete: 'Incomplete',
  partial: 'Partial',
};

export function ResidentsTable() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AccountStatus | typeof ALL_VALUE>(ALL_VALUE);
  const [streetId, setStreetId] = useState<string>(ALL_VALUE);
  const [contactVerification, setContactVerification] = useState<ContactVerificationFilter | typeof ALL_VALUE>(ALL_VALUE);
  const [selectedRoles, setSelectedRoles] = useState<ResidentRole[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  /* eslint-disable react-hooks/exhaustive-deps */
  const debouncedSearch = useDebounce(search, 300);

  // Reset page when search term changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const toggleRole = useCallback((role: ResidentRole) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
    // Reset page when filter changes
    setPage(1);
  }, []);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    // Search is handled by debounce
  }, []);

  const params = useMemo<Partial<ResidentSearchParams>>(() => ({
    search: debouncedSearch || undefined,
    status: status === ALL_VALUE ? undefined : status as AccountStatus,
    street_id: streetId === ALL_VALUE ? undefined : streetId,
    contact_verification: contactVerification === ALL_VALUE ? undefined : contactVerification as ContactVerificationFilter,
    resident_role: selectedRoles.length > 0 ? selectedRoles : undefined,
    resident_role: selectedRoles.length > 0 ? selectedRoles : undefined,
    page,
    limit,
  }), [debouncedSearch, status, streetId, contactVerification, selectedRoles, page, limit]);

  const { data, isLoading, error } = useResidents(params);
  const { data: streets } = useStreets();
  const { data: verificationStats } = useContactVerificationStats();

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

        <Select value={contactVerification} onValueChange={(v) => setContactVerification(v as ContactVerificationFilter | typeof ALL_VALUE)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Verification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Verification</SelectItem>
            <SelectItem value="verified">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                Verified
              </span>
            </SelectItem>
            <SelectItem value="partial">
              <span className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                Partial
              </span>
            </SelectItem>
            <SelectItem value="unverified">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                Unverified
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => router.push('/residents/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Resident
        </Button>
      </div>

      {/* Verification Stats Summary */}
      {verificationStats && (verificationStats.unverified > 0 || verificationStats.partial > 0) && (
        <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
          <div className="text-sm text-muted-foreground">Contact Verification:</div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setContactVerification('verified')}
              className="flex items-center gap-1.5 text-sm hover:underline"
            >
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium">{verificationStats.verified}</span>
              <span className="text-muted-foreground">verified</span>
            </button>
            {verificationStats.partial > 0 && (
              <button
                onClick={() => setContactVerification('partial')}
                className="flex items-center gap-1.5 text-sm hover:underline"
              >
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="font-medium">{verificationStats.partial}</span>
                <span className="text-muted-foreground">partial</span>
              </button>
            )}
            {verificationStats.unverified > 0 && (
              <button
                onClick={() => setContactVerification('unverified')}
                className="flex items-center gap-1.5 text-sm hover:underline"
              >
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-amber-700">{verificationStats.unverified}</span>
                <span className="text-muted-foreground">unverified</span>
              </button>
            )}
          </div>
        </div>
      )}

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

      {/* Active Verification Filter */}
      {contactVerification !== ALL_VALUE && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Verification filter:</span>
          <Badge
            variant="secondary"
            className="cursor-pointer hover:bg-secondary/80"
            onClick={() => setContactVerification(ALL_VALUE)}
          >
            {CONTACT_VERIFICATION_LABELS[contactVerification]}
            <X className="ml-1 h-3 w-3" />
          </Badge>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border overflow-hidden shadow-soft animate-slide-up">
        <Table variant="modern">
          <TableHeader>
            <TableRow interactive={false}>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-6 w-16 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12">
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
              data?.data.map((resident) => (
                <ResidentRow key={resident.id} resident={resident} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && (
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page</span>
              <Select
                value={limit.toString()}
                onValueChange={(v) => {
                  setLimit(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px] rounded-xl">
                  <SelectValue placeholder={limit.toString()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, data.count)} of {data.count} residents
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-9 w-9 p-0"
            >
              <span className="sr-only">Previous page</span>
              <ChevronDown className="h-4 w-4 rotate-90" />
            </Button>

            {Array.from({ length: Math.min(5, Math.ceil(data.count / limit)) }, (_, i) => {
              // Simple windowing logic - in a real app would need complex truncation for large page counts
              // For now, let's do a simple sliding window around current page
              const totalPages = Math.ceil(data.count / limit);
              let pageNum;

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
                  variant={page === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  className={`h-9 w-9 p-0 ${page === pageNum ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  {pageNum}
                </Button>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              disabled={page * limit >= data.count}
              onClick={() => setPage((p) => p + 1)}
              className="h-9 w-9 p-0"
            >
              <span className="sr-only">Next page</span>
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}