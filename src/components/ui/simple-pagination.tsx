'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// URL-based pagination props (uses router for navigation)
interface UrlPaginationProps {
    currentPage: number;
    totalCount: number;
    pageSize: number;
    totalPages?: never;
    onPageChange?: never;
}

// State-based pagination props (uses callback for navigation)
interface StatePaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalCount?: never;
    pageSize?: never;
}

type PaginationProps = UrlPaginationProps | StatePaginationProps;

// Export as both Pagination and SimplePagination for backwards compatibility
export function Pagination(props: PaginationProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const { currentPage } = props;

    // Determine if using state-based or URL-based pagination
    const isStateBased = 'totalPages' in props && props.totalPages !== undefined;

    const totalPages = isStateBased
        ? props.totalPages
        : Math.ceil((props as UrlPaginationProps).totalCount / (props as UrlPaginationProps).pageSize);

    const handlePageChange = (page: number) => {
        if (isStateBased && props.onPageChange) {
            props.onPageChange(page);
        } else {
            const params = new URLSearchParams(searchParams);
            params.set('page', page.toString());
            router.push(`${pathname}?${params.toString()}`);
        }
    };

    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-end space-x-2 py-4">
            <div className="text-sm text-muted-foreground mr-4">
                Page {currentPage} of {totalPages}
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
            >
                <ChevronLeft className="h-4 w-4" />
                Previous
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
            >
                Next
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    );
}

// Alias for backwards compatibility
export { Pagination as SimplePagination };
