import { getBudgetYear } from '@/actions/expenses/budgets';
import { BudgetsClient } from '@/components/expenditure/budgets/budgets-client';

/** Budgets per expense category (#1406). The route needs EXPENDITURE_VIEW (ROUTE_PERMISSIONS). */
export default async function BudgetsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const currentYear = new Date().getFullYear();
    const requested = Number(Array.isArray(params.year) ? params.year[0] : params.year);
    const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : currentYear;

    const result = await getBudgetYear(year);

    return <BudgetsClient year={year} currentYear={currentYear} budget={result.data} error={result.error} />;
}
