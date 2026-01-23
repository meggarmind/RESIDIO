'use client';

import { Search, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface SearchStats {
    query_text: string;
    count: number;
}

interface SearchAnalyticsCardProps {
    topSearches?: SearchStats[];
    zeroResultSearches?: SearchStats[];
    isLoading?: boolean;
}

export function SearchAnalyticsCard({ topSearches, zeroResultSearches, isLoading }: SearchAnalyticsCardProps) {
    if (isLoading) {
        return <SearchAnalyticsSkeleton />;
    }

    const hasData = (topSearches?.length || 0) > 0 || (zeroResultSearches?.length || 0) > 0;

    if (!hasData) {
        return null; // Don't show if no data to avoid clutter
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Top Searches */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base font-medium">Top Searches</CardTitle>
                            <CardDescription>Most frequent queries</CardDescription>
                        </div>
                        <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {topSearches?.map((item, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{item.query_text}</span>
                                </div>
                                <span className="text-sm text-muted-foreground">{item.count} searches</span>
                            </div>
                        ))}
                        {(!topSearches || topSearches.length === 0) && (
                            <p className="text-sm text-muted-foreground">No data available</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Zero Results */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base font-medium">Content Gaps</CardTitle>
                            <CardDescription>Searches with no results</CardDescription>
                        </div>
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {zeroResultSearches?.map((item, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{item.query_text}</span>
                                </div>
                                <span className="text-sm text-muted-foreground">{item.count} times</span>
                            </div>
                        ))}
                        {(!zeroResultSearches || zeroResultSearches.length === 0) && (
                            <p className="text-sm text-muted-foreground">No content gaps found</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function SearchAnalyticsSkeleton() {
    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex justify-between">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-8" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex justify-between">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-8" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
