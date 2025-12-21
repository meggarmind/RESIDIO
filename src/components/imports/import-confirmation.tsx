'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck,
} from 'lucide-react';
import { useImport, useImportRowSummary, useProcessImport } from '@/hooks/use-imports';
import type { ProcessImportResult } from '@/actions/imports/types';

interface ImportConfirmationProps {
  importId: string;
  onComplete: (result: ProcessImportResult) => void;
  onBack: () => void;
}

export function ImportConfirmation({ importId, onComplete, onBack }: ImportConfirmationProps) {
  const [processingMode, setProcessingMode] = useState<'atomic' | 'individual'>('individual');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [skipUnmatched, setSkipUnmatched] = useState(true);

  const { data: importData, isLoading: isLoadingImport } = useImport(importId);
  const { data: summaryData, isLoading: isLoadingSummary } = useImportRowSummary(importId);
  const processImportMutation = useProcessImport();

  const summary = summaryData;
  const importRecord = importData;

  const handleProcess = async () => {
    try {
      const result = await processImportMutation.mutateAsync({
        import_id: importId,
        mode: processingMode,
        skip_duplicates: skipDuplicates,
        skip_unmatched: skipUnmatched,
      });

      onComplete(result);
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (isLoadingImport || isLoadingSummary) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg font-medium">Loading import details...</p>
      </div>
    );
  }

  const rowsToProcess = summary?.matched || 0;
  const willBeSkipped = (skipUnmatched ? (summary?.unmatched || 0) : 0) +
    (summary?.duplicate || 0);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 border rounded-lg text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FileCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{summary?.total || 0}</p>
          <p className="text-sm text-muted-foreground">Total Rows</p>
        </div>
        <div className="p-4 border rounded-lg text-center bg-green-50 dark:bg-green-950/20">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">{summary?.matched || 0}</p>
          <p className="text-sm text-muted-foreground">To Process</p>
        </div>
        <div className="p-4 border rounded-lg text-center bg-yellow-50 dark:bg-yellow-950/20">
          <div className="flex items-center justify-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
          </div>
          <p className="text-2xl font-bold text-yellow-600">{summary?.unmatched || 0}</p>
          <p className="text-sm text-muted-foreground">Unmatched</p>
        </div>
        <div className="p-4 border rounded-lg text-center bg-orange-50 dark:bg-orange-950/20">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-orange-600">{summary?.duplicate || 0}</p>
          <p className="text-sm text-muted-foreground">Duplicates</p>
        </div>
      </div>

      {/* Import Details */}
      <div className="p-4 border rounded-lg space-y-2">
        <h3 className="font-medium">Import Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">File:</span>
            <span className="ml-2 font-medium">{importRecord?.file_name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Type:</span>
            <span className="ml-2 font-medium uppercase">{importRecord?.file_type}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Transaction Filter:</span>
            <span className="ml-2 font-medium capitalize">{importRecord?.transaction_filter}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Bank:</span>
            <span className="ml-2 font-medium">{importRecord?.bank_name}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Processing Options */}
      <div className="space-y-6">
        <h3 className="font-medium text-lg">Processing Options</h3>

        {/* Processing Mode */}
        <div className="space-y-3">
          <Label className="text-base">Processing Mode</Label>
          <RadioGroup
            value={processingMode}
            onValueChange={(v) => setProcessingMode(v as 'atomic' | 'individual')}
            className="space-y-2"
          >
            <div className="flex items-start space-x-3 p-3 border rounded-lg">
              <RadioGroupItem value="individual" id="individual" className="mt-1" />
              <div>
                <Label htmlFor="individual" className="font-medium cursor-pointer">
                  Individual (Recommended)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Process each row separately. If one fails, others still succeed.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 border rounded-lg">
              <RadioGroupItem value="atomic" id="atomic" className="mt-1" />
              <div>
                <Label htmlFor="atomic" className="font-medium cursor-pointer">
                  Atomic (All or Nothing)
                </Label>
                <p className="text-sm text-muted-foreground">
                  All rows must succeed. If one fails, all are rolled back.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Skip Options */}
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="skip-duplicates"
              checked={skipDuplicates}
              onCheckedChange={(checked) => setSkipDuplicates(checked === true)}
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor="skip-duplicates" className="cursor-pointer">
                Skip potential duplicates
              </Label>
              <p className="text-sm text-muted-foreground">
                Rows with matching reference or amount/date will be skipped
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="skip-unmatched"
              checked={skipUnmatched}
              onCheckedChange={(checked) => setSkipUnmatched(checked === true)}
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor="skip-unmatched" className="cursor-pointer">
                Skip unmatched rows
              </Label>
              <p className="text-sm text-muted-foreground">
                Rows without a matched resident will be skipped
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {(summary?.unmatched || 0) > 0 && !skipUnmatched && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>
            You have {summary?.unmatched} unmatched rows and &quot;Skip unmatched rows&quot; is disabled.
            These rows will cause errors during processing.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary of what will happen */}
      <div className="p-4 bg-muted rounded-lg">
        <h4 className="font-medium mb-2">What will happen:</h4>
        <ul className="space-y-1 text-sm">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>{rowsToProcess} payment(s) will be created</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>Resident wallets will be credited automatically</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>Unpaid invoices will be allocated using FIFO</span>
          </li>
          {willBeSkipped > 0 && (
            <li className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-orange-600" />
              <span>{willBeSkipped} row(s) will be skipped</span>
            </li>
          )}
        </ul>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={handleProcess}
          disabled={rowsToProcess === 0 || processImportMutation.isPending}
          size="lg"
          className="min-w-[180px]"
        >
          {processImportMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Process {rowsToProcess} Payment{rowsToProcess !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
