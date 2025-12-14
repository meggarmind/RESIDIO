'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResidentForm, type HouseState } from '@/components/residents/resident-form';
import { Users, Loader2 } from 'lucide-react';

function NewResidentContent() {
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

export default function NewResidentPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <NewResidentContent />
    </Suspense>
  );
}
