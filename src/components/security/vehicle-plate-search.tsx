'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Car, Loader2, Search } from 'lucide-react';
import { useSearchVehicleByPlate, useCurrentUserSecurityPermissions } from '@/hooks/use-security';
import { SecurityContactStatusBadge } from './security-badges';
import { describeVehicle } from './contact-vehicles-card';
import { toast } from 'sonner';
import type { VisitorVehicleWithContact } from '@/types/database';

/**
 * Looks up an active vehicle by plate and shows whose it is (#121, SG-02).
 * Gated on security.view, the permission searchVehicleByPlate enforces.
 */
export function VehiclePlateSearch() {
  const { data: permissionsData } = useCurrentUserSecurityPermissions();
  const canSearch = permissionsData?.permissions?.view_contacts || false;

  const [plate, setPlate] = useState('');
  // undefined = not searched yet, null = searched with no match
  const [result, setResult] = useState<VisitorVehicleWithContact | null | undefined>(undefined);
  const searchMutation = useSearchVehicleByPlate();

  if (!canSearch) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate.trim()) return;
    try {
      setResult(await searchMutation.mutateAsync(plate));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Search failed');
      setResult(undefined);
    }
  };

  const contact = result?.contact;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Car className="h-5 w-5" />
          Look Up Plate
        </CardTitle>
        <CardDescription>Find the registered contact for a vehicle at the gate</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-4">
          <Input
            aria-label="Plate number"
            placeholder="Enter plate (e.g., LAG-123-AB)"
            className="font-mono uppercase"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
          />
          <Button type="submit" variant="outline" disabled={!plate.trim() || searchMutation.isPending}>
            {searchMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search
              </>
            )}
          </Button>
        </form>

        {result === null && (
          <p className="text-sm text-muted-foreground">No active vehicle is registered with that plate.</p>
        )}
        {result && contact && (
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold tracking-wider">{result.plate_number}</span>
                <span className="text-xs text-muted-foreground">{describeVehicle(result)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{contact.full_name}</span>
                <SecurityContactStatusBadge status={contact.status} />
              </div>
              {contact.resident && (
                <p className="text-xs text-muted-foreground">
                  Visiting: {contact.resident.first_name} {contact.resident.last_name} ({contact.resident.resident_code})
                </p>
              )}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/security/contacts/${contact.id}`}>View Contact →</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
