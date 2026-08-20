'use client';

import { useDevelopmentLevyProfiles } from '@/hooks/use-billing';
import { useCurrentDevelopmentLevyProfileId, useSetCurrentDevelopmentLevyProfileId, useGenerateRetroactiveLevies } from '@/hooks/use-settings';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const NONE_VALUE = '_none';

export default function DevelopmentLeviesPage() {
    const { data: developmentLevyProfiles } = useDevelopmentLevyProfiles();
    const { data: currentDevLevyId } = useCurrentDevelopmentLevyProfileId();
    const setCurrentDevLevyMutation = useSetCurrentDevelopmentLevyProfileId();
    const generateLeviesMutation = useGenerateRetroactiveLevies();

    return (
        <div className="space-y-6">
            {/* Development Levy Settings */}
            <div>
                <h3 className="text-lg font-medium">Development Levy</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Select which Development Levy profile automatically applies to new houses.
                </p>
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="current_dev_levy">Current Development Levy</Label>
                                <p className="text-sm text-muted-foreground">
                                    This profile will be applied to all newly created houses
                                </p>
                            </div>
                            <Select
                                value={currentDevLevyId || NONE_VALUE}
                                onValueChange={(value) => setCurrentDevLevyMutation.mutate(value === NONE_VALUE ? null : value)}
                                disabled={setCurrentDevLevyMutation.isPending}
                            >
                                <SelectTrigger className="w-[280px]">
                                    <SelectValue placeholder="Select a Development Levy" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE_VALUE}>
                                        <span className="text-muted-foreground">None (disabled)</span>
                                    </SelectItem>
                                    {developmentLevyProfiles?.filter(p => p.is_active).map((profile) => {
                                        const total = profile.items?.reduce((sum: number, item: { amount?: number }) => sum + (item.amount || 0), 0) || 0;
                                        return (
                                            <SelectItem key={profile.id} value={profile.id}>
                                                {profile.name} - {formatCurrency(total)}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        {currentDevLevyId && (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                <span>Development Levy is active for new houses</span>
                            </div>
                        )}
                        {!currentDevLevyId && (
                            <div className="text-sm text-amber-600">
                                No Development Levy selected - new houses will not be charged automatically
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Retroactive Levy Generation */}
            <div>
                <h3 className="text-lg font-medium">Retroactive Levy Generation</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Generate outstanding one-time levies for existing houses that haven&apos;t been charged yet.
                </p>
                <Button
                    variant="outline"
                    onClick={() => generateLeviesMutation.mutate()}
                    disabled={generateLeviesMutation.isPending}
                >
                    {generateLeviesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate Retroactive Levies
                </Button>
            </div>
        </div>
    );
}
