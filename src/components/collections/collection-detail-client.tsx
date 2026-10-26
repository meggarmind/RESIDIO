'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, HandCoins, Package, Target, Users, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Can, useCan } from '@/components/auth/can';
import { EnhancedPageHeader, EnhancedStatCard, EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { CollectionFormDialog } from '@/components/collections/collection-form-dialog';
import { EMPTY_NOTIFIED_PARTY, NotifiedPartyFields } from '@/components/collections/notified-party-fields';
import { RecordPaymentDialog } from '@/components/collections/record-payment-dialog';
import { MoveToBillingDialog } from '@/components/collections/move-to-billing-dialog';
import {
  addCollectionNotifiedParty,
  removeCollectionNotifiedParty,
  reverseCollectionPayment,
  setCollectionItemGiven,
  type CollectionDetail,
  type NotifiedPartyInput,
} from '@/actions/collections/collections';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  buildCollectionPaymentsCsv,
  COLLECTION_PAYMENT_METHOD_LABELS,
  COLLECTION_TYPE_LABELS,
  houseLabel,
  payerName,
  type CollectionPayment,
  type NotifiedParty,
} from '@/lib/collections/ledger';
import { formatDay } from '@/lib/whatsapp/assistant-format';
import { formatCurrency } from '@/lib/utils';

const ALL = 'all';

function channelsLabel(party: NotifiedParty): string {
  return party.channels.map((channel) => ({ email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' })[channel]).join(', ');
}

/** One collection: its report, its payments (filter, export, mark given, reverse) and its notified parties. */
export function CollectionDetailClient({ detail }: { detail: CollectionDetail }) {
  const router = useRouter();
  const { collection, summary, payments, notifiedParties, paymentParties } = detail;
  const isItem = collection.collection_type === 'item_purchase';
  const canManage = useCan(PERMISSIONS.COLLECTIONS_MANAGE);
  const canCreatePayments = useCan(PERMISSIONS.PAYMENTS_CREATE);

  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reversing, setReversing] = useState<CollectionPayment | null>(null);
  const [movingToBilling, setMovingToBilling] = useState<CollectionPayment | null>(null);
  const [reason, setReason] = useState('');
  const [addingParty, setAddingParty] = useState(false);
  const [party, setParty] = useState<NotifiedPartyInput>(EMPTY_NOTIFIED_PARTY);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [payerType, setPayerType] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((payment) => {
      if (term && ![payerName(payment.payer), payment.receipt_number, payment.reference ?? '', payment.item_reference ?? ''].some((text) => text.toLowerCase().includes(term))) return false;
      if (payerType !== ALL && (payerType === 'resident') !== Boolean(payment.payer?.resident_id)) return false;
      if (method !== ALL && payment.method !== method) return false;
      if (status === 'received' && payment.reversed_at) return false;
      if (status === 'reversed' && !payment.reversed_at) return false;
      if (status === 'not_given' && (payment.reversed_at || payment.given_at)) return false;
      return true;
    });
  }, [payments, search, payerType, method, status]);

  const run = async (action: () => Promise<{ error: string | null }>, success: string) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    toast.success(success);
    router.refresh();
    return true;
  };

  const exportCsv = () => {
    const blob = new Blob([buildCollectionPaymentsCsv(shown)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${collection.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-payments.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title={collection.name}
        description={collection.description || `${COLLECTION_TYPE_LABELS[collection.collection_type]}. Opens ${formatDay(collection.opens_on)}${collection.closes_on ? `, closes ${formatDay(collection.closes_on)}` : ''}.`}
        icon={HandCoins}
        backHref="/collections"
        backLabel="Back to collections"
        actions={
          <Can permission={PERMISSIONS.COLLECTIONS_MANAGE}>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(true)} className="gap-2 max-md:min-h-11">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button onClick={() => setRecording(true)} disabled={!collection.is_active} className="gap-2 max-md:min-h-11">
                <Plus className="h-4 w-4" /> Record payment
              </Button>
            </div>
          </Can>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{COLLECTION_TYPE_LABELS[collection.collection_type]}</Badge>
        <Badge variant={collection.is_active ? 'secondary' : 'outline'}>{collection.is_active ? 'Open' : 'Closed'}</Badge>
        {isItem && (
          <Badge variant="outline" className="tabular-nums">
            {formatCurrency(Number(collection.item_price))} per item
            {collection.non_resident_price ? `, ${formatCurrency(Number(collection.non_resident_price))} for non-residents` : ''}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <EnhancedStatCard title="Total received" value={formatCurrency(summary.total)} icon={HandCoins} animate={false} />
        <EnhancedStatCard title="Payers" icon={Users} value={summary.payerCount} description={`${summary.paymentCount} payments`} animate={false} />
        {isItem ? (
          <>
            <EnhancedStatCard title="Items sold" icon={Package} value={summary.itemsSold ?? 0} animate={false} />
            <EnhancedStatCard title="Not yet given" icon={CheckCircle2} value={summary.itemsNotGiven ?? 0} accentColor={summary.itemsNotGiven ? 'warning' : 'default'} animate={false} />
          </>
        ) : (
          <EnhancedStatCard
            title="Target"
            icon={Target}
            value={summary.targetPercent != null ? `${summary.targetPercent}%` : 'No target'}
            description={collection.target_amount ? `of ${formatCurrency(Number(collection.target_amount))}` : undefined}
            animate={false}
          />
        )}
      </div>

      <EnhancedTableCard title="Payments" animate={false} actions={
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={shown.length === 0} className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      }>
        <div className="space-y-4 p-4">
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payer, receipt or reference" className="pl-9" aria-label="Search payments" />
            </div>
            <Select value={payerType} onValueChange={setPayerType}>
              <SelectTrigger className="md:w-40" aria-label="Payer type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All payers</SelectItem>
                <SelectItem value="resident">Residents</SelectItem>
                <SelectItem value="non_resident">Non-residents</SelectItem>
              </SelectContent>
            </Select>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="md:w-40" aria-label="Method"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All methods</SelectItem>
                {Object.entries(COLLECTION_PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="md:w-40" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="reversed">Reversed</SelectItem>
                {isItem && <SelectItem value="not_given">Not yet given</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {payments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payment matches these filters.</p>
          ) : (
            <Table stack>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>House</TableHead>
                  {isItem && <TableHead className="text-right">Quantity</TableHead>}
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((payment) => (
                  <TableRow key={payment.id} className={payment.reversed_at ? 'text-muted-foreground' : undefined}>
                    <TableCell label="Receipt" className="font-mono text-xs">{payment.receipt_number}</TableCell>
                    <TableCell label="Date">{formatDay(payment.payment_date)}</TableCell>
                    <TableCell label="Payer">
                      {payerName(payment.payer)}
                      <span className="ml-1 text-xs text-muted-foreground">{payment.payer?.resident_id ? '' : '(non-resident)'}</span>
                      {(paymentParties[payment.id] ?? []).length > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          Notified: {(paymentParties[payment.id] ?? []).map((p) => p.name).join(', ')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell label="House">{houseLabel(payment.house) || '—'}</TableCell>
                    {isItem && <TableCell label="Quantity" className="text-right tabular-nums">{payment.quantity}</TableCell>}
                    <TableCell label="Amount" className="text-right tabular-nums">{formatCurrency(Number(payment.amount))}</TableCell>
                    <TableCell label="Method">{COLLECTION_PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</TableCell>
                    <TableCell label="Status">
                      {payment.reversed_at ? (
                        <Badge variant="outline" title={payment.reversal_reason ?? undefined}>Reversed</Badge>
                      ) : isItem ? (
                        <Badge variant={payment.given_at ? 'secondary' : 'outline'}>{payment.given_at ? `Given ${formatDay(payment.given_at)}` : 'Not given'}</Badge>
                      ) : (
                        <Badge variant="secondary">Received</Badge>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {!payment.reversed_at && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${payment.receipt_number}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isItem && (
                                <DropdownMenuItem
                                  disabled={busy}
                                  onSelect={() => run(() => setCollectionItemGiven(payment.id, !payment.given_at), payment.given_at ? 'Marked not given' : 'Marked given')}
                                >
                                  {payment.given_at ? 'Mark not given' : 'Mark items given'}
                                </DropdownMenuItem>
                              )}
                              {canCreatePayments && (
                                <DropdownMenuItem onSelect={() => setMovingToBilling(payment)}>
                                  Move to billing
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive" onSelect={() => { setReason(''); setReversing(payment); }}>
                                Reverse payment
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </EnhancedTableCard>

      {isItem && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Notified parties</CardTitle>
              <CardDescription>Told about every payment into this collection. Optional.</CardDescription>
            </div>
            <Can permission={PERMISSIONS.COLLECTIONS_MANAGE}>
              <Button variant="outline" size="sm" onClick={() => { setParty(EMPTY_NOTIFIED_PARTY); setAddingParty(true); }} className="gap-2">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </Can>
          </CardHeader>
          <CardContent>
            {notifiedParties.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody is notified. Payments send no extra message.</p>
            ) : (
              <ul className="divide-y">
                {notifiedParties.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-4 py-2">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{channelsLabel(p)}</p>
                    </div>
                    <Can permission={PERMISSIONS.COLLECTIONS_MANAGE}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${p.name}`}
                        disabled={busy}
                        onClick={() => run(() => removeCollectionNotifiedParty(p.id), 'Notified party removed')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Can>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {recording && <RecordPaymentDialog collection={collection} open={recording} onOpenChange={setRecording} />}
      {movingToBilling && <MoveToBillingDialog payment={movingToBilling} onOpenChange={(open) => !open && setMovingToBilling(null)} />}
      {editing && <CollectionFormDialog collection={collection} open={editing} onOpenChange={setEditing} />}

      <Dialog open={reversing !== null} onOpenChange={(open) => !open && setReversing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse payment {reversing?.receipt_number}</DialogTitle>
            <DialogDescription>
              The payment stays on the list as reversed and leaves every total. Record it again if it belongs elsewhere.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it reversed?" aria-label="Reason" />
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                if (reversing && (await run(() => reverseCollectionPayment(reversing.id, reason), 'Payment reversed'))) setReversing(null);
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reverse
            </Button>
            <Button variant="outline" onClick={() => setReversing(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addingParty} onOpenChange={setAddingParty}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add notified party</DialogTitle>
            <DialogDescription>Gets a message for every payment into {collection.name}. No login needed.</DialogDescription>
          </DialogHeader>
          <NotifiedPartyFields idPrefix="collection-party" value={party} onChange={setParty} />
          <DialogFooter className="gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                if (await run(() => addCollectionNotifiedParty(collection.id, party), 'Notified party added')) setAddingParty(false);
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button variant="outline" onClick={() => setAddingParty(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
