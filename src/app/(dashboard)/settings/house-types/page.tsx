'use client';

import { HouseTypesList } from '@/components/admin/house-types-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HouseTypesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">House Types</h3>
        <p className="text-sm text-muted-foreground">
          Manage house types and their associated billing profiles.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>House Types Management</CardTitle>
          <CardDescription>
            Configure house types and link them to billing profiles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HouseTypesList />
        </CardContent>
      </Card>
    </div>
  );
}
