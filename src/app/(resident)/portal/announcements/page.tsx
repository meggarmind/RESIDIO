'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
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

// Spring physics for smooth, professional animations
const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

// Card animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.05, // 50ms stagger between cards
    },
  }),
};

// Map priority to visual styles (uses 'emergency' not 'urgent')
const priorityStyles: Record<string, string> = {
  emergency: 'border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-900/10',
  high: 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10',
  normal: 'border-l-2 border-border',
  low: 'border-l border-border opacity-90',
};

const priorityBadgeStyles: Record<string, string> = {
  emergency: 'bg-red-500/20 text-red-700 dark:text-red-300',
  high: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  normal: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  low: 'bg-slate-500/20 text-slate-700 dark:text-slate-300',
};

// Category badge colors using design guide colors
const categoryColors: Record<string, string> = {
  General: 'bg-bill-mint/20 text-bill-mint border-bill-mint/30',
  Maintenance: 'bg-bill-orange/20 text-bill-orange border-bill-orange/30',
  Events: 'bg-bill-lavender/20 text-bill-lavender border-bill-lavender/30',
  Security: 'bg-bill-coral/20 text-bill-coral border-bill-coral/30',
  Financial: 'bg-bill-teal/20 text-bill-teal border-bill-teal/30',
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

  const getCategoryColor = (categoryName: string) => {
    return categoryColors[categoryName] || 'bg-bill-mint/20 text-bill-mint border-bill-mint/30';
  };

  return (
    <Card className={cn('transition-all hover:shadow-md relative', priorityStyles[priority])}>
      {/* Unread indicator */}
      {!hasRead && (
        <div className="absolute top-4 right-4">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bill-mint opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-bill-mint" />
          </span>
        </div>
      )}

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
                  <Badge
                    variant="outline"
                    className={cn('text-xs border', getCategoryColor(announcement.category.name))}
                  >
                    {announcement.category.name}
                  </Badge>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {expanded ? (
                <motion.p
                  key="expanded"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm text-muted-foreground"
                >
                  {announcement.content}
                </motion.p>
              ) : (
                <motion.p
                  key="collapsed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-sm text-muted-foreground line-clamp-2"
                >
                  {announcement.summary || announcement.content}
                </motion.p>
              )}
            </AnimatePresence>

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
            <ShimmerSkeleton key={i} className="h-32 rounded-2xl" />
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
          {sortedAnnouncements.map((announcement, index) => (
            <motion.div
              key={announcement.id}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              custom={index}
            >
              <AnnouncementCard announcement={announcement} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
