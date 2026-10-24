'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResidentForm } from '@/components/residents/resident-form';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { Button } from '@/components/ui/button';
import { useHouse } from '@/hooks/use-houses';
import { ArrowLeft, Users, Loader2 } from 'lucide-react';

function NewResidentContent() {
  const searchParams = useSearchParams();
  const preselectedHouseId = searchParams.get('house_id') ?? undefined;
  const { data: house } = useHouse(preselectedHouseId);

  return (
    <div className="space-y-6">
      {preselectedHouseId && (
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/houses/${preselectedHouseId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to {house ? `${house.short_name || house.house_number}, ${house.street?.name ?? ''}` : 'house'}
          </Link>
        </Button>
      )}
      <EnhancedPageHeader
        title="Add New Resident"
        description="Register a new community member."
        icon={Users}
      />

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
          <ResidentForm preselectedHouseId={preselectedHouseId} />
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
