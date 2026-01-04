'use client';

import { MoreVertical, ArrowDown, FileText } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Define a local interface matching what we expect from the API/Supabase
interface Invoice {
    id: string;
    invoice_number?: string;
    description?: string; // or title
    amount: number;
    due_date: string;
    status: string; // 'unpaid' | 'paid' | 'overdue' etc.
    created_at: string;
}

interface BillsTableProps {
    invoices: Invoice[];
}

export function BillsTable({ invoices = [] }: BillsTableProps) {
    return (
        <div className="bg-transparent">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-paier-navy">Recent Invoices</h2>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">Auto-pay</span>
                    <Switch />
                </div>
            </div>

            {/* Table List */}
            <div className="space-y-2">
                {invoices.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        No recent invoices found.
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-400 px-4 mb-2">
                            <div className="col-span-4">Service</div>
                            <div className="col-span-3">Date</div>
                            <div className="col-span-3">Amount</div>
                            <div className="col-span-2">Status</div>
                        </div>

                        {invoices.map((invoice) => (
                            <div
                                key={invoice.id}
                                className="grid grid-cols-12 gap-4 items-center bg-white rounded-2xl p-4 hover:shadow-sm transition-shadow cursor-default group"
                            >
                                {/* Service/Description */}
                                <div className="col-span-4 flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-paier-navy/5 transition-colors">
                                        <FileText className="h-4 w-4 text-paier-navy" />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-medium text-paier-navy text-sm truncate">
                                            {invoice.description || `Invoice #${invoice.invoice_number}`}
                                        </span>
                                        <span className="text-xs text-gray-400 truncate">
                                            {invoice.invoice_number}
                                        </span>
                                    </div>
                                </div>

                                {/* Date */}
                                <div className="col-span-3 text-sm text-paier-navy">
                                    {new Date(invoice.created_at).toLocaleDateString()}
                                </div>

                                {/* Amount */}
                                <div className="col-span-3 font-semibold text-paier-navy">
                                    {formatCurrency(invoice.amount)}
                                </div>

                                {/* Status & Action */}
                                <div className="col-span-2 flex items-center justify-between">
                                    <StatusBadge status={invoice.status} />
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-paier-navy opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* Load More */}
            {invoices.length > 5 && (
                <div className="mt-6 text-center">
                    <button className="text-gray-400 text-sm flex items-center justify-center gap-2 mx-auto hover:text-gray-600">
                        View all <ArrowDown className="h-3 w-3" />
                    </button>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    // Map API status to visual styles
    const styles: Record<string, string> = {
        paid: 'bg-green-100 text-green-700',
        pending: 'bg-yellow-100 text-yellow-700',
        overdue: 'bg-red-100 text-red-700',
        void: 'bg-gray-100 text-gray-500',
        unpaid: 'bg-orange-100 text-orange-700',
    };

    const label = status.charAt(0).toUpperCase() + status.slice(1);

    return (
        <span className={cn("px-3 py-1 rounded-full text-xs font-medium", styles[status] || styles.void)}>
            {label}
        </span>
    );
}
