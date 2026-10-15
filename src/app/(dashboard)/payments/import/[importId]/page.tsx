'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { IconBox } from '@/components/ui/icon-box';
import { ArrowLeft, FileText } from 'lucide-react';
import { useImport, useImportRowSummary } from '@/hooks/use-imports';
import { getStatusBadge } from '@/components/imports/import-status-badge';
import { ImportSummaryTiles } from '@/components/imports/import-summary-tiles';
import { ImportApprovalPanel } from '@/components/imports/import-approval-panel';

export default function ImportDetailPage() {
  const params = useParams();
  const importId = params.importId as string;

  const {
    data: importRecord,
    isLoading,
    isError,
    error,
  } = useImport(importId);
  const { data: summary } = useImportRowSummary(importId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4 py-12 text-center">
        <Alert variant="destructive" className="mx-auto max-w-xl text-left">
          <AlertTitle>Failed to load import</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
        <Button variant="link" asChild>
          <Link href="/payments/imports">Back to import history</Link>
        </Button>
      </div>
    );
  }

  if (!importRecord) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Import not found</p>
        <Button variant="link" asChild>
          <Link href="/payments/imports">Back to import history</Link>
        </Button>
      </div>
    );
  }

  const bankAccount = importRecord.bank_account;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back to import history">
          <Link href="/payments/imports">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <IconBox color="blue" size="sm">
          <FileText className="h-5 w-5" />
        </IconBox>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{importRecord.file_name}</h1>
          <p className="text-muted-foreground text-sm">
            {bankAccount
              ? `${bankAccount.bank_name} · ${bankAccount.account_number}`
              : importRecord.bank_name || 'Unknown bank account'}
            {' · '}
            {importRecord.created_by_user?.full_name
              ? `Uploaded by ${importRecord.created_by_user.full_name}`
              : 'Uploader not recorded'}
          </p>
        </div>
        <div className="ml-auto">{getStatusBadge(importRecord.status ?? 'pending')}</div>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Rows</CardTitle>
          <CardDescription>How the statement rows were matched</CardDescription>
        </CardHeader>
        <CardContent>
          <ImportSummaryTiles summary={summary} />
        </CardContent>
      </Card>

      <ImportApprovalPanel importId={importId} />
    </div>
  );
}
