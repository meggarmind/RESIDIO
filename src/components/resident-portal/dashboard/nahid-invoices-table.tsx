'use client';

import { ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, formatCurrency } from '@/lib/utils';
import { AvatarCircle } from '@/components/ui/avatar-circle';
import { StatusBadge } from '@/components/ui/status-badge';
import type { InvoiceWithDetails } from '@/types/database';

interface NahidInvoicesTableProps {
    invoices: InvoiceWithDetails[];
}

// Spring physics for smooth, professional animations
const spring = {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
    mass: 1,
};

// Row animation variant
const rowVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: (custom: number) => ({
        opacity: 1,
        y: 0,
        transition: {
            ...spring,
            delay: custom * 0.05, // 50ms stagger between rows
        },
    }),
};

export function NahidInvoicesTable({ invoices }: NahidInvoicesTableProps) {
    return (
        <div className="bg-bill-card border border-border rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-bill-text">Payment Transactions</h2>
                <button className="flex items-center gap-1 text-sm text-bill-text-secondary font-medium">
                    Monthly <ArrowDown className="h-4 w-4" />
                </button>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 pb-4 border-b border-border text-xs font-semibold uppercase tracking-wider text-bill-text-secondary">
                <div className="col-span-5">Payment From</div>
                <div className="col-span-3">Date</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-2">Status</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-border">
                {invoices.length === 0 ? (
                    <div className="py-8 text-center text-bill-text-secondary text-sm">
                        No recent transactions found.
                    </div>
                ) : (
                    invoices.map((invoice, index) => (
                        <motion.div
                            key={invoice.id}
                            className="grid grid-cols-12 gap-4 py-4 items-center hover:bg-bill-secondary/50 transition-colors duration-200 -mx-4 px-4 rounded-lg"
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            custom={index}
                        >
                            {/* Payment From */}
                            <div className="col-span-5 flex items-center gap-3">
                                <AvatarCircle
                                    name={invoice.billing_profile?.name || invoice.invoice_number || 'Invoice'}
                                    size="sm"
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-bill-text">
                                        {invoice.invoice_number}
                                    </span>
                                    <span className="text-[11px] text-bill-text-secondary">
                                        {invoice.billing_profile?.name || 'Invoice'}
                                    </span>
                                </div>
                            </div>

                            {/* Date */}
                            <div className="col-span-3 text-sm text-bill-text-secondary font-medium">
                                {new Date(invoice.created_at).toLocaleDateString()}
                            </div>

                            {/* Amount */}
                            <div className="col-span-2 text-sm font-bold text-bill-text">
                                {formatCurrency(invoice.amount_due || 0)}
                            </div>

                            {/* Status */}
                            <div className="col-span-2">
                                <StatusBadge
                                    variant={
                                        invoice.status === 'paid' ? 'success' :
                                        invoice.status === 'partially_paid' ? 'warning' : 'error'
                                    }
                                >
                                    {invoice.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </StatusBadge>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}
