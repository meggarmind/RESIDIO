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
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Reference Data</h3>
                <p className="text-sm text-muted-foreground">
                    Manage core reference data like Streets and House Types.
                </p>
            </div>
            <div className="h-full py-6">
                <Tabs defaultValue="streets" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="streets">Streets</TabsTrigger>
                        <TabsTrigger value="house-types">House Types</TabsTrigger>
                    </TabsList>
                    <TabsContent value="streets" className="border-none p-0 outline-none">
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
                    <TabsContent value="house-types" className="border-none p-0 outline-none">
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
        </div>
    );
}
