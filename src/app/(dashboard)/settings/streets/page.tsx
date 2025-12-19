'use client';

import { StreetsList } from '@/components/admin/streets-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function StreetsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Streets</h3>
        <p className="text-sm text-muted-foreground">
          Manage the list of streets in the estate.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Streets Management</CardTitle>
          <CardDescription>
            Add, edit, or remove streets used throughout the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StreetsList />
        </CardContent>
      </Card>
    </div>
  );
}
