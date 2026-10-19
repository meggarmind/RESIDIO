'use client';

import type { ResidentWithHouses } from '@/types/database';
import { WalletBalance } from '@/components/residents/wallet-balance';
import { WalletTransactions } from '@/components/residents/wallet-transactions';
import { WalletPaymentBatchTools } from '@/components/residents/wallet-payment-batch-tools';
import { ResidentPayments } from '@/components/residents/resident-payments';
import { PaymentAliases } from '@/components/residents/payment-aliases';

/**
 * The resident detail "Money" tab (#783): wallet, payments and payment aliases,
 * formerly three separate tabs. Loaded on demand by the detail page.
 */
export function ResidentMoneyTab({ resident }: { resident: ResidentWithHouses }) {
  const id = resident.id;
  return (
    <div className="space-y-4">
      {/*
        Issue #120: the wallet balance card carries the only manual
        credit/debit control. It lives on this tab -- alongside the batch
        settlement tools and the ledger -- rather than on Overview, whose
        Financial Summary already prints the same figure. The two are never
        on screen together.
      */}
      <WalletBalance residentId={id} />
      <WalletPaymentBatchTools
        residentId={id}
        houses={(resident.resident_houses || []).filter((rh) => rh.is_active).map((rh) => ({
          id: rh.house_id,
          label: rh.house?.short_name || rh.house?.house_number || rh.house_id,
        }))}
      />
      <WalletTransactions residentId={id} />
      <ResidentPayments residentId={id} />
      <PaymentAliases residentId={id} residentName={`${resident.first_name} ${resident.last_name}`} />
    </div>
  );
}
