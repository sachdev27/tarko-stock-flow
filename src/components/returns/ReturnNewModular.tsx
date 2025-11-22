import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { ReturnDetailsSection } from './ReturnDetailsSection';
import { ProductSelectionSection } from './ProductSelectionSection';
import { ReturnCartSection } from './ReturnCartSection';

interface Customer {
  id: string;
  name: string;
  city?: string;
  [key: string]: unknown;
}

interface ProductType {
  id: string;
  name: string;
}

interface Brand {
  id: string;
  name: string;
}

interface ReturnItem {
  product_type_id: string;
  brand_id: string;
  product_type_name: string;
  brand_name: string;
  item_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE_PIECES';
  quantity: number;
  parameters?: Record<string, string>;
  rolls?: { length_meters: number }[];
  bundles?: { bundle_size: number; piece_length_meters: number }[];
  bundle_size?: number;
  piece_length_meters?: number;
  piece_count?: number;
  notes?: string;
}

const ReturnNewModular = () => {
  const { token } = useAuth();

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [returnDate, setReturnDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);

  // Data state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Loading state
  const [submitting, setSubmitting] = useState(false);

  // Refs for keyboard navigation
  const customerRef = useRef<HTMLDivElement>(null);
  const productTypeRef = useRef<HTMLDivElement>(null);
  const productSearchRef = useRef<HTMLDivElement>(null);

  // Fetch initial data
  useEffect(() => {
    if (token) {
      fetchCustomers();
      fetchProductTypes();
      fetchBrands();
    }
  }, [token]);

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/inventory/customers');
      setCustomers(response.data || []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
      toast.error('Failed to fetch customers');
    }
  };

  const fetchProductTypes = async () => {
    try {
      const response = await api.get('/parameters/product-types');
      setProductTypes(response.data || []);
    } catch (error) {
      console.error('Failed to fetch product types:', error);
      toast.error('Failed to fetch product types');
    }
  };

  const fetchBrands = async () => {
    try {
      const response = await api.get('/parameters/brands');
      setBrands(response.data || []);
    } catch (error) {
      console.error('Failed to fetch brands:', error);
      toast.error('Failed to fetch brands');
    }
  };

  const handleCreateCustomer = async (name: string): Promise<Customer | void> => {
    try {
      const response = await api.post('/inventory/customers', { name });
      const newCustomer = response.data;
      setCustomers(prev => [...prev, newCustomer]);
      setCustomerId(newCustomer.id);
      toast.success('Customer created successfully');
      return newCustomer;
    } catch (error) {
      console.error('Failed to create customer:', error);
      toast.error('Failed to create customer');
    }
  };

  const handleAddItem = (item: ReturnItem) => {
    setItems(prev => {
      // Check if an identical item already exists
      const existingIndex = prev.findIndex(existingItem => {
        // Match on product type, brand, item type, and parameters
        const sameProductAndBrand =
          existingItem.product_type_id === item.product_type_id &&
          existingItem.brand_id === item.brand_id &&
          existingItem.item_type === item.item_type;

        if (!sameProductAndBrand) return false;

        // Compare parameters (handle key order differences)
        const existingParams = existingItem.parameters || {};
        const newParams = item.parameters || {};
        const existingKeys = Object.keys(existingParams).sort();
        const newKeys = Object.keys(newParams).sort();
        if (existingKeys.length !== newKeys.length) return false;
        if (!existingKeys.every((key, idx) => key === newKeys[idx])) return false;
        if (!existingKeys.every(key => existingParams[key] === newParams[key])) return false;

        // For rolls, check if length matches
        if ((item.item_type === 'FULL_ROLL' || item.item_type === 'CUT_ROLL') && item.rolls && existingItem.rolls) {
          const existingLength = existingItem.rolls[0]?.length_meters;
          const newLength = item.rolls[0]?.length_meters;
          return existingLength === newLength;
        }

        // For bundles, check if size and length match
        if (item.item_type === 'BUNDLE' && item.bundles && existingItem.bundles) {
          const existingBundle = existingItem.bundles[0];
          const newBundle = item.bundles[0];
          return existingBundle?.bundle_size === newBundle?.bundle_size &&
                 existingBundle?.piece_length_meters === newBundle?.piece_length_meters;
        }

        // For spare pieces, check if length matches
        if (item.item_type === 'SPARE_PIECES') {
          return existingItem.piece_length_meters === item.piece_length_meters;
        }

        return false;
      });

      if (existingIndex !== -1) {
        // Merge with existing item
        const updatedItems = [...prev];
        const existingItem = updatedItems[existingIndex];

        if (item.item_type === 'FULL_ROLL' || item.item_type === 'CUT_ROLL') {
          // Add new rolls to existing rolls
          existingItem.rolls = [...(existingItem.rolls || []), ...(item.rolls || [])];
          existingItem.quantity = existingItem.rolls.length;
        } else if (item.item_type === 'BUNDLE') {
          // Add new bundles to existing bundles
          existingItem.bundles = [...(existingItem.bundles || []), ...(item.bundles || [])];
          existingItem.quantity = existingItem.bundles.length;
        } else if (item.item_type === 'SPARE_PIECES') {
          // Add piece count
          existingItem.piece_count = (existingItem.piece_count || 0) + (item.piece_count || 0);
        }

        return updatedItems;
      }

      // No match found, add as new item
      return [...prev, item];
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    toast.success('Item removed from cart');
  };

  const handleClearCart = () => {
    if (items.length === 0) {
      toast.info('Cart is already empty');
      return;
    }
    setItems([]);
    toast.success('Cart cleared');
  };

  const validateForm = () => {
    if (!customerId) {
      toast.error('Please select a customer');
      return false;
    }

    if (!returnDate) {
      toast.error('Please select a return date');
      return false;
    }

    if (items.length === 0) {
      toast.error('Please add at least one item to the return');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const returnData = {
        customer_id: customerId,
        return_date: returnDate.toISOString().split('T')[0],
        notes,
        items: items.map(item => ({
          product_type_id: item.product_type_id,
          brand_id: item.brand_id,
          item_type: item.item_type,
          quantity: item.quantity,
          parameters: item.parameters || {},
          rolls: item.rolls || [],
          bundles: item.bundles || [],
          piece_count: item.piece_count,
          piece_length_meters: item.piece_length_meters,
          notes: item.notes || ''
        }))
      };

      await api.post('/returns/create', returnData);
      toast.success('Return created successfully!');

      // Reset form
      setCustomerId('');
      setReturnDate(new Date());
      setNotes('');
      setItems([]);
    } catch (error: unknown) {
      console.error('Failed to create return:', error);
      if (error instanceof Error) {
        toast.error('Failed to create return');
      } else {
        toast.error('Failed to create return');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+H - Focus customer
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        customerRef.current?.querySelector('input')?.focus();
      }
      // Shift+Enter - Save return
      if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
      // Ctrl+Delete - Clear cart
      if (e.ctrlKey && e.key === 'Delete') {
        e.preventDefault();
        handleClearCart();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [customerId, returnDate, notes, items]); // Dependencies for handleSubmit

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Create New Return</h2>

        {/* Keyboard Shortcuts Help */}
        <Card className="p-3 bg-muted/50">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs text-muted-foreground">
            <div>
              <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl+H</kbd> Customer
            </div>
            <div>
              <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl+P</kbd> Product Type
            </div>
            <div>
              <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl+B</kbd> Brand
            </div>
            <div>
              <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl+Shift+P</kbd> Parameters
            </div>
            <div>
              <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl+Del</kbd> Clear Cart
            </div>
            <div>
              <kbd className="px-2 py-1 bg-background rounded text-xs">Shift+Enter</kbd> Save
            </div>
          </div>
        </Card>
      </div>

      <Separator />

      {/* Return Details Section - Horizontal */}
      <ReturnDetailsSection
        customerId={customerId}
        onCustomerChange={setCustomerId}
        returnDate={returnDate}
        onReturnDateChange={setReturnDate}
        notes={notes}
        onNotesChange={setNotes}
        customers={customers}
        onCreateCustomer={handleCreateCustomer}
        customerRef={customerRef}
      />

      <Separator />

      {/* Product Selection and Cart - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Selection - Left (2/3) */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Add Products to Return</h3>
            <ProductSelectionSection
              productTypes={productTypes}
              brands={brands}
              onAddItem={handleAddItem}
              productTypeRef={productTypeRef}
              productSearchRef={productSearchRef}
            />
          </Card>
        </div>

        {/* Cart - Right (1/3) */}
        <div className="lg:col-span-1 space-y-4">
          <ReturnCartSection
            items={items}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
          />

          {/* Create Return Button */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || items.length === 0}
            size="lg"
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Create Return
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReturnNewModular;
