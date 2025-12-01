// Pagination controls component
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onFirstPage: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onLastPage: () => void;
}

export const PaginationControls = ({
  currentPage,
  totalPages,
  onFirstPage,
  onPrevPage,
  onNextPage,
  onLastPage,
}: PaginationControlsProps) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <Button
        variant="outline"
        size="sm"
        onClick={onFirstPage}
        disabled={currentPage === 1}
      >
        <ChevronsLeft className="h-4 w-4" />
        <span className="ml-2 hidden sm:inline">First</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onPrevPage}
        disabled={currentPage === 1}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="ml-2 hidden sm:inline">Previous</span>
      </Button>

      <div className="flex items-center gap-2 px-4">
        <span className="text-sm">
          Page <span className="font-medium">{currentPage}</span> of{' '}
          <span className="font-medium">{totalPages}</span>
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onNextPage}
        disabled={currentPage === totalPages}
      >
        <span className="mr-2 hidden sm:inline">Next</span>
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onLastPage}
        disabled={currentPage === totalPages}
      >
        <span className="mr-2 hidden sm:inline">Last</span>
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
