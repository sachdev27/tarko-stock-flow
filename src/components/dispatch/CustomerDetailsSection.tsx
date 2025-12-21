import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { SearchableCombobox } from './SearchableCombobox';
import { cn } from '@/lib/utils';

interface CustomerDetailsProps {
  customerId: string;
  onCustomerChange: (id: string) => void;
  billToId: string;
  onBillToChange: (id: string) => void;
  transportId: string;
  onTransportChange: (id: string) => void;
  vehicleId: string;
  onVehicleChange: (id: string) => void;
  dispatchDate?: Date;
  onDispatchDateChange: (date: Date | undefined) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  customers: any[];
  billToList: any[];
  transports: any[];
  vehicles: any[];
  onCreateCustomer: (name: string) => Promise<any>;
  onCreateBillTo: (name: string) => Promise<any>;
  onCreateTransport: (name: string) => Promise<any>;
  onCreateVehicle: (number: string) => Promise<any>;
  customerRef?: React.RefObject<HTMLDivElement>;
}

export const CustomerDetailsSection = ({
  customerId,
  onCustomerChange,
  billToId,
  onBillToChange,
  transportId,
  onTransportChange,
  vehicleId,
  onVehicleChange,
  dispatchDate,
  onDispatchDateChange,
  notes,
  onNotesChange,
  customers,
  billToList,
  transports,
  vehicles,
  onCreateCustomer,
  onCreateBillTo,
  onCreateTransport,
  onCreateVehicle,
  customerRef
}: CustomerDetailsProps) => {
  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h3 className="font-semibold text-lg">Customer Details</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div ref={customerRef}>
          <Label>
            Customer <span className="text-red-500">*</span>
          </Label>
          <SearchableCombobox
            value={customerId}
            onChange={onCustomerChange}
            options={customers}
            placeholder="Search or create customer (Name - City)"
            onCreateNew={onCreateCustomer}
            displayFormat={(c) => (c.city ? `${c.name} - ${c.city}` : c.name)}
          />
          <p className="text-xs text-gray-500 mt-1">Format: Name - City</p>
        </div>

        <div>
          <Label>Bill To</Label>
          <SearchableCombobox
            value={billToId}
            onChange={onBillToChange}
            options={billToList}
            placeholder="Search or create bill-to entity"
            onCreateNew={onCreateBillTo}
            displayFormat={(b) => b.name}
          />
        </div>

        <div>
          <Label>Transport</Label>
          <SearchableCombobox
            value={transportId}
            onChange={onTransportChange}
            options={transports}
            placeholder="Search or create transport"
            onCreateNew={onCreateTransport}
            displayFormat={(t) => t.name}
          />
        </div>

        <div>
          <Label>Vehicle</Label>
          <SearchableCombobox
            value={vehicleId}
            onChange={onVehicleChange}
            options={vehicles}
            placeholder="Search or create vehicle"
            onCreateNew={onCreateVehicle}
            displayFormat={(v) => v.driver_name && v.vehicle_number ? `${v.driver_name} - ${v.vehicle_number}` : v.driver_name || v.vehicle_number}
            searchFields={['driver_name', 'vehicle_number']}
          />
          <p className="text-xs text-gray-500 mt-1">Format: Driver Name - Vehicle Number</p>
        </div>

        <div>
          <Label>
            Dispatch Date <span className="text-red-500">*</span>
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !dispatchDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dispatchDate ? format(dispatchDate, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <div className="p-3 space-y-3">
                <Calendar
                  mode="single"
                  selected={dispatchDate}
                  onSelect={onDispatchDateChange}
                  initialFocus
                />
                <div className="border-t pt-3">
                  <Label className="text-sm font-medium mb-2 block">Time</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Hour</Label>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={dispatchDate?.getHours() || 0}
                        onChange={(e) => {
                          const newDate = dispatchDate ? new Date(dispatchDate) : new Date();
                          newDate.setHours(parseInt(e.target.value) || 0);
                          onDispatchDateChange(newDate);
                        }}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Minute</Label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={dispatchDate?.getMinutes() || 0}
                        onChange={(e) => {
                          const newDate = dispatchDate ? new Date(dispatchDate) : new Date();
                          newDate.setMinutes(parseInt(e.target.value) || 0);
                          onDispatchDateChange(newDate);
                        }}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div>
        <Label>Notes (Optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Any additional notes..."
          rows={2}
          className="resize-none"
        />
      </div>
    </div>
  );
};
