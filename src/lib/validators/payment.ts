import { z } from 'zod';

export const paymentStatusEnum = z.enum(['pending', 'paid', 'overdue', 'failed']);
export const paymentMethodEnum = z.enum(['cash', 'bank_transfer', 'pos', 'cheque', 'online']);

export const paymentFormSchema = z.object({
    resident_id: z.string().uuid('Resident is required'),
    house_id: z.string().uuid().optional().nullable(),
    amount: z.number().positive('Amount must be positive'),
    payment_date: z.date(),
    status: paymentStatusEnum,
    method: paymentMethodEnum.optional().nullable(),
    reference_number: z.string().optional().or(z.literal('')),
    notes: z.string().optional().or(z.literal('')),
    period_start: z.date().optional().nullable(),
    period_end: z.date().optional().nullable(),
});

export type PaymentFormData = z.infer<typeof paymentFormSchema>;

// Schema for creating split payments across multiple houses
export const splitPaymentSchema = z.object({
    resident_id: z.string().uuid('Resident is required'),
    total_amount: z.number().positive('Total amount must be positive'),
    payment_date: z.date(),
    method: paymentMethodEnum.optional().nullable(),
    reference_number: z.string().optional().or(z.literal('')),
    notes: z.string().optional().or(z.literal('')),
    splits: z.array(z.object({
        house_id: z.string().uuid('House is required'),
        amount: z.number().positive('Amount must be positive'),
    })).min(1, 'At least one house must be selected'),
}).refine(
    (data) => {
        const splitTotal = data.splits.reduce((sum, s) => sum + s.amount, 0);
        return Math.abs(splitTotal - data.total_amount) < 0.01; // Allow 1 kobo rounding
    },
    { message: 'Split amounts must equal total amount' }
);

export type SplitPaymentFormData = z.infer<typeof splitPaymentSchema>;

export const paymentSearchSchema = z.object({
    status: paymentStatusEnum.optional(),
    resident_id: z.string().uuid().optional(),
    query: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(), // ISO strings for range query
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});

export type PaymentSearchParams = z.infer<typeof paymentSearchSchema>;
