'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HouseForm } from '@/components/houses/house-form';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { Home } from 'lucide-react';

export default function NewHousePage() {
  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title="Add New House"
        description="Register a new property in the estate."
        icon={Home}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            House Details
          </CardTitle>
          <CardDescription>
            Enter the details for the new property.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HouseForm />
        </CardContent>
      </Card>
    </div>
  );
}
