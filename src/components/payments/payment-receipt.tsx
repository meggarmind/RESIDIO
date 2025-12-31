'use client';

import { forwardRef } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

interface PaymentReceiptProps {
    payment: {
        id: string;
        amount: number;
        payment_date: string;
        method?: string | null;
        status: string;
        reference_number?: string | null;
        notes?: string | null;
        period_start?: string | null;
        period_end?: string | null;
        created_at: string;
        resident?: {
            id: string;
            first_name: string;
            last_name: string;
            resident_code: string;
            phone_primary?: string;
            email?: string;
        } | null;
        house?: {
            house_number: string;
            short_name?: string | null;
            street?: {
                name: string;
            } | null;
        } | null;
    };
    estateName?: string;
}

export const PaymentReceipt = forwardRef<HTMLDivElement, PaymentReceiptProps>(
    ({ payment, estateName = 'Residio Estate' }, ref) => {
        const receiptNumber = payment.reference_number || `RCP-${payment.id.slice(0, 8).toUpperCase()}`;

        return (
            <div
                ref={ref}
                className="bg-white text-black p-8 max-w-md mx-auto print:max-w-none print:mx-0"
                style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
                {/* Header */}
                <div className="text-center border-b-2 border-black pb-4 mb-6">
                    <h1 className="text-2xl font-bold uppercase tracking-wider">{estateName}</h1>
                    <p className="text-sm text-gray-600 mt-1">Payment Receipt</p>
                </div>

                {/* Receipt Info */}
                <div className="flex justify-between text-sm mb-6">
                    <div>
                        <p className="font-semibold">Receipt No:</p>
                        <p className="font-mono">{receiptNumber}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-semibold">Date:</p>
                        <p>{format(new Date(payment.payment_date), 'MMMM d, yyyy')}</p>
                    </div>
                </div>

                {/* Resident Details */}
                <div className="bg-gray-50 p-4 rounded mb-6">
                    <h2 className="font-semibold text-sm uppercase text-gray-600 mb-2">Received From</h2>
                    <p className="text-lg font-semibold">
                        {payment.resident?.first_name} {payment.resident?.last_name}
                    </p>
                    <p className="text-sm text-gray-600">
                        Resident Code: {payment.resident?.resident_code}
                    </p>
                    {payment.house && (
                        <p className="text-sm text-gray-600">
                            Property: {payment.house.short_name || payment.house.house_number}
                            {payment.house.street?.name && ` • ${payment.house.house_number} ${payment.house.street.name}`}
                        </p>
                    )}
                </div>

                {/* Payment Details */}
                <div className="mb-6">
                    <h2 className="font-semibold text-sm uppercase text-gray-600 mb-3">Payment Details</h2>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b">
                                <td className="py-2 text-gray-600">Amount</td>
                                <td className="py-2 text-right font-semibold text-lg">
                                    {formatCurrency(Number(payment.amount))}
                                </td>
                            </tr>
                            <tr className="border-b">
                                <td className="py-2 text-gray-600">Payment Method</td>
                                <td className="py-2 text-right capitalize">
                                    {payment.method?.replace('_', ' ') || 'Not specified'}
                                </td>
                            </tr>
                            <tr className="border-b">
                                <td className="py-2 text-gray-600">Status</td>
                                <td className="py-2 text-right">
                                    <span
                                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                                            payment.status === 'paid'
                                                ? 'bg-green-100 text-green-800'
                                                : payment.status === 'pending'
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : 'bg-red-100 text-red-800'
                                        }`}
                                    >
                                        {payment.status}
                                    </span>
                                </td>
                            </tr>
                            {payment.period_start && payment.period_end && (
                                <tr className="border-b">
                                    <td className="py-2 text-gray-600">Period Covered</td>
                                    <td className="py-2 text-right">
                                        {format(new Date(payment.period_start), 'MMM yyyy')} -{' '}
                                        {format(new Date(payment.period_end), 'MMM yyyy')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Notes */}
                {payment.notes && (
                    <div className="mb-6">
                        <h2 className="font-semibold text-sm uppercase text-gray-600 mb-2">Notes</h2>
                        <p className="text-sm text-gray-700 italic">{payment.notes}</p>
                    </div>
                )}

                {/* Footer */}
                <div className="border-t-2 border-black pt-4 mt-8">
                    <div className="flex justify-between text-xs text-gray-500">
                        <p>Generated: {format(new Date(), 'MMM d, yyyy HH:mm')}</p>
                        <p>Thank you for your payment</p>
                    </div>
                </div>

                {/* Print-only styling */}
                <style jsx>{`
                    @media print {
                        div {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                    }
                `}</style>
            </div>
        );
    }
);

PaymentReceipt.displayName = 'PaymentReceipt';
