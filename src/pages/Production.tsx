import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Factory, Plus } from 'lucide-react';

const Production = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    locationId: '',
    productTypeId: '',
    brandId: '',
    productionDate: new Date().toISOString().slice(0, 16),
    quantity: '',
    batchNo: '',
    autoBatchNo: true,
    parameters: {} as Record<string, string>,
    notes: '',
    numberOfRolls: '1',
    lengthPerRoll: '',
  });

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      const [locationsRes, productTypesRes, brandsRes] = await Promise.all([
        supabase.from('locations').select('*').is('deleted_at', null),
        supabase.from('product_types').select('*, units(*)').is('deleted_at', null),
        supabase.from('brands').select('*').is('deleted_at', null),
      ]);

      if (locationsRes.data) setLocations(locationsRes.data);
      if (productTypesRes.data) setProductTypes(productTypesRes.data);
      if (brandsRes.data) setBrands(brandsRes.data);
    } catch (error) {
      console.error('Error fetching master data:', error);
      toast.error('Failed to load master data');
    }
  };

  const generateBatchNo = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `BATCH-${year}${month}-${random}`;
  };

  const generateBatchCode = (productType: any, params: Record<string, string>) => {
    const brand = brands.find(b => b.id === formData.brandId)?.name || 'BRAND';
    const date = new Date();
    const year = date.getFullYear();
    const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

    if (productType.name === 'HDPE Pipe') {
      return `HDPE-${params.PE}-PN${params.PN}-${params.OD}-${brand}-${year}-${seq}`;
    } else if (productType.name === 'Sprinkler Pipe') {
      return `SPR-${params.Type}-PN${params.PN}-${params.OD}-${brand}-${year}-${seq}`;
    }

    return `${productType.name.toUpperCase()}-${brand}-${year}-${seq}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.locationId || !formData.productTypeId || !formData.brandId || !formData.quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    const quantity = parseFloat(formData.quantity);
    if (quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    setLoading(true);

    try {
      const productType = productTypes.find(pt => pt.id === formData.productTypeId);
      const paramSchema = productType?.parameter_schema || [];

      // Validate required parameters
      for (const param of paramSchema) {
        if (param.required && !formData.parameters[param.name]) {
          toast.error(`${param.name} is required`);
          setLoading(false);
          return;
        }
      }

      // Create product variant first
      const { data: variantData, error: variantError } = await supabase
        .from('product_variants')
        .insert({
          product_type_id: formData.productTypeId,
          brand_id: formData.brandId,
          parameters: formData.parameters,
        })
        .select()
        .single();

      if (variantError) throw variantError;

      const batchNo = formData.autoBatchNo ? generateBatchNo() : formData.batchNo;
      const batchCode = generateBatchCode(productType, formData.parameters);

      // Create batch
      const { data: batchData, error: batchError } = await supabase
        .from('batches')
        .insert({
          batch_no: batchNo,
          batch_code: batchCode,
          product_variant_id: variantData.id,
          location_id: formData.locationId,
          production_date: formData.productionDate,
          initial_quantity: quantity,
          current_quantity: quantity,
          notes: formData.notes,
          created_by: user?.id,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Create production transaction
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          batch_id: batchData.id,
          transaction_type: 'PRODUCTION',
          quantity_change: quantity,
          transaction_date: formData.productionDate,
          notes: `Initial production: ${formData.notes}`,
          created_by: user?.id,
        });

      if (transactionError) throw transactionError;

      // Create rolls based on numberOfRolls
      const numberOfRolls = parseInt(formData.numberOfRolls);
      const rolls = [];

      if (numberOfRolls > 0) {
        let lengthPerRoll: number;

        if (formData.lengthPerRoll) {
          // Use custom length per roll
          lengthPerRoll = parseFloat(formData.lengthPerRoll);
        } else {
          // Distribute evenly
          lengthPerRoll = quantity / numberOfRolls;
        }

        for (let i = 0; i < numberOfRolls; i++) {
          rolls.push({
            batch_id: batchData.id,
            product_variant_id: variantData.id,
            length_meters: lengthPerRoll,
            initial_length_meters: lengthPerRoll,
            status: 'AVAILABLE',
          });
        }

        const { error: rollsError } = await supabase
          .from('rolls')
          .insert(rolls);

        if (rollsError) throw rollsError;
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'CREATE_BATCH',
        entity_type: 'BATCH',
        entity_id: batchData.id,
        description: `Created batch ${batchCode} with ${quantity} units and ${numberOfRolls} rolls`,
      });

      toast.success(`Production batch ${batchCode} created successfully with ${numberOfRolls} roll(s)!`);

      // Reset form
      setFormData({
        locationId: '',
        productTypeId: '',
        brandId: '',
        productionDate: new Date().toISOString().slice(0, 16),
        quantity: '',
        batchNo: '',
        autoBatchNo: true,
        parameters: {},
        notes: '',
        numberOfRolls: '1',
        lengthPerRoll: '',
      });
    } catch (error: any) {
      console.error('Error creating production batch:', error);
      toast.error(error.message || 'Failed to create production batch');
    } finally {
      setLoading(false);
    }
  };

  const selectedProductType = productTypes.find(pt => pt.id === formData.productTypeId);
  const paramSchema = selectedProductType?.parameter_schema || [];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Factory className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Daily Production Entry</h1>
            <p className="text-muted-foreground">Record new production batches</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Production Batch</CardTitle>
            <CardDescription>Enter production details to create a new inventory batch</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Select value={formData.locationId} onValueChange={(value) => setFormData({...formData, locationId: value})}>
                  <SelectTrigger id="location" className="h-12">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Type */}
              <div className="space-y-2">
                <Label htmlFor="productType">Product Type *</Label>
                <Select value={formData.productTypeId} onValueChange={(value) => {
                  setFormData({...formData, productTypeId: value, parameters: {}});
                }}>
                  <SelectTrigger id="productType" className="h-12">
                    <SelectValue placeholder="Select product type" />
                  </SelectTrigger>
                  <SelectContent>
                    {productTypes.map((pt) => (
                      <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Brand */}
              <div className="space-y-2">
                <Label htmlFor="brand">Brand *</Label>
                <Select value={formData.brandId} onValueChange={(value) => setFormData({...formData, brandId: value})}>
                  <SelectTrigger id="brand" className="h-12">
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dynamic Parameters */}
              {paramSchema.length > 0 && (
                <div className="space-y-4 p-4 bg-secondary/50 rounded-lg">
                  <h3 className="font-semibold">Product Parameters</h3>
                  {paramSchema.map((param: any) => (
                    <div key={param.name} className="space-y-2">
                      <Label htmlFor={param.name}>{param.name} {param.required && '*'}</Label>
                      {param.type === 'select' ? (
                        <Select
                          value={formData.parameters[param.name] || ''}
                          onValueChange={(value) => setFormData({
                            ...formData,
                            parameters: {...formData.parameters, [param.name]: value}
                          })}
                        >
                          <SelectTrigger id={param.name} className="h-12">
                            <SelectValue placeholder={`Select ${param.name}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {param.options?.map((opt: string) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={param.name}
                          type={param.type === 'number' ? 'number' : 'text'}
                          placeholder={`Enter ${param.name}${param.unit ? ` (${param.unit})` : ''}`}
                          value={formData.parameters[param.name] || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            parameters: {...formData.parameters, [param.name]: e.target.value}
                          })}
                          className="h-12"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Production Date */}
              <div className="space-y-2">
                <Label htmlFor="productionDate">Production Date & Time *</Label>
                <Input
                  id="productionDate"
                  type="datetime-local"
                  value={formData.productionDate}
                  onChange={(e) => setFormData({...formData, productionDate: e.target.value})}
                  className="h-12"
                />
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Label htmlFor="quantity">Total Quantity * {selectedProductType && `(${selectedProductType.units?.abbreviation})`}</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.001"
                  placeholder="Enter total quantity"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  className="h-12"
                />
              </div>

              {/* Roll Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="numberOfRolls">Number of Rolls *</Label>
                  <Input
                    id="numberOfRolls"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={formData.numberOfRolls}
                    onChange={(e) => {
                      const numberOfRolls = e.target.value;
                      setFormData({
                        ...formData,
                        numberOfRolls,
                        lengthPerRoll: formData.quantity && numberOfRolls
                          ? (parseFloat(formData.quantity) / parseInt(numberOfRolls)).toFixed(2)
                          : ''
                      });
                    }}
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lengthPerRoll">
                    Length per Roll {selectedProductType && `(${selectedProductType.units?.abbreviation})`}
                  </Label>
                  <Input
                    id="lengthPerRoll"
                    type="number"
                    step="0.001"
                    placeholder="Auto-calculated"
                    value={formData.lengthPerRoll}
                    onChange={(e) => setFormData({ ...formData, lengthPerRoll: e.target.value })}
                    className="h-12"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to distribute evenly
                  </p>
                </div>
              </div>

              {/* Batch Number */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="batchNo">Batch Number</Label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.autoBatchNo}
                      onChange={(e) => setFormData({...formData, autoBatchNo: e.target.checked})}
                      className="rounded"
                    />
                    <span>Auto-generate</span>
                  </label>
                </div>
                <Input
                  id="batchNo"
                  type="text"
                  placeholder={formData.autoBatchNo ? 'Auto-generated' : 'Enter batch number'}
                  value={formData.batchNo}
                  onChange={(e) => setFormData({...formData, batchNo: e.target.value})}
                  disabled={formData.autoBatchNo}
                  className="h-12"
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about this production batch"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full h-12" disabled={loading}>
                <Plus className="h-5 w-5 mr-2" />
                {loading ? 'Creating Batch...' : 'Create Production Batch'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Production;
