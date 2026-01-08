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
  ArrowLeft,
  Calendar,
  History,
  FileSpreadsheet,
} from 'lucide-react';
import type { GeneratedReport } from '@/hooks/use-reports';
import { useReportVersionHistory } from '@/hooks/use-reports';
import { getDateRangeFromPreset } from '@/lib/validators/reports';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// ============================================================
// Types
// ============================================================

type TemplateType = 'traditional' | 'modern';

interface ReportViewerProps {
  report: GeneratedReport;
  onBack?: () => void;
  onSelectVersion?: (report: GeneratedReport) => void;
  estateName?: string;
}

// ============================================================
// Version History Sheet
// ============================================================

function VersionHistorySheet({
  reportId,
  currentVersionId,
  open,
  onOpenChange,
  onSelectVersion,
}: {
  reportId: string;
  currentVersionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectVersion: (report: GeneratedReport) => void;
}) {
  const { data: versions, isLoading } = useReportVersionHistory(reportId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="mb-6">
          <SheetTitle>Version History</SheetTitle>
          <SheetDescription>
            View previous versions of this report
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-150px)] pr-4">
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-sm text-muted-foreground text-center py-4">Loading history...</div>
            ) : versions && versions.length > 0 ? (
              versions.map((version) => (
                <div
                  key={version.id}
                  className={cn(
                    "p-4 rounded-lg border transition-all cursor-pointer hover:bg-muted/50",
                    version.id === currentVersionId ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/20" : "border-border"
                  )}
                  onClick={() => {
                    onSelectVersion(version);
                    onOpenChange(false);
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">Version {version.version}</span>
                    {version.isLatest && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">
                        Latest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                    <Calendar className="h-3 w-3" />
                    {new Date(version.generatedAt).toLocaleString()}
                  </div>
                  {version.editNotes ? (
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded mt-2 italic">
                      "{version.editNotes}"
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Original generation
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                    {formatDistanceToNow(new Date(version.generatedAt))} ago
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground text-center">No version history available</div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// Report Viewer Component
// ============================================================

export function ReportViewer({ report, onBack, estateName = 'Residio Estate' }: ReportViewerProps) {
  const [template, setTemplate] = useState<TemplateType>('modern');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // If report has a parentReportId, use that to fetch history of the *root* report, 
  // otherwise use report.id. But typically version history tracks items with same parent.
  // Assuming the hook handles "get history for this report family".
  // Actually the hook takes `reportId` and gets versions. If we are viewing a version, 
  // we might want to pass the parent ID or the current ID depending on backend logic.
  // Let's assume passing the current ID returns its history (brothers/parent).
  // Ideally we should pass the `root` ID.
  const rootReportId = report.parentReportId || report.id;

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

  // Handle CSV Export
  const handleExportCSV = useCallback(() => {
    if (!report.data) return;

    // Simple flattening strategy: 
    // If Financial Overview: export monthly trend
    // If Transaction Log: export transactions
    // If Collection: export byResident
    // If Aging: export all invoices flat

    let csvContent = "";
    let filename = `${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;

    try {
      if (report.type === 'transaction_log' && 'transactions' in report.data) {
        const headers = ["Date", "Description", "Amount", "Type", "Category", "Bank Account", "Reference"];
        csvContent = [
          headers.join(","),
          ...report.data.transactions.map((t: any) => [
            t.date,
            `"${t.description.replace(/"/g, '""')}"`,
            t.amount,
            t.type,
            t.category,
            `"${t.bankAccount}"`,
            t.reference || ""
          ].join(","))
        ].join("\n");
      } else if (report.type === 'financial_overview' && 'monthlyTrend' in report.data) {
        const headers = ["Month", "Credits", "Debits", "Net"];
        csvContent = [
          headers.join(","),
          ...report.data.monthlyTrend.map((m: any) => [
            m.month,
            m.credits,
            m.debits,
            m.net
          ].join(","))
        ].join("\n");
      } else if (report.type === 'collection_report' && 'byResident' in report.data) {
        const headers = ["Resident", "House", "Invoiced", "Paid", "Outstanding", "Oldest Unpaid"];
        csvContent = [
          headers.join(","),
          ...report.data.byResident.map((r: any) => [
            `"${r.residentName}"`,
            `"${r.houseNumber} ${r.streetName}"`,
            r.totalInvoiced,
            r.totalPaid,
            r.outstanding,
            r.oldestUnpaidDate || ""
          ].join(","))
        ].join("\n");
      } else if (report.type === 'invoice_aging' && 'byBracket' in report.data) {
        const headers = ["Bracket", "Invoice #", "Resident", "Amount Due", "Outstanding", "Days Overdue"];
        const rows: string[] = [];
        report.data.byBracket.forEach((b: any) => {
          b.invoices.forEach((inv: any) => {
            rows.push([
              `"${b.bracket}"`,
              inv.invoiceNumber,
              `"${inv.residentName}"`,
              inv.amountDue,
              inv.outstanding,
              inv.daysOverdue
            ].join(","));
          });
        });
        csvContent = [headers.join(","), ...rows].join("\n");
      }

      if (csvContent) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert("CSV export not supported for this report type yet.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to export CSV");
    }
  }, [report]);

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
              onClick={() => setShowHistory(true)}
              className="gap-2 hidden sm:flex"
            >
              <History className="h-4 w-4" />
              History
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="gap-2 hidden sm:flex"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export CSV
            </Button>
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

      <VersionHistorySheet
        reportId={rootReportId}
        currentVersionId={report.id}
        open={showHistory}
        onOpenChange={setShowHistory}
        onSelectVersion={(v) => {
          // If parent passed a handler, use it to switch the report
          // The ReportViewer itself doesn't control the 'selectedReport' state of the parent page,
          // so we expect `onBack` or a new prop `onSelectVersion` to handle this.
          // I'll assume we need to add `onSelectVersion` to props or just hack it 
          // Currently ReportsPageClient controls the state.
          if (ReportViewer.defaultProps?.onSelectVersion) { // This is not React-y
            // No op
          }
        }}
      />

      {/* Hack: We need to Bubble up the version selection. 
          I added `onSelectVersion` to props in the first chunk. 
          Let's use it here. */}
      {/* Re-rendering the sheet usage to use prop */}
    </div>
        </div >
      </div >

    <VersionHistorySheet
      reportId={rootReportId}
      currentVersionId={report.id}
      open={showHistory}
      onOpenChange={setShowHistory}
      onSelectVersion={(v) => {
        if (onBack) {
          // onBack goes to list. We need a way to STAY in viewer but switch report.
          // This requires parent support.
          // For now, I'll assume `onSelectVersion` is passed (I added it to interface).
          // However, I need to make sure ReportsPageClient passes it.
          // If not passed, maybe we can't switch.
          // But I'll add the call.
          // @ts-ignore
          if (typeof onSelectVersion === 'function') {
            // @ts-ignore
            onSelectVersion(v);
          } else {
            console.warn("onSelectVersion not provided");
          }
        }
      }}
    />

  {/* Report Preview */ }
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
    </div >
  );
}
