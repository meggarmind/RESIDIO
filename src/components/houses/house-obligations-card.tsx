'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getHouseObligations } from '@/actions/houses/get-house-obligations';
import { DUES_REMINDER_TARGET_LABELS, type DuesReminderTarget } from '@/lib/billing/landlord-dues';
import { formatDay } from '@/lib/whatsapp/assistant-format';
import { formatCurrency } from '@/lib/utils';

/** Obligations of this house by role (#1196): occupant dues and landlord levies, who paid, and the landlord-pays setting. */
export function HouseObligationsCard({ houseId }: { houseId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['house-obligations', houseId],
    queryFn: async () => {
      const result = await getHouseObligations(houseId);
      if (result.error || !result.data) throw new Error(result.error || 'Could not load obligations');
      return result.data;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Obligations by role</CardTitle>
        <CardDescription>What the occupant owes in dues, what the landlord owes in levies, and who paid.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <Skeleton className="h-32 w-full" />}
        {error && <p className="text-sm text-destructive" role="alert">{error.message}</p>}
        {data && (
          <>
            <p className="text-sm">
              <span className="font-medium">Dues paid by landlord: </span>
              {data.duesPaidByLandlord
                ? `Yes. Reminders go to ${(DUES_REMINDER_TARGET_LABELS[data.duesReminderTarget as DuesReminderTarget] ?? data.duesReminderTarget).toLowerCase()}.`
                : 'No. The occupant pays their own dues.'}
            </p>

            {data.groups.map((group) => (
              <section key={group.role} className="space-y-3" aria-label={group.label}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Owed {formatCurrency(group.outstanding)} of {formatCurrency(group.billed)} billed
                  </p>
                </div>
                {group.parties.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody is billed for this today.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {group.parties.map((party) => (
                      <li key={party.id} className="space-y-1 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {party.name}
                            {party.current && <Badge variant="secondary" className="ml-2">Billed now</Badge>}
                          </span>
                          <span className="text-sm tabular-nums">
                            {party.outstanding > 0 ? `Owes ${formatCurrency(party.outstanding)}` : 'Nothing owed'}
                          </span>
                        </div>
                        {party.byCategory.map((row) => (
                          <p key={row.code} className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                            <span>{row.name}</span>
                            <span>{formatCurrency(row.paid)} paid of {formatCurrency(row.billed)}</span>
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <section className="space-y-3" aria-label="Who paid">
              <h3 className="text-sm font-semibold">Who paid</h3>
              {data.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded for this house.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {data.payments.map((source) => (
                    <li key={`${source.creditedToId}|${source.paidByName ?? ''}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <span>
                        {source.paidByName ? <>{source.paidByName} paid for <span className="font-medium">{source.creditedToName}</span></> : <span className="font-medium">{source.creditedToName}</span>}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {source.count} {source.count === 1 ? 'payment' : 'payments'}, last {formatDay(source.lastDate)}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatCurrency(source.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
