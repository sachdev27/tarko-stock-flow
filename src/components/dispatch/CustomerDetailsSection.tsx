import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableCombobox } from './SearchableCombobox';

interface CustomerDetailsProps {
  customerId: string;
  onCustomerChange: (id: string) => void;
  billToId: string;
  onBillToChange: (id: string) => void;
  transportId: string;
  onTransportChange: (id: string) => void;
  vehicleId: string;
  onVehicleChange: (id: string) => void;
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            displayFormat={(v) => v.vehicle_number}
          />
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
