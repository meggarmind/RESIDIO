import { useState, useRef } from 'react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, Plus, History } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { PettyCashMetrics } from '@/actions/finance/petty-cash';
import { toast } from 'sonner';
import { ManagePettyCashDialog } from './petty-cash/manage-accounts-dialog';

interface PettyCashDashboardProps {
    data: PettyCashMetrics;
    onSnapLog?: (receiptData: any) => void;
    onTopUp?: () => void;
}

/**
 * PettyCashDashboard
 * 
 * Manages the "Digital Float" for estate operations.
 * Allows quick top-ups, expense logging, and "Snap & Log" receipt capture.
 */
export function PettyCashDashboard({ data, onSnapLog, onTopUp }: PettyCashDashboardProps) {
    const { totalBalance, metrics, recentTransactions } = data;

    // We removed internal scanning logic from here as it's moved to a dialog
    // onSnapLog prop might still be passed but we don't use it directly here anymore in a card

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* 1. Digital Float Balance */}
                <Card className="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                            <span>Digital Float</span>
                            <Coins className="h-4 w-4 text-primary" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-2">
                            <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
                            <div className="flex gap-2 mt-1">
                                <ManagePettyCashDialog />
                                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onTopUp}>
                                    <Plus className="h-3 w-3 mr-1" /> Top Up
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Month-to-Date Spend */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Month Spend</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(metrics.totalSpentThisMonth)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Current month total
                        </p>
                    </CardContent>
                </Card>

                {/* 3. Pending Receipts */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Receipts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div className="text-2xl font-bold">{metrics.pendingReconciliations}</div>
                            {metrics.pendingReconciliations > 0 && (
                                <Badge variant="outline" className="border-amber-500 text-amber-500 bg-amber-50 dark:bg-amber-900/10 text-[10px] px-1.5 py-0 h-5">
                                    Needs Review
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Unreconciled items
                        </p>
                    </CardContent>
                </Card>

                {/* 4. Recent Activity (Mini List) */}
                <Card className="flex flex-col">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                            <span>Recent Activity</span>
                            <History className="h-4 w-4 text-muted-foreground" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-[80px]">
                        <div className="space-y-3">
                            {recentTransactions.slice(0, 2).length === 0 ? (
                                <p className="text-xs text-muted-foreground">No recent activity</p>
                            ) : (
                                recentTransactions.slice(0, 2).map((tx) => (
                                    <div key={tx.id} className="flex items-center justify-between text-xs">
                                        <div className="truncate max-w-[100px] font-medium" title={tx.description}>
                                            {tx.description || 'Expense'}
                                        </div>
                                        <div className="text-destructive font-medium whitespace-nowrap">
                                            -{formatCurrency(tx.amount || 0)}
                                        </div>
                                    </div>
                                ))
                            )}
                            {recentTransactions.length > 2 && (
                                <p className="text-[10px] text-muted-foreground text-center">
                                    +{recentTransactions.length - 2} more
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
            {/* Old Main Action Area Removed */}
        </div>
    );
}

function ActivityIndicator({ status }: { status: 'healthy' | 'warning' | 'critical' }) {
    return (
        <span className={cn("h-2 w-2 rounded-full", {
            "bg-emerald-500": status === 'healthy',
            "bg-amber-500": status === 'warning',
            "bg-red-500": status === 'critical',
        })} />
    );
}
