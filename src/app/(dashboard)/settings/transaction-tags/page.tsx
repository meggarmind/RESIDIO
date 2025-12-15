import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { TransactionTagsList } from '@/components/admin/transaction-tags-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
    title: 'Transaction Tags',
    description: 'Manage transaction category tags for bank statement imports',
};

export default async function TransactionTagsPage() {
    const supabase = await createServerSupabaseClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // RBAC Check - Only admin can manage transaction tags
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const allowedRoles = ['admin', 'chairman'];
    if (!profile || !allowedRoles.includes(profile.role)) {
        redirect('/dashboard');
    }

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
