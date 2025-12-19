'use client';

import { TransactionTagsList } from '@/components/admin/transaction-tags-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function TransactionTagsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Transaction Tags</h3>
        <p className="text-sm text-muted-foreground">
          Manage category tags for classifying bank statement transactions.
          Tags help organize imported transactions for financial reporting.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tags Management</CardTitle>
          <CardDescription>
            Create and manage tags to categorize incoming (credit) and outgoing (debit) transactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionTagsList />
        </CardContent>
      </Card>
    </div>
  );
}
