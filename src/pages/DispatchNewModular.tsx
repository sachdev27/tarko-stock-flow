import { useState, useEffect, useRef } from 'react';
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
  const [dispatchDate, setDispatchDate] = useState<Date | undefined>(new Date());
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
    },
    {
      key: 'Enter',
      shift: true,
      action: () => handleDispatch(),
      description: 'Submit Dispatch'
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
    console.log('=== handleAddRoll called ===');
    console.log('Incoming roll:', roll);
    console.log('Current selectedRolls:', selectedRolls);

    // Map roll_id to id if needed
    const normalizedRoll = {
      id: roll.roll_id || roll.id,
      product_variant_id: roll.product_variant_id,
      piece_id: roll.piece_id,
      piece_ids: roll.piece_ids,
      batch_code: roll.batch_code,
      length_meters: roll.length_meters,
      status: roll.status,
      bundle_size: roll.bundle_size,
      roll_type: roll.roll_type,
      stock_type: roll.stock_type,
      product_category: roll.product_category,
      parameters: roll.parameters,
      brand_name: roll.brand_name,
      product_type_name: roll.product_type_name,
      quantity: roll.quantity || 1,
      dispatchLength: roll.length_meters,
      piece_length_meters: roll.piece_length_meters,
      piece_count: roll.piece_count,
      spare_id: roll.spare_id,
      spare_ids: roll.spare_ids,
      length_per_unit: roll.length_per_unit
    };

    console.log('Normalized roll:', normalizedRoll);

    // Check for duplicates - for cut pieces, each piece is unique
    // For BUNDLE, FULL_ROLL, SPARE that come from distributed stock entries, keep separate
    const existingIndex = selectedRolls.findIndex(r => {
      if (normalizedRoll.piece_id && r.piece_id) {
        return r.piece_id === normalizedRoll.piece_id;
      }
      // Don't merge if this is a BUNDLE, FULL_ROLL, or SPARE - keep separate for inventory tracking
      if (['BUNDLE', 'FULL_ROLL', 'SPARE'].includes(normalizedRoll.stock_type)) {
        console.log('Skipping merge for stock_type:', normalizedRoll.stock_type);
        return false;
      }
      return r.id === normalizedRoll.id && !normalizedRoll.piece_id;
    });

    console.log('existingIndex:', existingIndex);

    if (existingIndex !== -1) {
      // For cut pieces (with piece_id), don't allow duplicates
      if (normalizedRoll.piece_id) {
        toast.info('This cut piece is already in cart');
        return;
      }
      // For regular items, increase quantity
      setSelectedRolls(prev => {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + normalizedRoll.quantity
        };
        console.log('Merged with existing. Updated selectedRolls:', updated);
        return updated;
      });
      toast.success(`Increased quantity to ${selectedRolls[existingIndex].quantity + normalizedRoll.quantity}`);
    } else {
      setSelectedRolls(prev => {
        const newRolls = [...prev, normalizedRoll];
        console.log('Added as new item. Updated selectedRolls:', newRolls);
        return newRolls;
      });
      toast.success(normalizedRoll.stock_type === 'CUT_ROLL' ? 'Added cut piece' : `Added ${normalizedRoll.batch_code || 'item'}`);
    }
  };

  const handleRemoveRoll = (index: number) => {
    const removed = selectedRolls[index];
    setSelectedRolls(selectedRolls.filter((_, i) => i !== index));
    toast.info(`Removed ${removed.batch_code}`);
  };

  const handleClearCart = () => {
    setSelectedRolls([]);
    toast.info('Cart cleared');
  };

  const handleClearAll = () => {
    setCustomerId('');
    setBillToId('');
    setTransportId('');
    setVehicleId('');
    setDispatchDate(new Date());
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

    if (!dispatchDate) {
      toast.error('Please select a dispatch date');
      return;
    }

    if (selectedRolls.length === 0) {
      toast.error('Please select at least one roll');
      productSearchRef.current?.querySelector('input')?.focus();
      return;
    }

    setLoading(true);
    try {
      // Format items for new dispatch endpoint
      const items = selectedRolls.flatMap(roll => {
        if (!roll.product_variant_id) {
          console.error('Missing product_variant_id for roll:', roll);
          throw new Error(`Missing product variant information for ${roll.batch_code || 'item'}`);
        }

        const baseItem = {
          stock_id: roll.id,
          product_variant_id: roll.product_variant_id,
          quantity: roll.quantity || 1
        };

        // Determine item type and add specific fields
        // Check for piece_ids array (multiple cut pieces) OR single piece_id
        if (roll.piece_ids && Array.isArray(roll.piece_ids) && roll.piece_ids.length > 0) {
          // Multiple cut pieces - create one dispatch item per piece
          return roll.piece_ids.map(pieceId => ({
            stock_id: roll.id,
            product_variant_id: roll.product_variant_id,
            quantity: 1,
            item_type: 'CUT_PIECE' as const,
            cut_piece_id: pieceId,
            length_meters: roll.length_meters
          }));
        } else if (roll.piece_id) {
          // Single cut piece
          return [{
            ...baseItem,
            item_type: 'CUT_PIECE' as const,
            cut_piece_id: roll.piece_id,
            length_meters: roll.length_meters
          }];
        } else if (roll.stock_type === 'SPARE' || roll.spare_id) {
          // Spare pieces
          return [{
            ...baseItem,
            item_type: 'SPARE_PIECES' as const,
            spare_piece_ids: roll.spare_ids || (roll.spare_id ? [roll.spare_id] : []),
            piece_count: roll.piece_count || 1
          }];
        } else if (roll.stock_type === 'BUNDLE' || roll.bundle_size) {
          // Bundle
          return [{
            ...baseItem,
            item_type: 'BUNDLE' as const,
            bundle_size: roll.bundle_size,
            pieces_per_bundle: roll.pieces_per_bundle,
            piece_length_meters: roll.piece_length_meters
          }];
        } else {
          // Full roll
          return [{
            ...baseItem,
            item_type: 'FULL_ROLL' as const,
            length_meters: roll.length_meters || roll.length_per_unit
          }];
        }
      });

      const response = await api.createDispatch({
        customer_id: customerId,
        bill_to_id: billToId || undefined,
        transport_id: transportId || undefined,
        vehicle_id: vehicleId || undefined,
        dispatch_date: dispatchDate ?
          `${dispatchDate.getFullYear()}-${String(dispatchDate.getMonth() + 1).padStart(2, '0')}-${String(dispatchDate.getDate()).padStart(2, '0')}`
          : undefined,
        notes: notes || undefined,
        items
      });

      toast.success(`🚚 Dispatch ${response.dispatch_number} completed successfully!`);

      // Reset form and focus on customer field
      handleClearAll();
    } catch (error: any) {
      console.error('Dispatch error:', error);
      toast.error(error.message || 'Failed to complete dispatch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-4">
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
              dispatchDate={dispatchDate}
              onDispatchDateChange={setDispatchDate}
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
              onClearCart={handleClearCart}
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
              customerId={customerId}
              transportId={transportId}
              customers={customers}
              transports={transports}
              vehicleId={vehicleId}
              billToId={billToId}
              vehicles={vehicles}
              billToList={billToList}
              onDispatch={handleDispatch}
              loading={loading}
            />

          </CardContent>
        </Card>
      </div>
  );
};

export default DispatchNewModular;
