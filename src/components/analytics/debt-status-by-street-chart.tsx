'use client';

import { Bar, BarChart, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { Home } from 'lucide-react';
import { DEBT_STATUSES, type DebtStatus } from '@/lib/billing/debt-status';
import type { DebtByStreet } from '@/lib/billing/debt-by-street';

/** Most to least owed, the colours of the committee's debt chart (#1347). */
export const DEBT_STATUS_COLORS: Record<DebtStatus, string> = {
  arrears: '#C00000',
  outstanding: '#ED7D31',
  paid_in_full: '#2F5597',
  credit: '#00703C',
};

const asAtFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** "154 houses: Arrears 95 · Outstanding 10 · Paid in Full 10 · Credit 39" */
export function debtTotalsLine(data: DebtByStreet): string {
  const parts = DEBT_STATUSES.map((status) => `${data.labels[status]} ${data.totals[status]}`);
  return `${data.totalHouses} ${data.totalHouses === 1 ? 'house' : 'houses'}: ${parts.join(' · ')}`;
}

interface DebtStatusByStreetChartProps {
  data: DebtByStreet | null | undefined;
  isLoading?: boolean;
  error?: Error | null;
}

/** Stacked horizontal bars: one bar per street, one segment per debt status, counts inside. */
export function DebtStatusByStreetChart({ data, isLoading, error }: DebtStatusByStreetChartProps) {
  const header = (description: string) => (
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Home className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div>
          <CardTitle className="text-base">
            Houses by debt status and street
            {data ? ` (as at ${asAtFormat.format(new Date(data.asAt))})` : ''}
          </CardTitle>
          <CardDescription className="text-xs" data-testid="debt-by-street-totals">{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
  );

  if (isLoading && !data) {
    return (
      <Card>
        {header('Loading debt status')}
        <CardContent><ShimmerSkeleton className="h-72 w-full" /></CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        {header('Debt status unavailable')}
        <CardContent><p className="text-sm text-muted-foreground" role="alert">{error.message}</p></CardContent>
      </Card>
    );
  }

  if (!data || data.streets.length === 0) {
    return (
      <Card>
        {header('No houses to show')}
        <CardContent><p className="text-sm text-muted-foreground">No lived-in house with a primary resident has a debt status yet.</p></CardContent>
      </Card>
    );
  }

  const rows = data.streets.map((street) => ({
    name: `${street.streetName} (${street.total} ${street.total === 1 ? 'house' : 'houses'})`,
    ...street.counts,
  }));

  return (
    <Card className="animate-fade-in-up">
      {header(debtTotalsLine(data))}
      <CardContent>
        <div style={{ height: rows.length * 56 + 60 }} data-testid="debt-by-street-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 5 }} barCategoryGap="25%">
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={190}
                tick={{ fontSize: 12 }}
                tickLine={false}
                className="text-muted-foreground"
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend verticalAlign="bottom" iconType="square" wrapperStyle={{ fontSize: 12 }} />
              {DEBT_STATUSES.map((status) => (
                <Bar
                  key={status}
                  dataKey={status}
                  name={data.labels[status]}
                  stackId="houses"
                  fill={DEBT_STATUS_COLORS[status]}
                  stroke="hsl(var(--card))"
                  strokeWidth={1}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey={status}
                    position="center"
                    fill="#ffffff"
                    fontSize={12}
                    fontWeight={600}
                    formatter={(value: number) => (value > 0 ? value : '')}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
