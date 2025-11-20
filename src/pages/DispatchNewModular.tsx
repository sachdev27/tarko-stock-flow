import { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { TruckIcon, RotateCcw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CustomerDetailsSection } from '@/components/dispatch/CustomerDetailsSection';
import { ProductSelectionSection } from '@/components/dispatch/ProductSelectionSection';
import { useKeyboardShortcuts, KeyboardShortcutsHelp } from '@/components/dispatch/useKeyboardShortcuts';
import { useDispatchData } from '@/components/dispatch/useDispatchData';

interface Roll {
  id: string;
  batch_code: string;
  length_meters: number;
  status: string;
  bundle_size?: number;
  roll_type?: string;
  parameters?: any;
  brand_name?: string;
  product_type_name?: string;
  quantity: number;
  dispatchLength?: number;
}

const DispatchNewModular = () => {
  const { token } = useAuth();

  // Customer Details State
  const [customerId, setCustomerId] = useState('');
  const [billToId, setBillToId] = useState('');
  const [transportId, setTransportId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');

  // Product Selection State
  const [productTypeId, setProductTypeId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedRolls, setSelectedRolls] = useState<Roll[]>([]);
  const [availableRolls, setAvailableRolls] = useState<Roll[]>([]);

  const [loading, setLoading] = useState(false);

  // Refs for keyboard navigation
  const customerRef = useRef<HTMLDivElement>(null);
  const productTypeRef = useRef<HTMLDivElement>(null);
  const productSearchRef = useRef<HTMLDivElement>(null);

  // Use custom hook for data management
  const {
    customers,
    billToList,
    transports,
    vehicles,
    productTypes,
    fetchCustomers,
    fetchBillToList,
    fetchTransports,
    fetchVehicles,
    fetchProductTypes,
    createCustomer,
    createBillTo,
    createTransport,
    createVehicle,
    api
  } = useDispatchData(token || '');

  // Fetch initial data
  useEffect(() => {
    if (token) {
      fetchCustomers();
      fetchBillToList();
      fetchTransports();
      fetchVehicles();
      fetchProductTypes();
    }
  }, [token]);

  // Keyboard shortcuts
  const shortcuts = [
    {
      key: 'h',
      ctrl: true,
      action: () => customerRef.current?.querySelector('input')?.focus(),
      description: 'Jump to Customer'
    },
    {
      key: 'p',
      ctrl: true,
      action: () => productTypeRef.current?.querySelector('input')?.focus(),
      description: 'Product Type'
    },
    {
      key: 'P',
      ctrl: true,
      shift: true,
      action: () => productSearchRef.current?.querySelector('input')?.focus(),
      description: 'Product Search'
    }
  ];

  useKeyboardShortcuts({ shortcuts });

  // Auto-search when product type changes
  useEffect(() => {
    if (productTypeId) {
      handleSearchProducts();
    } else {
      setAvailableRolls([]);
    }
  }, [productTypeId]);

  const handleSearchProducts = async () => {
    if (!productTypeId) {
      toast.error('Please select a product type');
      return;
    }

    try {
      setLoading(true);
      const results = await api.searchProducts({
        product_type_id: productTypeId,
        parameters: {} // Parse productSearch into parameters
      });
      // API returns array directly, not { rolls: [] }
      const rollsArray = Array.isArray(results) ? results : [];
      setAvailableRolls(rollsArray);
      if (rollsArray.length === 0) {
        toast.info('No products found for this product type');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to search products');
      setAvailableRolls([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoll = (roll: any) => {
    // Map roll_id to id if needed
    const normalizedRoll = {
      id: roll.roll_id || roll.id,
      batch_code: roll.batch_code,
      length_meters: roll.length_meters,
      status: roll.status,
      bundle_size: roll.bundle_size,
      roll_type: roll.roll_type,
      parameters: roll.parameters,
      brand_name: roll.brand_name,
      product_type_name: roll.product_type_name,
      quantity: 1, // Default quantity
      dispatchLength: roll.length_meters
    };

    if (selectedRolls.find(r => r.id === normalizedRoll.id)) {
      toast.info('Roll already selected');
      return;
    }
    setSelectedRolls([...selectedRolls, normalizedRoll]);
    toast.success(`Added ${normalizedRoll.batch_code}`);
  };

  const handleRemoveRoll = (index: number) => {
    const removed = selectedRolls[index];
    setSelectedRolls(selectedRolls.filter((_, i) => i !== index));
    toast.info(`Removed ${removed.batch_code}`);
  };

  const handleClearAll = () => {
    setCustomerId('');
    setBillToId('');
    setTransportId('');
    setVehicleId('');
    setNotes('');
    setProductTypeId('');
    setProductSearch('');
    setSelectedRolls([]);
    setAvailableRolls([]);
    customerRef.current?.querySelector('input')?.focus();
    toast.info('Form cleared');
  };

  const handleDispatch = async () => {
    if (!customerId) {
      toast.error('Please select a customer');
      customerRef.current?.querySelector('input')?.focus();
      return;
    }

    if (selectedRolls.length === 0) {
      toast.error('Please select at least one roll');
      productSearchRef.current?.querySelector('input')?.focus();
      return;
    }

    setLoading(true);
    try {
      await api.dispatchSale({
        customer_id: customerId,
        bill_to_id: billToId || undefined,
        transport_id: transportId || undefined,
        vehicle_id: vehicleId || undefined,
        notes: notes || undefined,
        rolls: selectedRolls.map(roll => ({
          roll_id: roll.id,
          quantity: roll.length_meters
        }))
      });

      toast.success('🚚 Dispatch completed successfully!');

      // Reset form and focus on customer field
      handleClearAll();
    } catch (error) {
      toast.error('Failed to complete dispatch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="p-4 max-w-7xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TruckIcon className="h-6 w-6" />
                New Dispatch
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Clear All
              </Button>
            </CardTitle>
            <KeyboardShortcutsHelp shortcuts={shortcuts} />
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Customer Details Section */}
            <CustomerDetailsSection
              customerId={customerId}
              onCustomerChange={setCustomerId}
              billToId={billToId}
              onBillToChange={setBillToId}
              transportId={transportId}
              onTransportChange={setTransportId}
              vehicleId={vehicleId}
              onVehicleChange={setVehicleId}
              notes={notes}
              onNotesChange={setNotes}
              customers={customers}
              billToList={billToList}
              transports={transports}
              vehicles={vehicles}
              onCreateCustomer={createCustomer}
              onCreateBillTo={createBillTo}
              onCreateTransport={createTransport}
              onCreateVehicle={createVehicle}
              customerRef={customerRef}
            />

            {/* Product Selection Section */}
            <ProductSelectionSection
              productTypeId={productTypeId}
              onProductTypeChange={setProductTypeId}
              productSearch={productSearch}
              onProductSearchChange={setProductSearch}
              selectedRolls={selectedRolls}
              onRemoveRoll={handleRemoveRoll}
              onAddRoll={handleAddRoll}
              onUpdateRollQuantity={(index, quantity, dispatchLength) => {
                // Update quantity or dispatch length for a selected roll
                const updated = [...selectedRolls];
                if (updated[index]) {
                  updated[index] = {
                    ...updated[index],
                    quantity,
                    dispatchLength
                  };
                  setSelectedRolls(updated);
                }
              }}
              productTypes={productTypes}
              availableRolls={availableRolls}
              onSearchProducts={handleSearchProducts}
              productTypeRef={productTypeRef}
              productSearchRef={productSearchRef}
            />

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                onClick={handleDispatch}
                disabled={loading || !customerId || selectedRolls.length === 0}
                size="lg"
                className="gap-2"
              >
                <TruckIcon className="h-4 w-4" />
                {loading ? 'Dispatching...' : 'Dispatch Sale'}
              </Button>
            </div>

            {/* Summary */}
            {selectedRolls.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">Total Rolls</div>
                    <div className="font-bold text-lg">{selectedRolls.length}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Total Length</div>
                    <div className="font-bold text-lg">
                      {selectedRolls.reduce((sum, r) => sum + r.length_meters, 0).toFixed(2)}m
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Customer</div>
                    <div className="font-medium truncate">
                      {customers.find(c => c.id === customerId)?.name || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Transport</div>
                    <div className="font-medium truncate">
                      {transports.find(t => t.id === transportId)?.name || '-'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default DispatchNewModular;
