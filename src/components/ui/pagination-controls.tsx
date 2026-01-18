'use client';

import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalCount: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageSizeOptions?: number[];
    disabled?: boolean;
}

export function PaginationControls({
    currentPage,
    totalPages,
    pageSize,
    totalCount,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 50, 100],
    disabled = false,
}: PaginationControlsProps) {
    // Calculate display range
    const startRow = (currentPage - 1) * pageSize + 1;
    const endRow = Math.min(currentPage * pageSize, totalCount);

    return (
        <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Rows per page</p>
                    <Select
                        value={pageSize.toString()}
                        onValueChange={(value) => onPageSizeChange(Number(value))}
                        disabled={disabled}
                    >
                        <SelectTrigger className="h-8 w-[70px]">
                            <SelectValue placeholder={pageSize.toString()} />
                        </SelectTrigger>
                        <SelectContent side="top">
                            {pageSizeOptions.map((size) => (
                                <SelectItem key={size} value={size.toString()}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex max-w-[200px] items-center text-sm font-medium">
                    {totalCount > 0 ? (
                        <span>
                            Showing {startRow}-{endRow} of {totalCount}
                        </span>
                    ) : (
                        <span>No rows to display</span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1 || disabled}
                    title="First page"
                >
                    <span className="sr-only">Go to first page</span>
                    <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1 || disabled}
                    title="Previous page"
                >
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center justify-center text-sm font-medium w-[80px]">
                    Page {currentPage} of {Math.max(1, totalPages)}
                </div>
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || totalPages === 0 || disabled}
                    title="Next page"
                >
                    <span className="sr-only">Go to next page</span>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages || totalPages === 0 || disabled}
                    title="Last page"
                >
                    <span className="sr-only">Go to last page</span>
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
