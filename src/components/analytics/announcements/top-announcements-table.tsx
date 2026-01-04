'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import type { TopAnnouncement } from '@/actions/announcements/analytics';

interface TopAnnouncementsTableProps {
  data: TopAnnouncement[] | null;
  isLoading?: boolean;
}

const priorityColors = {
  emergency: 'destructive',
  high: 'warning',
  normal: 'default',
  low: 'secondary',
} as const;

/**
 * Top Announcements Table
 *
 * Shows the highest-performing announcements ranked by engagement rate.
 * Displays engagement as both percentage and progress bar for visual clarity.
 */
export function TopAnnouncementsTable({ data, isLoading }: TopAnnouncementsTableProps) {
  if (isLoading) {
    return <TableSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Top Announcements</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            No announcement data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-600" />
          <div>
            <CardTitle className="text-base">Top Announcements</CardTitle>
            <CardDescription className="text-xs">
              Highest engagement rates by reads
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead className="min-w-[200px]">Announcement</TableHead>
                <TableHead className="w-[100px]">Category</TableHead>
                <TableHead className="w-[80px]">Priority</TableHead>
                <TableHead className="w-[100px] text-right">Reads</TableHead>
                <TableHead className="w-[150px]">Engagement</TableHead>
                <TableHead className="w-[110px]">Published</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((announcement, index) => (
                <TableRow key={announcement.id}>
                  {/* Rank */}
                  <TableCell className="font-medium text-muted-foreground">
                    {index + 1}
                  </TableCell>

                  {/* Title */}
                  <TableCell>
                    <div className="font-medium truncate max-w-[300px]">
                      {announcement.title}
                    </div>
                  </TableCell>

                  {/* Category */}
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {announcement.category_name || 'None'}
                    </Badge>
                  </TableCell>

                  {/* Priority */}
                  <TableCell>
                    <Badge
                      variant={priorityColors[announcement.priority as keyof typeof priorityColors] || 'default'}
                      className="text-xs"
                    >
                      {announcement.priority}
                    </Badge>
                  </TableCell>

                  {/* Reads */}
                  <TableCell className="text-right text-sm">
                    <div className="flex flex-col items-end">
                      <span className="font-medium">{announcement.read_count}</span>
                      <span className="text-xs text-muted-foreground">
                        / {announcement.target_count}
                      </span>
                    </div>
                  </TableCell>

                  {/* Engagement */}
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {announcement.engagement_rate.toFixed(1)}%
                        </span>
                        {announcement.engagement_rate >= 70 && (
                          <TrendingUp className="h-3 w-3 text-emerald-600" />
                        )}
                      </div>
                      <Progress
                        value={announcement.engagement_rate}
                        className="h-1.5"
                      />
                    </div>
                  </TableCell>

                  {/* Published Date */}
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(announcement.published_at), 'MMM d, yyyy')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
