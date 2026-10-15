'use client';

import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export interface ImportRowSummary {
  total?: number;
  matched?: number;
  unmatched?: number;
  duplicate?: number;
}

export interface ImportProcessingOptionValues {
  processingMode: 'atomic' | 'individual';
  skipDuplicates: boolean;
  skipUnmatched: boolean;
}

export const DEFAULT_PROCESSING_OPTIONS: ImportProcessingOptionValues = {
  processingMode: 'individual',
  skipDuplicates: true,
  skipUnmatched: true,
};

interface ImportProcessingOptionsProps {
  summary: ImportRowSummary | null | undefined;
  values: ImportProcessingOptionValues;
  onChange: (values: ImportProcessingOptionValues) => void;
}

/** The processing options form and the what-will-happen summary, shown once an import is approved. */
export function ImportProcessingOptions({ summary, values, onChange }: ImportProcessingOptionsProps) {
  const { processingMode, skipDuplicates, skipUnmatched } = values;
  const setProcessingMode = (v: 'atomic' | 'individual') => onChange({ ...values, processingMode: v });
  const setSkipDuplicates = (v: boolean) => onChange({ ...values, skipDuplicates: v });
  const setSkipUnmatched = (v: boolean) => onChange({ ...values, skipUnmatched: v });

  const rowsToProcess = summary?.matched || 0;
  const willBeSkipped = (skipUnmatched ? (summary?.unmatched || 0) : 0) +
    (summary?.duplicate || 0);

  return (
    <div className="space-y-6">
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

    </div>
  );
}
