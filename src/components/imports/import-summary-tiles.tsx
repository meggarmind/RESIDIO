import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck,
} from 'lucide-react';
import type { ImportRowSummary } from '@/components/imports/import-processing-options';

/** Row-count tiles shared by the wizard's confirm step and the import detail page. */
export function ImportSummaryTiles({ summary }: { summary: ImportRowSummary | null | undefined }) {
  return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 border rounded-xl text-center bg-muted/20 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FileCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{summary?.total || 0}</p>
          <p className="text-sm text-muted-foreground">Total Rows</p>
        </div>
        <div className="p-4 border rounded-xl text-center bg-green-50 dark:bg-green-950/20 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">{summary?.matched || 0}</p>
          <p className="text-sm text-muted-foreground">To Process</p>
        </div>
        <div className="p-4 border rounded-xl text-center bg-yellow-50 dark:bg-yellow-950/20 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
          </div>
          <p className="text-2xl font-bold text-yellow-600">{summary?.unmatched || 0}</p>
          <p className="text-sm text-muted-foreground">Unmatched</p>
        </div>
        <div className="p-4 border rounded-xl text-center bg-orange-50 dark:bg-orange-950/20 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-orange-600">{summary?.duplicate || 0}</p>
          <p className="text-sm text-muted-foreground">Duplicates</p>
        </div>
      </div>
  );
}
