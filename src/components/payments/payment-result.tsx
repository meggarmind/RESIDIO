'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    ArrowRight,
    FileText,
    Download,
    LayoutDashboard,
    Wallet,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export type PaymentResultStatus = 'success' | 'failed' | 'pending' | 'cancelled';

interface PaymentResultProps {
    status: PaymentResultStatus;
    title?: string;
    description?: string;
    amount?: number;
    reference?: string;
    paymentMethod?: string;
    date?: string;
    onDownloadReceipt?: () => void;
    isDownloading?: boolean;
    primaryAction?: {
        label: string;
        onClick: () => void;
        icon?: React.ElementType;
    };
    secondaryAction?: {
        label: string;
        onClick: () => void;
        icon?: React.ElementType;
    };
}

const statusConfig = {
    success: {
        icon: CheckCircle2,
        defaultTitle: 'Payment Successful!',
        defaultDescription: 'Your payment has been processed successfully.',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-500/10',
        iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    },
    failed: {
        icon: XCircle,
        defaultTitle: 'Payment Failed',
        defaultDescription: 'We were unable to process your payment. Please try again.',
        color: 'text-red-600',
        bgColor: 'bg-red-500/10',
        iconBg: 'bg-red-100 dark:bg-red-900/30',
    },
    pending: {
        icon: Clock,
        defaultTitle: 'Payment Pending',
        defaultDescription: 'Your payment is being processed. This may take a few moments.',
        color: 'text-amber-600',
        bgColor: 'bg-amber-500/10',
        iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    },
    cancelled: {
        icon: AlertCircle,
        defaultTitle: 'Payment Cancelled',
        defaultDescription: 'The payment process was cancelled.',
        color: 'text-slate-600',
        bgColor: 'bg-slate-500/10',
        iconBg: 'bg-slate-100 dark:bg-slate-900/30',
    },
};

export function PaymentResult({
    status,
    title,
    description,
    amount,
    reference,
    paymentMethod,
    date,
    onDownloadReceipt,
    isDownloading,
    primaryAction,
    secondaryAction,
}: PaymentResultProps) {
    const router = useRouter();
    const config = statusConfig[status];
    const StatusIcon = config.icon;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md mx-auto"
        >
            <Card className="overflow-hidden border-none shadow-xl">
                {/* Status Header */}
                <div className={cn('py-10 px-6 text-center relative overflow-hidden', config.bgColor)}>
                    {/* Subtle background pattern/decoration */}
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <StatusIcon size={120} />
                    </div>

                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                        className="flex justify-center mb-6"
                    >
                        <div className={cn('p-5 rounded-full shadow-inner bg-white dark:bg-slate-900', config.color)}>
                            <StatusIcon className="h-12 w-12" />
                        </div>
                    </motion.div>

                    <h2 className={cn('text-2xl font-bold mb-2', config.color)}>
                        {title || config.defaultTitle}
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 text-sm max-w-[280px] mx-auto">
                        {description || config.defaultDescription}
                    </p>
                </div>

                {/* Payment Details */}
                <CardContent className="p-6 bg-white dark:bg-slate-950">
                    {amount !== undefined && (
                        <div className="text-center py-6 mb-6 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-semibold mb-1">
                                Amount {status === 'success' ? 'Paid' : 'Total'}
                            </p>
                            <p className={cn(
                                'text-4xl font-black tracking-tight',
                                status === 'success' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                            )}>
                                {formatCurrency(amount)}
                            </p>
                        </div>
                    )}

                    <div className="space-y-4 mb-8">
                        {reference && (
                            <div className="flex justify-between items-center py-1">
                                <span className="text-sm text-slate-500 dark:text-slate-400">Reference Number</span>
                                <span className="text-sm font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                    {reference}
                                </span>
                            </div>
                        )}
                        {paymentMethod && (
                            <div className="flex justify-between items-center py-1">
                                <span className="text-sm text-slate-500 dark:text-slate-400">Payment Method</span>
                                <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                    {paymentMethod.toLowerCase().includes('wallet') ? <Wallet className="h-3.5 w-3.5" /> : null}
                                    {paymentMethod}
                                </span>
                            </div>
                        )}
                        {date && (
                            <div className="flex justify-between items-center py-1">
                                <span className="text-sm text-slate-500 dark:text-slate-400">Date & Time</span>
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">{date}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-3">
                        {status === 'success' && onDownloadReceipt && (
                            <Button
                                onClick={onDownloadReceipt}
                                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-6 text-base font-bold shadow-lg shadow-emerald-500/20"
                                disabled={isDownloading}
                            >
                                {isDownloading ? (
                                    <Clock className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Download className="h-5 w-5" />
                                )}
                                Download Receipt
                            </Button>
                        )}

                        {primaryAction ? (
                            <Button
                                onClick={primaryAction.onClick}
                                className={cn(
                                    "w-full gap-2 py-6 text-base font-bold",
                                    status !== 'success' && "bg-slate-900 dark:bg-slate-100"
                                )}
                            >
                                {primaryAction.icon && <primaryAction.icon className="h-5 w-5" />}
                                {primaryAction.label}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => router.push('/portal/invoices')}
                                variant={status === 'success' ? "outline" : "default"}
                                className="w-full gap-2 py-6 text-base font-bold"
                            >
                                <FileText className="h-5 w-5" />
                                Back to Invoices
                            </Button>
                        )}

                        {secondaryAction ? (
                            <Button
                                onClick={secondaryAction.onClick}
                                variant="ghost"
                                className="w-full text-slate-500 hover:text-slate-900"
                            >
                                {secondaryAction.icon && <secondaryAction.icon className="h-4 w-4 mr-2" />}
                                {secondaryAction.label}
                            </Button>
                        ) : status === 'success' ? (
                            <Button
                                onClick={() => router.push('/portal')}
                                variant="ghost"
                                className="w-full text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                            >
                                <LayoutDashboard className="h-4 w-4 mr-2" />
                                Go to Dashboard
                            </Button>
                        ) : null}
                    </div>
                </CardContent>
            </Card>

            {status === 'success' && (
                <p className="text-center text-xs text-slate-500 mt-6 px-6 italic">
                    A confirmation email has been sent to your registered address.
                </p>
            )}
        </motion.div>
    );
}
