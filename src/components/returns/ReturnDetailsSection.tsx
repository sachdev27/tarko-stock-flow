import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { SearchableCombobox } from '../dispatch/SearchableCombobox';
import { cn } from '@/lib/utils';

interface Customer {
  id: string;
  name: string;
  city?: string;
  [key: string]: unknown;
}

interface ReturnDetailsProps {
  customerId: string;
  onCustomerChange: (id: string) => void;
  returnDate: Date;
  onReturnDateChange: (date: Date) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  customers: Customer[];
  onCreateCustomer: (name: string) => Promise<Customer | void>;
  customerRef?: React.RefObject<HTMLDivElement>;
}

export const ReturnDetailsSection = ({
  customerId,
  onCustomerChange,
  returnDate,
  onReturnDateChange,
  notes,
  onNotesChange,
  customers,
  onCreateCustomer,
  customerRef
}: ReturnDetailsProps) => {
  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h3 className="font-semibold text-lg">Return Details</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Customer */}
        <div ref={customerRef}>
          <Label>
            Customer <span className="text-red-500">*</span>
          </Label>
          <SearchableCombobox
            value={customerId}
            onChange={onCustomerChange}
            options={customers}
            onCreateNew={onCreateCustomer}
            placeholder="Search or create customer"
            displayFormat={(c) => (c.city ? `${c.name} - ${c.city}` : c.name)}
            searchFields={['name', 'city']}
          />
        </div>

        {/* Return Date */}
        <div>
          <Label>
            Return Date <span className="text-red-500">*</span>
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !returnDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {returnDate ? format(returnDate, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={returnDate}
                onSelect={(date) => date && onReturnDateChange(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Notes */}
        <div className="md:col-span-2">
          <Label>Notes (Optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Any notes about this return..."
            rows={2}
          />
        </div>
      </div>
    </div>
  );
};
