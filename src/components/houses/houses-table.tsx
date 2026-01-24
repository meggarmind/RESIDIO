'use client';

import { useState, memo, useMemo } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { OccupancyBadge } from '@/components/residents/status-badge';
import { useHouses } from '@/hooks/use-houses';
import { useStreets, useHouseTypes } from '@/hooks/use-reference';
import { useDebounce } from '@/hooks/use-debounce';
import {
  Home,
  Plus,
  Search,
  Eye,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { HouseSearchParams } from '@/lib/validators/house';
import { getPropertyShortname } from '@/lib/utils'; // Added cn import

const ALL_VALUE = '_all';

// Type for house data (inferred from API)
interface HouseData {
  id: string;
  house_number: string;
  is_occupied: boolean;
  street?: { name: string } | null;
  house_type?: { name: string } | null;
  street_id?: string;
}

// Memoized row component
const HouseRow = memo(function HouseRow({ house }: { house: HouseData }) {
  return (
    <TableRow className="group">
      <TableCell>
        <span className="font-mono text-sm font-semibold bg-muted px-2 py-1 rounded text-foreground/80 group-hover:bg-background transition-colors border">
          {getPropertyShortname(house)}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-secondary/20 text-secondary-foreground">
            <Home className="h-4 w-4" />
          </div>
          <span className="font-medium">{house.house_number}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{house.street?.name}</TableCell>
      <TableCell className="text-muted-foreground">{house.house_type?.name ?? '-'}</TableCell>
      <TableCell>
        <OccupancyBadge isOccupied={house.is_occupied} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" asChild>
            <Link href={`/houses/${house.id}`}>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" asChild>
            <Link href={`/houses/${house.id}?edit=true`}>
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

export function HousesTable() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [streetId, setStreetId] = useState<string>(ALL_VALUE);
  const [houseTypeId, setHouseTypeId] = useState<string>(ALL_VALUE);
  const [isOccupied, setIsOccupied] = useState<string>(ALL_VALUE);
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);

  // Debounce search to prevent excessive API calls
  const debouncedSearch = useDebounce(search, 300);

  const params: Partial<HouseSearchParams> = {
    search: debouncedSearch || undefined,
    street_id: streetId === ALL_VALUE ? undefined : streetId,
    house_type_id: houseTypeId === ALL_VALUE ? undefined : houseTypeId,
    is_occupied: isOccupied === ALL_VALUE ? undefined : isOccupied === 'true',
    page,
    limit,
  };

  const { data, isLoading, error } = useHouses(params);
  const { data: streets } = useStreets();
  const { data: houseTypes } = useHouseTypes();

  // Calculate active filters count for badges
  const activeFilters = useMemo(() => {
    const filters = [];
    if (streetId !== ALL_VALUE) {
      const label = streets?.find(s => s.id === streetId)?.name || 'Unknown Street';
      filters.push({ id: 'street', label: `Street: ${label}`, onRemove: () => setStreetId(ALL_VALUE) });
    }
    if (houseTypeId !== ALL_VALUE) {
      const label = houseTypes?.find(t => t.id === houseTypeId)?.name || 'Unknown Type';
      filters.push({ id: 'type', label: `Type: ${label}`, onRemove: () => setHouseTypeId(ALL_VALUE) });
    }
    if (isOccupied !== ALL_VALUE) {
      const label = isOccupied === 'true' ? 'Occupied' : 'Vacant';
      filters.push({ id: 'status', label: `Status: ${label}`, onRemove: () => setIsOccupied(ALL_VALUE) });
    }
    if (debouncedSearch) {
      filters.push({ id: 'search', label: `Search: "${debouncedSearch}"`, onRemove: () => setSearch('') });
    }
    return filters;
  }, [streetId, houseTypeId, isOccupied, streets, houseTypes, debouncedSearch]);

  // Reset page when filters change
  // Note: We don't need a useEffect for this if we just ensure we setPage(1) when setting filters
  // But due to complexity of multiple setters, a small effect monitoring params except page might be cleaner,
  // DO NOT use useEffect for this to avoid double fetch. Better to wrap setters or just accept that page might be empty until user clicks back?
  // Current 'HousesTable' had explicit setPage(1) on search.
  // We'll trust the user to navigate back if they filter themselves into an empty page, OR (better) reset page on filter change
  // For this implementation, I will manually setPage(1) in the onChange handlers.

  const handleStreetChange = (val: string) => { setStreetId(val); setPage(1); };
  const handleTypeChange = (val: string) => { setHouseTypeId(val); setPage(1); };
  const handleStatusChange = (val: string) => { setIsOccupied(val); setPage(1); };
  const handleSearchChange = (val: string) => { setSearch(val); setPage(1); };

  const clearAllFilters = () => {
    setStreetId(ALL_VALUE);
    setHouseTypeId(ALL_VALUE);
    setIsOccupied(ALL_VALUE);
    setSearch('');
    setPage(1);
  };

  if (error) {
    return (
      <div className="p-8 text-center text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
        <p className="font-semibold">Error loading property registry</p>
        <p className="text-sm opacity-80">{error.message}</p>
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.count / limit) : 0;
  const startIdx = (page - 1) * limit + 1;
  const endIdx = data ? Math.min(page * limit, data.count) : 0;

  return (
    <div className="space-y-4">
      {/* 1. Integrated Toolbar */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search Area */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
            <Input
              placeholder="Search by house #, street, or resident..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 bg-background/50"
            />
          </div>

          {/* Filter Area - Right Aligned / Wrapped */}
          <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
            <Select value={streetId} onValueChange={handleStreetChange}>
              <SelectTrigger className="w-[140px] flex-1 sm:flex-none">
                <SelectValue placeholder="Street" />
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

            <Select value={houseTypeId} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-[140px] flex-1 sm:flex-none">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All Types</SelectItem>
                {houseTypes?.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={isOccupied} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[140px] flex-1 sm:flex-none">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All Status</SelectItem>
                <SelectItem value="true">Occupied</SelectItem>
                <SelectItem value="false">Vacant</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={() => router.push('/houses/new')} className="hidden sm:flex">
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
            {/* Mobile-only Add Button (icon only to save space) */}
            <Button onClick={() => router.push('/houses/new')} size="icon" className="sm:hidden shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Active Filters Badges */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-in fade-in slide-in-from-top-1">
            <span className="text-xs text-muted-foreground font-medium mr-1">
              Active Filters:
            </span>
            {activeFilters.map((filter) => (
              <Badge
                key={filter.id}
                variant="secondary"
                className="gap-1 px-2 py-1 cursor-pointer hover:bg-secondary/80 transition-colors"
                onClick={filter.onRemove}
              >
                {filter.label}
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </Badge>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearAllFilters}
            >
              Clear all
            </Button>
          </div>
        )}
      </div>

      {/* 2. Table Content Layout */}
      <div className="rounded-xl border shadow-sm bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>House</TableHead>
              <TableHead>Street</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-16 rounded" /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-7 w-7 rounded" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-[300px] text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <div className="p-3 bg-muted/50 rounded-full mb-2">
                      <Search className="h-6 w-6 opacity-50" />
                    </div>
                    <p className="font-medium text-foreground">No properties found</p>
                    <p className="text-sm">Try adjusting your search or filters</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={clearAllFilters}>
                      Clear Filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((house) => (
                <HouseRow key={house.id} house={house} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 3. Pagination Footer */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center py-2">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select
              value={limit.toString()}
              onValueChange={(val) => {
                setLimit(Number(val));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder="20" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="hidden sm:inline-block h-4 w-px bg-border" />
          <span>
            Showing {data && data.count > 0 ? startIdx : 0} to {endIdx} of {data?.count ?? 0}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Simple numbered pagination logic - First, current, last */}
          {totalPages > 0 && (
            <div className="flex items-center gap-1 mx-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Simple sliding window around current page
                let p = page;
                if (page < 3) p = 1 + i;
                else if (page > totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;

                if (p > 0 && p <= totalPages) {
                  return (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  );
                }
                return null;
              })}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}