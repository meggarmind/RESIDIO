import { Suspense } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StreetsList } from '@/components/admin/streets-list';
import { HouseTypesList } from '@/components/admin/house-types-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const metadata: Metadata = {
    title: 'Reference Data Management',
    description: 'Manage streets and house types',
};

export default async function ReferencesPage() {
    const supabase = await createServerSupabaseClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

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
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Reference Data</h2>
            </div>

            <Tabs defaultValue="streets" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="streets">Streets</TabsTrigger>
                    <TabsTrigger value="house-types">House Types</TabsTrigger>
                </TabsList>
                <TabsContent value="streets" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Streets Management</CardTitle>
                            <CardDescription>
                                Manage the list of streets in the estate.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <StreetsList />
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="house-types" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>House Types Management</CardTitle>
                            <CardDescription>
                                Manage the various types of houses available.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <HouseTypesList />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
