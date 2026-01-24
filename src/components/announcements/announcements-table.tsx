'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AnnouncementStatusBadge, AnnouncementPriorityBadge, TargetAudienceBadge } from './status-badges';
import {
  useAnnouncements,
  useAnnouncementCategories,
  useDeleteAnnouncement,
  usePublishAnnouncement,
  useUnpublishAnnouncement,
  useArchiveAnnouncement,
} from '@/hooks/use-announcements';
import {
  Megaphone,
  Plus,
  Search,
  Eye,
  MoreVertical,
  Pencil,
  Trash2,
  Archive,
  Send,
  X,
  Pin,
  Clock,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import { EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { cn } from '@/lib/utils';
import type { Announcement, AnnouncementStatus, AnnouncementListParams } from '@/types/database';

const ALL_VALUE = '_all';

const AnnouncementRow = memo(function AnnouncementRow({
  announcement,
  onPublish,
  onUnpublish,
  onArchive,
  onDelete,
}: {
  announcement: Announcement;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <TableRow className="hover:bg-gray-50 dark:hover:bg-[#0F172A]">
      <TableCell>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={`/announcements/${announcement.id}`}
                className="font-medium hover:underline truncate"
              >
                {announcement.title}
              </Link>
              {announcement.is_pinned && (
                <Pin className="h-3 w-3 text-amber-500 flex-shrink-0" />
              )}
            </div>
            {announcement.summary && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {announcement.summary}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <AnnouncementStatusBadge status={announcement.status || 'draft'} />
      </TableCell>
      <TableCell>
        <AnnouncementPriorityBadge priority={announcement.priority || 'normal'} />
      </TableCell>
      <TableCell>
        <TargetAudienceBadge audience={announcement.target_audience || 'all'} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {announcement.published_at
          ? format(new Date(announcement.published_at), 'MMM d, yyyy')
          : announcement.scheduled_for
            ? (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(announcement.scheduled_for), 'MMM d, yyyy')}
              </span>
            )
            : '-'}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {announcement.created_at
          ? formatDistanceToNow(new Date(announcement.created_at), { addSuffix: true })
          : '-'}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/announcements/${announcement.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            {announcement.status === 'draft' && (
              <DropdownMenuItem asChild>
                <Link href={`/announcements/${announcement.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {(announcement.status === 'draft' || announcement.status === 'scheduled') && (
              <DropdownMenuItem onClick={() => onPublish(announcement.id)}>
                <Send className="mr-2 h-4 w-4" />
                Publish Now
              </DropdownMenuItem>
            )}
            {announcement.status === 'scheduled' && (
              <DropdownMenuItem onClick={() => onUnpublish(announcement.id)}>
                <X className="mr-2 h-4 w-4" />
                Cancel Schedule
              </DropdownMenuItem>
            )}
            {announcement.status === 'published' && (
              <DropdownMenuItem onClick={() => onUnpublish(announcement.id)}>
                <X className="mr-2 h-4 w-4" />
                Unpublish
              </DropdownMenuItem>
            )}
            {(announcement.status === 'draft' || announcement.status === 'published') && (
              <DropdownMenuItem onClick={() => onArchive(announcement.id)}>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
            )}
            {announcement.status === 'draft' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(announcement.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

export function AnnouncementsTable() {
  const [params, setParams] = useState<AnnouncementListParams>({
    status: undefined,
    search: undefined,
    category_id: undefined,
    page: 1,
    limit: 20,
  });
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | 'all'>('all');
  const [pageSize, setPageSize] = useState(20);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, error } = useAnnouncements({
    ...params,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: pageSize,
  });
  const { data: categories } = useAnnouncementCategories();

  const deleteMutation = useDeleteAnnouncement();
  const publishMutation = usePublishAnnouncement();
  const unpublishMutation = useUnpublishAnnouncement();
  const archiveMutation = useArchiveAnnouncement();

  const handlePublish = async (id: string) => {
    try {
      await publishMutation.mutateAsync(id);
      toast.success('Announcement published');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to publish');
    }
  };

  const handleUnpublish = async (id: string) => {
    try {
      await unpublishMutation.mutateAsync(id);
      toast.success('Announcement unpublished');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to unpublish');
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveMutation.mutateAsync(id);
      toast.success('Announcement archived');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      toast.success('Announcement deleted');
      setDeleteId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    }
  };

  const handleSearch = (value: string) => {
    setParams((prev) => ({ ...prev, search: value || undefined, page: 1 }));
  };

  const setPage = (page: number) => {
    setParams((prev) => ({ ...prev, page }));
  };

  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleCategoryChange = (value: string) => {
    setParams((prev) => ({
      ...prev,
      category_id: value === ALL_VALUE ? undefined : value,
      page: 1,
    }));
  };

  return (
    <EnhancedTableCard title="Announcements Management">
      <div className="space-y-4 p-4">
        {/* Integrated Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search announcements..."
                  value={params.search || ''}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9"
                />
                {params.search && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={() => handleSearch('')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              <Select
                value={params.category_id || ALL_VALUE}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All Categories</SelectItem>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button asChild>
              <Link href="/announcements/new">
                <Plus className="mr-2 h-4 w-4" />
                New Announcement
              </Link>
            </Button>
          </div>

          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as AnnouncementStatus | 'all')}
            className="w-full"
          >
            <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/50">
              <TabsTrigger value="all" className="px-4 py-2">All</TabsTrigger>
              <TabsTrigger value="draft" className="px-4 py-2">Drafts</TabsTrigger>
              <TabsTrigger value="scheduled" className="px-4 py-2">Scheduled</TabsTrigger>
              <TabsTrigger value="published" className="px-4 py-2">Published</TabsTrigger>
              <TabsTrigger value="archived" className="px-4 py-2">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="text-center py-8 text-destructive">
            Failed to load announcements: {error.message}
          </div>
        ) : !data?.data.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No announcements found</p>
            <p className="text-sm">Create your first announcement to get started</p>
            <Button asChild className="mt-4">
              <Link href="/announcements/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Announcement
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border overflow-hidden shadow-soft animate-slide-up">
              <Table variant="modern">
                <TableHeader>
                  <TableRow interactive={false}>
                    <TableHead className="min-w-[300px]">Announcement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((announcement) => (
                    <AnnouncementRow
                      key={announcement.id}
                      announcement={announcement}
                      onPublish={handlePublish}
                      onUnpublish={handleUnpublish}
                      onArchive={handleArchive}
                      onDelete={setDeleteId}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Windowed Pagination Footer */}
            <div className="mt-4 flex flex-col sm:flex-row gap-4 justify-between items-center px-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(val) => {
                      setPageSize(Number(val));
                      setParams((prev) => ({ ...prev, page: 1 }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[70px] rounded-xl">
                      <SelectValue placeholder={pageSize.toString()} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  Showing {((params.page || 1) - 1) * pageSize + 1} to{' '}
                  {Math.min((params.page || 1) * pageSize, totalCount)} of {totalCount} announcements
                </p>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((params.page || 1) - 1)}
                    disabled={(params.page || 1) === 1}
                    className="h-8 w-9 p-0 rounded-lg"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if ((params.page || 1) <= 3) {
                        pageNum = i + 1;
                      } else if ((params.page || 1) >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = (params.page || 1) - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={(params.page || 1) === pageNum ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPage(pageNum)}
                          className="h-8 w-9 p-0 rounded-lg"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((params.page || 1) + 1)}
                    disabled={(params.page || 1) >= totalPages}
                    className="h-8 w-9 p-0 rounded-lg"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this announcement? This action cannot be undone.
              Only draft announcements can be deleted.
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
    </EnhancedTableCard>
  );
}
