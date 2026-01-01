'use client';

import { useRouter } from 'next/navigation';
import { AnnouncementForm } from '@/components/announcements';
import { useCreateAnnouncement } from '@/hooks/use-announcements';
import { toast } from 'sonner';

export default function NewAnnouncementPage() {
  const router = useRouter();
  const createMutation = useCreateAnnouncement();

  const handleSubmit = async (data: Parameters<typeof createMutation.mutateAsync>[0]) => {
    try {
      const announcement = await createMutation.mutateAsync(data);
      toast.success('Announcement created');
      router.push(`/announcements/${announcement?.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create announcement');
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6">
      <AnnouncementForm
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        mode="create"
      />
    </div>
  );
}
