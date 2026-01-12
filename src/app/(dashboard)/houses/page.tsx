'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HousesTable } from '@/components/houses/houses-table';
import { Home } from 'lucide-react';

export default function HousesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Houses</h1>
        <p className="text-muted-foreground">Manage properties in the estate.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Property Registry
          </CardTitle>
          <CardDescription>
            View and manage all houses and properties in the community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HousesTable />
        </CardContent>
      </Card>
    </div>
  );
}
