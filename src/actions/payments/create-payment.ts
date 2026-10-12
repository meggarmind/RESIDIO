'use server'

import type { CreatePaymentInput, CreatePaymentResult } from '@/lib/payments/create-payment'
import { createPaymentCore } from '@/lib/payments/create-payment'
import { authorizePermission } from '@/lib/auth/authorize'
import { PERMISSIONS } from '@/lib/auth/action-roles'

// Public server action. Client-supplied is_verified / bank_row_id are dropped
// (verification has its own permission); the bank-statement importer calls
// createPaymentCore with trustedVerification instead. The core re-checks the
// permission and writes the audit entry.
export async function createPayment(data: CreatePaymentInput): Promise<CreatePaymentResult> {
    const auth = await authorizePermission(PERMISSIONS.PAYMENTS_CREATE)
    if (!auth.authorized) {
        return { error: auth.error || 'Unauthorized' }
    }

    const { is_verified: _isVerified, bank_row_id: _bankRowId, ...rest } = data ?? ({} as CreatePaymentInput)
    void _isVerified
    void _bankRowId
    return createPaymentCore(rest as CreatePaymentInput)
}
