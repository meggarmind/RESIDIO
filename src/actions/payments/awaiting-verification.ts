"use server";

/**
 * Awaiting verification (#1432): bank alerts that still have no resident, and
 * receipt payments that still have no bank proof. A read only, so no audit.
 * Each half is guarded by the permission of the actions its rows lead to.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authorizePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/auth/action-roles";
import { readEmailAutoProcessLimit } from "@/lib/email-imports/auto-record";
import { embed } from "@/lib/utils";
import { NO_PERMISSION } from "@/lib/payments/awaiting-verification";

export type AwaitingAlert = {
  id: string;
  email_import_id: string;
  amount: number;
  transaction_type: string | null;
  transaction_date: string | null;
  created_at: string;
  description: string | null;
  bank_account_last4: string | null;
  senderVerified: boolean | null;
};

export type AwaitingReceipt = {
  id: string;
  amount: number;
  payment_date: string;
  created_at: string | null;
  notes: string | null;
  reference_number: string | null;
  houseCode: string;
  resident: string;
};

export type AwaitingVerificationResult = {
  /** null when the user lacks email_imports.process, or the load failed (see alertsError). */
  alerts: AwaitingAlert[] | null;
  alertsError: string | null;
  /** null when the user lacks payments.verify, or the load failed (see receiptsError). */
  receipts: AwaitingReceipt[] | null;
  receiptsError: string | null;
  /** The approval limit for bank alerts (#710); null means it could not be read, so every credit is over it. */
  autoProcessLimit: number | null;
};

const ALERT_COLUMNS =
  "id, email_import_id, amount, transaction_type, transaction_date, created_at, description, bank_account_last4, email_messages(sender_verified)";
// payment_records has two foreign keys to residents (resident_id, paid_by_resident_id): name the one.
const PAYMENT_COLUMNS =
  "id, amount, payment_date, created_at, notes, reference_number, status, approval_request_id, house:houses!payment_records_house_id_fkey(short_name, house_number), resident:residents!payment_records_resident_id_fkey(first_name, last_name)";

/** A resident's payment report waits in Approvals, so it is not in this list. */
const isReport = (row: Record<string, unknown>) =>
  row.status === "pending" && !!row.approval_request_id;

async function loadAlerts(): Promise<{
  data: AwaitingAlert[] | null;
  error: string | null;
  autoProcessLimit: number | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_PROCESS);
  if (!auth.authorized)
    return { data: null, error: NO_PERMISSION, autoProcessLimit: null };

  const supabase = await createServerSupabaseClient();
  const [{ data, error }, autoProcessLimit] = await Promise.all([
    supabase
      .from("email_transactions")
      .select(ALERT_COLUMNS)
      .eq("status", "queued_for_review")
      .eq("transaction_type", "credit")
      .order("created_at", { ascending: true }),
    readEmailAutoProcessLimit(),
  ]);
  if (error) {
    console.error("Fetch awaiting-verification alerts error:", error);
    return { data: null, error: error.message, autoProcessLimit };
  }
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return {
    error: null,
    autoProcessLimit,
    data: rows.map((row) => ({
      id: row.id as string,
      email_import_id: row.email_import_id as string,
      amount: Number(row.amount) || 0,
      transaction_type: (row.transaction_type as string | null) ?? null,
      transaction_date: (row.transaction_date as string | null) ?? null,
      created_at: row.created_at as string,
      description: (row.description as string | null) ?? null,
      bank_account_last4: (row.bank_account_last4 as string | null) ?? null,
      senderVerified:
        embed(row.email_messages as { sender_verified: boolean | null } | null)
          ?.sender_verified ?? null,
    })),
  };
}

async function loadReceipts(): Promise<{
  data: AwaitingReceipt[] | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.PAYMENTS_VERIFY);
  if (!auth.authorized) return { data: null, error: NO_PERMISSION };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("payment_records")
    .select(PAYMENT_COLUMNS)
    .eq("is_verified", false)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Fetch awaiting-verification receipts error:", error);
    return { data: null, error: error.message };
  }
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return {
    error: null,
    data: rows
      .filter((row) => !isReport(row))
      .map((row) => {
        const house = embed(
          row.house as {
            short_name: string | null;
            house_number: string | null;
          } | null,
        );
        const res = embed(
          row.resident as {
            first_name: string | null;
            last_name: string | null;
          } | null,
        );
        return {
          id: row.id as string,
          amount: Number(row.amount) || 0,
          payment_date: row.payment_date as string,
          created_at: (row.created_at as string | null) ?? null,
          notes: (row.notes as string | null) ?? null,
          reference_number: (row.reference_number as string | null) ?? null,
          houseCode: house?.short_name || house?.house_number || "No house",
          resident:
            [res?.first_name, res?.last_name]
              .filter(Boolean)
              .join(" ")
              .trim() || "Unknown resident",
        };
      }),
  };
}

export async function getAwaitingVerification(): Promise<AwaitingVerificationResult> {
  const [a, r] = await Promise.all([loadAlerts(), loadReceipts()]);
  return {
    alerts: a.data,
    alertsError: a.error,
    receipts: r.data,
    receiptsError: r.error,
    autoProcessLimit: a.autoProcessLimit,
  };
}
