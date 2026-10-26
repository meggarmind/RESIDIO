import { getCollections } from '@/actions/collections/collections';
import { CollectionsClient } from '@/components/collections/collections-client';

export default async function CollectionsPage() {
  const { data, error } = await getCollections();
  return <CollectionsClient collections={data ?? []} error={error} />;
}
