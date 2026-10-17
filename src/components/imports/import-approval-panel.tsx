'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { IconBox } from '@/components/ui/icon-box';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, Loader2, PlayCircle, RotateCcw, Send, ShieldCheck, XCircle } from 'lucide-react';
import {
  useApproveImport,
  useImport,
  useImportRowSummary,
  useProcessImport,
  useRejectImport,
  useResetFailedImport,
  useSubmitForApproval,
} from '@/hooks/use-imports';
import { Can, useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  DEFAULT_PROCESSING_OPTIONS,
  ImportProcessingOptions,
  type ImportProcessingOptionValues,
} from '@/components/imports/import-processing-options';
import { ImportResults } from '@/components/imports/import-results';
import type { ProcessImportResult } from '@/actions/imports/types';
import { NO_MATCHED_ROWS_MESSAGE, hasMatchedRows } from '@/lib/imports/submit-guard';

interface ImportApprovalPanelProps {
  importId: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

/**
 * Status-driven approval controls for one bank statement import.
 * Each button is gated on its own permission (CORE.md section 6); the server
 * actions stay the authority and their error strings are shown as-is.
 */
export function ImportApprovalPanel({ importId }: ImportApprovalPanelProps) {
  const router = useRouter();
  const { data: importRecord } = useImport(importId);
  const { data: summary } = useImportRowSummary(importId);

  const submitMutation = useSubmitForApproval();
  const approveMutation = useApproveImport();
  const rejectMutation = useRejectImport();
  const processMutation = useProcessImport();
  const resetMutation = useResetFailedImport();

  const canReview = useCan(PERMISSIONS.IMPORTS_REVIEW);
  const canApprove = useCan(PERMISSIONS.IMPORTS_APPROVE);
  const canReject = useCan(PERMISSIONS.IMPORTS_REJECT);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [options, setOptions] = useState<ImportProcessingOptionValues>(DEFAULT_PROCESSING_OPTIONS);
  const [processResult, setProcessResult] = useState<ProcessImportResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!importRecord) return null;

  const status = importRecord.status ?? 'pending';
  const trimmedReason = rejectReason.trim();
  const anyPending =
    submitMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    processMutation.isPending ||
    resetMutation.isPending;

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const handleSubmit = () => run(() => submitMutation.mutateAsync(importId));
  const handleApprove = () => run(() => approveMutation.mutateAsync({ importId }));
  const handleReject = () => {
    if (!trimmedReason) return;
    return run(async () => {
      await rejectMutation.mutateAsync({ importId, reason: trimmedReason });
      setRejectOpen(false);
      setRejectReason('');
    });
  };
  const handleReset = () =>
    run(async () => {
      await resetMutation.mutateAsync(importId);
      setResetOpen(false);
    });
  const handleProcess = () =>
    run(async () => {
      const result = await processMutation.mutateAsync({
        import_id: importId,
        mode: options.processingMode,
        skip_duplicates: options.skipDuplicates,
        skip_unmatched: options.skipUnmatched,
      });
      setProcessResult(result);
    });

  const rejectionReason =
    (importRecord.import_summary as { rejection_reason?: string } | null)?.rejection_reason;
  const summaryErrors =
    ((importRecord.import_summary as { errors?: { error?: string }[] } | null)?.errors) ?? [];

  const createdRowCount = summary?.created ?? 0;

  const uploader = importRecord.created_by_user?.full_name;
  const approver = importRecord.approved_by_user?.full_name;

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconBox color="blue" size="sm">
            <ShieldCheck className="h-5 w-5" />
          </IconBox>
          <div>
            <CardTitle>Approval</CardTitle>
            <CardDescription>
              {uploader ? `Uploaded by ${uploader}` : 'Uploader not recorded'}
              {approver ? ` · Approved by ${approver}` : ''}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {actionError && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        {status === 'processing' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This import has not been submitted yet. Submit it so an approver can review it before
              any payment is created.
            </p>
            <Can permission={PERMISSIONS.IMPORTS_REVIEW}>
              <Button
                onClick={handleSubmit}
                disabled={anyPending || !hasMatchedRows(summary?.matched)}
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit for approval
              </Button>
            </Can>
            {canReview && summary && !hasMatchedRows(summary.matched) && (
              <p className="text-xs text-muted-foreground">{NO_MATCHED_ROWS_MESSAGE}</p>
            )}
          </div>
        )}

        {status === 'awaiting_approval' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Waiting for approval. Nothing is posted until an approver signs this import off.
            </p>
            <div className="flex flex-wrap gap-3">
              <Can permission={PERMISSIONS.IMPORTS_APPROVE}>
                <Button onClick={handleApprove} disabled={anyPending}>
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Approve
                </Button>
              </Can>
              <Can permission={PERMISSIONS.IMPORTS_REJECT}>
                <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={anyPending}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </Can>
            </div>
            {!canApprove && !canReject && (
              <p className="text-xs text-muted-foreground">
                You do not have permission to approve or reject imports.
              </p>
            )}
          </div>
        )}

        {status === 'approved' && !processResult && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Approved</AlertTitle>
              <AlertDescription>
                Choose the processing options and process the payments. This creates the payments
                and credits resident wallets.
              </AlertDescription>
            </Alert>
            <ImportProcessingOptions summary={summary} values={options} onChange={setOptions} />
            <Can permission={PERMISSIONS.IMPORTS_REVIEW}>
              <Button
                size="lg"
                onClick={handleProcess}
                disabled={anyPending || (summary?.matched || 0) === 0}
              >
                {processMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                Process payments
              </Button>
            </Can>
            {!canReview && (
              <p className="text-xs text-muted-foreground">
                You need the imports.review permission to process an approved import.
              </p>
            )}
          </div>
        )}

        {status === 'rejected' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Rejected</AlertTitle>
            <AlertDescription>{rejectionReason || 'No reason was recorded.'}</AlertDescription>
          </Alert>
        )}

        {(status === 'completed' || status === 'failed' || processResult) && (
          processResult ? (
            <ImportResults result={processResult} onStartOver={() => router.push('/payments/import')} />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">{importRecord.created_rows ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Payments created</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">{importRecord.skipped_rows ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Rows skipped</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{importRecord.error_rows ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Errors</p>
                </div>
              </div>
              {summaryErrors.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {summaryErrors.map((e, i) => (
                    <li key={i}>{e.error}</li>
                  ))}
                </ul>
              )}
              {status === 'failed' && (
                <Can permission={PERMISSIONS.IMPORTS_RESET}>
                  <Button variant="outline" onClick={() => setResetOpen(true)} disabled={anyPending}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset for review
                  </Button>
                </Can>
              )}
            </div>
          )
        )}

        {status === 'pending' && (
          <p className="text-sm text-muted-foreground">
            This import has not finished uploading. Return to the import wizard to complete it.
          </p>
        )}
      </CardContent>

      {status === 'awaiting_approval' && (
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectReason('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject import</DialogTitle>
            <DialogDescription>
              The import will be marked rejected and no payments will be created. A reason is
              required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="import-reject-reason">Reason</Label>
            <Textarea
              id="import-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this import being rejected?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Can permission={PERMISSIONS.IMPORTS_REJECT}>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={!trimmedReason || rejectMutation.isPending}
              >
                {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm rejection
              </Button>
            </Can>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {status === 'failed' && (
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset failed import</DialogTitle>
            <DialogDescription>
              The import goes back to review and must be submitted and approved again before it
              can be processed. {createdRowCount} {createdRowCount === 1 ? 'row was' : 'rows were'}{' '}
              already created and will not be processed again. Rows that errored return to
              unmatched and must be re-matched before resubmitting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Can permission={PERMISSIONS.IMPORTS_RESET}>
              <Button onClick={handleReset} disabled={resetMutation.isPending}>
                {resetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm reset
              </Button>
            </Can>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </Card>
  );
}
