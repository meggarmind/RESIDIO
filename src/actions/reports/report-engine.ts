'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ReportRequestFormData } from '@/lib/validators/reports';
import { getDateRangeFromPreset } from '@/lib/validators/reports';

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

export type ReportData =
  | { type: 'financial_overview'; data: FinancialOverviewData }
  | { type: 'collection_report'; data: CollectionReportData }
  | { type: 'invoice_aging'; data: InvoiceAgingData }
  | { type: 'transaction_log'; data: TransactionLogData }
  | { type: 'debtors_report'; data: DebtorsReportData };

export interface GenerateReportResult {
  success: boolean;
  report?: ReportData;
  error?: string;
}

// ============================================================
// Authorization Check
// ============================================================

async function checkReportAccess(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, error: 'Unauthorized' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const allowedRoles = ['admin', 'chairman', 'financial_secretary'];
  if (!profile || !allowedRoles.includes(profile.role)) {
    return { authorized: false, error: 'Forbidden' };
  }

  return { authorized: true, user, profile };
}

// ============================================================
// Financial Overview Report
// ============================================================

async function generateFinancialOverview(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  startDate: string,
  endDate: string,
  bankAccountIds: string[],
  transactionType: 'all' | 'credit' | 'debit'
): Promise<FinancialOverviewData> {
  // Build query for bank statement rows
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

  // Filter by bank accounts if specified
  if (bankAccountIds.length > 0) {
    query = query.in('bank_statement_imports.bank_account_id', bankAccountIds);
  }

  // Filter by transaction type if specified
  if (transactionType !== 'all') {
    query = query.eq('transaction_type', transactionType);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error('Error fetching financial overview:', error);
    throw new Error(error.message);
  }

  // Process data
  let totalCredits = 0;
  let totalDebits = 0;
  const creditCategoryMap = new Map<string | null, CategoryBreakdown>();
  const debitCategoryMap = new Map<string | null, CategoryBreakdown>();
  const monthlyData = new Map<string, { credits: number; debits: number }>();

  for (const row of rows || []) {
    const amount = Number(row.amount) || 0;
    const tag = row.transaction_tags as unknown as { id: string; name: string; color: string } | null;
    const categoryId = row.tag_id || null;
    const categoryName = tag?.name || 'Uncategorized';
    const categoryColor = tag?.color || 'gray';

    // Aggregate totals
    if (row.transaction_type === 'credit') {
      totalCredits += amount;

      // Aggregate by category
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
      transactionCount: rows?.length || 0,
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
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  startDate: string,
  endDate: string
): Promise<CollectionReportData> {
  // Get invoices within the period
  const { data: invoices, error: invoiceError } = await supabase
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
    .neq('status', 'void');

  if (invoiceError) {
    console.error('Error fetching invoices:', invoiceError);
    throw new Error(invoiceError.message);
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

async function generateInvoiceAging(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
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
    { name: 'Current (0-30 days)', min: 0, max: 30, invoices: [] as any[], total: 0 },
    { name: '31-60 days', min: 31, max: 60, invoices: [] as any[], total: 0 },
    { name: '61-90 days', min: 61, max: 90, invoices: [] as any[], total: 0 },
    { name: 'Over 90 days', min: 91, max: Infinity, invoices: [] as any[], total: 0 },
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
      invoiceNumber: invoice.invoice_number,
      residentName: resident ? `${resident.first_name} ${resident.last_name}` : 'Unknown',
      houseNumber: house?.house_number || 'N/A',
      amountDue,
      amountPaid,
      outstanding,
      dueDate: invoice.due_date,
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
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  startDate: string,
  endDate: string,
  bankAccountIds: string[],
  transactionType: 'all' | 'credit' | 'debit'
): Promise<TransactionLogData> {
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
    .order('transaction_date', { ascending: false });

  if (bankAccountIds.length > 0) {
    query = query.in('bank_statement_imports.bank_account_id', bankAccountIds);
  }

  if (transactionType !== 'all') {
    query = query.eq('transaction_type', transactionType);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error('Error fetching transaction log:', error);
    throw new Error(error.message);
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

async function generateDebtorsReport(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
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
// Main Report Generation Function
// ============================================================

export async function generateReport(
  params: ReportRequestFormData
): Promise<GenerateReportResult> {
  const supabase = await createServerSupabaseClient();

  // Check authorization
  const authCheck = await checkReportAccess(supabase);
  if (!authCheck.authorized) {
    return { success: false, error: authCheck.error };
  }

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

      case 'invoice_aging': {
        const data = await generateInvoiceAging(supabase);
        return { success: true, report: { type: 'invoice_aging', data } };
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

      case 'debtors_report': {
        const data = await generateDebtorsReport(supabase);
        return { success: true, report: { type: 'debtors_report', data } };
      }

      default:
        return { success: false, error: 'Invalid report type' };
    }
  } catch (error) {
    console.error('Error generating report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
    };
  }
}
