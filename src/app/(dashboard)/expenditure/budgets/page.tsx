import { getBudgetYear } from '@/actions/expenses/budgets';
import { BudgetsClient } from '@/components/expenditure/budgets/budgets-client';
import { lagosParts } from '@/lib/whatsapp/assistant-format';

/** Budgets per expense category (#1406). The route needs EXPENDITURE_VIEW (ROUTE_PERMISSIONS). */
export default async function BudgetsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    // The estate's year, not the server's: Africa/Lagos (UTC+1), so 31 December 23:30 UTC is already next year.
    const currentYear = lagosParts(new Date()).year;
    const requested = Number(Array.isArray(params.year) ? params.year[0] : params.year);
    const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : currentYear;

    const result = await getBudgetYear(year);

    return <BudgetsClient year={year} currentYear={currentYear} budget={result.data} error={result.error} />;
}
