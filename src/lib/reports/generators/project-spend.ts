/**
 * Project spend report (#1404, layout B): per capital project, spend in the period and to date,
 * against its budget and its milestones.
 *
 * Spend is the amount of the project's expenses (`expenses.project_id`). A bank import row matched to
 * a project becomes one such expense when it is processed (process-import.ts), so counting the bank
 * rows as well would count that money twice. Only paid expenses count, the same as the financial overview.
 */
import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryCell, SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { cents, money, reportDate } from '@/lib/reports/generators/money-out';

interface ProjectRow { id: string; name: string; status: string | null; total_budget: number | string | null }
interface MilestoneRow { id: string; project_id: string | null; title: string; status: string | null; due_date: string | null }
interface ExpenseRow { id: string; project_id: string | null; amount: number | string | null; expense_date: string }

async function readAll<T>(label: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result = await fetchAllRows<T>(page);
  if (result.error !== null) {
    console.error(`Error fetching ${label} for project spend report:`, result.error);
    throw new Error(result.error);
  }
  return result.data;
}

export async function generateProjectSpend(
  supabase: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string }
): Promise<SummaryReport> {
  const { startDate, endDate } = dateRange;

  const projects = await readAll<ProjectRow>('projects', (from, to) =>
    supabase.from('projects').select('id, name, status, total_budget').order('id').range(from, to));
  const milestones = await readAll<MilestoneRow>('milestones', (from, to) =>
    supabase.from('project_milestones').select('id, project_id, title, status, due_date').order('id').range(from, to));
  const expenses = await readAll<ExpenseRow>('expenses', (from, to) =>
    supabase.from('expenses').select('id, project_id, amount, expense_date')
      .not('project_id', 'is', null).eq('status', 'paid').lte('expense_date', endDate).order('id').range(from, to));

  const spend = new Map<string, { period: number; toDate: number }>();
  for (const e of expenses) {
    if (!e.project_id) continue;
    const entry = spend.get(e.project_id) ?? { period: 0, toDate: 0 };
    const amount = Number(e.amount) || 0;
    entry.toDate += amount;
    if (e.expense_date >= startDate) entry.period += amount;
    spend.set(e.project_id, entry);
  }

  const milestonesOf = new Map<string, MilestoneRow[]>();
  for (const m of milestones) {
    if (!m.project_id) continue;
    milestonesOf.set(m.project_id, [...(milestonesOf.get(m.project_id) ?? []), m]);
  }

  const lines = projects.map((p) => {
    const s = spend.get(p.id) ?? { period: 0, toDate: 0 };
    const budget = p.total_budget === null || p.total_budget === undefined ? null : Number(p.total_budget) || 0;
    const ms = milestonesOf.get(p.id) ?? [];
    const done = ms.filter((m) => m.status === 'completed').length;
    const next = ms.filter((m) => m.status !== 'completed' && m.due_date).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];
    return { project: p, period: cents(s.period), toDate: cents(s.toDate), budget, left: budget === null ? null : cents(budget - s.toDate), milestones: ms.length, done, next };
  }).sort((a, b) => b.period - a.period || b.toDate - a.toDate || a.project.name.localeCompare(b.project.name));

  const totalPeriod = cents(lines.reduce((sum, l) => sum + l.period, 0));
  const totalToDate = cents(lines.reduce((sum, l) => sum + l.toDate, 0));
  const withBudget = lines.filter((l) => l.budget !== null);
  const totalBudget = cents(withBudget.reduce((sum, l) => sum + (l.budget ?? 0), 0));
  const budgetLeft = cents(withBudget.reduce((sum, l) => sum + (l.left ?? 0), 0));

  const rows: Record<string, SummaryCell>[] = lines.map((l) => ({
    project: l.project.name,
    status: l.project.status ? l.project.status.replace(/_/g, ' ') : '',
    budget: l.budget === null ? '' : money(l.budget),
    spendPeriod: money(l.period),
    spendToDate: money(l.toDate),
    budgetLeft: l.left === null ? '' : money(l.left),
    milestones: l.milestones === 0 ? 'None' : `${l.done} of ${l.milestones} done`,
    nextMilestone: l.next ? `${l.next.title}, due ${reportDate(l.next.due_date!)}` : '',
  }));

  const data: SummaryReportData = {
    summary: [
      { label: 'Projects', value: lines.length, tone: 'neutral' },
      { label: 'Spend in period (NGN)', value: money(totalPeriod), tone: 'neutral', hint: `${reportDate(startDate)} to ${reportDate(endDate)}` },
      { label: 'Spend to date (NGN)', value: money(totalToDate), tone: 'neutral', hint: `Up to ${reportDate(endDate)}` },
      withBudget.length > 0
        ? { label: 'Budget left (NGN)', value: money(budgetLeft), tone: budgetLeft < 0 ? 'bad' : 'good', hint: `Of ${money(totalBudget)} budgeted` }
        : { label: 'Budget left (NGN)', value: 'No budget set', tone: 'neutral' },
    ],
    chart: {
      title: 'Spend in period by project (NGN)',
      bars: lines.map((l) => ({ label: l.project.name, value: l.period, display: money(l.period), tone: 'neutral' as const })),
    },
    table: {
      columns: [
        { key: 'project', label: 'Project' },
        { key: 'status', label: 'Status' },
        { key: 'budget', label: 'Budget', align: 'right' },
        { key: 'spendPeriod', label: 'Spend in period', align: 'right' },
        { key: 'spendToDate', label: 'Spend to date', align: 'right' },
        { key: 'budgetLeft', label: 'Budget left', align: 'right' },
        { key: 'milestones', label: 'Milestones' },
        { key: 'nextMilestone', label: 'Next milestone' },
      ],
      rows,
      totals: {
        project: 'Total', status: null, budget: withBudget.length > 0 ? money(totalBudget) : null,
        spendPeriod: money(totalPeriod), spendToDate: money(totalToDate),
        budgetLeft: withBudget.length > 0 ? money(budgetLeft) : null, milestones: null, nextMilestone: null,
      },
    },
    notes: [
      'Spend is the amount of each project\'s expenses, including bank statement rows already turned into expenses. Only paid expenses are counted, the same as the Financial Overview.',
      'Budget left is budget less spend to date, for projects that have a budget.',
    ],
  };

  return { type: 'project_spend', layout: 'summary', data };
}
