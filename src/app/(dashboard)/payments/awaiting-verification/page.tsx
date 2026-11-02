"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Inbox, Receipt, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EnhancedStatCard } from "@/components/dashboard/enhanced-stat-card";
import { useCan } from "@/components/auth/can";
import { useAuth } from "@/lib/auth/auth-provider";
import { PERMISSIONS } from "@/lib/auth/action-roles";
import { formatCurrency, formatDayMedium } from "@/lib/utils";
import { NO_PERMISSION } from "@/lib/payments/awaiting-verification";
import {
  emailOverLimitLabel,
  exceedsEmailAutoProcessLimit,
  extractSenderName,
} from "@/lib/email-imports/utils";
import {
  getAwaitingVerification,
  type AwaitingAlert,
  type AwaitingReceipt,
} from "@/actions/payments/awaiting-verification";
import {
  processSingleTransaction,
  skipTransaction,
} from "@/actions/email-imports/process-email-import";
import { manuallyVerifyPayment } from "@/actions/finance/manual-verification";
import { deletePayment } from "@/actions/payments/delete-payment";
import { getActiveResidents } from "@/actions/residents/get-residents";

type CardKey = "all" | "alerts" | "receipts";
type Mode = "approve" | "skip" | "verify" | "reject";
type Row =
  | { kind: "alert"; id: string; sortKey: string; alert: AwaitingAlert }
  | { kind: "receipt"; id: string; sortKey: string; receipt: AwaitingReceipt };

const OTHER = "Other";
const SKIP_REASONS = [
  "Not an estate payment",
  "Duplicate alert",
  "Transfer between estate accounts",
  OTHER,
];
const QUERY_KEY = ["awaiting-verification"];

const payerName = (a: AwaitingAlert) =>
  a.description ? extractSenderName(a.description) || a.description : "";

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-center gap-2 text-destructive">
      <AlertCircle className="h-4 w-4" />
      {children}
    </div>
  );
}

export default function AwaitingVerificationPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const canProcess = useCan(PERMISSIONS.EMAIL_IMPORTS_PROCESS);
  const canVerify = useCan(PERMISSIONS.PAYMENTS_VERIFY);
  const canDelete = useCan(PERMISSIONS.PAYMENTS_DELETE);
  // Mirrors processSingleTransaction: over-limit credits need imports.approve or super_admin (#709).
  const canApproveOverLimit =
    useCan(PERMISSIONS.IMPORTS_APPROVE) || profile?.role_name === "super_admin";

  const [card, setCard] = useState<CardKey>("all");
  const [active, setActive] = useState<{ id: string; mode: Mode } | null>(null);
  const [residentId, setResidentId] = useState("");
  const [saveAsAlias, setSaveAsAlias] = useState(true);
  const [skipReason, setSkipReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [note, setNote] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getAwaitingVerification,
  });

  const alertsDenied = data?.alertsError === NO_PERMISSION;
  const receiptsDenied = data?.receiptsError === NO_PERMISSION;
  const alertsFailed = !!data?.alertsError && !alertsDenied;
  const receiptsFailed = !!data?.receiptsError && !receiptsDenied;

  const alerts = data?.alerts ?? [];
  const receipts = data?.receipts ?? [];

  const {
    data: residents,
    isError: residentsIsError,
    error: residentsError,
  } = useQuery({
    queryKey: ["residents-list"],
    queryFn: async () => {
      const result = await getActiveResidents();
      if (result.error) throw new Error(result.error);
      return result.data || [];
    },
    enabled: canProcess && alerts.length > 0,
  });

  // null means the limit could not be read: every credit is then over it.
  const autoProcessLimit = data ? data.autoProcessLimit : null;
  const overLimitLabel = emailOverLimitLabel(autoProcessLimit);
  const isReleaseBlocked = (a: AwaitingAlert) =>
    exceedsEmailAutoProcessLimit(a, autoProcessLimit) && !canApproveOverLimit;

  const close = () => {
    setActive(null);
    setResidentId("");
    setSaveAsAlias(true);
    setSkipReason("");
    setOtherReason("");
    setNote("");
  };
  const open = (id: string, mode: Mode) => {
    close();
    setActive({ id, mode });
  };
  const done = (message: string) => {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["email-imports"] });
    close();
  };
  const fail = (fallback: string) => (e: Error) =>
    toast.error(e.message || fallback);

  const approve = useMutation({
    mutationFn: async (a: AwaitingAlert) => {
      const name = payerName(a).trim();
      const result = await processSingleTransaction(a.id, {
        residentId,
        saveAsAlias: saveAsAlias && !!name,
        aliasName: saveAsAlias && name ? name : undefined,
      });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => done("Transaction processed successfully"),
    onError: fail("Failed to process transaction"),
  });
  const skip = useMutation({
    mutationFn: async (id: string) => {
      const result = await skipTransaction(id, finalSkipReason);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => done("Transaction skipped"),
    onError: fail("Failed to skip transaction"),
  });
  const verify = useMutation({
    mutationFn: async (id: string) => {
      const result = await manuallyVerifyPayment(id, note.trim() || undefined);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => done("Payment verified"),
    onError: fail("Failed to verify payment"),
  });
  const reject = useMutation({
    mutationFn: async (id: string) => {
      const result = await deletePayment(id);
      if (!result.success) throw new Error(result.error ?? undefined);
    },
    onSuccess: () => done("Payment removed"),
    onError: fail("Failed to remove payment"),
  });
  const finalSkipReason =
    skipReason === OTHER ? otherReason.trim() : skipReason;
  const busy =
    approve.isPending || skip.isPending || verify.isPending || reject.isPending;

  const rows: Row[] = [
    ...(card !== "receipts"
      ? alerts.map(
          (alert): Row => ({
            kind: "alert",
            id: alert.id,
            sortKey: alert.created_at,
            alert,
          }),
        )
      : []),
    ...(card !== "alerts"
      ? receipts.map(
          (receipt): Row => ({
            kind: "receipt",
            id: receipt.id,
            sortKey: receipt.created_at ?? receipt.payment_date,
            receipt,
          }),
        )
      : []),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const confirmButtons = (
    label: string,
    pending: boolean,
    pendingLabel: string,
    onConfirm: () => void,
    disabled = false,
    destructive = false,
    title?: string,
  ) => (
    <div className="flex gap-2">
      <Button
        variant={destructive ? "destructive" : "default"}
        onClick={onConfirm}
        disabled={disabled || busy}
        title={title}
      >
        {pending ? pendingLabel : label}
      </Button>
      <Button variant="outline" onClick={close} disabled={busy}>
        Cancel
      </Button>
    </div>
  );

  const renderPanel = (row: Row) => {
    if (!active || active.id !== row.id) return null;
    if (row.kind === "alert" && active.mode === "approve") {
      const a = row.alert;
      const blocked = isReleaseBlocked(a);
      const name = payerName(a);
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Assign to resident</Label>
            <Select
              value={residentId}
              onValueChange={setResidentId}
              disabled={residentsIsError}
            >
              <SelectTrigger aria-label="Resident">
                <SelectValue placeholder="Select resident" />
              </SelectTrigger>
              <SelectContent>
                {residents?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.first_name} {r.last_name} ({r.resident_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {residentsIsError && (
              <p className="text-sm text-destructive" role="alert">
                Failed to load residents
                {residentsError instanceof Error && residentsError.message
                  ? `: ${residentsError.message}`
                  : ""}
              </p>
            )}
          </div>
          {name && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`alias-${a.id}`}
                checked={saveAsAlias}
                onCheckedChange={(c) => setSaveAsAlias(c === true)}
              />
              <Label htmlFor={`alias-${a.id}`}>Save payer name as alias</Label>
              <span className="text-sm text-muted-foreground">({name})</span>
            </div>
          )}
          {blocked && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {overLimitLabel}
            </p>
          )}
          {confirmButtons(
            "Confirm approve",
            approve.isPending,
            "Approving...",
            () => approve.mutate(a),
            !residentId || blocked,
            false,
            blocked ? overLimitLabel : undefined,
          )}
        </div>
      );
    }
    if (row.kind === "alert" && active.mode === "skip") {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Reason for skipping</Label>
            <Select value={skipReason} onValueChange={setSkipReason}>
              <SelectTrigger aria-label="Skip reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {SKIP_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {skipReason === OTHER && (
              <Textarea
                aria-label="Other reason"
                placeholder="Enter the reason"
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                rows={2}
              />
            )}
          </div>
          {confirmButtons(
            "Confirm skip",
            skip.isPending,
            "Skipping...",
            () => skip.mutate(row.id),
            !finalSkipReason,
            true,
          )}
        </div>
      );
    }
    if (row.kind === "receipt" && active.mode === "verify") {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`note-${row.id}`}>Note (optional)</Label>
            <Textarea
              id={`note-${row.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
          {confirmButtons(
            "Confirm verify",
            verify.isPending,
            "Verifying...",
            () => verify.mutate(row.id),
          )}
        </div>
      );
    }
    if (row.kind === "receipt" && active.mode === "reject") {
      return (
        <div className="space-y-3">
          <p className="text-sm">
            The app removes this payment and opens the bills it paid again. Use
            this only when the money never came.
          </p>
          {confirmButtons(
            "Confirm reject",
            reject.isPending,
            "Removing...",
            () => reject.mutate(row.id),
            false,
            true,
          )}
        </div>
      );
    }
    return null;
  };

  const shownTotal = alerts.length + receipts.length;
  // A half that failed to load has no count: show a dash, never 0.
  const countOf = (n: number, failed: boolean) => (failed ? "—" : n);
  const listFailed = !!error || (alertsFailed && receiptsFailed);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Awaiting verification</h1>
        <p className="text-muted-foreground mt-1">
          Bank alerts that have no resident yet, and receipt payments that have
          no bank proof.
        </p>
      </div>

      {error && <ErrorLine>Failed to load: {error.message}</ErrorLine>}
      {alertsDenied && (
        <p className="text-sm text-muted-foreground">
          Bank alerts are hidden: you need the email imports process permission
          to see them.
        </p>
      )}
      {receiptsDenied && (
        <p className="text-sm text-muted-foreground">
          Receipts are hidden: you need the payments verify permission to see
          them.
        </p>
      )}
      {alertsFailed && (
        <ErrorLine>Failed to load bank alerts: {data?.alertsError}</ErrorLine>
      )}
      {receiptsFailed && (
        <ErrorLine>Failed to load receipts: {data?.receiptsError}</ErrorLine>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <EnhancedStatCard
          title="All"
          value={countOf(shownTotal, alertsFailed || receiptsFailed)}
          icon={ShieldCheck}
          accentColor="info"
          isLoading={isLoading}
          animate={false}
          selected={card === "all"}
          onClick={() => setCard("all")}
        />
        <EnhancedStatCard
          title="Bank alerts, no resident"
          value={countOf(alerts.length, alertsFailed)}
          icon={Inbox}
          accentColor="warning"
          isLoading={isLoading}
          animate={false}
          selected={card === "alerts"}
          onClick={() => setCard("alerts")}
        />
        <EnhancedStatCard
          title="Receipts, no bank proof"
          value={countOf(receipts.length, receiptsFailed)}
          icon={Receipt}
          accentColor="default"
          isLoading={isLoading}
          animate={false}
          selected={card === "receipts"}
          onClick={() => setCard("receipts")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {card === "all"
              ? "All items"
              : card === "alerts"
                ? "Bank alerts, no resident"
                : "Receipts, no bank proof"}
          </CardTitle>
          <CardDescription>
            Select a card above to change the list
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : listFailed ? null : rows.length === 0 ? (
            alertsFailed || receiptsFailed ? null : (
              <div className="text-center py-8 text-muted-foreground">
                Nothing is waiting for verification.
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <Fragment key={`${row.kind}-${row.id}`}>
                      <TableRow>
                        {row.kind === "alert" ? (
                          <>
                            <TableCell>
                              <Badge variant="outline">Bank alert</Badge>
                            </TableCell>
                            <TableCell>
                              {formatDayMedium(
                                row.alert.transaction_date ??
                                  row.alert.created_at,
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {row.alert.description || "-"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.alert.bank_account_last4
                                  ? `Account ending ${row.alert.bank_account_last4}`
                                  : ""}
                                {row.alert.senderVerified === false
                                  ? " Sender not verified"
                                  : ""}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(row.alert.amount)}
                            </TableCell>
                            <TableCell>
                              {canProcess && (
                                <>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => open(row.id, "approve")}
                                      disabled={
                                        isReleaseBlocked(row.alert) || busy
                                      }
                                      title={
                                        isReleaseBlocked(row.alert)
                                          ? overLimitLabel
                                          : undefined
                                      }
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => open(row.id, "skip")}
                                      disabled={busy}
                                    >
                                      Skip
                                    </Button>
                                  </div>
                                  {isReleaseBlocked(row.alert) && (
                                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                      {overLimitLabel}
                                    </p>
                                  )}
                                </>
                              )}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              <Badge variant="outline">Receipt</Badge>
                            </TableCell>
                            <TableCell>
                              {formatDayMedium(row.receipt.payment_date)}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {row.receipt.resident}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.receipt.houseCode}
                              </div>
                              {row.receipt.reference_number && (
                                <div className="font-mono text-xs">
                                  {row.receipt.reference_number}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(row.receipt.amount)}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {canVerify && (
                                  <Button
                                    size="sm"
                                    onClick={() => open(row.id, "verify")}
                                    disabled={busy}
                                  >
                                    Verify
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => open(row.id, "reject")}
                                    disabled={busy}
                                  >
                                    Reject
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                      {active?.id === row.id && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30">
                            {renderPanel(row)}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
