'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  ArrowRight,
  Download,
  RotateCcw,
} from 'lucide-react';
import type { ProcessImportResult } from '@/actions/imports/types';

interface ImportResultsProps {
  result: ProcessImportResult;
  onStartOver: () => void;
}

export function ImportResults({ result, onStartOver }: ImportResultsProps) {
  const isSuccess = result.success && result.error_count === 0;
  const isPartialSuccess = result.success && result.error_count > 0;
  const isFailed = !result.success;

  const handleDownloadLog = () => {
    const logContent = {
      timestamp: new Date().toISOString(),
      import_id: result.import_id,
      success: result.success,
      summary: {
        created: result.created_count,
        skipped: result.skipped_count,
        errors: result.error_count,
      },
      errors: result.errors,
    };

    const blob = new Blob([JSON.stringify(logContent, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-log-${result.import_id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {isSuccess && (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <AlertTitle className="text-green-800 dark:text-green-200">
            Import Successful!
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            All payments have been created and wallets have been credited.
          </AlertDescription>
        </Alert>
      )}

      {isPartialSuccess && (
        <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-200">
            Import Completed with Errors
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-300">
            Some payments were created, but {result.error_count} row(s) encountered errors.
          </AlertDescription>
        </Alert>
      )}

      {isFailed && (
        <Alert variant="destructive">
          <XCircle className="h-5 w-5" />
          <AlertTitle>Import Failed</AlertTitle>
          <AlertDescription>
            The import could not be completed. Please review the errors below.
          </AlertDescription>
        </Alert>
      )}

      {/* Result Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-6 border rounded-lg text-center bg-green-50 dark:bg-green-950/20">
          <CheckCircle2 className="h-8 w-8 mx-auto text-green-600 mb-2" />
          <p className="text-3xl font-bold text-green-600">{result.created_count}</p>
          <p className="text-sm text-muted-foreground">Payments Created</p>
        </div>
        <div className="p-6 border rounded-lg text-center bg-orange-50 dark:bg-orange-950/20">
          <AlertTriangle className="h-8 w-8 mx-auto text-orange-600 mb-2" />
          <p className="text-3xl font-bold text-orange-600">{result.skipped_count}</p>
          <p className="text-sm text-muted-foreground">Rows Skipped</p>
        </div>
        <div className="p-6 border rounded-lg text-center bg-red-50 dark:bg-red-950/20">
          <XCircle className="h-8 w-8 mx-auto text-red-600 mb-2" />
          <p className="text-3xl font-bold text-red-600">{result.error_count}</p>
          <p className="text-sm text-muted-foreground">Errors</p>
        </div>
      </div>

      {/* Error Details */}
      {result.errors.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Error Details</h3>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Row ID</TableHead>
                  <TableHead>Error Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.slice(0, 10).map((error, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-xs">
                      {error.row_id ? error.row_id.slice(0, 8) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm text-destructive">
                      {error.error}
                    </TableCell>
                  </TableRow>
                ))}
                {result.errors.length > 10 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      ... and {result.errors.length - 10} more errors
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* What Happened */}
      {result.created_count > 0 && (
        <div className="p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-2">What happened:</h4>
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>{result.created_count} payment record(s) created</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Resident wallets credited with payment amounts</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Wallet balances automatically allocated to unpaid invoices</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>All actions logged in audit trail</span>
            </li>
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4 pt-4">
        <Button asChild>
          <Link href="/payments">
            <ArrowRight className="h-4 w-4 mr-2" />
            View Payments
          </Link>
        </Button>
        <Button variant="outline" onClick={onStartOver}>
          <Plus className="h-4 w-4 mr-2" />
          Import Another File
        </Button>
        {result.errors.length > 0 && (
          <Button variant="outline" onClick={handleDownloadLog}>
            <Download className="h-4 w-4 mr-2" />
            Download Error Log
          </Button>
        )}
      </div>
    </div>
  );
}
