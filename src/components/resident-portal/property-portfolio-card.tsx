'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, User, MoreVertical } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { ResidentHouse, House } from '@/types/database';

interface PropertyPortfolioCardProps {
    properties: ResidentHouse[];
    isLoading?: boolean;
}

export function PropertyPortfolioCard({ properties, isLoading }: PropertyPortfolioCardProps) {
    if (isLoading) {
        return (
            <Card className="h-full">
                <CardHeader>
                    <div className="h-6 w-1/3 bg-muted animate-pulse rounded" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-20 bg-muted animate-pulse rounded" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-full relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">My Portfolio</CardTitle>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                    View All
                </Button>
            </CardHeader>
            <CardContent>
                {properties.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No properties found in portfolio.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {properties.map((prop) => (
                            <div
                                key={prop.id}
                                className="flex items-start justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                            >
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <Building2 className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm">
                                            {prop.house?.house_number} {prop.house?.street?.name}
                                        </h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="text-[10px] h-5">
                                                {prop.resident_role.replace(/_/g, ' ')}
                                            </Badge>
                                            <Badge
                                                className="text-[10px] h-5"
                                                variant={prop.is_active ? 'success' : 'secondary'}
                                            >
                                                {prop.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    {/* Placeholder for levy status or tenant info */}
                                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground mb-1">
                                        <User className="w-3 h-3" />
                                        <span>Occupied</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
