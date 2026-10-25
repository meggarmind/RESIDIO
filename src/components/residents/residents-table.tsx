'use client';

import { useState, memo, useCallback, useMemo, useEffect, useRef } from 'react';
import { getLastSharedElementName, isSharedTransitionActive, navigateWithSharedElement } from '@/lib/navigation/shared-element-transition';
import { useDebounce } from '@/hooks/use-debounce';
import { usePersistedState } from '@/hooks/use-persisted-state';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { RecordCard } from '@/components/ui/record-card';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { AccountStatusBadge, ResidentRoleBadge } from '@/components/residents/status-badge';
import { ContactVerificationBadge } from '@/components/residents/contact-verification-badge';
import { ResidentQuickView } from '@/components/residents/resident-quick-view';
import { useAdminResidents, useContactVerificationStats } from '@/hooks/use-residents';
import { useStreets } from '@/hooks/use-reference';
import { Users, Plus, Search, Pencil, UserPlus, ChevronDown, X, CheckCircle2, AlertCircle, Clock, Eye } from 'lucide-react';
import type { ResidentSearchParams, ContactVerificationFilter } from '@/lib/validators/resident';
import type { AccountStatus, ResidentRole, ResidentWithHouses } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const ALL_VALUE = '_all';

type ResidentSortKey = 'resident_code' | 'first_name' | 'house_number';

type NavigateHandler = (id: string, el: HTMLElement | null, event: React.MouseEvent) => void;

// Show first active house assignment, plus the unique roles across active assignments
function summarizeResident(resident: ResidentWithHouses) {
  const activeHouse = resident.resident_houses?.find((rh) => rh.is_active);
  const address = activeHouse
    ? `${activeHouse.house?.house_number} ${activeHouse.house?.street?.name}`
    : '-';
  const activeAssignments = resident.resident_houses?.filter((rh) => rh.is_active) ?? [];
  const uniqueActiveRoles = Array.from(new Set(activeAssignments.map((rh) => rh.resident_role)));
  return { address, activeAssignments, uniqueActiveRoles };
}

// True when the element and every ancestor take part in layout. The table row
// and the phone card both live in the DOM and CSS hides one of them, so only a
// displayed element may claim a view-transition name (names must be unique).
function isDisplayed(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (getComputedStyle(node).display === 'none') return false;
  }
  return true;
}

// Reverse shared-element transition: when returning from this resident's
// detail page, name the visible row/card so the header morphs back into it. Only
// while a shared transition is active; the helper clears the name afterwards.
function claimReturnTransitionName(residentId: string, el: HTMLElement | null) {
  const name = `resident-${residentId}`;
  if (el && isSharedTransitionActive() && getLastSharedElementName() === name && isDisplayed(el)) {
    el.style.viewTransitionName = name;
    el.dataset.sharedTarget = 'true';
  }
}

function useReturnTransitionName<T extends HTMLElement>(residentId: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    claimReturnTransitionName(residentId, ref.current);
  }, [residentId]);
  return ref;
}

// Preview and Edit buttons, shared by the table row and the phone card
function ResidentActions({ resident, onPreview }: { resident: ResidentWithHouses; onPreview: (id: string) => void }) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Preview resident"
        onClick={(event) => {
          event.stopPropagation();
          onPreview(resident.id);
        }}
      >
        <Eye className="h-4 w-4" />
      </Button>
      <Can permission={PERMISSIONS.RESIDENTS_UPDATE}>
        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label="Edit resident"
          onClick={(e) => e.stopPropagation()}
        >
          <Link href={`/residents/${resident.id}?edit=true`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
      </Can>
    </>
  );
}

// Memoized phone card, the stacked counterpart of a table row (below md)
const ResidentCard = memo(function ResidentCard({ resident, onNavigate, onPreview }: { resident: ResidentWithHouses; onNavigate: NavigateHandler; onPreview: (id: string) => void }) {
  const { address } = summarizeResident(resident);
  const cardRef = useReturnTransitionName<HTMLDivElement>(resident.id);

  return (
    <RecordCard
      ref={cardRef}
      data-testid="resident-card"
      title={`${resident.first_name} ${resident.last_name}`}
      badge={<AccountStatusBadge status={resident.account_status} />}
      subtitle={address === '-' ? resident.resident_code : `${resident.resident_code} · ${address}`}
      label={`Open ${resident.first_name} ${resident.last_name}`}
      onClick={(event, card) => onNavigate(resident.id, card, event)}
      actions={
        <>
          <div className="mr-auto">
            <ContactVerificationBadge
              emailVerifiedAt={resident.email_verified_at}
              phoneVerifiedAt={resident.phone_verified_at}
              hasEmail={!!resident.email}
            />
          </div>
          <ResidentActions resident={resident} onPreview={onPreview} />
        </>
      }
    >
      <RoleBadges resident={resident} />
    </RecordCard>
  );
});

function RoleBadges({ resident }: { resident: ResidentWithHouses }) {
  const { activeAssignments, uniqueActiveRoles } = summarizeResident(resident);
  return (
    <div className="flex flex-wrap gap-1">
      {activeAssignments.length ? (
        uniqueActiveRoles.map((role) => <ResidentRoleBadge key={role} role={role} />)
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Unassigned
        </Badge>
      )}
    </div>
  );
}

// Sort options for the phone sort control (the table uses its column headers)
export const RESIDENT_SORT_OPTIONS = [
  { value: 'resident_code', label: 'Code' },
  { value: 'first_name', label: 'Name' },
  { value: 'house_number', label: 'House' },
];

// Labels for contact verification filter
const CONTACT_VERIFICATION_LABELS: Record<ContactVerificationFilter | typeof ALL_VALUE, string> = {
  [ALL_VALUE]: 'All Verification',
  verified: 'Verified',
  unverified: 'Unverified',
  incomplete: 'Incomplete',
  partial: 'Partial',
};

const columns: DataTableColumn<ResidentWithHouses>[] = [
  {
    key: 'resident_code',
    header: 'Code',
    sortable: true,
    identifier: true,
    cell: (resident) => (
      <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{resident.resident_code}</span>
    ),
  },
  {
    key: 'first_name',
    header: 'Name',
    sortable: true,
    cell: (resident) => (
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">
          {resident.first_name} {resident.last_name}
        </span>
      </div>
    ),
  },
  { key: 'phone', header: 'Phone', hideBelow: 'xl', cell: (resident) => resident.phone_primary },
  {
    key: 'house_number',
    header: 'Address',
    sortable: true,
    cell: (resident) => summarizeResident(resident).address,
  },
  { key: 'role', header: 'Role', cell: (resident) => <RoleBadges resident={resident} /> },
  { key: 'status', header: 'Status', cell: (resident) => <AccountStatusBadge status={resident.account_status} /> },
  {
    key: 'verified',
    header: 'Verified',
    hideBelow: 'lg',
    cell: (resident) => (
      <ContactVerificationBadge
        emailVerifiedAt={resident.email_verified_at}
        phoneVerifiedAt={resident.phone_verified_at}
        hasEmail={!!resident.email}
      />
    ),
  },
];

export function ResidentsTable() {
  const router = useRouter();
  const [search, setSearch] = usePersistedState('residents-registry:search', '');
  const [status, setStatus] = usePersistedState<AccountStatus | typeof ALL_VALUE>('residents-registry:status', ALL_VALUE);
  const [streetId, setStreetId] = usePersistedState<string>('residents-registry:street', ALL_VALUE);
  const [contactVerification, setContactVerification] = usePersistedState<ContactVerificationFilter | typeof ALL_VALUE>('residents-registry:verification', ALL_VALUE);
  const [selectedRoles, setSelectedRoles] = usePersistedState<ResidentRole[]>('residents-registry:roles', []);
  const [page, setPage] = usePersistedState('residents-registry:page', 1);
  const [limit, setLimit] = usePersistedState('residents-registry:limit', 20);
  const [sortBy, setSortBy] = usePersistedState<ResidentSortKey | undefined>('residents-registry:sortBy', undefined);
  const [sortOrder, setSortOrder] = usePersistedState<'asc' | 'desc'>('residents-registry:sortOrder', 'asc');
  const [previewResidentId, setPreviewResidentId] = useState<string | null>(null);

  const handleSortChange = useCallback((next: DataTableSort) => {
    setSortBy(next.key as ResidentSortKey);
    setSortOrder(next.order);
  }, [setSortBy, setSortOrder]);

  const handleNavigate = useCallback<NavigateHandler>((id, el, event) => {
    void navigateWithSharedElement({
      push: (href) => router.push(href),
      href: `/residents/${id}`,
      sourceEl: el,
      name: `resident-${id}`,
      event,
    });
  }, [router]);

   
  const debouncedSearch = useDebounce(search, 300);

  const toggleRole = useCallback((role: ResidentRole) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
    // Reset page when filter changes
    setPage(1);
  }, [setPage, setSelectedRoles]);

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
    sort_by: sortBy,
    sort_order: sortBy ? sortOrder : undefined,
    page,
    limit,
  }), [debouncedSearch, status, streetId, contactVerification, selectedRoles, sortBy, sortOrder, page, limit]);

  const { data, isLoading, error } = useAdminResidents(params);
  const { data: streets } = useStreets();
  const { data: verificationStats } = useContactVerificationStats();

  // Shown in the table's empty row and in the phone card list
  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-4 text-center">
      <UserPlus className="size-12 text-muted-foreground" />
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">No residents yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Get started by adding your first resident to the system
        </p>
      </div>
      <Can permission={PERMISSIONS.RESIDENTS_CREATE}>
        <Button onClick={() => router.push('/residents/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Resident
        </Button>
      </Can>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
        <form onSubmit={handleSearch} className="flex-1 min-w-[12rem]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or code..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
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

      </div>

      {/* Verification Stats Summary */}
      {verificationStats && (verificationStats.unverified > 0 || verificationStats.partial > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-medium text-muted-foreground">Verification</span>
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

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(resident) => resident.id}
        isLoading={isLoading}
        error={error}
        emptyState={emptyState}
        sort={sortBy ? { key: sortBy, order: sortOrder } : undefined}
        onSortChange={handleSortChange}
        pagination={{
          page,
          pageSize: limit,
          totalCount: data?.count ?? 0,
          onPageChange: setPage,
          onPageSizeChange: setLimit,
        }}
        onRowClick={(resident, el, event) => handleNavigate(resident.id, el, event)}
        rowRef={(resident, el) => claimReturnTransitionName(resident.id, el)}
        actions={(resident) => <ResidentActions resident={resident} onPreview={setPreviewResidentId} />}
        renderCard={(resident) => (
          <ResidentCard resident={resident} onNavigate={handleNavigate} onPreview={setPreviewResidentId} />
        )}
        sortOptions={RESIDENT_SORT_OPTIONS}
        itemLabel="residents"
        cardListTestId="resident-card-list"
      />

      <ResidentQuickView
        residentId={previewResidentId}
        open={previewResidentId !== null}
        onOpenChange={(open) => !open && setPreviewResidentId(null)}
      />
    </div>
  );
}
