/**
 * Server-only report generation (types, generators and the client-taking entry point).
 *
 * Deliberately NOT a server-action module (no directive): `generateReportWithClient` performs
 * NO authorization and accepts any Supabase client, so it must never be reachable as a
 * client-callable server action. Callers are responsible for authorization:
 *   - `generateReport` in `@/actions/reports/report-engine` (session client, gated by
 *     the report-view permission check), and
 *   - the CRON_SECRET-authenticated cron path (`@/lib/reports/process-schedules`), which has
 *     no session and passes the admin client.
 * See #483 (same pattern as #388).
 */

import type { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import type { ReportRequestFormData } from '@/lib/validators/reports';
import { getDateRangeFromPreset, isRetiredReport, resolveRetiredReport, REPORT_TYPE_LABELS } from '@/lib/validators/reports';
import type { SummaryCell, SummaryGrid, SummaryGridStatus, SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';
import { generateProjectSpend } from '@/lib/reports/generators/project-spend';
import { generatePettyCash } from '@/lib/reports/generators/petty-cash';
import { formatCalendarDate } from '@/lib/utils/calendar-date';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import { DEBT_STATUS_DEFAULTS, getDebtStatuses, type DebtStatus } from '@/lib/billing/debt-status';
import { generateCollectionRateByStreet } from '@/lib/reports/generators/collection-rate-by-street';
import { generateExpensesByCategory } from '@/lib/reports/generators/expenses-by-category';
import { generateWalletBalances } from '@/lib/reports/generators/wallet-balances';
import { generateWriteOffs } from '@/lib/reports/generators/write-offs';
import { OCCUPANT_PAYER_ROLES, resolvePayer, type BillingPayer } from '@/lib/billing/payer';
import { generateStatementOfAccount } from '@/lib/reports/generators/statement-of-account';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';

/** Either the cookie-bound session client or the service-role admin client. */
export type ReportSupabaseClient =
  | Awaited<ReturnType<typeof createServerSupabaseClient>>
  | ReturnType<typeof createAdminClient>;


// ============================================================
// Types
// ============================================================

export interface CategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  transactionType: 'credit' | 'debit';
  transactionCount: number;
  totalAmount: number;
  percentageOfTotal: number;
}

export interface FinancialOverviewData {
  summary: {
    totalCredits: number;
    totalDebits: number;
    netBalance: number;
    transactionCount: number;
  };
  creditCategories: CategoryBreakdown[];
  debitCategories: CategoryBreakdown[];
  monthlyTrend: {
    month: string;
    credits: number;
    debits: number;
    net: number;
  }[];
}

export interface CollectionReportData {
  summary: {
    totalInvoiced: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRate: number;
    residentsWithDebts: number;
    totalResidents: number;
  };
  byResident: {
    residentId: string;
    residentName: string;
    residentCode: string;
    houseNumber: string;
    streetName: string;
    totalInvoiced: number;
    totalPaid: number;
    outstanding: number;
    invoiceCount: number;
    oldestUnpaidDate: string | null;
  }[];
  byStatus: {
    status: string;
    count: number;
    amount: number;
  }[];
}

export interface InvoiceAgingData {
  summary: {
    totalOutstanding: number;
    current: number; // 0-30 days
    days30to60: number;
    days60to90: number;
    over90Days: number;
  };
  byBracket: {
    bracket: string;
    invoiceCount: number;
    totalAmount: number;
    percentage: number;
    invoices: {
      invoiceId: string;
      invoiceNumber: string;
      residentName: string;
      houseNumber: string;
      amountDue: number;
      amountPaid: number;
      outstanding: number;
      dueDate: string;
      daysOverdue: number;
    }[];
  }[];
}

export interface TransactionLogData {
  summary: {
    totalTransactions: number;
    totalCredits: number;
    totalDebits: number;
    dateRange: { start: string; end: string };
  };
  transactions: {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'credit' | 'debit';
    category: string;
    categoryColor: string;
    bankAccount: string;
    reference: string | null;
  }[];
}

export interface DebtorInfo {
  residentId: string;
  residentName: string;
  residentCode: string;
  email: string | null;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  houseNumber: string;
  streetName: string;
  totalOutstanding: number;
  invoiceCount: number;
  oldestDueDate: string;
  daysOverdue: number;
  // Aging breakdown for this debtor
  current: number;       // 0-30 days
  days31to60: number;
  days61to90: number;
  over90Days: number;
}

export interface DebtorsReportData {
  summary: {
    totalDebtors: number;
    totalOutstanding: number;
    current: number;       // 0-30 days
    days31to60: number;
    days61to90: number;
    over90Days: number;
    averageDebt: number;
    averageDaysOverdue: number;
  };
  byAgingBracket: {
    bracket: string;
    debtorCount: number;
    totalAmount: number;
    percentage: number;
  }[];
  debtors: DebtorInfo[];
}

// ============================================================
// Indebtedness Report Types (Summary & Detail)
// ============================================================

export interface HouseIndebtednessRow {
  houseId: string;
  houseNumber: string;
  streetName: string;
  primaryResidentName: string;
  primaryResidentId: string | null;
  /** Shared debt status (#980) of the house. */
  status: DebtStatus;
  /** The editable label of `status`. */
  statusLabel: string;
  outstandingAmount?: number;
}

export interface IndebtednessReportData {
  summary: {
    totalHouses: number;
    indebtedCount: number;
    nonIndebtedCount: number;
    totalOutstanding?: number;
  };
  houses: HouseIndebtednessRow[];
}

// ============================================================
// Development Levy Report Types
// ============================================================

export interface DevelopmentLevyRow {
  houseId: string;
  houseNumber: string;
  streetName: string;
  responsibleResidentName: string;
  responsibleResidentId: string | null;
  responsibleResidentRole: string;
  levyAmount: number;
  isPaid: boolean;
}

export interface DevelopmentLevyData {
  summary: {
    totalHouses: number;
    paidCount: number;
    unpaidCount: number;
    totalAmount: number;
    collectedAmount: number;
    collectionRate: number;
  };
  houses: DevelopmentLevyRow[];
}

export type ReportData =
  | { type: 'financial_overview'; data: FinancialOverviewData }
  | { type: 'collection_report'; data: CollectionReportData }
  | { type: 'invoice_aging'; data: InvoiceAgingData }
  | { type: 'transaction_log'; data: TransactionLogData }
  | { type: 'debtors_report'; data: DebtorsReportData }
  | { type: 'indebtedness_summary'; data: IndebtednessReportData }
  | { type: 'development_levy'; data: DevelopmentLevyData }
  // Summary-first layout (#1397): rendered from its `layout` marker, not from `type`.
  | SummaryReport;

export interface GenerateReportResult {
  success: boolean;
  report?: ReportData;
  error?: string;
}


// ============================================================
// Authorization Check
// ============================================================

// ============================================================
// Financial Overview Report
// ============================================================

async function generateFinancialOverview(
  supabase: ReportSupabaseClient,
  startDate: string,
  endDate: string,
  bankAccountIds: string[],
  transactionType: 'all' | 'credit' | 'debit'
): Promise<FinancialOverviewData> {
  // 1. Fetch Bank Statement Rows
  const { data: rows, error } = await fetchAllRows((from, to) => {
    let query = supabase
      .from('bank_statement_rows')
      .select(`
        id,
        amount,
        transaction_type,
        transaction_date,
        tag_id,
        transaction_tags (
          id,
          name,
          color,
          transaction_type
        ),
        bank_statement_imports!inner (
          id,
          bank_account_id,
          status
        )
      `)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .eq('bank_statement_imports.status', 'completed');

    if (bankAccountIds.length > 0) {
      query = query.in('bank_statement_imports.bank_account_id', bankAccountIds);
    }

    if (transactionType !== 'all') {
      query = query.eq('transaction_type', transactionType);
    }

    return query.order('id').range(from, to);
  });

  if (error) {
    console.error('Error fetching financial overview (bank rows):', error);
    throw new Error(error);
  }

  // 2. Fetch Expenses (Manual / Petty Cash)
  // Only fetching if we are interested in 'debit' or 'all' transactions
  let expensesData: Record<string, unknown>[] = [];
  if (transactionType === 'all' || transactionType === 'debit') {
    // We exclude 'bank_import' source type because those should already be covered by bank_statement_rows
    // Assuming 'bank_import' means it was created FROM a bank row.
    // If payment_method is 'bank_transfer', it might still be a manual entry that hasn't been reconciled with a bank row yet.
    // To be safe and avoid double counting:
    // - If source_type is 'bank_import', exclude it (it's in bank rows).
    // - If source_type is 'petty_cash', include it (it's NOT in bank rows, it's cash).
    // - If source_type is 'manual', it depends. If 'bank_transfer', it might be a double count if bank rows are also imported.
    // For this implementation, we will strictly include 'petty_cash' expenses as these are clearly distinct from bank rows.
    // And we can include 'manual' expenses if we assume they are cash or external to the connected bank accounts.
    // Let's include all non-bank-import expenses for now to ensure visibility, but this is a policy decision.

    const { data: expenses, error: expensesError } = await fetchAllRows((from, to) =>
      supabase
        .from('expenses')
        .select(`
          id,
          amount,
          expense_date,
          description,
          category_id,
          expense_categories (
            id,
            name,
            color
          ),
          payment_method,
          source_type,
          status
        `)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate)
        .eq('status', 'paid')
        .neq('source_type', 'bank_import')
        .order('id')
        .range(from, to)
    );

    if (expensesError) {
      console.error('Error fetching expenses for report:', expensesError);
      // We log but don't fail properly? Or should we fail?
      // Let's just log for now to avoid breaking the whole report if expenses fail
    } else {
      expensesData = expenses || [];
    }
  }

  // Process data
  let totalCredits = 0;
  let totalDebits = 0;
  const creditCategoryMap = new Map<string | null, CategoryBreakdown>();
  const debitCategoryMap = new Map<string | null, CategoryBreakdown>();
  const monthlyData = new Map<string, { credits: number; debits: number }>();
  const totalTransactionCount = (rows?.length || 0) + expensesData.length;

  // Process Bank Rows
  for (const row of rows || []) {
    const amount = Number(row.amount) || 0;
    const tag = row.transaction_tags as unknown as { id: string; name: string; color: string } | null;
    const categoryId = row.tag_id || null;
    const categoryName = tag?.name || 'Uncategorized';
    const categoryColor = tag?.color || 'gray';

    // Aggregate totals
    if (row.transaction_type === 'credit') {
      totalCredits += amount;

      const existing = creditCategoryMap.get(categoryId);
      if (existing) {
        existing.transactionCount += 1;
        existing.totalAmount += amount;
      } else {
        creditCategoryMap.set(categoryId, {
          categoryId,
          categoryName,
          categoryColor,
          transactionType: 'credit',
          transactionCount: 1,
          totalAmount: amount,
          percentageOfTotal: 0,
        });
      }
    } else if (row.transaction_type === 'debit') {
      totalDebits += amount;

      const existing = debitCategoryMap.get(categoryId);
      if (existing) {
        existing.transactionCount += 1;
        existing.totalAmount += amount;
      } else {
        debitCategoryMap.set(categoryId, {
          categoryId,
          categoryName,
          categoryColor,
          transactionType: 'debit',
          transactionCount: 1,
          totalAmount: amount,
          percentageOfTotal: 0,
        });
      }
    }

    // Monthly trend
    if (row.transaction_date) {
      const monthKey = row.transaction_date.substring(0, 7); // YYYY-MM
      const monthData = monthlyData.get(monthKey) || { credits: 0, debits: 0 };
      if (row.transaction_type === 'credit') {
        monthData.credits += amount;
      } else {
        monthData.debits += amount;
      }
      monthlyData.set(monthKey, monthData);
    }
  }

  // Process Expenses (treated as Debits)
  for (const expense of expensesData) {
    const amount = Number(expense.amount) || 0;
    const category = expense.expense_categories as unknown as { id: string; name: string; color: string } | null;
    const categoryId = (expense.category_id as string | null) || null;
    const categoryName = category?.name || 'Uncategorized Expense';
    const categoryColor = category?.color || 'orange'; // Default valid color for expense

    totalDebits += amount;

    const existing = debitCategoryMap.get(categoryId);
    if (existing) {
      existing.transactionCount += 1;
      existing.totalAmount += amount;
    } else {
      debitCategoryMap.set(categoryId, {
        categoryId,
        categoryName,
        categoryColor,
        transactionType: 'debit',
        transactionCount: 1,
        totalAmount: amount,
        percentageOfTotal: 0,
      });
    }

    // Monthly trend for expenses
    if (expense.expense_date) {
      const monthKey = String(expense.expense_date).substring(0, 7);
      const monthData = monthlyData.get(monthKey) || { credits: 0, debits: 0 };
      monthData.debits += amount;
      monthlyData.set(monthKey, monthData);
    }
  }

  // Calculate percentages and convert to arrays (only categories with transactions)
  const creditCategories = Array.from(creditCategoryMap.values()).map((cat) => ({
    ...cat,
    percentageOfTotal: totalCredits > 0 ? (cat.totalAmount / totalCredits) * 100 : 0,
  }));

  const debitCategories = Array.from(debitCategoryMap.values()).map((cat) => ({
    ...cat,
    percentageOfTotal: totalDebits > 0 ? (cat.totalAmount / totalDebits) * 100 : 0,
  }));

  // Sort by amount descending
  creditCategories.sort((a, b) => b.totalAmount - a.totalAmount);
  debitCategories.sort((a, b) => b.totalAmount - a.totalAmount);

  // Convert monthly data to sorted array
  const monthlyTrend = Array.from(monthlyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      credits: data.credits,
      debits: data.debits,
      net: data.credits - data.debits,
    }));

  return {
    summary: {
      totalCredits,
      totalDebits,
      netBalance: totalCredits - totalDebits,
      transactionCount: totalTransactionCount,
    },
    creditCategories,
    debitCategories,
    monthlyTrend,
  };
}

// ============================================================
// Collection Report
// ============================================================

async function generateCollectionReport(
  supabase: ReportSupabaseClient,
  startDate: string,
  endDate: string
): Promise<CollectionReportData> {
  // Get invoices within the period
  const { data: invoices, error: invoiceError } = await fetchAllRows((from, to) =>
    supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        amount_due,
        amount_paid,
        status,
        due_date,
        resident:residents (
          id,
          first_name,
          last_name,
          resident_code
        ),
        house:houses (
          house_number,
          street:streets (name)
        )
      `)
      .gte('due_date', startDate)
      .lte('due_date', endDate)
      .neq('status', 'void')
      .order('id')
      .range(from, to)
  );

  if (invoiceError) {
    console.error('Error fetching invoices:', invoiceError);
    throw new Error(invoiceError);
  }

  // Process data
  let totalInvoiced = 0;
  let totalCollected = 0;
  const residentMap = new Map<string, {
    residentId: string;
    residentName: string;
    residentCode: string;
    houseNumber: string;
    streetName: string;
    totalInvoiced: number;
    totalPaid: number;
    invoiceCount: number;
    oldestUnpaidDate: string | null;
  }>();

  const statusCounts: Record<string, { count: number; amount: number }> = {};

  for (const invoice of invoices || []) {
    const amountDue = Number(invoice.amount_due) || 0;
    const amountPaid = Number(invoice.amount_paid) || 0;
    totalInvoiced += amountDue;
    totalCollected += amountPaid;

    // Group by resident
    const resident = invoice.resident as unknown as { id: string; first_name: string; last_name: string; resident_code: string } | null;
    const house = invoice.house as unknown as { house_number: string; street: { name: string } | null } | null;

    if (resident) {
      const existing = residentMap.get(resident.id);
      const outstanding = amountDue - amountPaid;
      const isUnpaid = outstanding > 0;

      if (existing) {
        existing.totalInvoiced += amountDue;
        existing.totalPaid += amountPaid;
        existing.invoiceCount += 1;
        if (isUnpaid && (!existing.oldestUnpaidDate || invoice.due_date < existing.oldestUnpaidDate)) {
          existing.oldestUnpaidDate = invoice.due_date;
        }
      } else {
        residentMap.set(resident.id, {
          residentId: resident.id,
          residentName: `${resident.first_name} ${resident.last_name}`,
          residentCode: resident.resident_code,
          houseNumber: house?.house_number || 'N/A',
          streetName: house?.street?.name || 'N/A',
          totalInvoiced: amountDue,
          totalPaid: amountPaid,
          invoiceCount: 1,
          oldestUnpaidDate: isUnpaid ? invoice.due_date : null,
        });
      }
    }

    // Count by status
    const status = invoice.status || 'unknown';
    if (!statusCounts[status]) {
      statusCounts[status] = { count: 0, amount: 0 };
    }
    statusCounts[status].count += 1;
    statusCounts[status].amount += amountDue;
  }

  // Convert to arrays
  const byResident = Array.from(residentMap.values())
    .map((r) => ({
      ...r,
      outstanding: r.totalInvoiced - r.totalPaid,
    }))
    .sort((a, b) => b.outstanding - a.outstanding);

  const byStatus = Object.entries(statusCounts).map(([status, data]) => ({
    status,
    count: data.count,
    amount: data.amount,
  }));

  const residentsWithDebts = byResident.filter((r) => r.outstanding > 0).length;

  return {
    summary: {
      totalInvoiced,
      totalCollected,
      totalOutstanding: totalInvoiced - totalCollected,
      collectionRate: totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0,
      residentsWithDebts,
      totalResidents: byResident.length,
    },
    byResident,
    byStatus,
  };
}

// ============================================================
// Invoice Aging Report
// ============================================================

interface AgingInvoice {
  invoiceId: string;
  invoiceNumber: string;
  residentName: string;
  houseNumber: string;
  amountDue: number;
  amountPaid: number;
  outstanding: number;
  dueDate: string;
  daysOverdue: number;
}

// Kept, unchanged, as the reference the Debtors and aging report is tested against (#1399): its
// totals must equal these two retired reports' totals. Nothing else calls them.
export async function generateInvoiceAging(
  supabase: ReportSupabaseClient
): Promise<InvoiceAgingData> {
  const today = new Date();

  // Get all unpaid/partially paid invoices
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      amount_due,
      amount_paid,
      status,
      due_date,
      resident:residents (
        id,
        first_name,
        last_name
      ),
      house:houses (
        house_number
      )
    `)
    .in('status', ['unpaid', 'partially_paid']);

  if (error) {
    console.error('Error fetching invoices for aging:', error);
    throw new Error(error.message);
  }

  // Define aging brackets
  const brackets = [
    { name: 'Current (0-30 days)', min: 0, max: 30, invoices: [] as AgingInvoice[], total: 0 },
    { name: '31-60 days', min: 31, max: 60, invoices: [] as AgingInvoice[], total: 0 },
    { name: '61-90 days', min: 61, max: 90, invoices: [] as AgingInvoice[], total: 0 },
    { name: 'Over 90 days', min: 91, max: Infinity, invoices: [] as AgingInvoice[], total: 0 },
  ];

  let totalOutstanding = 0;

  for (const invoice of invoices || []) {
    const amountDue = Number(invoice.amount_due) || 0;
    const amountPaid = Number(invoice.amount_paid) || 0;
    const outstanding = amountDue - amountPaid;

    if (outstanding <= 0) continue;

    totalOutstanding += outstanding;

    const dueDate = new Date(invoice.due_date);
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    const resident = invoice.resident as unknown as { id: string; first_name: string; last_name: string } | null;
    const house = invoice.house as unknown as { house_number: string } | null;

    const invoiceData = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number ?? '',
      residentName: resident ? `${resident.first_name} ${resident.last_name}` : 'Unknown',
      houseNumber: house?.house_number || 'N/A',
      amountDue,
      amountPaid,
      outstanding,
      dueDate: invoice.due_date ?? '',
      daysOverdue,
    };

    // Place in appropriate bracket
    for (const bracket of brackets) {
      if (daysOverdue >= bracket.min && daysOverdue <= bracket.max) {
        bracket.invoices.push(invoiceData);
        bracket.total += outstanding;
        break;
      }
    }
  }

  // Calculate percentages and format response
  const byBracket = brackets.map((bracket) => ({
    bracket: bracket.name,
    invoiceCount: bracket.invoices.length,
    totalAmount: bracket.total,
    percentage: totalOutstanding > 0 ? (bracket.total / totalOutstanding) * 100 : 0,
    invoices: bracket.invoices.sort((a, b) => b.outstanding - a.outstanding),
  }));

  return {
    summary: {
      totalOutstanding,
      current: brackets[0].total,
      days30to60: brackets[1].total,
      days60to90: brackets[2].total,
      over90Days: brackets[3].total,
    },
    byBracket,
  };
}

// ============================================================
// Transaction Log Report
// ============================================================

async function generateTransactionLog(
  supabase: ReportSupabaseClient,
  startDate: string,
  endDate: string,
  bankAccountIds: string[],
  transactionType: 'all' | 'credit' | 'debit'
): Promise<TransactionLogData> {
  const { data: rows, error } = await fetchAllRows((from, to) => {
    let query = supabase
      .from('bank_statement_rows')
      .select(`
        id,
        transaction_date,
        description,
        amount,
        transaction_type,
        reference,
        transaction_tags (
          name,
          color
        ),
        bank_statement_imports!inner (
          status,
          estate_bank_accounts (
            account_name,
            bank_name
          )
        )
      `)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .eq('bank_statement_imports.status', 'completed')
      .order('transaction_date', { ascending: false })
      .order('id');

    if (bankAccountIds.length > 0) {
      query = query.in('bank_statement_imports.bank_account_id', bankAccountIds);
    }

    if (transactionType !== 'all') {
      query = query.eq('transaction_type', transactionType);
    }

    return query.range(from, to);
  });

  if (error) {
    console.error('Error fetching transaction log:', error);
    throw new Error(error);
  }

  let totalCredits = 0;
  let totalDebits = 0;

  const transactions = (rows || []).map((row) => {
    const amount = Number(row.amount) || 0;
    const tag = row.transaction_tags as unknown as { name: string; color: string } | null;
    const importData = row.bank_statement_imports as unknown as { estate_bank_accounts: { account_name: string; bank_name: string } | null } | null;

    if (row.transaction_type === 'credit') {
      totalCredits += amount;
    } else {
      totalDebits += amount;
    }

    return {
      id: row.id,
      date: row.transaction_date || '',
      description: row.description || '',
      amount,
      type: (row.transaction_type || 'credit') as 'credit' | 'debit',
      category: tag?.name || 'Uncategorized',
      categoryColor: tag?.color || 'gray',
      bankAccount: importData?.estate_bank_accounts
        ? `${importData.estate_bank_accounts.account_name} (${importData.estate_bank_accounts.bank_name})`
        : 'Unknown',
      reference: row.reference,
    };
  });

  return {
    summary: {
      totalTransactions: transactions.length,
      totalCredits,
      totalDebits,
      dateRange: { start: startDate, end: endDate },
    },
    transactions,
  };
}

// ============================================================
// Debtors Report
// ============================================================

export async function generateDebtorsReport(
  supabase: ReportSupabaseClient
): Promise<DebtorsReportData> {
  const today = new Date();

  // Get all unpaid/partially paid/overdue invoices with resident contact info
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      amount_due,
      amount_paid,
      status,
      due_date,
      resident:residents (
        id,
        first_name,
        last_name,
        resident_code,
        email,
        phone_primary,
        phone_secondary
      ),
      house:houses (
        house_number,
        street:streets (name)
      )
    `)
    .in('status', ['unpaid', 'partially_paid']);

  if (error) {
    console.error('Error fetching invoices for debtors report:', error);
    throw new Error(error.message);
  }

  // Define aging brackets
  const brackets = [
    { name: 'Current (0-30 days)', min: 0, max: 30 },
    { name: '31-60 days', min: 31, max: 60 },
    { name: '61-90 days', min: 61, max: 90 },
    { name: 'Over 90 days', min: 91, max: Infinity },
  ];

  // Aggregate by resident (debtor)
  const debtorMap = new Map<string, {
    residentId: string;
    residentName: string;
    residentCode: string;
    email: string | null;
    phonePrimary: string | null;
    phoneSecondary: string | null;
    houseNumber: string;
    streetName: string;
    totalOutstanding: number;
    invoiceCount: number;
    oldestDueDate: string;
    maxDaysOverdue: number;
    current: number;
    days31to60: number;
    days61to90: number;
    over90Days: number;
  }>();

  for (const invoice of invoices || []) {
    const amountDue = Number(invoice.amount_due) || 0;
    const amountPaid = Number(invoice.amount_paid) || 0;
    const outstanding = amountDue - amountPaid;

    if (outstanding <= 0) continue;

    const resident = invoice.resident as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      resident_code: string;
      email: string | null;
      phone_primary: string | null;
      phone_secondary: string | null;
    } | null;

    if (!resident) continue;

    const house = invoice.house as unknown as {
      house_number: string;
      street: { name: string } | null;
    } | null;

    const dueDate = new Date(invoice.due_date);
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Determine which aging bucket this invoice belongs to
    let agingBucket: 'current' | 'days31to60' | 'days61to90' | 'over90Days' = 'current';
    if (daysOverdue > 90) {
      agingBucket = 'over90Days';
    } else if (daysOverdue > 60) {
      agingBucket = 'days61to90';
    } else if (daysOverdue > 30) {
      agingBucket = 'days31to60';
    }

    const existing = debtorMap.get(resident.id);
    if (existing) {
      existing.totalOutstanding += outstanding;
      existing.invoiceCount += 1;
      existing[agingBucket] += outstanding;
      if (invoice.due_date < existing.oldestDueDate) {
        existing.oldestDueDate = invoice.due_date;
      }
      if (daysOverdue > existing.maxDaysOverdue) {
        existing.maxDaysOverdue = daysOverdue;
      }
    } else {
      debtorMap.set(resident.id, {
        residentId: resident.id,
        residentName: `${resident.first_name} ${resident.last_name}`,
        residentCode: resident.resident_code,
        email: resident.email,
        phonePrimary: resident.phone_primary,
        phoneSecondary: resident.phone_secondary,
        houseNumber: house?.house_number || 'N/A',
        streetName: house?.street?.name || 'N/A',
        totalOutstanding: outstanding,
        invoiceCount: 1,
        oldestDueDate: invoice.due_date,
        maxDaysOverdue: daysOverdue,
        current: agingBucket === 'current' ? outstanding : 0,
        days31to60: agingBucket === 'days31to60' ? outstanding : 0,
        days61to90: agingBucket === 'days61to90' ? outstanding : 0,
        over90Days: agingBucket === 'over90Days' ? outstanding : 0,
      });
    }
  }

  // Convert to array and sort by total outstanding (highest first)
  const debtors: DebtorInfo[] = Array.from(debtorMap.values())
    .map((d) => ({
      residentId: d.residentId,
      residentName: d.residentName,
      residentCode: d.residentCode,
      email: d.email,
      phonePrimary: d.phonePrimary,
      phoneSecondary: d.phoneSecondary,
      houseNumber: d.houseNumber,
      streetName: d.streetName,
      totalOutstanding: d.totalOutstanding,
      invoiceCount: d.invoiceCount,
      oldestDueDate: d.oldestDueDate,
      daysOverdue: d.maxDaysOverdue,
      current: d.current,
      days31to60: d.days31to60,
      days61to90: d.days61to90,
      over90Days: d.over90Days,
    }))
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  // Calculate totals
  const totalOutstanding = debtors.reduce((sum, d) => sum + d.totalOutstanding, 0);
  const totalCurrent = debtors.reduce((sum, d) => sum + d.current, 0);
  const totalDays31to60 = debtors.reduce((sum, d) => sum + d.days31to60, 0);
  const totalDays61to90 = debtors.reduce((sum, d) => sum + d.days61to90, 0);
  const totalOver90Days = debtors.reduce((sum, d) => sum + d.over90Days, 0);
  const totalDaysOverdue = debtors.reduce((sum, d) => sum + d.daysOverdue, 0);

  // Build aging bracket summary
  const bracketData = [
    { name: 'Current (0-30 days)', total: totalCurrent, count: debtors.filter(d => d.current > 0).length },
    { name: '31-60 days', total: totalDays31to60, count: debtors.filter(d => d.days31to60 > 0).length },
    { name: '61-90 days', total: totalDays61to90, count: debtors.filter(d => d.days61to90 > 0).length },
    { name: 'Over 90 days', total: totalOver90Days, count: debtors.filter(d => d.over90Days > 0).length },
  ];

  const byAgingBracket = bracketData.map((b) => ({
    bracket: b.name,
    debtorCount: b.count,
    totalAmount: b.total,
    percentage: totalOutstanding > 0 ? (b.total / totalOutstanding) * 100 : 0,
  }));

  return {
    summary: {
      totalDebtors: debtors.length,
      totalOutstanding,
      current: totalCurrent,
      days31to60: totalDays31to60,
      days61to90: totalDays61to90,
      over90Days: totalOver90Days,
      averageDebt: debtors.length > 0 ? totalOutstanding / debtors.length : 0,
      averageDaysOverdue: debtors.length > 0 ? totalDaysOverdue / debtors.length : 0,
    },
    byAgingBracket,
    debtors,
  };
}

// ============================================================
// Debtors and aging (replaces the Debtors and Invoice Aging reports, #1399)
// ============================================================

const AGING_BUCKETS = [
  { key: 'current', label: 'Current', tone: 'good' },
  { key: 'days1to30', label: '1-30 days', tone: 'neutral' },
  { key: 'days31to60', label: '31-60 days', tone: 'neutral' },
  { key: 'days61to90', label: '61-90 days', tone: 'bad' },
  { key: 'over90Days', label: 'Over 90 days', tone: 'bad' },
] as const;

type AgingBucketKey = (typeof AGING_BUCKETS)[number]['key'];

/**
 * The same cut-offs as the two retired reports (their 0-30 bucket is split in two: not yet due, and
 * 1-30 days late), so the amounts per bucket and the grand total do not change.
 */
function agingBucketFor(daysOverdue: number): AgingBucketKey {
  if (daysOverdue > 90) return 'over90Days';
  if (daysOverdue > 60) return 'days61to90';
  if (daysOverdue > 30) return 'days31to60';
  if (daysOverdue > 0) return 'days1to30';
  return 'current';
}

const emptyBuckets = (): Record<AgingBucketKey, number> => ({ current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90Days: 0 });

const reportDate = (value: string) => formatCalendarDate(value, 'en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
const moneyCells = (amounts: Record<AgingBucketKey, number>) =>
  Object.fromEntries(Object.entries(amounts).map(([key, amount]) => [key, money(amount)]));
const money = (amount: number) => amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function generateDebtorsAging(
  supabase: ReportSupabaseClient,
  showInvoiceLines: boolean
): Promise<SummaryReport> {
  const today = new Date();

  // Same query and filter as the Debtors report, read a page at a time: the API returns at most
  // 1,000 rows per request, and a single read would silently drop the rest from the totals.
  const PAGE_SIZE = 1000;
  const invoices = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from('invoices')
      .select(`
      id,
      invoice_number,
      amount_due,
      amount_paid,
      status,
      due_date,
      resident:residents (
        id,
        first_name,
        last_name,
        email,
        phone_primary,
        phone_secondary
      ),
      house:houses (
        house_number,
        street:streets (name)
      )
    `)
      .in('status', ['unpaid', 'partially_paid'])
      .order('id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching invoices for debtors and aging report:', error);
      throw new Error(error.message);
    }
    invoices.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }

  interface Line { invoiceNumber: string; dueDate: string; daysOverdue: number; outstanding: number; bucket: AgingBucketKey }
  const debtorMap = new Map<string, {
    name: string;
    linked: boolean;
    house: string;
    street: string;
    contact: string;
    buckets: Record<AgingBucketKey, number>;
    total: number;
    lines: Line[];
  }>();
  const bucketTotals = emptyBuckets();
  let oldest: { daysOverdue: number; dueDate: string } | null = null;

  for (const invoice of invoices) {
    const outstanding = (Number(invoice.amount_due) || 0) - (Number(invoice.amount_paid) || 0);
    if (outstanding <= 0) continue;

    const resident = invoice.resident as unknown as {
      id: string; first_name: string; last_name: string; email: string | null; phone_primary: string | null; phone_secondary: string | null;
    } | null;
    const house = invoice.house as unknown as { house_number: string; street: { name: string } | null } | null;

    const daysOverdue = Math.max(0, Math.floor((today.getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)));
    const bucket = agingBucketFor(daysOverdue);

    // The Debtors report skipped an invoice with no resident, the Aging report counted it. Counting it
    // (one "No resident linked" row for each house) keeps the total equal to the Aging report and hides
    // no money. It is not a debtor, so the Debtors figure leaves it out.
    const houseName = house?.house_number || 'N/A';
    const streetName = house?.street?.name || 'N/A';
    const key = resident?.id ?? `no-resident:${houseName}|${streetName}`;
    let debtor = debtorMap.get(key);
    if (!debtor) {
      debtor = {
        name: resident ? `${resident.first_name} ${resident.last_name}` : 'No resident linked',
        linked: resident !== null,
        house: houseName,
        street: streetName,
        contact: resident ? [resident.phone_primary, resident.phone_secondary, resident.email].filter(Boolean).join(', ') : '',
        buckets: emptyBuckets(),
        total: 0,
        lines: [],
      };
      debtorMap.set(key, debtor);
    }
    debtor.buckets[bucket] += outstanding;
    debtor.total += outstanding;
    debtor.lines.push({ invoiceNumber: invoice.invoice_number ?? '', dueDate: invoice.due_date ?? '', daysOverdue, outstanding, bucket });
    bucketTotals[bucket] += outstanding;
    if (!oldest || daysOverdue > oldest.daysOverdue) oldest = { daysOverdue, dueDate: invoice.due_date ?? '' };
  }

  const debtors = Array.from(debtorMap.values()).sort((a, b) => b.total - a.total);
  const totalOwed = debtors.reduce((sum, d) => sum + d.total, 0);
  const owedOver90 = bucketTotals.over90Days;
  const debtorCount = debtors.filter((d) => d.linked).length;
  const hasUnlinked = debtors.some((d) => !d.linked);

  const rows: Record<string, SummaryCell>[] = [];
  for (const d of debtors) {
    rows.push({
      debtor: d.name,
      house: d.house,
      street: d.street,
      contact: d.contact,
      ...moneyCells(d.buckets),
      total: money(d.total),
    });
    // "Show invoice lines": one indented row per invoice straight under its debtor, in the same table.
    if (showInvoiceLines) {
      for (const line of d.lines.sort((a, b) => b.daysOverdue - a.daysOverdue)) {
        rows.push({
          debtor: `    ${line.invoiceNumber || 'Invoice'}, due ${reportDate(line.dueDate)}, ${line.daysOverdue} days late`,
          house: null, street: null, contact: null,
          ...moneyCells(emptyBuckets()),
          [line.bucket]: money(line.outstanding),
          total: money(line.outstanding),
        });
      }
    }
  }

  const data: SummaryReportData = {
    summary: [
      { label: 'Total owed (NGN)', value: money(totalOwed), tone: totalOwed > 0 ? 'bad' : 'good' },
      { label: 'Debtors', value: debtorCount, tone: debtorCount > 0 ? 'bad' : 'good' },
      { label: 'Owed over 90 days (NGN)', value: money(owedOver90), tone: owedOver90 > 0 ? 'bad' : 'good' },
      oldest
        ? { label: 'Oldest debt', value: `${oldest.daysOverdue} days`, tone: 'neutral', hint: `Due ${reportDate(oldest.dueDate)}` }
        : { label: 'Oldest debt', value: 'None', tone: 'good' },
    ],
    chart: {
      title: 'Owed by age (NGN)',
      bars: AGING_BUCKETS.map((b) => ({ label: b.label, value: bucketTotals[b.key], display: money(bucketTotals[b.key]), tone: b.tone })),
    },
    table: {
      columns: [
        { key: 'debtor', label: 'Debtor' },
        { key: 'house', label: 'House' },
        { key: 'street', label: 'Street' },
        { key: 'contact', label: 'Contact' },
        ...AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, align: 'right' as const })),
        { key: 'total', label: 'Total', align: 'right' as const },
      ],
      rows,
      totals: { debtor: 'Total', house: null, street: null, contact: null, ...moneyCells(bucketTotals), total: money(totalOwed) },
    },
    notes: [
      'Amounts are what is still unpaid on invoices that are unpaid or part paid. Age is days past the due date.',
      ...(hasUnlinked ? ['Rows marked "No resident linked" are unpaid invoices with no resident. Their money is in the totals, but they are not counted as debtors.'] : []),
    ],
  };

  return { type: 'debtors_aging', layout: 'summary', data };
}

// ============================================================
// Indebtedness Summary Report
// ============================================================

interface IndebtednessResidentLink {
  resident_id: string;
  resident_role: string;
  is_active: boolean;
  move_in_date: string | null;
  resident: { id: string; first_name: string; last_name: string } | null;
}

/**
 * The Primary Resident of a house on the Indebtedness Report (#1420): the person the house's
 * Security Dues bill, by the billing payer rule (`resolvePayer`, #1068). An occupant-paid house
 * shows the tenant, else the owner-occupier; a landlord-paid house shows the landlord. A house
 * with nobody of that class still shows its landlord, else its developer, else its occupant, so
 * no row is lost.
 * Newest move-in first when two people share a role, as in get_debt_statuses.
 */
export function pickIndebtednessPrimary(
  links: IndebtednessResidentLink[],
  payer: BillingPayer,
): IndebtednessResidentLink | null {
  const candidates = links
    .filter((link) => link.is_active)
    .sort((a, b) => (b.move_in_date ?? '').localeCompare(a.move_in_date ?? ''))
    .map((link) => ({ id: link.resident_id, role: link.resident_role, link }));
  const hasOccupant = candidates.some((c) => (OCCUPANT_PAYER_ROLES as readonly string[]).includes(c.role));
  const pick = (as: BillingPayer) =>
    resolvePayer({
      payer: as,
      targetType: 'house',
      house: { vacant: !hasOccupant, newNeverOccupied: false },
      applicableRoles: null,
      residents: candidates,
    }).payer;
  return (pick(payer) ?? pick('landlord') ?? pick('occupant'))?.link ?? null;
}

export async function generateIndebtednessReport(
  supabase: ReportSupabaseClient,
  includeUnoccupied: boolean = false,
  includeAmount: boolean = false,
  /** The dues sheet (#1400): count one charge only, and name its payer class. Omitted, every charge counts as before. */
  charge?: { category: string; payer: BillingPayer | null }
): Promise<IndebtednessReportData> {
  // Get all active houses with street info and primary residents
  const { data: houses, error: housesError } = await supabase
    .from('houses')
    .select(`
      id,
      house_number,
      billing_profile:billing_profiles!houses_billing_profile_id_fkey (
        payer
      ),
      street:streets (
        id,
        name
      ),
      resident_houses (
        resident_id,
        resident_role,
        is_active,
        move_in_date,
        resident:residents!resident_houses_resident_id_fkey (
          id,
          first_name,
          last_name
        )
      )
    `)
    .eq('is_active', true)
    .order('house_number');

  if (housesError) {
    console.error('Error fetching houses for indebtedness report:', housesError);
    throw new Error(housesError.message);
  }

  // Get outstanding amounts per house from invoices if needed or for summary counts. Read a page at
  // a time: the API returns at most 1,000 rows per request, and a single read would drop the rest
  // from the totals.
  const PAGE_SIZE = 1000;
  const invoices: { house_id: string | null; amount_due: number | string | null; amount_paid: number | string | null; status: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('invoices')
      .select(`
      house_id,
      amount_due,
      amount_paid,
      status
    `)
      .in('status', ['unpaid', 'partially_paid']);
    if (charge) query = query.eq('charge_category', charge.category);
    const { data: page, error: invoicesError } = await query
      .order('id')
      .range(from, from + PAGE_SIZE - 1);

    if (invoicesError) {
      console.error('Error fetching invoices:', invoicesError);
      throw new Error(invoicesError.message);
    }
    invoices.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }

  // Calculate outstanding per house
  const houseOutstanding = new Map<string, number>();
  for (const invoice of invoices || []) {
    if (invoice.house_id) {
      const outstanding = (Number(invoice.amount_due) || 0) - (Number(invoice.amount_paid) || 0);
      const current = houseOutstanding.get(invoice.house_id) || 0;
      houseOutstanding.set(invoice.house_id, current + outstanding);
    }
  }

  const debtStatuses = new Map(
    (await getDebtStatuses(supabase, { houseIds: (houses || []).map((h) => h.id), chargeCategory: charge?.category })).map((d) => [d.houseId, d]),
  );

  // Process houses
  const rows: HouseIndebtednessRow[] = [];
  let totalOutstanding = 0;

  for (const house of houses || []) {
    const street = house.street as unknown as { id: string; name: string } | null;

    const residentHouses = house.resident_houses as unknown as IndebtednessResidentLink[] | null;
    const billingProfile = house.billing_profile as unknown as { payer: BillingPayer | null } | null;
    const primaryAssignment = pickIndebtednessPrimary(residentHouses ?? [], charge?.payer ?? billingProfile?.payer ?? 'occupant');

    if (!includeUnoccupied && !primaryAssignment) continue;

    const outstanding = houseOutstanding.get(house.id) || 0;
    if (outstanding > 0) {
      totalOutstanding += outstanding;
    }

    const row: HouseIndebtednessRow = {
      houseId: house.id,
      houseNumber: house.house_number,
      streetName: street?.name || 'Unknown Street',
      primaryResidentName: primaryAssignment?.resident
        ? `${primaryAssignment.resident.first_name} ${primaryAssignment.resident.last_name}`
        : 'No Primary Resident',
      primaryResidentId: primaryAssignment?.resident?.id || null,
      status: debtStatuses.get(house.id)?.status ?? 'paid_in_full',
      statusLabel: debtStatuses.get(house.id)?.label ?? DEBT_STATUS_DEFAULTS.labels.paid_in_full,
    };

    if (includeAmount) {
      row.outstandingAmount = outstanding;
    }

    rows.push(row);
  }

  // Sort by street name, then house number (numeric sort)
  rows.sort((a, b) => {
    const streetCompare = a.streetName.localeCompare(b.streetName);
    if (streetCompare !== 0) return streetCompare;
    // Extract numeric portion of house number for proper sorting
    const numA = parseInt(a.houseNumber.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.houseNumber.replace(/\D/g, '')) || 0;
    return numA - numB;
  });

  const indebtedCount = rows.filter(r => r.status === 'arrears' || r.status === 'outstanding').length;

  return {
    summary: {
      totalHouses: rows.length,
      indebtedCount,
      nonIndebtedCount: rows.length - indebtedCount,
      totalOutstanding: includeAmount ? totalOutstanding : undefined,
    },
    houses: rows,
  };
}



// ============================================================
// Dues, levies and collection status (replaces the two Indebtedness reports, #1400)
// ============================================================

/** A sheet shows at most this many months (the latest ones), so the grid stays readable. */
const MAX_DUES_MONTHS = 24;

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string) => `${MONTH_ABBR[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Month keys ('YYYY-MM') from the month of `start` to the month of `end`. An unusable range falls back to this year so far. */
function monthKeysBetween(start: string, end: string): string[] {
  let from = start.slice(0, 7);
  let to = end.slice(0, 7);
  if (!MONTH_KEY.test(from) || !MONTH_KEY.test(to) || from > to) {
    const year = getDateRangeFromPreset('this_year');
    from = year.startDate.slice(0, 7);
    to = year.endDate.slice(0, 7);
  }
  const keys: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  while (`${y}-${String(m).padStart(2, '0')}` <= to) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return keys;
}

type DuesInvoice = {
  id: string;
  house_id: string | null;
  invoice_number: string | null;
  invoice_type: string | null;
  charge_category: string;
  amount_due: number | string | null;
  amount_paid: number | string | null;
  status: string;
  due_date: string;
  period_start: string | null;
  rate_snapshot: { is_development_levy?: boolean } | null;
};

/** The chosen charge's non-void invoices, and the development levy's for the Levy column, a page of 1000 at a time (PostgREST caps one response at 1000 rows). */
async function fetchDuesInvoices(supabase: ReportSupabaseClient, chargeCategory: string): Promise<DuesInvoice[]> {
  const PAGE = 1000;
  const rows: DuesInvoice[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, house_id, invoice_number, invoice_type, charge_category, amount_due, amount_paid, status, due_date, period_start, rate_snapshot')
      .neq('status', 'void')
      .in('charge_category', [chargeCategory, 'development_levy'])
      .not('house_id', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('Error fetching invoices for dues and collection status report:', error);
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as unknown as DuesInvoice[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type LevyStatusLabel = 'Paid' | 'Part paid' | 'Not paid' | 'No levy';

function levyStatusFor(levyInvoices: DuesInvoice[]): LevyStatusLabel {
  if (levyInvoices.length === 0) return 'No levy';
  if (levyInvoices.every((i) => i.status === 'paid')) return 'Paid';
  if (levyInvoices.some((i) => i.status === 'paid' || i.status === 'partially_paid' || (Number(i.amount_paid) || 0) > 0)) return 'Part paid';
  return 'Not paid';
}

/** One month of one house, in the estate map's words: paid up, outstanding (not yet due), overdue, no invoice. */
function monthStatusFor(invoices: DuesInvoice[], today: string): SummaryGridStatus {
  if (invoices.length === 0) return 'no_invoice';
  const open = invoices.filter((i) => i.status === 'unpaid' || i.status === 'partially_paid');
  if (open.length === 0) return 'paid_up';
  return open.some((i) => i.due_date < today) ? 'overdue' : 'outstanding';
}

export async function generateDuesCollectionStatus(
  supabase: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string },
  includeUnoccupied: boolean,
  showInvoiceLines: boolean,
  chargeCategory: string = DEFAULT_CHARGE_CATEGORY
): Promise<SummaryReport> {
  // The charge comes from the table, never a fixed list, so a category added later works here.
  const { data: categories, error: categoryError } = await supabase
    .from('charge_categories')
    .select('code, name, is_active')
    .eq('code', chargeCategory);
  if (categoryError) {
    console.error('Error fetching the charge for the dues and collection status report:', categoryError);
    throw new Error(categoryError.message);
  }
  const category = (categories as { code: string; name: string; is_active: boolean }[] | null)?.[0];
  if (!category) throw new Error(`Unknown charge: ${chargeCategory}`);
  if (!category.is_active) throw new Error(`${category.name} is not an active charge, so it cannot be reported.`);
  const chargeName = category.name;

  // The house list, the amounts owed and the status label come from the Indebtedness report's own
  // generator, so the total owed here is the same figure it gave. It counts this charge only. Dues
  // go to the billing profile's payer (the house's own, occupant by default); every other charge is
  // a landlord's (owner decision on #1400, 2 Nov 2026).
  const indebtedness = await generateIndebtednessReport(supabase, includeUnoccupied, true, {
    category: chargeCategory,
    payer: chargeCategory === DEFAULT_CHARGE_CATEGORY ? null : 'landlord',
  });
  const invoices = await fetchDuesInvoices(supabase, chargeCategory);
  const today = new Date().toISOString().slice(0, 10);

  const allMonths = monthKeysBetween(dateRange.startDate, dateRange.endDate);
  const monthKeys = allMonths.slice(-MAX_DUES_MONTHS);

  const byHouse = new Map<string, DuesInvoice[]>();
  for (const invoice of invoices) {
    if (!invoice.house_id) continue;
    const list = byHouse.get(invoice.house_id);
    if (list) list.push(invoice);
    else byHouse.set(invoice.house_id, [invoice]);
  }

  let fullyPaid = 0;
  let partPaid = 0;
  let notPaid = 0;
  let monthsOwedTotal = 0;
  const streetOwed = new Map<string, number>();
  const rows: Record<string, SummaryCell>[] = [];
  const grid: SummaryGrid = { months: monthKeys.map((key) => ({ key, label: monthLabel(key) })), houses: [] };
  const isLevy = (i: DuesInvoice) => i.rate_snapshot?.is_development_levy === true;

  for (const house of indebtedness.houses) {
    const houseInvoices = byHouse.get(house.houseId) ?? [];
    const levy = levyStatusFor(houseInvoices.filter((i) => isLevy(i) || i.charge_category === 'development_levy'));
    // Only the chosen charge makes months (and Owed and lines). A development levy that sits under Dues is
    // still no month; under the Development Levy charge it is the bill.
    const chosen = houseInvoices.filter((i) => i.charge_category === chargeCategory);
    // Under Security Dues a month is a service charge, as in the WhatsApp balance: a levy, adjustment or other type
    // adds to Owed only. Under any other charge the chosen charge's invoices are the bill, a flagged levy included.
    const dues = chosen.filter((i) =>
      chargeCategory === DEFAULT_CHARGE_CATEGORY ? i.invoice_type === 'SERVICE_CHARGE' && !isLevy(i) : chargeCategory === 'development_levy' || !isLevy(i)
    );

    const months: Record<string, SummaryGridStatus> = {};
    for (const key of monthKeys) {
      months[key] = monthStatusFor(dues.filter((i) => (i.period_start ?? i.due_date).slice(0, 7) === key), today);
    }
    const statuses = Object.values(months);
    const monthsPaid = statuses.filter((s) => s === 'paid_up').length;
    const monthsBilled = statuses.filter((s) => s !== 'no_invoice').length;
    const monthsOwed = statuses.filter((s) => s === 'overdue' || s === 'outstanding').length;
    monthsOwedTotal += monthsOwed;

    // Same amount as the Indebtedness report; a house in credit owes nothing.
    const owed = Math.max(0, house.outstandingAmount ?? 0);
    if (owed === 0) fullyPaid++;
    else if (monthsPaid === 0) notPaid++;
    else partPaid++;
    if (owed > 0) streetOwed.set(house.streetName, (streetOwed.get(house.streetName) ?? 0) + owed);

    // The first column is keyed `debtor` so the server PDF gives it the wide column its invoice lines need.
    rows.push({
      debtor: house.houseNumber,
      street: house.streetName,
      resident: house.primaryResidentName,
      monthsPaid: `${monthsPaid} of ${monthsBilled}`,
      monthsOwed,
      levy,
      owed: money(owed),
      status: house.statusLabel,
    });
    if (showInvoiceLines) {
      const open = chosen
        .filter((i) => i.status === 'unpaid' || i.status === 'partially_paid')
        .map((i) => ({ i, outstanding: (Number(i.amount_due) || 0) - (Number(i.amount_paid) || 0) }))
        .filter((l) => l.outstanding > 0)
        .sort((a, b) => a.i.due_date.localeCompare(b.i.due_date));
      for (const { i, outstanding } of open) {
        rows.push({
          debtor: `    ${i.invoice_number || 'Invoice'}, due ${reportDate(i.due_date)}, ${i.status === 'partially_paid' ? 'part paid' : 'unpaid'}`,
          street: null, resident: null, monthsPaid: null, monthsOwed: null, levy: null,
          owed: money(outstanding),
          status: null,
        });
      }
    }

    grid.houses.push({ id: house.houseId, houseNumber: house.houseNumber, streetName: house.streetName, levy, owed, months });
  }

  const totalOwed = indebtedness.summary.totalOutstanding ?? 0;

  const notes = [
    `Charge: ${chargeName}. "Months paid" counts the months whose invoices are all paid, out of the months that have an invoice.`,
    'Owed is everything still unpaid on the house for this charge, including earlier months, so it can be more than the months shown.',
    'Fully paid: owes nothing. Part paid: owes something and has paid at least one month. Not paid: owes something and has paid no month.',
  ];
  if (allMonths.length > monthKeys.length) notes.push(`The period is longer than ${MAX_DUES_MONTHS} months, so the latest ${MAX_DUES_MONTHS} are shown.`);

  const data: SummaryReportData = {
    summary: [
      { label: 'Houses fully paid', value: fullyPaid, tone: 'good' },
      { label: 'Houses part paid', value: partPaid, tone: partPaid > 0 ? 'neutral' : 'good' },
      { label: 'Houses not paid', value: notPaid, tone: notPaid > 0 ? 'bad' : 'good' },
      { label: 'Total owed (NGN)', value: money(totalOwed), tone: totalOwed > 0 ? 'bad' : 'good' },
    ],
    chart: {
      title: 'Owed by street (NGN)',
      bars: Array.from(streetOwed, ([label, value]) => ({ label, value, display: money(value), tone: 'bad' as const }))
        .sort((a, b) => b.value - a.value),
    },
    table: {
      columns: [
        { key: 'debtor', label: 'House' },
        { key: 'street', label: 'Street' },
        { key: 'resident', label: 'Primary Resident' },
        { key: 'monthsPaid', label: 'Months paid', align: 'right' },
        { key: 'monthsOwed', label: 'Months owed', align: 'right' },
        { key: 'levy', label: 'Levy' },
        { key: 'owed', label: 'Owed', align: 'right' },
        { key: 'status', label: 'Status' },
      ],
      rows,
      totals: { debtor: 'Total', street: null, resident: null, monthsPaid: null, monthsOwed: monthsOwedTotal, levy: null, owed: money(totalOwed), status: null },
    },
    notes,
    grid,
    chargeName,
  };

  return { type: 'dues_collection_status', layout: 'summary', data };
}

// ============================================================
// Development Levy Report
// ============================================================

async function generateDevelopmentLevyReport(
  supabase: ReportSupabaseClient,
  includeUnoccupied: boolean = false,
  paymentStatus: 'all' | 'paid' | 'unpaid' = 'all'
): Promise<DevelopmentLevyData> {
  // Get current development levy profile
  const { data: settingData } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'current_development_levy_profile_id')
    .single();

  const devLevyProfileId = settingData?.value || null;

  if (!devLevyProfileId) {
    // No development levy configured, return empty report
    return {
      summary: {
        totalHouses: 0,
        paidCount: 0,
        unpaidCount: 0,
        totalAmount: 0,
        collectedAmount: 0,
        collectionRate: 0,
      },
      houses: [],
    };
  }

  // Get the development levy profile details
  const { data: profile } = await supabase
    .from('billing_profiles')
    .select(`
      id,
      name,
      billing_items (
        amount
      )
    `)
    .eq('id', devLevyProfileId)
    .eq('is_development_levy', true)
    .single();

  const levyAmount = profile?.billing_items?.[0]?.amount || 0;

  // Get all active houses with residents
  const { data: houses, error: housesError } = await fetchAllRows((from, to) =>
    supabase
      .from('houses')
      .select(`
        id,
        house_number,
        street:streets (
          id,
          name
        ),
        resident_houses (
          resident_id,
          resident_role,
          is_active,
          resident:residents!resident_houses_resident_id_fkey (
            id,
            first_name,
            last_name
          )
        )
      `)
      .eq('is_active', true)
      .order('house_number')
      .order('id')
      .range(from, to)
  );

  if (housesError) {
    console.error('Error fetching houses for development levy report:', housesError);
    throw new Error(housesError);
  }

  // Get development levy invoices (filter by rate_snapshot containing is_development_levy)
  const { data: invoices, error: invoicesError } = await fetchAllRows((from, to) =>
    supabase
      .from('invoices')
      .select(`
        id,
        house_id,
        amount_due,
        amount_paid,
        status,
        rate_snapshot
      `)
      .order('id')
      .range(from, to)
  );

  if (invoicesError) {
    console.error('Error fetching development levy invoices:', invoicesError);
    throw new Error(invoicesError);
  }

  // Filter to only development levy invoices and track payment status per house
  const housePaymentStatus = new Map<string, { paid: boolean; amount: number }>();

  for (const invoice of invoices || []) {
    const snapshot = invoice.rate_snapshot as { is_development_levy?: boolean } | null;
    if (snapshot?.is_development_levy && invoice.house_id) {
      const amountPaid = Number(invoice.amount_paid) || 0;
      const amountDue = Number(invoice.amount_due) || 0;
      const isPaid = invoice.status === 'paid' || amountPaid >= amountDue;

      // Track if this house has paid its dev levy
      const existing = housePaymentStatus.get(invoice.house_id);
      if (!existing) {
        housePaymentStatus.set(invoice.house_id, { paid: isPaid, amount: amountDue });
      } else if (isPaid) {
        housePaymentStatus.set(invoice.house_id, { paid: true, amount: amountDue });
      }
    }
  }

  // Process houses
  const rows: DevelopmentLevyRow[] = [];
  let paidCount = 0;
  let collectedAmount = 0;

  for (const house of houses || []) {
    const street = house.street as unknown as { id: string; name: string } | null;

    // Find responsible resident for development levy
    // Priority: non_resident_landlord > resident_landlord > developer
    const residentHouses = house.resident_houses as unknown as Array<{
      resident_id: string;
      resident_role: string;
      is_active: boolean;
      resident: { id: string; first_name: string; last_name: string } | null;
    }>;

    const activeAssignments = residentHouses?.filter(rh => rh.is_active) || [];

    let responsibleAssignment = activeAssignments.find(rh => rh.resident_role === 'non_resident_landlord');
    if (!responsibleAssignment) {
      responsibleAssignment = activeAssignments.find(rh => rh.resident_role === 'resident_landlord');
    }
    if (!responsibleAssignment) {
      responsibleAssignment = activeAssignments.find(rh => rh.resident_role === 'developer');
    }

    if (!includeUnoccupied && !responsibleAssignment) continue;

    const paymentInfo = housePaymentStatus.get(house.id);
    const isPaid = paymentInfo?.paid || false;
    const amount = paymentInfo?.amount || levyAmount;

    if (isPaid) {
      paidCount++;
      collectedAmount += amount;
    }

    const roleLabels: Record<string, string> = {
      non_resident_landlord: 'Property Owner',
      resident_landlord: 'Owner-Occupier',
      developer: 'Developer',
    };

    rows.push({
      houseId: house.id,
      houseNumber: house.house_number,
      streetName: street?.name || 'Unknown Street',
      responsibleResidentName: responsibleAssignment?.resident
        ? `${responsibleAssignment.resident.first_name} ${responsibleAssignment.resident.last_name}`
        : 'No Responsible Party',
      responsibleResidentId: responsibleAssignment?.resident?.id || null,
      responsibleResidentRole: responsibleAssignment
        ? (roleLabels[responsibleAssignment.resident_role] || responsibleAssignment.resident_role)
        : 'N/A',
      levyAmount: amount,
      isPaid,
    });
  }

  // Filter by payment status if specified
  let filteredRows = rows;
  if (paymentStatus === 'paid') {
    filteredRows = rows.filter(row => row.isPaid);
  } else if (paymentStatus === 'unpaid') {
    filteredRows = rows.filter(row => !row.isPaid);
  }

  // Recalculate summary based on filtered rows
  const filteredPaidCount = filteredRows.filter(row => row.isPaid).length;
  const filteredCollectedAmount = filteredRows
    .filter(row => row.isPaid)
    .reduce((sum, row) => sum + row.levyAmount, 0);
  const filteredTotalAmount = filteredRows.reduce((sum, row) => sum + row.levyAmount, 0);

  // Sort by street name, then house number
  filteredRows.sort((a, b) => {
    const streetCompare = a.streetName.localeCompare(b.streetName);
    if (streetCompare !== 0) return streetCompare;
    const numA = parseInt(a.houseNumber.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.houseNumber.replace(/\D/g, '')) || 0;
    return numA - numB;
  });

  return {
    summary: {
      totalHouses: filteredRows.length,
      paidCount: filteredPaidCount,
      unpaidCount: filteredRows.length - filteredPaidCount,
      totalAmount: filteredTotalAmount,
      collectedAmount: filteredCollectedAmount,
      collectionRate: filteredTotalAmount > 0 ? (filteredCollectedAmount / filteredTotalAmount) * 100 : 0,
    },
    houses: filteredRows,
  };
}

// ============================================================
// Main Report Generation Function

// ============================================================
// Main Report Generation Function (no authorization -- see header)
// ============================================================

export async function generateReportWithClient(
  supabase: ReportSupabaseClient,
  params: ReportRequestFormData
): Promise<GenerateReportResult> {
  // Calculate date range
  const dateRange =
    params.periodPreset === 'custom'
      ? { startDate: params.startDate || '', endDate: params.endDate || '' }
      : getDateRangeFromPreset(params.periodPreset);

  try {
    switch (params.reportType) {
      case 'financial_overview': {
        const data = await generateFinancialOverview(
          supabase,
          dateRange.startDate,
          dateRange.endDate,
          params.bankAccountIds || [],
          params.transactionType || 'all'
        );
        return { success: true, report: { type: 'financial_overview', data } };
      }

      case 'collection_report': {
        const data = await generateCollectionReport(
          supabase,
          dateRange.startDate,
          dateRange.endDate
        );
        return { success: true, report: { type: 'collection_report', data } };
      }

      case 'transaction_log': {
        const data = await generateTransactionLog(
          supabase,
          dateRange.startDate,
          dateRange.endDate,
          params.bankAccountIds || [],
          params.transactionType || 'all'
        );
        return { success: true, report: { type: 'transaction_log', data } };
      }

      case 'debtors_aging': {
        const report = await generateDebtorsAging(supabase, params.includeDetails);
        return { success: true, report };
      }

      case 'dues_collection_status': {
        const report = await generateDuesCollectionStatus(
          supabase,
          dateRange,
          params.includeUnoccupied,
          params.includeDetails,
          params.chargeCategory
        );
        return { success: true, report };
      }

      case 'project_spend': {
        const report = await generateProjectSpend(supabase, dateRange);
        return { success: true, report };
      }

      case 'petty_cash': {
        const report = await generatePettyCash(supabase, dateRange, params.includeDetails);
        return { success: true, report };
      }

      case 'statement_of_account': {
        const report = await generateStatementOfAccount(supabase, dateRange, {
          kind: params.statementFor ?? 'house',
          id: params.statementId ?? '',
        });
        return { success: true, report };
      }

      case 'collection_rate_by_street': {
        const report = await generateCollectionRateByStreet(supabase, dateRange);
        return { success: true, report };
      }

      case 'expenses_by_category': {
        const report = await generateExpensesByCategory(supabase, dateRange, params.includeDetails);
        return { success: true, report };
      }

      case 'wallet_balances': {
        const report = await generateWalletBalances(supabase, dateRange);
        return { success: true, report };
      }

      case 'write_offs': {
        const report = await generateWriteOffs(supabase, dateRange);
        return { success: true, report };
      }

      case 'development_levy': {
        const data = await generateDevelopmentLevyReport(
          supabase,
          params.includeUnoccupied,
          params.paymentStatus
        );
        return { success: true, report: { type: 'development_levy', data } };
      }

      default: {
        // A retired report (#1399): old rows still open, but it is not generated again.
        if (isRetiredReport(params.reportType)) {
          return { success: false, error: `${REPORT_TYPE_LABELS[params.reportType]} was replaced by ${REPORT_TYPE_LABELS[resolveRetiredReport(params.reportType)]}.` };
        }
        // A listed report without a generator yet (#1397): say so rather than fail silently.
        const label = REPORT_TYPE_LABELS[params.reportType];
        return { success: false, error: label ? `${label} cannot be generated yet.` : 'Invalid report type' };
      }
    }
  } catch (error) {
    console.error('Error generating report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
    };
  }
}
