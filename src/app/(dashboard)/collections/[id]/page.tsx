import Link from 'next/link';
import { getCollection } from '@/actions/collections/collections';
import { CollectionDetailClient } from '@/components/collections/collection-detail-client';
import { Button } from '@/components/ui/button';

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getCollection(id);
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h1 className="text-xl font-semibold">{error === 'Collection not found' ? 'Collection not found' : 'Collection could not be loaded'}</h1>
        {error && error !== 'Collection not found' && <p className="text-sm text-muted-foreground">{error}</p>}
        <Button asChild variant="outline">
          <Link href="/collections">Back to collections</Link>
        </Button>
      </div>
    );
  }
  return <CollectionDetailClient detail={data} />;
}
