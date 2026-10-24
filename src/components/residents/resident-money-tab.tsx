'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarRange, Plus, Receipt, Users } from 'lucide-react';
import type { ResidentWithHouses } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { WalletBalance } from '@/components/residents/wallet-balance';
import { WalletTransactions } from '@/components/residents/wallet-transactions';
import { WalletPaymentBatchTools } from '@/components/residents/wallet-payment-batch-tools';
import { UnpostedPaymentsStrip } from '@/components/residents/unposted-payments-strip';
import { PaymentAliases } from '@/components/residents/payment-aliases';
import { useResidentAliases } from '@/hooks/use-imports';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * The resident detail "Money" tab (#783, #1142): the wallet ledger in the main
 * column, balance and actions in a right rail. Payment History was folded into
 * the ledger; pending and failed payments show in the Unposted strip.
 */
export function ResidentMoneyTab({ resident }: { resident: ResidentWithHouses }) {
  const id = resident.id;
  const [batchSection, setBatchSection] = useState<'settle' | 'prepay' | null>(null);
  const [aliasesOpen, setAliasesOpen] = useState(false);
  const { hasPermission } = useAuth();
  const { data: aliasesData } = useResidentAliases(id);
  const aliasCount = aliasesData?.data?.length ?? 0;
  const residentName = `${resident.first_name} ${resident.last_name}`;

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      {/* Rail first on small screens (order), right column from lg. */}
      <div className="order-first space-y-4 lg:order-last">
        {/*
          Issue #120: the wallet balance card carries the only manual
          credit/debit control. It lives on this tab rather than on Overview,
          whose Financial Summary already prints the same figure.
        */}
        <WalletBalance residentId={id} />
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            {hasPermission(PERMISSIONS.PAYMENTS_CREATE) && (
              <Button size="sm" asChild className="min-h-11 justify-start md:min-h-0">
                <Link href={`/payments/new?residentId=${id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  Record payment
                </Link>
              </Button>
            )}
            {hasPermission(PERMISSIONS.BILLING_MANAGE_WALLETS) && (
              <>
                <Button size="sm" variant="outline" className="min-h-11 justify-start md:min-h-0" onClick={() => setBatchSection('settle')}>
                  <Receipt className="mr-2 h-4 w-4" />
                  Settle invoices
                </Button>
                <Button size="sm" variant="outline" className="min-h-11 justify-start md:min-h-0" onClick={() => setBatchSection('prepay')}>
                  <CalendarRange className="mr-2 h-4 w-4" />
                  Prepay
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="min-h-11 justify-start md:min-h-0" onClick={() => setAliasesOpen(true)}>
              <Users className="mr-2 h-4 w-4" />
              Payment aliases ({aliasCount})
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <UnpostedPaymentsStrip residentId={id} />
        <WalletTransactions residentId={id} />
      </div>

      <Dialog open={batchSection !== null} onOpenChange={(open) => { if (!open) setBatchSection(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{batchSection === 'prepay' ? 'Prepay future invoices' : 'Settle invoices'}</DialogTitle>
            <DialogDescription>
              {batchSection === 'prepay'
                ? 'Create and pay invoices for future months from the wallet.'
                : 'Settle several invoices with one receipt.'}
            </DialogDescription>
          </DialogHeader>
          {batchSection && (
            <WalletPaymentBatchTools
              residentId={id}
              section={batchSection}
              houses={(resident.resident_houses || []).filter((rh) => rh.is_active).map((rh) => ({
                id: rh.house_id,
                label: rh.house?.short_name || rh.house?.house_number || rh.house_id,
              }))}
            />
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={aliasesOpen} onOpenChange={setAliasesOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Payment aliases</SheetTitle>
            <SheetDescription>Names that may appear on bank transfers for {residentName}.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <PaymentAliases residentId={id} residentName={residentName} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
