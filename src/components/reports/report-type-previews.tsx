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
    // No separate generator exists yet for this type; it is shown with the per-house layout and amounts.
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
            <figcaption className="absolute right-3 top-3 rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Example layout
            </figcaption>
            <p className="pr-28 text-lg font-bold tracking-tight">{title}</p>
            <p className="text-xs text-muted-foreground">Estate name · 31 Oct 2026</p>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                {preview.stats.map((stat) => (
                    <div key={stat.label} className="rounded-md border bg-muted/40 p-2.5">
                        <p className="text-[11px] text-muted-foreground">{stat.label}</p>
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
