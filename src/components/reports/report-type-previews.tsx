import { cn } from '@/lib/utils';
import type { ReportType } from '@/lib/validators/reports';

/**
 * Static "Example layout" pages for the report type picker (#1362). The values are made up; the stat labels
 * and table columns follow what each report shows in `templates/modern-template.tsx` and `src/lib/pdf/reports/*`.
 * Dates are month names, never numeric (CORE.md section 4).
 */

type Align = 'left' | 'right' | 'center';

interface PreviewDefinition {
    stats: { label: string; value: string }[];
    tableTitle: string;
    columns: { label: string; align?: Align }[];
    rows: string[][];
}

export const reportTypePreviews: Record<ReportType, PreviewDefinition> = {
    financial_overview: {
        stats: [
            { label: 'Total Income', value: '₦4,250,000.00' },
            { label: 'Total Expenses', value: '₦1,980,000.00' },
            { label: 'Net Balance', value: '₦2,270,000.00' },
        ],
        tableTitle: 'Monthly Trend',
        columns: [{ label: 'Period' }, { label: 'Income', align: 'right' }, { label: 'Expenses', align: 'right' }, { label: 'Net', align: 'right' }],
        rows: [
            ['Aug 2026', '₦1,380,000.00', '₦640,000.00', '₦740,000.00'],
            ['Sep 2026', '₦1,420,000.00', '₦700,000.00', '₦720,000.00'],
            ['Oct 2026', '₦1,450,000.00', '₦640,000.00', '₦810,000.00'],
        ],
    },
    collection_report: {
        stats: [
            { label: 'Total Invoiced', value: '₦3,600,000.00' },
            { label: 'Total Collected', value: '₦2,900,000.00' },
            { label: 'Outstanding', value: '₦700,000.00' },
        ],
        tableTitle: 'Collection by Resident',
        columns: [
            { label: 'Resident' },
            { label: 'Property' },
            { label: 'Invoiced', align: 'right' },
            { label: 'Paid', align: 'right' },
            { label: 'Outstanding', align: 'right' },
        ],
        rows: [
            ['A. Bello', 'Block 4, House 12', '₦120,000.00', '₦120,000.00', '₦0.00'],
            ['C. Okafor', 'Block 2, House 3', '₦120,000.00', '₦60,000.00', '₦60,000.00'],
            ['M. Yusuf', 'Block 7, House 9', '₦120,000.00', '₦0.00', '₦120,000.00'],
        ],
    },
    invoice_aging: {
        stats: [
            { label: 'Current (0-30 days)', value: '₦420,000.00' },
            { label: '31-60 Days', value: '₦180,000.00' },
            { label: 'Over 90 Days', value: '₦95,000.00' },
        ],
        tableTitle: 'Outstanding Invoices by Age',
        columns: [
            { label: 'S/N' },
            { label: 'Invoice #' },
            { label: 'Resident' },
            { label: 'House' },
            { label: 'Due Date', align: 'right' },
            { label: 'Days', align: 'right' },
            { label: 'Amount', align: 'right' },
        ],
        rows: [
            ['1', 'INV-0412', 'C. Okafor', 'Block 2, House 3', '15 Oct 2026', '15', '₦60,000.00'],
            ['2', 'INV-0388', 'M. Yusuf', 'Block 7, House 9', '31 Aug 2026', '60', '₦120,000.00'],
        ],
    },
    transaction_log: {
        stats: [
            { label: 'Total Transactions', value: '128' },
            { label: 'Total Credits', value: '₦4,250,000.00' },
            { label: 'Total Debits', value: '₦1,980,000.00' },
        ],
        tableTitle: 'Transactions',
        columns: [
            { label: 'S/N' },
            { label: 'Date' },
            { label: 'Description' },
            { label: 'Category' },
            { label: 'Amount', align: 'right' },
        ],
        rows: [
            ['1', '02 Oct 2026', 'Service charge, Block 4 House 12', 'Service charge', '₦120,000.00'],
            ['2', '05 Oct 2026', 'Generator diesel', 'Utilities', '-₦85,000.00'],
            ['3', '09 Oct 2026', 'Security contract', 'Security', '-₦210,000.00'],
        ],
    },
    debtors_aging: {
        stats: [
            { label: 'Total owed', value: '1,260,000.00' },
            { label: 'Debtors', value: '14' },
            { label: 'Owed over 90 days', value: '340,000.00' },
            { label: 'Oldest debt', value: '212 days' },
        ],
        tableTitle: 'Debtors by age of debt',
        columns: [
            { label: 'Debtor' },
            { label: 'House' },
            { label: 'Contact' },
            { label: 'Current', align: 'right' },
            { label: '1-30 days', align: 'right' },
            { label: '31-60 days', align: 'right' },
            { label: '61-90 days', align: 'right' },
            { label: 'Over 90 days', align: 'right' },
            { label: 'Total', align: 'right' },
        ],
        rows: [
            ['M. Yusuf', 'Block 7, House 9', '0803 000 0000', '0.00', '0.00', '0.00', '0.00', '360,000.00', '360,000.00'],
            ['C. Okafor', 'Block 2, House 3', '0805 000 0000', '0.00', '60,000.00', '0.00', '0.00', '0.00', '60,000.00'],
        ],
    },
    dues_collection_status: {
        stats: [
            { label: 'Houses fully paid', value: '71' },
            { label: 'Houses part paid', value: '11' },
            { label: 'Houses not paid', value: '14' },
            { label: 'Total owed', value: '1,260,000.00' },
        ],
        tableTitle: 'One sheet per house, with a grid of months',
        columns: [
            { label: 'House' },
            { label: 'Street' },
            { label: 'Primary Resident' },
            { label: 'Months paid', align: 'right' },
            { label: 'Months owed', align: 'right' },
            { label: 'Levy' },
            { label: 'Owed', align: 'right' },
            { label: 'Status' },
        ],
        rows: [
            ['12', 'Palm Close', 'A. Bello', '10 of 10', '0', 'Paid', '0.00', 'Paid in full'],
            ['14', 'Palm Close', 'M. Yusuf', '6 of 10', '4', 'Not paid', '360,000.00', 'Arrears'],
            ['3', 'Cedar Way', 'C. Okafor', '9 of 10', '1', 'Part paid', '60,000.00', 'Outstanding'],
        ],
    },
    project_spend: {
        stats: [
            { label: 'Projects', value: '3' },
            { label: 'Spend in period', value: '1,450,000.00' },
            { label: 'Spend to date', value: '6,200,000.00' },
            { label: 'Budget left', value: '3,800,000.00' },
        ],
        tableTitle: 'Spend on each project, against its budget and milestones',
        columns: [
            { label: 'Project' },
            { label: 'Budget', align: 'right' },
            { label: 'Spend in period', align: 'right' },
            { label: 'Spend to date', align: 'right' },
            { label: 'Budget left', align: 'right' },
            { label: 'Milestones' },
        ],
        rows: [
            ['Perimeter fence', '8,000,000.00', '1,200,000.00', '5,000,000.00', '3,000,000.00', '3 of 5 done'],
            ['Gate house repairs', '2,000,000.00', '250,000.00', '1,200,000.00', '800,000.00', '1 of 2 done'],
        ],
    },
    petty_cash: {
        stats: [
            { label: 'Accounts', value: '2' },
            { label: 'Top-ups', value: '300,000.00' },
            { label: 'Spend', value: '215,000.00' },
            { label: 'Closing balance', value: '135,000.00' },
        ],
        tableTitle: 'Each petty cash account, opening to closing',
        columns: [
            { label: 'Account' },
            { label: 'Opening balance', align: 'right' },
            { label: 'Top-ups', align: 'right' },
            { label: 'Spend', align: 'right' },
            { label: 'Closing balance', align: 'right' },
        ],
        rows: [
            ['Estate office', '50,000.00', '200,000.00', '165,000.00', '85,000.00'],
            ['Security post', '0.00', '100,000.00', '50,000.00', '50,000.00'],
        ],
    },
    statement_of_account: {
        stats: [
            { label: 'Opening balance', value: '20,000.00' },
            { label: 'Charged', value: '30,000.00' },
            { label: 'Paid', value: '40,000.00' },
            { label: 'Owed now', value: '10,000.00' },
        ],
        tableTitle: 'Every charge and payment, with a running balance',
        columns: [
            { label: 'Date' },
            { label: 'Item' },
            { label: 'Charge type' },
            { label: 'Charge', align: 'right' },
            { label: 'Payment', align: 'right' },
            { label: 'Balance', align: 'right' },
        ],
        rows: [
            ['01 August 2026', 'Opening balance', '', '', '', '20,000.00'],
            ['01 August 2026', 'INV-0412: Security Dues', 'Security Dues', '10,000.00', '', '30,000.00'],
            ['14 August 2026', 'Payment (bank_transfer), ref FBN-2231', 'Security Dues', '', '40,000.00', '-10,000.00'],
            ['01 September 2026', 'INV-0498: Security Dues', 'Security Dues', '10,000.00', '', '0.00'],
            ['01 October 2026', 'INV-0571: Security Dues', 'Security Dues', '10,000.00', '', '10,000.00'],
        ],
    },
    collection_rate_by_street: {
        stats: [
            { label: 'Billed', value: '9,600,000.00' },
            { label: 'Collected', value: '8,340,000.00' },
            { label: 'Owed', value: '1,260,000.00' },
            { label: 'Collection rate', value: '86.9%' },
        ],
        tableTitle: 'Billed, collected and owed for each street',
        columns: [
            { label: 'Street' },
            { label: 'Houses', align: 'right' },
            { label: 'Billed', align: 'right' },
            { label: 'Collected', align: 'right' },
            { label: 'Owed', align: 'right' },
            { label: 'Collection rate', align: 'right' },
        ],
        rows: [
            ['Palm Close', '40', '4,800,000.00', '4,500,000.00', '300,000.00', '93.8%'],
            ['Cedar Way', '56', '4,800,000.00', '3,840,000.00', '960,000.00', '80.0%'],
        ],
    },
    expenses_by_category: {
        stats: [
            { label: 'Total spent', value: '3,150,000.00' },
            { label: 'Expenses', value: '42' },
            { label: 'Categories used', value: '6' },
            { label: 'Largest category', value: 'Security' },
        ],
        tableTitle: 'Spending by category and by vendor',
        columns: [
            { label: 'Group' },
            { label: 'Category or vendor' },
            { label: 'Expenses', align: 'right' },
            { label: 'Total', align: 'right' },
            { label: 'Share', align: 'right' },
        ],
        rows: [
            ['Category', 'Security', '3', '1,260,000.00', '40.0%'],
            ['Category', 'Utilities', '12', '945,000.00', '30.0%'],
            ['Vendor', 'Bright Power Ltd', '12', '945,000.00', '30.0%'],
        ],
    },
    wallet_balances: {
        stats: [
            { label: 'Resident credit held', value: '2,450,000.00' },
            { label: 'Credits in period', value: '1,800,000.00' },
            { label: 'Debits in period', value: '1,350,000.00' },
            { label: 'Residents with credit', value: '31' },
        ],
        tableTitle: 'Each resident wallet, opening to closing',
        columns: [
            { label: 'Resident' },
            { label: 'Opening balance', align: 'right' },
            { label: 'Credits', align: 'right' },
            { label: 'Debits', align: 'right' },
            { label: 'Closing balance', align: 'right' },
        ],
        rows: [
            ['A. Bello', '20,000.00', '120,000.00', '100,000.00', '40,000.00'],
            ['C. Okafor', '0.00', '60,000.00', '60,000.00', '0.00'],
        ],
    },
    // Retired (#1399): not offered in the picker; kept so the Record stays complete for old rows.
    debtors_report: {
        stats: [
            { label: 'Total Debtors', value: '14' },
            { label: 'Total Outstanding', value: '₦1,260,000.00' },
            { label: 'Over 90 Days', value: '₦340,000.00' },
            { label: 'Avg Days Overdue', value: '47' },
        ],
        tableTitle: 'Debtors',
        columns: [
            { label: 'S/N' },
            { label: 'Debtor' },
            { label: 'Contact' },
            { label: 'Property' },
            { label: 'Invoices', align: 'center' },
            { label: 'Days', align: 'right' },
            { label: 'Outstanding', align: 'right' },
        ],
        rows: [
            ['1', 'M. Yusuf', '0803 000 0000', 'Block 7, House 9', '3', '92', '₦360,000.00'],
            ['2', 'C. Okafor', '0805 000 0000', 'Block 2, House 3', '1', '15', '₦60,000.00'],
        ],
    },
    // Retired (#1400): replaced by Dues, levies and collection status.
    indebtedness_summary: {
        stats: [
            { label: 'Total Houses', value: '96' },
            { label: 'Indebted', value: '14' },
            { label: 'Total Outstanding', value: '₦1,260,000.00' },
            { label: 'Non-Indebted', value: '82' },
        ],
        tableTitle: 'Indebtedness Status by House',
        columns: [
            { label: 'Street' },
            { label: 'House #' },
            { label: 'Primary Resident' },
            { label: 'Status', align: 'center' },
            { label: 'Amount', align: 'right' },
        ],
        rows: [
            ['Palm Close', '12', 'A. Bello', 'Paid in Full', '₦0.00'],
            ['Palm Close', '14', 'M. Yusuf', 'Arrears', '₦360,000.00'],
            ['Cedar Way', '3', 'C. Okafor', 'Outstanding', '₦60,000.00'],
        ],
    },
    // Retired (#1400). It never had a generator (#1379).
    indebtedness_detail: {
        stats: [
            { label: 'Total Houses', value: '96' },
            { label: 'Indebted', value: '14' },
            { label: 'Total Outstanding', value: '₦1,260,000.00' },
        ],
        tableTitle: 'Indebtedness Details by House',
        columns: [
            { label: 'Street' },
            { label: 'House #' },
            { label: 'Primary Resident' },
            { label: 'Status', align: 'center' },
            { label: 'Amount', align: 'right' },
        ],
        rows: [
            ['Palm Close', '14', 'M. Yusuf', 'Arrears', '₦360,000.00'],
            ['Cedar Way', '3', 'C. Okafor', 'Outstanding', '₦60,000.00'],
        ],
    },
    development_levy: {
        stats: [
            { label: 'Total Properties', value: '96' },
            { label: 'Paid', value: '71' },
            { label: 'Unpaid', value: '25' },
            { label: 'Collection Rate', value: '74%' },
        ],
        tableTitle: 'Development Levy Status by Property',
        columns: [
            { label: 'House' },
            { label: 'Primary Resident' },
            { label: 'Responsible Party' },
            { label: 'Levy Amount', align: 'right' },
            { label: 'Paid', align: 'center' },
        ],
        rows: [
            ['Palm Close, 12', 'A. Bello', 'A. Bello', '₦250,000.00', 'Yes'],
            ['Palm Close, 14', 'M. Yusuf', 'Landlord', '₦250,000.00', 'No'],
            ['Cedar Way, 3', 'C. Okafor', 'C. Okafor', '₦250,000.00', 'Yes'],
        ],
    },
};

const alignClass: Record<Align, string> = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function ReportTypePreview({ type, title }: { type: ReportType; title: string }) {
    const preview = reportTypePreviews[type];
    return (
        <figure
            aria-label={`Example layout of the ${title}`}
            className="relative rounded-lg border bg-background p-4 shadow-sm md:p-6"
            data-testid="report-type-preview"
        >
            <figcaption className="absolute right-3 top-3 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Example layout
            </figcaption>
            <p className="pr-28 text-lg font-bold tracking-tight">{title}</p>
            <p className="text-xs text-muted-foreground">Estate name · 31 Oct 2026</p>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                {preview.stats.map((stat) => (
                    <div key={stat.label} className="rounded-md border bg-muted/40 p-2.5">
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-sm font-semibold tabular-nums">{stat.value}</p>
                    </div>
                ))}
            </div>

            <p className="mt-5 text-sm font-semibold">{preview.tableTitle}</p>
            <div className="mt-2 overflow-x-auto rounded-md border">
                <table className="w-full min-w-max text-xs">
                    <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                            {preview.columns.map((col) => (
                                <th key={col.label} scope="col" className={cn('px-3 py-2 font-medium', alignClass[col.align ?? 'left'])}>
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {preview.rows.map((row, i) => (
                            <tr key={i} className="border-t">
                                {row.map((cell, j) => (
                                    <td key={j} className={cn('px-3 py-2 tabular-nums', alignClass[preview.columns[j].align ?? 'left'])}>
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </figure>
    );
}
