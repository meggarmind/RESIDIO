'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { AnnouncementForm } from '@/components/announcements';
import { useAnnouncement, useUpdateAnnouncement } from '@/hooks/use-announcements';
import { toast } from 'sonner';

export default function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { data: announcement, isLoading, error } = useAnnouncement(resolvedParams.id);
  const updateMutation = useUpdateAnnouncement();

  const handleSubmit = async (data: Parameters<typeof updateMutation.mutateAsync>[0]['data']) => {
    try {
      await updateMutation.mutateAsync({ id: resolvedParams.id, data });
      toast.success('Announcement updated');
      router.push(`/announcements/${resolvedParams.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update announcement');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton className="h-96 w-full" />
          </div>
          <div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !announcement) {
    notFound();
  }

  // Only allow editing drafts
  if (announcement.status !== 'draft') {
    router.push(`/announcements/${resolvedParams.id}`);
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto py-6">
      <AnnouncementForm
        announcement={announcement}
        onSubmit={handleSubmit}
        isSubmitting={updateMutation.isPending}
        mode="edit"
      />
    </div>
  );
}
