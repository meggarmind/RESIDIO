'use client';

import { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

interface ResidentAnalyticsChartsProps {
    invoices: any[]; // Using any[] temporarily, should be Invoice[]
}

export function ResidentAnalyticsCharts({ invoices }: ResidentAnalyticsChartsProps) {
    // Aggregate monthly spending (last 6 months)
    const monthlyData = useMemo(() => {
        if (!invoices) return [];

        const last6Months = new Array(6).fill(0).map((_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            return {
                month: d.toLocaleString('default', { month: 'short' }),
                fullDate: d,
                amount: 0,
                originalIndex: i // 0 is current month, 5 is 6 months ago
            };
        }).reverse();

        invoices.forEach(inv => {
            if (inv.status !== 'paid') return;

            const date = new Date(inv.created_at); // Or payment_date if available
            const now = new Date();

            // Check if within last 6 months
            const diffMonths = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());

            if (diffMonths >= 0 && diffMonths < 6) {
                // Find the corresponding month object (since we reversed, index is 5 - diffMonths)
                // Actually simpler: match by label since we built the array
                const monthLabel = date.toLocaleString('default', { month: 'short' });
                const target = last6Months.find(m => m.month === monthLabel);
                if (target) {
                    target.amount += Number(inv.total_amount);
                }
            }
        });

        return last6Months;
    }, [invoices]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-popover border border-border p-2 rounded-lg shadow-lg">
                    <p className="font-medium text-popover-foreground">{label}</p>
                    <p className="text-sm text-primary">
                        {formatCurrency(payload[0].value)}
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <Card className="h-full border-border bg-card shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium text-card-foreground">
                    Monthly Spending
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    {monthlyData.every(d => d.amount === 0) ? (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                            No spending data for the last 6 months
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis
                                    dataKey="month"
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `₦${value / 1000}k`}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.3)' }} />
                                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                                    {monthlyData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill="hsl(var(--primary))" fillOpacity={0.8} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
