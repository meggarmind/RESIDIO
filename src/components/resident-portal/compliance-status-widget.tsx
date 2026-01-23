'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';

interface ComplianceStatusWidgetProps {
    compliancePercentage: number;
    outstandingProperties: number;
    totalProperties: number;
}

export function ComplianceStatusWidget({
    compliancePercentage = 0,
    outstandingProperties = 0,
    totalProperties = 0,
}: ComplianceStatusWidgetProps) {
    const isHealthy = compliancePercentage === 100;

    return (
        <Card className="bg-gradient-to-br from-card to-accent/5">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Portfolio Compliance
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-end justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-3xl font-bold">{compliancePercentage}%</span>
                        {isHealthy ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-orange-500" />
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                        {totalProperties - outstandingProperties} / {totalProperties} Active Units
                    </p>
                </div>

                <Progress value={compliancePercentage} className="h-2 mb-4" />

                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Levy Payments</span>
                        <span className={`font-medium ${outstandingProperties > 0 ? 'text-destructive' : 'text-green-500'}`}>
                            {outstandingProperties > 0 ? `${outstandingProperties} Pending` : 'Up to date'}
                        </span>
                    </div>

                    <Button variant="outline" className="w-full text-xs h-8" size="sm">
                        View Compliance Report
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
