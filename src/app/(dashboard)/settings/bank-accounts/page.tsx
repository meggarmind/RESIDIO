'use client';

import { BankAccountsList } from '@/components/admin/bank-accounts-list';
import { BankPasswordsSection } from '@/components/admin/bank-passwords-section';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function BankAccountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Bank Accounts</h3>
        <p className="text-sm text-muted-foreground">
          Manage estate bank accounts used for statement imports.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Bank Accounts Management</CardTitle>
          <CardDescription>
            Add, edit, or remove bank accounts. Changes by non-admin users require approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BankAccountsList />
        </CardContent>
      </Card>

      <BankPasswordsSection />
    </div>
  );
}
