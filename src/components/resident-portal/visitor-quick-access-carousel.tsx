'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Zap, Loader2, CheckCircle2, UserPlus } from 'lucide-react';
import { useCreateSecurityContact, useSecurityContactCategories } from '@/hooks/use-security';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VisitorQuickAccessCarouselProps {
    contacts: any[];
    isLoading?: boolean;
}

export function VisitorQuickAccessCarousel({ contacts, isLoading }: VisitorQuickAccessCarouselProps) {
    const { residentId } = useAuth();
    const { data: resident } = useResident(residentId || undefined);
    const { data: categories } = useSecurityContactCategories();
    const createMutation = useCreateSecurityContact();
    const [generatingId, setGeneratingId] = useState<string | null>(null);

    const visitorCategory = categories?.find((c) => c.name?.toLowerCase() === 'visitor');
    const activeHouses = resident?.resident_houses?.filter((rh) => rh.is_active) || [];
    const visitorContacts = contacts?.filter((c) => c.category?.name?.toLowerCase() === 'visitor') || [];

    const handleQuickCode = async (visitor: any) => {
        if (!residentId || !visitorCategory || activeHouses.length === 0) {
            toast.error('Unable to generate quick code');
            return;
        }

        setGeneratingId(visitor.id);
        try {
            // Default to 24 hours for quick code
            const hours = 24;
            const houseId = activeHouses[0].house_id;

            await createMutation.mutateAsync({
                resident_id: residentId,
                category_id: visitorCategory.id,
                full_name: visitor.full_name,
                phone_primary: visitor.phone_primary,
                phone_secondary: visitor.phone_secondary || undefined,
                relationship: 'Visitor',
                notes: `Quick Access Code (Auto-generated). Valid for ${hours} hours.`,
            });

            toast.success(`Access code generated for ${visitor.full_name}`);
        } catch (error) {
            toast.error('Failed to generate quick code');
            console.error(error);
        } finally {
            setGeneratingId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex gap-4 overflow-hidden py-2">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="flex-shrink-0 w-32 h-40 animate-pulse bg-muted/50" />
                ))}
            </div>
        );
    }

    if (visitorContacts.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-orange-500" />
                    Frequent Visitors
                </h3>
            </div>

            <ScrollArea className="w-full whitespace-nowrap pb-4">
                <div className="flex w-max space-x-4 p-1">
                    {visitorContacts.map((visitor, index) => (
                        <motion.div
                            key={visitor.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <Card className="flex flex-col items-center p-3 w-32 space-y-3 hover:shadow-md transition-shadow group relative overflow-hidden">
                                <Avatar className="h-14 w-14 border-2 border-background shadow-sm">
                                    <AvatarImage src={visitor.photo_url || ''} />
                                    <AvatarFallback className="bg-orange-500/10 text-orange-600">
                                        {visitor.full_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="text-center">
                                    <p className="text-xs font-bold truncate w-24 text-foreground">
                                        {visitor.full_name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        Last: {visitor.last_visit_at ? new Date(visitor.last_visit_at).toLocaleDateString() : 'New'}
                                    </p>
                                </div>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    className={cn(
                                        "w-full h-8 text-[10px] gap-1 group-hover:bg-orange-500 group-hover:text-white transition-colors",
                                        generatingId === visitor.id && "bg-orange-500 text-white border-orange-500"
                                    )}
                                    onClick={() => handleQuickCode(visitor)}
                                    disabled={generatingId !== null}
                                >
                                    {generatingId === visitor.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Zap className="h-3 w-3" />
                                    )}
                                    Quick Code
                                </Button>
                            </Card>
                        </motion.div>
                    ))}
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div>
    );
}
