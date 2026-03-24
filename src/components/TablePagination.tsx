import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;
const SIBLING_COUNT = 1; // pages shown on each side of current page

interface TablePaginationProps {
  totalItems: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
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

export function TablePagination({ totalItems, currentPage, onPageChange, pageSize = PAGE_SIZE, className }: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  if (totalItems <= pageSize) return null;

  const pages = getPageRange(currentPage, totalPages);

  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', className)}>
      <p className="text-sm text-muted-foreground whitespace-nowrap">
        Showing {start}–{end} of {totalItems}
      </p>
      <Pagination>
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
    </div>
  );
}

export { PAGE_SIZE };
