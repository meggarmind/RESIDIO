'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResidentForm } from '@/components/residents/resident-form';
import { Users } from 'lucide-react';

export default function NewResidentPage() {
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
          <ResidentForm />
        </CardContent>
      </Card>
    </div>
  );
}
