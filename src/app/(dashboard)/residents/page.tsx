'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

export default function ResidentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Residents</h1>
        <p className="text-muted-foreground">Manage community members and their access.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Resident Management
          </CardTitle>
          <CardDescription>
            View, add, and manage residents in your community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Resident management features will be available in Phase 3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
