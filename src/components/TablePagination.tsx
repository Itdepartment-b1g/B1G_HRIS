import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

interface TablePaginationProps {
  totalItems: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  className?: string;
}

export function TablePagination({ totalItems, currentPage, onPageChange, pageSize = PAGE_SIZE, className }: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  if (totalItems <= pageSize) return null;

  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', className)}>
      <p className="text-sm text-muted-foreground">
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
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <PaginationItem key={p}>
              <PaginationLink
                href="#"
                onClick={(e) => { e.preventDefault(); onPageChange(p); }}
                isActive={currentPage === p}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ))}
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
