'use client';

import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { CreditCard } from 'lucide-react';

/**
 * Client-side wrapper for the Record Payment page header.
 *
 * `EnhancedPageHeader` is a client component (it calls `useVisualTheme()`),
 * and a lucide icon is a `forwardRef` object containing a `render` function
 * that React cannot serialize across the server/client boundary. The parent
 * page must stay an async Server Component (it awaits `searchParams`), so
 * the icon import and the header render are isolated here instead of being
 * passed down as a prop from the server.
 */
export function PaymentPageHeader() {
    return (
        <EnhancedPageHeader
            title="Record Payment"
            description="Enter payment details for a resident."
            icon={CreditCard}
        />
    );
}
