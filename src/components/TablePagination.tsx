import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;
const SIBLING_COUNT = 1; // pages shown on each side of current page

interface TablePaginationProps {
  totalItems: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
}

/**
 * Build the list of page numbers / ellipsis markers to render.
 * Always shows first page, last page, and a window around the current page.
 * Returns (number | 'ellipsis-start' | 'ellipsis-end')[].
 */
function getPageRange(current: number, total: number): (number | string)[] {
  // If total pages is small enough, show all
  const totalSlots = SIBLING_COUNT * 2 + 5; // siblings + current + 2 ellipsis + first + last
  if (total <= totalSlots) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - SIBLING_COUNT, 1);
  const rightSibling = Math.min(current + SIBLING_COUNT, total);

  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  const pages: (number | string)[] = [];

  // Always show first page
  pages.push(1);

  if (showLeftEllipsis) {
    pages.push('ellipsis-start');
  } else {
    // Fill pages between 1 and leftSibling
    for (let i = 2; i < leftSibling; i++) pages.push(i);
  }

  // Sibling window including current
  for (let i = leftSibling; i <= rightSibling; i++) {
    if (i !== 1 && i !== total) pages.push(i);
  }

  if (showRightEllipsis) {
    pages.push('ellipsis-end');
  } else {
    // Fill pages between rightSibling and total
    for (let i = rightSibling + 1; i < total; i++) pages.push(i);
  }

  // Always show last page
  pages.push(total);

  return pages;
}

export function TablePagination({
  totalItems,
  currentPage,
  onPageChange,
  pageSize = PAGE_SIZE,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  if (totalItems <= 0) return null;

  const pages = getPageRange(currentPage, totalPages);
  const showPageButtons = totalItems > pageSize;

  return (
    <div
      className={cn(
        // Extra right padding so Activity popup FAB does not cover Next
        'flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 pr-16 lg:pr-20',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-9 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-sm text-muted-foreground whitespace-nowrap">
          Showing {start}–{end} of {totalItems}
        </p>
      </div>
      {showPageButtons && (
        <Pagination className="mx-0 w-auto justify-start sm:justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => { e.preventDefault(); if (currentPage > 1) onPageChange(currentPage - 1); }}
                className={cn(currentPage <= 1 && 'pointer-events-none opacity-50')}
              />
            </PaginationItem>
            {pages.map((p) =>
              typeof p === 'string' ? (
                <PaginationItem key={p}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => { e.preventDefault(); onPageChange(p); }}
                    isActive={currentPage === p}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => { e.preventDefault(); if (currentPage < totalPages) onPageChange(currentPage + 1); }}
                className={cn(currentPage >= totalPages && 'pointer-events-none opacity-50')}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

export { PAGE_SIZE, PAGE_SIZE_OPTIONS };
