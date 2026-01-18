'use client';

import { useState, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/lib/auth/auth-provider';
import { useInvoices, useResidentIndebtedness } from '@/hooks/use-billing';
import { InvoiceStatusPopover } from './invoice-status-popover';
import { formatCurrency } from '@/lib/utils';

/**
 * Invoice Status Indicator Component
 *
 * Displays a badge-enabled icon button showing unpaid/overdue invoice status.
 * Replaces the mock mail icon in the portal header.
 *
 * Badge Colors:
 * - Red: Overdue invoices exist
 * - Orange: Invoices due within 7 days
 * - Gray: Only unpaid (not urgent)
 * - Hidden: No unpaid invoices
 */
export function InvoiceStatusIndicator() {
  const [open, setOpen] = useState(false);
  const { residentId } = useAuth();

  // Fetch invoices (filter by unpaid statuses client-side)
  const { data: invoicesData, isLoading } = useInvoices({
    residentId: residentId || '',
    limit: 50,
  });

  // Fetch total indebtedness
  const { data: indebtedness } = useResidentIndebtedness(residentId || '');

  // Filter to unpaid/overdue/partially_paid invoices
  const invoices = useMemo(() =>
    (invoicesData?.data || [])
      .filter((inv) => ['unpaid', 'overdue', 'partially_paid'].includes(inv.status || ''))
      .slice(0, 3)
    , [invoicesData]);
  const totalOwed = indebtedness?.totalUnpaid || 0;

  // Calculate badge color based on invoice urgency
  const badgeColor = useMemo(() => {
    if (!invoices.length) return null;

    // Check for overdue invoices
    const hasOverdue = invoices.some((inv) => inv.status === 'overdue');
    if (hasOverdue) return 'var(--color-error)';

    // Check for invoices due within 7 days
    const now = Date.now();
    const hasDueSoon = invoices.some((inv) => {
      const dueDate = new Date(inv.due_date || '').getTime();
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      return daysUntilDue <= 7 && daysUntilDue >= 0;
    });
    if (hasDueSoon) return 'var(--color-warning)';

    // Only unpaid invoices (not urgent)
    return 'var(--color-text-muted)';
  }, [invoices]);

  // Tooltip message
  const tooltipMessage = useMemo(() => {
    if (!invoices.length) return 'No unpaid invoices';
    const count = invoices.length;
    const plural = count !== 1 ? 's' : '';
    return `${count} unpaid invoice${plural} (${formatCurrency(totalOwed)})`;
  }, [invoices.length, totalOwed]);

  // Don't render if no resident ID
  if (!residentId) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex relative"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-md)',
                }}
                aria-label={tooltipMessage}
              >
                <FileText
                  style={{
                    width: 'var(--icon-sm)',
                    height: 'var(--icon-sm)',
                    color: 'var(--color-text-muted)',
                  }}
                />
                {/* Badge indicator */}
                {badgeColor && (
                  <span
                    className={cn(
                      "absolute top-2 right-2 w-2 h-2 rounded-full",
                      badgeColor === 'var(--color-error)' && "pulse-urgent"
                    )}
                    style={{
                      background: badgeColor,
                    }}
                    aria-hidden="true"
                  />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{tooltipMessage}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-[380px] p-0" align="end">
        <InvoiceStatusPopover
          invoices={invoices}
          totalOwed={totalOwed}
          isLoading={isLoading}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
