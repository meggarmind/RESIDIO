import React from 'react';
import { pdf } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { REPORT_TYPE_LABELS, type ReportRequestFormData } from '@/lib/validators/reports';
import { asOfChargeTitle, subjectTitle } from '@/lib/reports/summary-report';
import { SummaryReportPdf } from '@/lib/pdf/reports/summary-report-pdf';
import { FinancialOverviewPdf } from '@/lib/pdf/reports/financial-overview-pdf';
import { CollectionReportPdf } from '@/lib/pdf/reports/collection-report-pdf';
import { InvoiceAgingPdf } from '@/lib/pdf/reports/invoice-aging-pdf';
import { TransactionLogPdf, DebtorsReportPdf, DevelopmentLevyPdf } from '@/lib/pdf/reports/reference-reports-pdf';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderReportPdf(type: ReportRequestFormData['reportType'], data: any, estateName: string): Promise<Buffer | null> {
  let component: React.ReactElement<DocumentProps> | null = null;

  switch (type) {
    case 'financial_overview': component = React.createElement(FinancialOverviewPdf, { data, estateName }) as React.ReactElement<DocumentProps>; break;
    case 'collection_report': component = React.createElement(CollectionReportPdf, { data, estateName }) as React.ReactElement<DocumentProps>; break;
    case 'invoice_aging': component = React.createElement(InvoiceAgingPdf, { data, estateName }) as React.ReactElement<DocumentProps>; break;
    case 'transaction_log': component = React.createElement(TransactionLogPdf, { data, estateName }) as React.ReactElement<DocumentProps>; break;
    case 'debtors_report': component = React.createElement(DebtorsReportPdf, { data, estateName }) as React.ReactElement<DocumentProps>; break;
    // Summary-first reports (#1399): `data` is the SummaryReportData of a report with `layout: 'summary'`.
    case 'debtors_aging': component = React.createElement(SummaryReportPdf, { data, title: REPORT_TYPE_LABELS[type], estateName }) as React.ReactElement<DocumentProps>; break;
    case 'dues_collection_status': component = React.createElement(SummaryReportPdf, { data, title: asOfChargeTitle(REPORT_TYPE_LABELS[type], data?.chargeName), estateName }) as React.ReactElement<DocumentProps>; break;
    case 'project_spend': component = React.createElement(SummaryReportPdf, { data, title: REPORT_TYPE_LABELS[type], estateName }) as React.ReactElement<DocumentProps>; break;
    case 'petty_cash': component = React.createElement(SummaryReportPdf, { data, title: REPORT_TYPE_LABELS[type], estateName }) as React.ReactElement<DocumentProps>; break;
    case 'statement_of_account': component = React.createElement(SummaryReportPdf, { data, title: subjectTitle(REPORT_TYPE_LABELS[type], data?.subject), estateName }) as React.ReactElement<DocumentProps>; break;
    case 'collection_rate_by_street':
    case 'expenses_by_category':
    case 'write_offs':
    case 'wallet_balances': component = React.createElement(SummaryReportPdf, { data, title: REPORT_TYPE_LABELS[type], estateName }) as React.ReactElement<DocumentProps>; break;
    case 'development_levy': component = React.createElement(DevelopmentLevyPdf, { data, estateName }) as React.ReactElement<DocumentProps>; break;
    default: return null;
  }

  try {
    const pdfDoc = pdf(component);
     const stream = await pdfDoc.toBuffer();
     const chunks: Buffer[] = [];
     for await (const chunk of stream as AsyncIterable<Uint8Array | string>) {
       chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
     }
     return Buffer.concat(chunks);
  } catch (e) {
    console.error('[renderReportPdf] Error:', e);
    return null;
  }
}
