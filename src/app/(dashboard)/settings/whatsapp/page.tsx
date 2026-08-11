import { getWhatsAppOptIns, getWhatsAppPendingContacts } from '@/actions/whatsapp/identity';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ResidentSummary = {
  first_name: string;
  last_name: string;
  resident_code: string;
};

type OptInRow = {
  phone_number: string;
  opted_in: boolean;
  source: string;
  updated_at: string;
  resident: ResidentSummary | null;
};

type PendingRow = {
  phone_number: string;
  status: string;
  last_seen_at: string;
};

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function WhatsAppOperationsPage() {
  const [optInResult, pendingResult] = await Promise.all([
    getWhatsAppOptIns(),
    getWhatsAppPendingContacts(),
  ]);
  const optIns = (optInResult.data || []) as OptInRow[];
  const pendingContacts = (pendingResult.data || []) as PendingRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp Operations</h1>
        <p className="text-sm text-muted-foreground">
          Review WhatsApp consent and unrostered contacts. Financial data is not shown here.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Opt-ins</CardTitle>
            <CardDescription>{optIns.length} linked WhatsApp number(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {optIns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No WhatsApp consent records yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Resident</th>
                      <th className="pb-2 pr-4 font-medium">Number</th>
                      <th className="pb-2 pr-4 font-medium">State</th>
                      <th className="pb-2 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optIns.map((row) => (
                      <tr key={`${row.phone_number}-${row.resident?.resident_code}`} className="border-b last:border-0">
                        <td className="py-3 pr-4">
                          {row.resident ? `${row.resident.first_name} ${row.resident.last_name}` : 'Unknown'}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={row.opted_in ? 'default' : 'secondary'}>
                            {row.opted_in ? 'Opted in' : 'Opted out'}
                          </Badge>
                        </td>
                        <td className="py-3 text-xs text-muted-foreground">{formatDate(row.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending contacts</CardTitle>
            <CardDescription>{pendingContacts.length} unrostered number(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending contacts.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Number</th>
                      <th className="pb-2 pr-4 font-medium">State</th>
                      <th className="pb-2 font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingContacts.map((row) => (
                      <tr key={row.phone_number} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-mono text-xs">{maskPhone(row.phone_number)}</td>
                        <td className="py-3 pr-4"><Badge variant="secondary">{row.status}</Badge></td>
                        <td className="py-3 text-xs text-muted-foreground">{formatDate(row.last_seen_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
