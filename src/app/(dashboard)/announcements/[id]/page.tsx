'use client';

import { use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  AnnouncementStatusBadge,
  AnnouncementPriorityBadge,
  TargetAudienceBadge,
  ReadReceiptStats,
} from '@/components/announcements';
import {
  useAnnouncement,
  usePublishAnnouncement,
  useUnpublishAnnouncement,
  useArchiveAnnouncement,
  useDeleteAnnouncement,
} from '@/hooks/use-announcements';
import {
  ArrowLeft,
  Pencil,
  Send,
  Archive,
  Trash2,
  Clock,
  User,
  Calendar,
  Pin,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { data: announcement, isLoading, error } = useAnnouncement(resolvedParams.id);

  const publishMutation = usePublishAnnouncement();
  const unpublishMutation = useUnpublishAnnouncement();
  const archiveMutation = useArchiveAnnouncement();
  const deleteMutation = useDeleteAnnouncement();

  const handlePublish = async () => {
    try {
      await publishMutation.mutateAsync(resolvedParams.id);
      toast.success('Announcement published');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to publish');
    }
  };

  const handleUnpublish = async () => {
    try {
      await unpublishMutation.mutateAsync(resolvedParams.id);
      toast.success('Announcement unpublished');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to unpublish');
    }
  };

  const handleArchive = async () => {
    try {
      await archiveMutation.mutateAsync(resolvedParams.id);
      toast.success('Announcement archived');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(resolvedParams.id);
      toast.success('Announcement deleted');
      router.push('/announcements');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (error || !announcement) {
    notFound();
  }

  const status = announcement.status || 'draft';
  const canEdit = status === 'draft';
  const canPublish = status === 'draft';
  const canUnpublish = status === 'published';
  const canArchive = status === 'draft' || status === 'published';
  const canDelete = status === 'draft';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/announcements">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{announcement.title}</h1>
            {announcement.is_pinned && <Pin className="h-4 w-4 text-amber-500" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href={`/announcements/${resolvedParams.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
          {canPublish && (
            <Button onClick={handlePublish} disabled={publishMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              Publish Now
            </Button>
          )}
          {canUnpublish && (
            <Button variant="outline" onClick={handleUnpublish} disabled={unpublishMutation.isPending}>
              <X className="mr-2 h-4 w-4" />
              Unpublish
            </Button>
          )}
          {canArchive && (
            <Button variant="outline" onClick={handleArchive} disabled={archiveMutation.isPending}>
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this announcement? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AnnouncementStatusBadge status={status} />
                <AnnouncementPriorityBadge priority={announcement.priority || 'normal'} />
                <TargetAudienceBadge audience={announcement.target_audience || 'all'} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {announcement.summary && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">{announcement.summary}</p>
                </div>
              )}
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="whitespace-pre-wrap">{announcement.content}</p>
              </div>
            </CardContent>
          </Card>

          {/* Read Stats - only for published announcements */}
          {status === 'published' && (
            <ReadReceiptStats announcementId={resolvedParams.id} />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {announcement.scheduled_for && (
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Scheduled For</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(announcement.scheduled_for), 'PPP p')}
                    </p>
                  </div>
                </div>
              )}
              {announcement.published_at && (
                <div className="flex items-start gap-3">
                  <Send className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Published</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(announcement.published_at), 'PPP p')}
                    </p>
                  </div>
                </div>
              )}
              {announcement.expires_at && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Expires</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(announcement.expires_at), 'PPP p')}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {announcement.created_at
                      ? format(new Date(announcement.created_at), 'PPP p')
                      : '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
