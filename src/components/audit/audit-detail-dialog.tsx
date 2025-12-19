'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  type AuditLogWithActor,
} from '@/types/database';
import { getActionBadgeVariant } from '@/lib/audit/helpers';

interface AuditDetailDialogProps {
  log: AuditLogWithActor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Format JSON for display
function formatJson(obj: Record<string, unknown> | null): string {
  if (!obj || Object.keys(obj).length === 0) return 'None';
  return JSON.stringify(obj, null, 2);
}

// Render a diff view for old and new values
function ValueDiff({
  oldValues,
  newValues,
}: {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}) {
  const allKeys = new Set([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ]);

  if (allKeys.size === 0) {
    return <p className="text-sm text-muted-foreground">No value changes recorded</p>;
  }

  return (
    <div className="space-y-2">
      {Array.from(allKeys).map((key) => {
        const oldVal = oldValues?.[key];
        const newVal = newValues?.[key];
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);

        return (
          <div key={key} className="rounded border p-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              {key}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className={changed ? 'bg-red-50 dark:bg-red-950/20 rounded p-1' : 'p-1'}>
                <span className="text-xs text-muted-foreground">Before: </span>
                <code className="text-xs">
                  {oldVal !== undefined ? JSON.stringify(oldVal) : '—'}
                </code>
              </div>
              <div className={changed ? 'bg-green-50 dark:bg-green-950/20 rounded p-1' : 'p-1'}>
                <span className="text-xs text-muted-foreground">After: </span>
                <code className="text-xs">
                  {newVal !== undefined ? JSON.stringify(newVal) : '—'}
                </code>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AuditDetailDialog({
  log,
  open,
  onOpenChange,
}: AuditDetailDialogProps) {
  if (!log) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Audit Log Details
            <Badge variant={getActionBadgeVariant(log.action)}>
              {AUDIT_ACTION_LABELS[log.action]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Entity Type</h4>
                <p className="text-sm">{AUDIT_ENTITY_LABELS[log.entity_type]}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Entity</h4>
                <p className="text-sm">{log.entity_display || log.entity_id}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Actor</h4>
                <p className="text-sm">{log.actor?.full_name || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">{log.actor?.email}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Timestamp</h4>
                <p className="text-sm">
                  {format(new Date(log.created_at), 'PPpp')}
                </p>
              </div>
            </div>

            {/* Description */}
            {log.description && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                  <p className="text-sm">{log.description}</p>
                </div>
              </>
            )}

            {/* Value Changes (for UPDATE actions) */}
            {(log.old_values || log.new_values) && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Value Changes
                  </h4>
                  <ValueDiff oldValues={log.old_values} newValues={log.new_values} />
                </div>
              </>
            )}

            {/* Metadata */}
            {log.metadata && Object.keys(log.metadata).length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Additional Metadata
                  </h4>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                    {formatJson(log.metadata)}
                  </pre>
                </div>
              </>
            )}

            {/* Technical Details */}
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Technical Details</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Log ID: </span>
                  <code>{log.id}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Entity ID: </span>
                  <code>{log.entity_id}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Actor ID: </span>
                  <code>{log.actor_id}</code>
                </div>
                {log.ip_address && (
                  <div>
                    <span className="text-muted-foreground">IP Address: </span>
                    <code>{log.ip_address}</code>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
