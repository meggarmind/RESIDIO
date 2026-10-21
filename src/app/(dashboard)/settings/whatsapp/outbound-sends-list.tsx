'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getWhatsAppOutboundSends } from '@/actions/whatsapp/admin-console';
import { OUTBOUND_SENDS_PAGE_SIZE } from '@/lib/whatsapp/outbound-send-list';

const STATUS_LABELS: Record<string, string> = { pending: 'Pending', sent: 'Sent', delivered: 'Delivered', failed: 'Failed' };

function formatDate(value: string) { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export function OutboundSendsList() {
  const [status, setStatus] = useState('');
  const [purpose, setPurpose] = useState('');
  const [page, setPage] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-outbound-sends', status, purpose, page],
    queryFn: () => getWhatsAppOutboundSends({ status, purpose, page }),
  });
  const rows = data?.data?.rows ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / OUTBOUND_SENDS_PAGE_SIZE));

  return <Card id="sent-messages">
    <CardHeader><CardTitle>Sent messages</CardTitle><CardDescription>Every WhatsApp message the app sends, assistant replies included. Message text is not stored, so it is not shown. Kept for 90 days.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Status" className="h-9 rounded-md border bg-background px-2 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Purpose" className="h-9 rounded-md border bg-background px-2 text-sm" value={purpose} onChange={(event) => { setPurpose(event.target.value); setPage(0); }}>
          <option value="">Replies and notifications</option>
          <option value="inbound_reply">Replies</option>
          <option value="notification">Notifications</option>
        </select>
      </div>
      {data && !data.success ? <p className="text-sm text-destructive">{data.error}</p> : null}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Time</th><th className="pb-2 pr-4">Purpose</th><th className="pb-2 pr-4">Resident</th><th className="pb-2 pr-4">Number</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Error</th><th className="pb-2">Answering</th></tr></thead><tbody>
        {rows.length === 0 ? <tr><td colSpan={7} className="py-3 text-muted-foreground">{isLoading ? 'Loading...' : 'No sent messages.'}</td></tr> : rows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.created_at)}</td><td className="py-3 pr-4">{row.purpose === 'notification' ? 'Notification' : 'Reply'}</td><td className="py-3 pr-4">{row.resident ? `${row.resident.first_name} ${row.resident.last_name}` : 'Unknown'}</td><td className="py-3 pr-4 font-mono text-xs">{row.maskedPhone}</td><td className="py-3 pr-4"><Badge variant={row.status === 'failed' ? 'destructive' : row.status === 'delivered' ? 'default' : 'secondary'}>{STATUS_LABELS[row.status] ?? row.status}</Badge></td><td className="py-3 pr-4 text-xs">{row.error_code || '-'}</td><td className="py-3 font-mono text-xs">{row.inbound_message_id || '-'}</td></tr>)}
      </tbody></table></div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} sends, page {page + 1} of {pages}</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>
      </div>
    </CardContent>
  </Card>;
}
