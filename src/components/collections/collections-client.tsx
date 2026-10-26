'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HandCoins, Plus, Search } from 'lucide-react';
import { Can } from '@/components/auth/can';
import { EnhancedPageHeader, EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CollectionFormDialog } from '@/components/collections/collection-form-dialog';
import type { CollectionListItem } from '@/actions/collections/collections';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { COLLECTION_TYPE_LABELS } from '@/lib/collections/ledger';
import { formatDay } from '@/lib/whatsapp/assistant-format';
import { formatCurrency } from '@/lib/utils';

/** Collections registry (#1194): every collection with its report line. */
export function CollectionsClient({ collections, error }: { collections: CollectionListItem[]; error: string | null }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? collections.filter((collection) => collection.name.toLowerCase().includes(term)) : collections;
  }, [collections, search]);

  const newButton = (
    <Can permission={PERMISSIONS.COLLECTIONS_MANAGE}>
      <Button onClick={() => setCreating(true)} className="gap-2 max-md:min-h-11">
        <Plus className="h-4 w-4" />
        New collection
      </Button>
    </Can>
  );

  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title="Collections"
        description="Contributions and item purchases, outside billing. They never become dues or wallet credit."
        icon={HandCoins}
        actions={newButton}
      />

      <EnhancedTableCard animate={false}>
        <div className="space-y-4 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search collections" className="pl-9" aria-label="Search collections" />
          </div>

          {error ? (
            <p className="py-8 text-center text-sm text-destructive">Collections could not be loaded: {error}</p>
          ) : collections.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <HandCoins className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">No collections yet</p>
              <p className="text-sm text-muted-foreground">Make one for each purpose, such as a party contribution or vehicle stickers.</p>
              {newButton}
            </div>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No collection matches “{search}”.</p>
          ) : (
            <Table stack>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Open</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Payers</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((collection) => (
                  <TableRow key={collection.id} className="cursor-pointer" onClick={() => router.push(`/collections/${collection.id}`)}>
                    <TableCell label="Name" className="font-medium">
                      {collection.name}
                      {!collection.is_active && <Badge variant="secondary" className="ml-2">Closed</Badge>}
                    </TableCell>
                    <TableCell label="Type">{COLLECTION_TYPE_LABELS[collection.collection_type]}</TableCell>
                    <TableCell label="Open">
                      {formatDay(collection.opens_on)}
                      {collection.closes_on ? ` to ${formatDay(collection.closes_on)}` : ''}
                    </TableCell>
                    <TableCell label="Received" className="text-right tabular-nums">{formatCurrency(collection.summary.total)}</TableCell>
                    <TableCell label="Payers" className="text-right tabular-nums">{collection.summary.payerCount}</TableCell>
                    <TableCell label="Progress" className="tabular-nums">
                      {collection.collection_type === 'item_purchase'
                        ? `${collection.summary.itemsSold} sold, ${collection.summary.itemsNotGiven} not given`
                        : collection.summary.targetPercent != null
                          ? `${collection.summary.targetPercent}% of ${formatCurrency(Number(collection.target_amount))}`
                          : 'No target'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </EnhancedTableCard>

      {creating && <CollectionFormDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
