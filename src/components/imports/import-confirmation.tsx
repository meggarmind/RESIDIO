'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Loader2, Send, Info } from 'lucide-react';
import { useImport, useImportRowSummary, useSubmitForApproval } from '@/hooks/use-imports';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { ImportSummaryTiles } from '@/components/imports/import-summary-tiles';

interface ImportConfirmationProps {
  importId: string;
  /** Called after the import has been submitted for approval. */
  onSubmitted: (importId: string) => void;
  onBack: () => void;
}

/**
 * Last wizard step. Nothing is posted here: the import is submitted for
 * approval, and payments are only created after an approver signs it off and
 * someone with imports.review processes it from the import's detail page.
 */
export function ImportConfirmation({ importId, onSubmitted, onBack }: ImportConfirmationProps) {
  const { data: importRecord, isLoading: isLoadingImport } = useImport(importId);
  const { data: summary, isLoading: isLoadingSummary } = useImportRowSummary(importId);
  const submitMutation = useSubmitForApproval();
  const canSubmit = useCan(PERMISSIONS.IMPORTS_REVIEW);

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync(importId);
      onSubmitted(importId);
    } catch {
      // The mutation's onError toast already shows the server's message.
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

  return (
    <div className="space-y-6">
      <ImportSummaryTiles summary={summary} />

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

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>What happens next</AlertTitle>
        <AlertDescription>
          No payments are created yet. Submitting sends this import for approval; once an approver
          signs it off, it can be processed from its import page, where you choose the processing
          options.
        </AlertDescription>
      </Alert>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || rowsToProcess === 0 || submitMutation.isPending}
            size="lg"
            className="min-w-[180px]"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit for approval
              </>
            )}
          </Button>
          {!canSubmit && (
            <p className="text-xs text-muted-foreground">
              You need the imports.review permission to submit an import.
            </p>
          )}
          {canSubmit && rowsToProcess === 0 && (
            <p className="text-xs text-muted-foreground">
              No matched rows to process, so there is nothing to submit.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
