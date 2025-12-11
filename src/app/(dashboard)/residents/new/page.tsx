'use client';

import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResidentForm, type HouseState } from '@/components/residents/resident-form';
import { Users } from 'lucide-react';

export default function NewResidentPage() {
  const searchParams = useSearchParams();
  const preselectedHouseId = searchParams.get('house_id') ?? undefined;
  const houseState = searchParams.get('house_state') as HouseState | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Add New Resident</h1>
        <p className="text-muted-foreground">Register a new community member.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Resident Details
          </CardTitle>
          <CardDescription>
            Enter the details for the new resident.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResidentForm preselectedHouseId={preselectedHouseId} houseState={houseState} />
        </CardContent>
      </Card>
    </div>
  );
}
