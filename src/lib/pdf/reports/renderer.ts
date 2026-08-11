import React from 'react';
import { pdf } from '@react-pdf/renderer';
import type { ReportRequestFormData } from '@/lib/validators/reports';
import { FinancialOverviewPdf } from '@/lib/pdf/reports/financial-overview-pdf';
import { CollectionReportPdf } from '@/lib/pdf/reports/collection-report-pdf';
import { InvoiceAgingPdf } from '@/lib/pdf/reports/invoice-aging-pdf';
import { TransactionLogPdf, DebtorsReportPdf, IndebtednessReportPdf, DevelopmentLevyPdf } from '@/lib/pdf/reports/reference-reports-pdf';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderReportPdf(type: ReportRequestFormData['reportType'], data: any): Promise<Buffer | null> {
  let component: React.ReactElement | null = null;

  switch (type) {
    case 'financial_overview': component = React.createElement(FinancialOverviewPdf, { data }); break;
    case 'collection_report': component = React.createElement(CollectionReportPdf, { data }); break;
    case 'invoice_aging': component = React.createElement(InvoiceAgingPdf, { data }); break;
    case 'transaction_log': component = React.createElement(TransactionLogPdf, { data }); break;
    case 'debtors_report': component = React.createElement(DebtorsReportPdf, { data }); break;
    case 'indebtedness_summary': component = React.createElement(IndebtednessReportPdf, { data }); break;
    case 'development_levy': component = React.createElement(DevelopmentLevyPdf, { data }); break;
    default: return null;
  }

  try {
    const pdfDoc = pdf(component);
    const asBuffer = Buffer.from(await pdfDoc.toBuffer());
    return asBuffer;
  } catch (e) {
    console.error('[renderReportPdf] Error:', e);
    return null;
  }
}
