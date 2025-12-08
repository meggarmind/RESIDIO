'use client';

import { BillingProfileForm } from '@/components/billing/billing-profile-form';
import { useBillingProfiles, useDeleteBillingProfile } from '@/hooks/use-billing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from 'react';

export default function BillingSettingsPage() {
    const { data: profiles, isLoading } = useBillingProfiles();
    const deleteMutation = useDeleteBillingProfile();
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    if (isLoading) return <div>Loading settings...</div>;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Billing Profiles (Rate Cards)</h3>
                <p className="text-sm text-muted-foreground">
                    Define the standard rates for different types of units.
                </p>
            </div>
            <div className="flex justify-end">
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>Create Profile</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                            <DialogTitle>Create Billing Profile</DialogTitle>
                            <DialogDescription>
                                Set up a new rate card. This can be assigned to House Types.
                            </DialogDescription>
                        </DialogHeader>
                        <BillingProfileForm onSuccess={() => setIsCreateOpen(false)} />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4">
                {profiles?.map((profile: any) => (
                    <Card key={profile.id}>
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-base">{profile.name}</CardTitle>
                                    <CardDescription>{profile.description}</CardDescription>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive h-8 w-8"
                                    onClick={async () => {
                                        if (confirm('Delete this profile? This might affect automated billing.')) {
                                            await deleteMutation.mutateAsync(profile.id);
                                        }
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {profile.items?.map((item: any) => (
                                    <div key={item.id} className="flex justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                                        <span>{item.name}</span>
                                        <span className="font-medium">{formatCurrency(item.amount)} <span className="text-xs text-muted-foreground">/{item.frequency}</span></span>
                                    </div>
                                ))}
                                {(!profile.items || profile.items.length === 0) && (
                                    <p className="text-sm text-muted-foreground italic">No items defined</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {(!profiles || profiles.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                        No billing profiles found. Create one to get started.
                    </div>
                )}
            </div>
        </div>
    );
}
