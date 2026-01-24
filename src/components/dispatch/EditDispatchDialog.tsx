import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Pencil, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { DispatchAPI } from './dispatchAPI';
import { SearchableCombobox } from './SearchableCombobox';

interface DispatchDetails {
  id: string;
  dispatch_number: string;
  dispatch_date: string;
  status: string;
  customer_id: string;
  customer_name: string;
  customer_city?: string;
  bill_to_id?: string;
  bill_to_name?: string;
  transport_id?: string;
  transport_name?: string;
  vehicle_id?: string;
  vehicle_driver?: string;
  vehicle_number?: string;
  invoice_number?: string;
  notes?: string;
}

interface EditDispatchDialogProps {
  dispatch: DispatchDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export const EditDispatchDialog = ({
  dispatch,
  open,
  onOpenChange,
  onSave,
}: EditDispatchDialogProps) => {
  const { token } = useAuth();
  const api = useMemo(() => new DispatchAPI(token || ''), [token]);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [billToId, setBillToId] = useState('');
  const [transportId, setTransportId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [dispatchDate, setDispatchDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState('');

  // Options for dropdowns
  interface ComboboxOption {
    id: string;
    [key: string]: unknown;
  }
  const [customers, setCustomers] = useState<ComboboxOption[]>([]);
  const [billToList, setBillToList] = useState<ComboboxOption[]>([]);
  const [transports, setTransports] = useState<ComboboxOption[]>([]);
  const [vehicles, setVehicles] = useState<ComboboxOption[]>([]);

  // Loading state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Initialize form with dispatch data when it changes
  useEffect(() => {
    if (dispatch) {
      console.log('🔄 Initializing form with dispatch:', dispatch);
      console.log('📅 Original dispatch_date from API:', dispatch.dispatch_date);
      setCustomerId(dispatch.customer_id || '');
      setBillToId(dispatch.bill_to_id || '');
      setTransportId(dispatch.transport_id || '');
      setVehicleId(dispatch.vehicle_id || '');
      setInvoiceNumber(dispatch.invoice_number || '');
      const dateFromDispatch = dispatch.dispatch_date ? new Date(dispatch.dispatch_date) : undefined;
      console.log('📅 Setting dispatch date:', dispatch.dispatch_date, '-> parsed:', dateFromDispatch);
      console.log('🕐 Parsed time - Hours:', dateFromDispatch?.getHours(), 'Minutes:', dateFromDispatch?.getMinutes());
      setDispatchDate(dateFromDispatch);
      setNotes(dispatch.notes || '');
    }
  }, [dispatch]);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [customersData, billToData, transportsData, vehiclesData] = await Promise.all([
        api.fetchCustomers(),
        api.fetchBillToList(),
        api.fetchTransports(),
        api.fetchVehicles(),
      ]);
      setCustomers(customersData || []);
      setBillToList(billToData || []);
      setTransports(transportsData || []);
      setVehicles(vehiclesData || []);
    } catch (error) {
      console.error('Error fetching options:', error);
      toast.error('Failed to load dropdown options');
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Fetch dropdown options when dialog opens
  useEffect(() => {
    if (open && token) {
      fetchOptions();
    }
  }, [open, token, fetchOptions]);

  const handleCreateCustomer = async (name: string) => {
    try {
      // Parse "Name - City" format
      const parts = name.split(' - ');
      const customerName = parts[0].trim();
      const city = parts.length > 1 ? parts[1].trim() : undefined;

      const newCustomer = await api.createCustomer({ name: customerName, city });
      setCustomers(prev => [...prev, newCustomer]);
      toast.success(`Customer "${customerName}" created`);
      return newCustomer;
    } catch (error) {
      toast.error('Failed to create customer');
    }
  };

  const handleCreateBillTo = async (name: string) => {
    try {
      const newBillTo = await api.createBillTo({ name });
      setBillToList(prev => [...prev, newBillTo]);
      toast.success(`Bill To "${name}" created`);
      return newBillTo;
    } catch (error) {
      toast.error('Failed to create bill-to');
    }
  };

  const handleCreateTransport = async (name: string) => {
    try {
      const newTransport = await api.createTransport({ name });
      setTransports(prev => [...prev, newTransport]);
      toast.success(`Transport "${name}" created`);
      return newTransport;
    } catch (error) {
      toast.error('Failed to create transport');
    }
  };

  const handleCreateVehicle = async (driverName: string) => {
    try {
      const newVehicle = await api.createVehicle({ driver_name: driverName, vehicle_number: '' });
      setVehicles(prev => [...prev, newVehicle]);
      toast.success(`Driver "${driverName}" created`);
      return newVehicle;
    } catch (error) {
      toast.error('Failed to create vehicle/driver');
    }
  };

  const handleSave = async () => {
    if (!dispatch) return;

    // Validation
    if (!customerId) {
      toast.error('Customer is required');
      return;
    }
    if (!dispatchDate) {
      toast.error('Dispatch date is required');
      return;
    }

    setSaving(true);
    try {
      console.log('💾 Saving dispatch with date:', dispatchDate);
      console.log('📅 ISO String being sent:', dispatchDate.toISOString());
      console.log('🕐 Hours/Minutes being sent:', dispatchDate.getHours(), dispatchDate.getMinutes());

      const result = await api.updateDispatch(dispatch.id, {
        customer_id: customerId,
        bill_to_id: billToId || null,
        transport_id: transportId || null,
        vehicle_id: vehicleId || null,
        invoice_number: invoiceNumber || null,
        dispatch_date: dispatchDate.toISOString(),
        notes: notes || null,
      });

      console.log('✅ Update result:', result);

      toast.success('Dispatch updated successfully');
      onSave();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update dispatch';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const isEditable = dispatch && !['REVERTED', 'CANCELLED'].includes(dispatch.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Dispatch: {dispatch?.dispatch_number}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : !isEditable ? (
          <div className="text-center py-8 text-gray-500">
            <p>This dispatch cannot be edited because it has been {dispatch?.status.toLowerCase()}.</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Customer */}
            <div className="space-y-2">
              <Label>
                Customer <span className="text-red-500">*</span>
              </Label>
              <SearchableCombobox
                value={customerId}
                onChange={setCustomerId}
                options={customers}
                placeholder="Search or create customer (Name - City)"
                onCreateNew={handleCreateCustomer}
                displayFormat={(c) => (c.city ? `${c.name} - ${c.city}` : c.name)}
              />
            </div>

            {/* Bill To */}
            <div className="space-y-2">
              <Label>Bill To</Label>
              <SearchableCombobox
                value={billToId}
                onChange={setBillToId}
                options={billToList}
                placeholder="Search or create bill-to entity"
                onCreateNew={handleCreateBillTo}
                displayFormat={(b) => b.name}
              />
            </div>

            {/* Transport */}
            <div className="space-y-2">
              <Label>Transport</Label>
              <SearchableCombobox
                value={transportId}
                onChange={setTransportId}
                options={transports}
                placeholder="Search or create transport"
                onCreateNew={handleCreateTransport}
                displayFormat={(t) => t.name}
              />
            </div>

            {/* Vehicle/Driver */}
            <div className="space-y-2">
              <Label>Vehicle/Driver</Label>
              <SearchableCombobox
                value={vehicleId}
                onChange={setVehicleId}
                options={vehicles}
                placeholder="Search or create driver"
                onCreateNew={handleCreateVehicle}
                displayFormat={(v) =>
                  v.driver_name && v.vehicle_number
                    ? `${v.driver_name} - ${v.vehicle_number}`
                    : v.driver_name || v.vehicle_number
                }
                searchFields={['driver_name', 'vehicle_number']}
              />
            </div>

            {/* Invoice Number */}
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Enter invoice number"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Dispatch Date <span className="text-red-500">*</span>
              </Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dispatchDate && "text-muted-foreground"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('🖱️ Date button clicked, current date:', dispatchDate);
                      setDatePickerOpen(true);
                    }}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dispatchDate ? format(dispatchDate, "PPP HH:mm") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0 z-[9999] shadow-2xl border-2"
                  align="start"
                  side="bottom"
                  sideOffset={4}                  onInteractOutside={() => {
                    console.log('👆 Clicked outside popover, closing');
                    setDatePickerOpen(false);
                  }}                  style={{
                    zIndex: 9999,
                    pointerEvents: 'auto'
                  }}
                >
                  <div
                    className="p-0 relative z-[9999]"
                    style={{ pointerEvents: 'auto' }}
                    onMouseDown={(e) => {
                      console.log('🖱️ Calendar container mousedown');
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      console.log('🖱️ Calendar container clicked');
                      e.stopPropagation();
                    }}
                  >
                    <Calendar
                      mode="single"
                      selected={dispatchDate}
                      onSelect={(newDate) => {
                        console.log('🗓️ Calendar onSelect called:', newDate);
                        console.log('📅 Current dispatchDate state:', dispatchDate);
                        if (newDate) {
                          // Create a new date object to preserve existing time
                          const existingTime = dispatchDate || new Date();
                          const updatedDate = new Date(newDate);
                          updatedDate.setHours(existingTime.getHours());
                          updatedDate.setMinutes(existingTime.getMinutes());
                          updatedDate.setSeconds(existingTime.getSeconds());
                          console.log('✅ Setting new date:', updatedDate);
                          setDispatchDate(updatedDate);
                          // Keep popover open to allow time adjustment
                        } else {
                          console.log('❌ Setting date to null/undefined');
                          setDispatchDate(newDate);
                        }
                      }}
                      onDayClick={(day, modifiers, e) => {
                        console.log('📅 Day clicked:', day, modifiers);
                        e.stopPropagation();
                      }}
                      initialFocus={false}
                      className="border-0"
                      style={{
                        zIndex: 9999,
                        pointerEvents: 'auto'
                      }}
                    />
                    <div className="border-t p-3 space-y-3" style={{ pointerEvents: 'auto' }}>
                      <Label className="text-sm font-medium">Time</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Hour</Label>
                          <input
                            type="number"
                            min="0"
                            max="23"
                            value={dispatchDate?.getHours() || 0}
                            onChange={(e) => {
                              e.stopPropagation();
                              console.log('🕐 Hour input changed:', e.target.value);
                              console.log('📅 Current dispatchDate:', dispatchDate);
                              const currentDate = dispatchDate || new Date();
                              const newDate = new Date(currentDate.getTime()); // Create new date from timestamp
                              newDate.setHours(parseInt(e.target.value) || 0);
                              console.log('✅ Setting new date with hour:', newDate);
                              setDispatchDate(newDate);
                            }}
                            onClick={(e) => e.stopPropagation()}
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
                              e.stopPropagation();
                              console.log('🕕 Minute input changed:', e.target.value);
                              console.log('📅 Current dispatchDate:', dispatchDate);
                              const currentDate = dispatchDate || new Date();
                              const newDate = new Date(currentDate.getTime()); // Create new date from timestamp
                              newDate.setMinutes(parseInt(e.target.value) || 0);
                              console.log('✅ Setting new date with minutes:', newDate);
                              setDispatchDate(newDate);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {isEditable && (
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
