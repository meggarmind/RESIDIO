import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ArrowRight, Clock, Coins } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { PettyCashMetrics } from '@/actions/finance/petty-cash';

interface PendingSummary {
    count: number;
    total: number;
    error: string | null;
}

interface PettyCashDashboardProps {
    /** null when the petty cash read failed; the other cards still render. */
    data: PettyCashMetrics | null;
    pending: PendingSummary;
}

function SectionError({ what }: { what: string }) {
    return (
        <p role="alert" className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Could not load {what}.
        </p>
    );
}

/**
 * The three figures a treasurer reads first: the petty cash float, this month's spend, and what is
 * still waiting for approval (#785).
 */
export function PettyCashDashboard({ data, pending }: PettyCashDashboardProps) {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border-primary/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                        <span>Digital Float</span>
                        <Coins className="h-4 w-4 text-primary" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data ? (
                        <div className="text-2xl font-bold tabular-nums">{formatCurrency(data.totalBalance)}</div>
                    ) : (
                        <SectionError what="the petty cash float" />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Month Spend</CardTitle>
                </CardHeader>
                <CardContent>
                    {data ? (
                        <>
                            <div className="text-2xl font-bold tabular-nums">
                                {formatCurrency(data.metrics.totalSpentThisMonth)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Current month total</p>
                        </>
                    ) : (
                        <SectionError what="this month's spend" />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                        <span>Pending approval</span>
                        <Clock className="h-4 w-4 text-warning" />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {pending.error ? (
                        <SectionError what="pending expenses" />
                    ) : (
                        <Link
                            href="/expenditure?status=pending"
                            className="group flex min-h-11 items-end justify-between gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <div>
                                <div className="text-2xl font-bold tabular-nums">{pending.count}</div>
                                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                                    {formatCurrency(pending.total)} awaiting approval
                                </p>
                            </div>
                            <span className="flex items-center gap-1 text-xs font-medium text-primary">
                                Review
                                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                            </span>
                        </Link>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
