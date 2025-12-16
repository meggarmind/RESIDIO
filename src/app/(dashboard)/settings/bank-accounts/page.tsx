import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BankAccountsList } from '@/components/admin/bank-accounts-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Bank Accounts | Settings',
  description: 'Manage estate bank accounts for statement imports',
};

export default async function BankAccountsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // RBAC Check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const allowedRoles = ['admin', 'chairman', 'financial_secretary'];
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect('/dashboard');
  }

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
    </div>
  );
}
