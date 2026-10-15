'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload } from 'lucide-react';
import { ImportHistoryTable } from '@/components/imports/import-history-table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';

export default function ImportHistoryPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back to payments">
          <Link href="/payments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Import History</h1>
          <p className="text-muted-foreground">
            Bank statement imports. Use Needs approval to see the ones waiting for sign-off.
          </p>
        </div>
        <Can permission={PERMISSIONS.IMPORTS_CREATE}>
          <Button className="ml-auto" asChild>
            <Link href="/payments/import">
              <Upload className="h-4 w-4 mr-2" />
              Import statement
            </Link>
          </Button>
        </Can>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Imports</CardTitle>
          <CardDescription>Open an import to approve, reject or process it</CardDescription>
        </CardHeader>
        <CardContent>
          <ImportHistoryTable
            onViewDetails={(importId) => router.push(`/payments/import/${importId}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
