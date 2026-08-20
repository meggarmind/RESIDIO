'use client';

import { BillingProfileForm } from '@/components/billing/billing-profile-form';
import { BillingProfileEditDialog } from '@/components/billing/billing-profile-edit-dialog';
import { useBillingProfiles, useDeleteBillingProfile, useDuplicateBillingProfile } from '@/hooks/use-billing';
import { useCurrentDevelopmentLevyProfileId } from '@/hooks/use-settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Building, Users, Clock, Pencil, Landmark, CheckCircle, Copy } from 'lucide-react';
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
import { BILLABLE_ROLE_OPTIONS } from '@/types/database';

export default function BillingProfilesPage() {
    const { data: profiles, isLoading } = useBillingProfiles();
    const deleteMutation = useDeleteBillingProfile();
    const duplicateMutation = useDuplicateBillingProfile();
    const { data: currentDevLevyId } = useCurrentDevelopmentLevyProfileId();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editProfileId, setEditProfileId] = useState<string | null>(null);

    const getRoleLabels = (roles: string[] | null) => {
        if (!roles || roles.length === 0) return null;
        return roles.map(role => {
            const found = BILLABLE_ROLE_OPTIONS.find(o => o.value === role);
            return found?.label || role;
        });
    };

    if (isLoading) return <div>Loading profiles...</div>;

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-medium">Billing Profiles (Rate Cards)</h3>
                        <p className="text-sm text-muted-foreground">
                            Define the standard rates for different types of units or residents.
                        </p>
                    </div>
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button>Create Profile</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Create Billing Profile</DialogTitle>
                                <DialogDescription>
                                    Set up a new rate card. This can be assigned to House Types or specific roles.
                                </DialogDescription>
                            </DialogHeader>
                            <BillingProfileForm onSuccess={() => setIsCreateOpen(false)} />
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="grid gap-4">
                    {profiles?.map((profile) => {
                        const roleLabels = getRoleLabels(profile.applicable_roles);
                        const isCurrentDevLevy = profile.is_development_levy && profile.id === currentDevLevyId;
                        return (
                            <Card key={profile.id} className={isCurrentDevLevy ? 'border-green-300 bg-green-50/30' : ''}>
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <CardTitle className="text-base">{profile.name}</CardTitle>
                                                {profile.is_development_levy && (
                                                    <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">
                                                        <Landmark className="h-3 w-3 mr-1" />
                                                        Development Levy
                                                    </Badge>
                                                )}
                                                {isCurrentDevLevy && (
                                                    <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100">
                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                        Current
                                                    </Badge>
                                                )}
                                                {profile.is_one_time && !profile.is_development_levy && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        One-Time
                                                    </Badge>
                                                )}
                                                {!profile.is_active && (
                                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                                        Inactive
                                                    </Badge>
                                                )}
                                            </div>
                                            <CardDescription>{profile.description}</CardDescription>
                                            <div className="flex items-center gap-2 mt-2">
                                                {profile.target_type === 'house' ? (
                                                    <Badge variant="outline" className="text-xs">
                                                        <Building className="h-3 w-3 mr-1" />
                                                        Property
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs">
                                                        <Users className="h-3 w-3 mr-1" />
                                                        Role-Based
                                                    </Badge>
                                                )}
                                                {roleLabels && (
                                                    <div className="flex gap-1">
                                                        {roleLabels.map((label, i) => (
                                                            <Badge key={i} variant="secondary" className="text-xs">
                                                                {label}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => setEditProfileId(profile.id)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => duplicateMutation.mutate(profile.id)}
                                                disabled={duplicateMutation.isPending}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
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
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {profile.items?.map((item: { id: string; name: string; amount: number; frequency?: string }) => (
                                            <div key={item.id} className="flex justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                                                <span>{item.name}</span>
                                                <span className="font-medium">
                                                    {formatCurrency(item.amount)}
                                                    <span className="text-xs text-muted-foreground ml-1">/{item.frequency}</span>
                                                </span>
                                            </div>
                                        ))}
                                        {(!profile.items || profile.items.length === 0) && (
                                            <p className="text-sm text-muted-foreground italic">No items defined</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}

                    {(!profiles || profiles.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                            No billing profiles found. Create one to get started.
                        </div>
                    )}
                </div>
            </div>

            <BillingProfileEditDialog
                profileId={editProfileId}
                open={!!editProfileId}
                onOpenChange={(open) => !open && setEditProfileId(null)}
            />
        </div>
    );
}
