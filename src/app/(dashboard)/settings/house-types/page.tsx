import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HouseTypesList } from '@/components/admin/house-types-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'House Types | Settings',
  description: 'Manage house type reference data',
};

export default async function HouseTypesPage() {
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
        <h3 className="text-lg font-medium">House Types</h3>
        <p className="text-sm text-muted-foreground">
          Manage house types and their associated billing profiles.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>House Types Management</CardTitle>
          <CardDescription>
            Configure house types and link them to billing profiles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HouseTypesList />
        </CardContent>
      </Card>
    </div>
  );
}
