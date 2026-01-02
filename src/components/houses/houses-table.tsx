'use client';

import { useState, memo } from 'react';
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
import { OccupancyBadge } from '@/components/residents/status-badge';
import { useHouses } from '@/hooks/use-houses';
import { useStreets, useHouseTypes } from '@/hooks/use-reference';
import { Home, Plus, Search, Eye, Pencil } from 'lucide-react';
import type { HouseSearchParams } from '@/lib/validators/house';
import { getPropertyShortname } from '@/lib/utils';

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

// Memoized row component to prevent unnecessary re-renders
const HouseRow = memo(function HouseRow({ house }: { house: HouseData }) {
  return (
    <TableRow>
      <TableCell>
        <span className="font-mono text-sm font-semibold bg-muted px-2 py-0.5 rounded">
          {getPropertyShortname(house)}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{house.house_number}</span>
        </div>
      </TableCell>
      <TableCell>{house.street?.name}</TableCell>
      <TableCell>{house.house_type?.name ?? '-'}</TableCell>
      <TableCell>
        <OccupancyBadge isOccupied={house.is_occupied} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/houses/${house.id}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/houses/${house.id}?edit=true`}>
              <Pencil className="h-4 w-4" />
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
  const [page, setPage] = useState(1);

  const params: Partial<HouseSearchParams> = {
    search: search || undefined,
    street_id: streetId === ALL_VALUE ? undefined : streetId,
    house_type_id: houseTypeId === ALL_VALUE ? undefined : houseTypeId,
    is_occupied: isOccupied === ALL_VALUE ? undefined : isOccupied === 'true',
    page,
    limit: 20,
  };

  const { data, isLoading, error } = useHouses(params);
  const { data: streets } = useStreets();
  const { data: houseTypes } = useHouseTypes();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Error loading houses: {error.message}
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
              placeholder="Search by house number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>

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

        <Select value={houseTypeId} onValueChange={setHouseTypeId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Types" />
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

        <Select value={isOccupied} onValueChange={setIsOccupied}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Status</SelectItem>
            <SelectItem value="true">Occupied</SelectItem>
            <SelectItem value="false">Vacant</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => router.push('/houses/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Add House
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property ID</TableHead>
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
                  <TableCell><Skeleton className="h-5 w-20 rounded" /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No houses found
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

      {/* Pagination */}
      {data && data.count > 20 && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, data.count)} of {data.count} houses
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 20 >= data.count}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}