import React from 'react';
import { pdf } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import type { ReportRequestFormData } from '@/lib/validators/reports';
import { FinancialOverviewPdf } from '@/lib/pdf/reports/financial-overview-pdf';
import { CollectionReportPdf } from '@/lib/pdf/reports/collection-report-pdf';
import { InvoiceAgingPdf } from '@/lib/pdf/reports/invoice-aging-pdf';
import { TransactionLogPdf, DebtorsReportPdf, IndebtednessReportPdf, DevelopmentLevyPdf } from '@/lib/pdf/reports/reference-reports-pdf';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderReportPdf(type: ReportRequestFormData['reportType'], data: any): Promise<Buffer | null> {
  let component: React.ReactElement<DocumentProps> | null = null;

  switch (type) {
    case 'financial_overview': component = React.createElement(FinancialOverviewPdf, { data }) as React.ReactElement<DocumentProps>; break;
    case 'collection_report': component = React.createElement(CollectionReportPdf, { data }) as React.ReactElement<DocumentProps>; break;
    case 'invoice_aging': component = React.createElement(InvoiceAgingPdf, { data }) as React.ReactElement<DocumentProps>; break;
    case 'transaction_log': component = React.createElement(TransactionLogPdf, { data }) as React.ReactElement<DocumentProps>; break;
    case 'debtors_report': component = React.createElement(DebtorsReportPdf, { data }) as React.ReactElement<DocumentProps>; break;
    case 'indebtedness_summary': component = React.createElement(IndebtednessReportPdf, { data }) as React.ReactElement<DocumentProps>; break;
    case 'development_levy': component = React.createElement(DevelopmentLevyPdf, { data }) as React.ReactElement<DocumentProps>; break;
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
