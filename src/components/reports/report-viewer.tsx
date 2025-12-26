'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TraditionalTemplate } from './templates/traditional-template';
import { ModernTemplate } from './templates/modern-template';
import {
  Download,
  FileText,
  Sparkles,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Calendar,
} from 'lucide-react';
import type { GeneratedReport } from '@/hooks/use-reports';
import { getDateRangeFromPreset } from '@/lib/validators/reports';

// ============================================================
// Types
// ============================================================

type TemplateType = 'traditional' | 'modern';

interface ReportViewerProps {
  report: GeneratedReport;
  onBack?: () => void;
  estateName?: string;
}

// ============================================================
// Report Viewer Component
// ============================================================

export function ReportViewer({ report, onBack, estateName = 'Residio Estate' }: ReportViewerProps) {
  const [template, setTemplate] = useState<TemplateType>('modern');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // Calculate date range - normalize to startDate/endDate
  const dateRange = report.parameters.periodPreset === 'custom'
    ? { startDate: report.parameters.startDate || '', endDate: report.parameters.endDate || '' }
    : getDateRangeFromPreset(report.parameters.periodPreset);

  // Handle PDF export via print - using safe DOM manipulation
  const handleExportPDF = useCallback(async () => {
    if (!printRef.current || isPrinting) return;

    setIsPrinting(true);

    try {
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow popups to export PDF');
        setIsPrinting(false);
        return;
      }

      // Build the print document using DOM manipulation (safer than document.write)
      const doc = printWindow.document;

      // Create DOCTYPE and HTML structure
      doc.open();
      doc.close();

      // Set document title
      doc.title = `${report.title} - ${estateName}`;

      // Create and append meta charset
      const meta = doc.createElement('meta');
      meta.setAttribute('charset', 'utf-8');
      doc.head.appendChild(meta);

      // Create and append styles
      const style = doc.createElement('style');
      style.textContent = `
        @page {
          size: A4;
          margin: 15mm;
        }

        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          padding: 0;
          font-family: ${template === 'traditional'
            ? "'Times New Roman', Times, serif"
            : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"};
        }

        table {
          page-break-inside: auto;
        }

        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }

        thead {
          display: table-header-group;
        }

        tfoot {
          display: table-footer-group;
        }
      `;
      doc.head.appendChild(style);

      // Create container and clone content
      const container = doc.createElement('div');
      container.innerHTML = printRef.current.innerHTML;
      doc.body.appendChild(container);

      // Wait for content to render then print
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
        setIsPrinting(false);
      }, 250);

    } catch (error) {
      console.error('Export failed:', error);
      setIsPrinting(false);
    }
  }, [isPrinting, report.title, estateName, template]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Report title based on type
  const reportTypeLabels: Record<string, string> = {
    financial_overview: 'Financial Overview',
    collection_report: 'Collection Report',
    invoice_aging: 'Invoice Aging Report',
    transaction_log: 'Transaction Log',
  };

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left Section: Back + Title */}
          <div className="flex items-center gap-4">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <div>
              <h2 className="text-lg font-semibold">
                {reportTypeLabels[report.type] || report.title}
              </h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {report.parameters.reportType !== 'invoice_aging' ? (
                  <span>
                    {new Date(dateRange.startDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' — '}
                    {new Date(dateRange.endDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                ) : (
                  <span>As of {new Date().toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                )}
              </div>
            </div>
          </div>

          {/* Center Section: Template Switcher */}
          <Tabs value={template} onValueChange={(v) => setTemplate(v as TemplateType)}>
            <TabsList className="grid w-[280px] grid-cols-2">
              <TabsTrigger value="modern" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Modern
              </TabsTrigger>
              <TabsTrigger value="traditional" className="gap-2">
                <FileText className="h-4 w-4" />
                Traditional
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Right Section: Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="gap-2"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-4 w-4" />
                  Exit Fullscreen
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" />
                  Fullscreen
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={handleExportPDF}
              disabled={isPrinting}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {isPrinting ? 'Preparing...' : 'Export PDF'}
            </Button>
          </div>
        </div>
      </div>

      {/* Report Preview */}
      <div className={`flex-1 overflow-auto ${template === 'modern' ? 'bg-slate-100' : 'bg-slate-50'}`}>
        <div className="max-w-[1100px] mx-auto py-6">
          {/* Preview Container with Shadow */}
          <div
            className="bg-white rounded-lg shadow-xl overflow-hidden"
            style={{
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
            }}
          >
            {template === 'traditional' ? (
              <TraditionalTemplate
                ref={printRef}
                report={report.data}
                title={reportTypeLabels[report.type] || report.title}
                dateRange={
                  report.parameters.reportType !== 'invoice_aging'
                    ? { start: dateRange.startDate, end: dateRange.endDate }
                    : undefined
                }
                estateName={estateName}
              />
            ) : (
              <ModernTemplate
                ref={printRef}
                report={report.data}
                title={reportTypeLabels[report.type] || report.title}
                dateRange={
                  report.parameters.reportType !== 'invoice_aging'
                    ? { start: dateRange.startDate, end: dateRange.endDate }
                    : undefined
                }
                estateName={estateName}
              />
            )}
          </div>

          {/* Footer Info */}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>
              Generated on {new Date(report.generatedAt).toLocaleString('en-GB', {
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            </p>
            <div className="flex items-center justify-center gap-3 mt-1">
              <span>
                Report ID: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{report.id}</code>
              </span>
              {report.version > 1 && (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  Version {report.version}
                </span>
              )}
              {report.editNotes && (
                <span className="text-xs italic">
                  Edit: {report.editNotes}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
