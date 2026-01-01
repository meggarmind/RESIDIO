'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  usePublishedAnnouncements,
  useAnnouncementCategories,
  useMarkAnnouncementAsRead,
  useHasReadAnnouncement,
} from '@/hooks/use-announcements';
import {
  Megaphone,
  AlertTriangle,
  Info,
  Calendar,
  Search,
  ArrowLeft,
  Pin,
  Eye,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnnouncementWithRelations, AnnouncementPriority } from '@/types/database';

// Map priority to visual styles (uses 'emergency' not 'urgent')
const priorityStyles: Record<string, string> = {
  emergency: 'border-l-4 border-l-red-500',
  high: 'border-l-4 border-l-amber-500',
  normal: '',
  low: 'opacity-90',
};

const priorityBadgeStyles: Record<string, string> = {
  emergency: 'bg-red-500/20 text-red-700 dark:text-red-300',
  high: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  normal: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  low: 'bg-slate-500/20 text-slate-700 dark:text-slate-300',
};

interface AnnouncementCardProps {
  announcement: AnnouncementWithRelations;
  onRead?: () => void;
}

function AnnouncementCard({ announcement, onRead }: AnnouncementCardProps) {
  const [expanded, setExpanded] = useState(false);
  const priority = (announcement.priority || 'normal') as AnnouncementPriority;
  const publishedDate = announcement.published_at
    ? new Date(announcement.published_at)
    : announcement.created_at
      ? new Date(announcement.created_at)
      : new Date();

  const { data: readStatus } = useHasReadAnnouncement(announcement.id);
  const markAsRead = useMarkAnnouncementAsRead();
  const hasRead = readStatus?.hasRead || false;

  const handleExpand = () => {
    if (!expanded && !hasRead) {
      markAsRead.mutate(announcement.id);
      onRead?.();
    }
    setExpanded(!expanded);
  };

  return (
    <Card className={cn('transition-all hover:shadow-md', priorityStyles[priority])}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
              priority === 'emergency'
                ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
                : priority === 'high'
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400'
                  : 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
            )}
          >
            {priority === 'emergency' || priority === 'high' ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Megaphone className="h-5 w-5" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{announcement.title}</h3>
                {announcement.is_pinned && (
                  <Badge variant="secondary" className="text-xs">
                    <Pin className="h-3 w-3 mr-1" />
                    Pinned
                  </Badge>
                )}
                {hasRead && (
                  <Badge variant="outline" className="text-xs text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Read
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {priority !== 'normal' && priority !== 'low' && (
                  <Badge className={cn('text-xs capitalize', priorityBadgeStyles[priority])}>
                    {priority}
                  </Badge>
                )}
                {announcement.category && (
                  <Badge variant="outline" className="text-xs">
                    {announcement.category.name}
                  </Badge>
                )}
              </div>
            </div>

            <p
              className={cn(
                'text-sm text-muted-foreground',
                !expanded && 'line-clamp-2'
              )}
            >
              {expanded ? announcement.content : (announcement.summary || announcement.content)}
            </p>

            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span title={format(publishedDate, 'PPpp')}>
                  {formatDistanceToNow(publishedDate, { addSuffix: true })}
                </span>
                {announcement.creator && (
                  <>
                    <span className="mx-1">•</span>
                    <span>by {announcement.creator.full_name}</span>
                  </>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleExpand}
              >
                <Eye className="h-3 w-3 mr-1" />
                {expanded ? 'Show less' : 'Read more'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortalAnnouncementsPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data: announcements = [], isLoading } = usePublishedAnnouncements({ limit: 50 });
  const { data: categories = [] } = useAnnouncementCategories();

  // Filter announcements
  const filteredAnnouncements = announcements.filter((a) => {
    const matchesSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || a.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Sort: pinned first, then by date
  const sortedAnnouncements = [...filteredAnnouncements].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    const dateA = a.published_at || a.created_at || '';
    const dateB = b.published_at || b.created_at || '';
    return dateB.localeCompare(dateA);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/portal">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            Announcements
          </h1>
          <p className="text-muted-foreground text-sm">
            Stay updated with the latest estate news and updates
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search announcements..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Announcements List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedAnnouncements.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Megaphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium text-lg mb-1">No announcements found</h3>
            <p className="text-muted-foreground text-sm">
              {search || categoryFilter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Check back later for estate updates'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedAnnouncements.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} />
          ))}
        </div>
      )}
    </div>
  );
}
