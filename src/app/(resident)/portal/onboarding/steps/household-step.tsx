'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ChevronRight, UserPlus, Trash2, User } from 'lucide-react';
import { useResident } from '@/hooks/use-residents';
import { useAuth } from '@/lib/auth/auth-provider';
import { HouseholdMemberForm } from '@/components/resident-portal/household-member-form';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHouseholdMembers, removeHouseholdMember } from '@/actions/residents/add-household-member';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface HouseholdStepProps {
    onNext: () => void;
    onBack: () => void;
}

export function HouseholdStep({ onNext, onBack }: HouseholdStepProps) {
    const { residentId } = useAuth();
    const { data: resident } = useResident(residentId || undefined);
    const queryClient = useQueryClient();

    // We need the house ID for household operations.
    // Assuming resident has at least one house.
    // We'll prioritize the "primary" house or the first one.
    const primaryHouse = resident?.resident_houses?.find(h => h.is_primary) || resident?.resident_houses?.[0];
    const houseId = primaryHouse?.house_id;

    const { data: members = [], isLoading } = useQuery({
        queryKey: ['householdMembers', houseId],
        queryFn: async () => {
            if (!houseId) return [];
            const result = await getHouseholdMembers(houseId);
            if (result.error) throw new Error(result.error);
            return result.data || [];
        },
        enabled: !!houseId,
    });

    const removeMutation = useMutation({
        mutationFn: async (id: string) => {
            const result = await removeHouseholdMember(id);
            if (result.error) throw new Error(result.error);
            return result.success;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['householdMembers', houseId] });
            toast.success('Member removed successfully');
        },
        onError: (error) => {
            toast.error('Failed to remove member');
        }
    });

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'household_member': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
            case 'domestic_staff': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400';
            case 'caretaker': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const formatRole = (role: string) => {
        return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    if (!houseId) {
        // If no house assigned, skip this step automatically or show error
        // For now, let's just let them continue
        return (
            <div className="text-center p-8">
                <p className="text-muted-foreground mb-4">No property assignment found.</p>
                <Button onClick={onNext}>Continue</Button>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-2xl mx-auto"
        >
            <Card className="border-0 shadow-lg bg-card/80 backdrop-blur">
                <CardHeader className="text-center pb-2">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Users className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">Household Members</CardTitle>
                    <CardDescription>
                        Add family members or staff who live with you. They can be given their own portal access.
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        {members.length === 0 ? (
                            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/20">
                                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                                <p className="text-muted-foreground text-sm">No household members added yet.</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {members.map((member) => (
                                    <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-10 w-10">
                                                <AvatarFallback className="bg-primary/10 text-primary">
                                                    {member.first_name[0]}{member.last_name[0]}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium">{member.first_name} {member.last_name}</p>
                                                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-5 ${getRoleBadgeColor(member.resident_role)}`}>
                                                        {formatRole(member.resident_role)}
                                                    </Badge>
                                                </div>
                                                {member.relationship && (
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                        <User className="h-3 w-3" />
                                                        {member.relationship}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove Member?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Are you sure you want to remove {member.first_name} {member.last_name} from your household?
                                                        This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        onClick={() => removeMutation.mutate(member.id)}
                                                    >
                                                        Remove
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-center pt-2">
                            <HouseholdMemberForm houseId={houseId} />
                        </div>
                    </div>

                    <div className="flex justify-between pt-6 border-t">
                        <Button variant="ghost" onClick={onBack}>
                            Back
                        </Button>
                        <Button onClick={onNext} className="min-w-[120px]">
                            {members.length > 0 ? 'Continue' : 'Skip & Continue'}
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
