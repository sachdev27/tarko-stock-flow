import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Factory, Plus, Upload, Trash2 } from 'lucide-react';
import { inventory, production, parameters } from '@/lib/api';

const Production = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [parameterOptions, setParameterOptions] = useState<Record<string, any[]>>({});

  const [formData, setFormData] = useState({
    locationId: '',
    productTypeId: '',
    brandId: '',
    productionDate: new Date().toISOString().slice(0, 16),
    productionTime: new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
    quantity: '',
    batchNo: '',
    autoBatchNo: true,
    parameters: {} as Record<string, string>,
    notes: '',
    numberOfRolls: '1',
    lengthPerRoll: '500',
    cutRolls: [] as { length: string }[],
  });

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [newCutRollLength, setNewCutRollLength] = useState('');

  useEffect(() => {
    fetchMasterData();
  }, []);

  // Auto-calculate total quantity from both normal rolls and cut rolls
  useEffect(() => {
    let total = 0;

    // Calculate normal rolls
    const rolls = parseInt(formData.numberOfRolls) || 0;
    const lengthPerRoll = parseFloat(formData.lengthPerRoll) || 0;
    if (rolls > 0 && lengthPerRoll > 0) {
      total += rolls * lengthPerRoll;
    }

    // Add cut rolls
    formData.cutRolls.forEach(roll => {
      const length = parseFloat(roll.length) || 0;
      total += length;
    });

    setFormData(prev => ({ ...prev, quantity: total > 0 ? total.toFixed(2) : '' }));
  }, [formData.numberOfRolls, formData.lengthPerRoll, formData.cutRolls]);

  const fetchMasterData = async () => {
    try {
      const [locationsRes, productTypesRes, brandsRes, paramsRes] = await Promise.all([
        inventory.getLocations(),
        inventory.getProductTypes(),
        inventory.getBrands(),
        parameters.getOptions(),
      ]);

      if (locationsRes.data) {
        setLocations(locationsRes.data);
      }

      if (productTypesRes.data) {
        setProductTypes(productTypesRes.data);
      }

      if (brandsRes.data) {
        setBrands(brandsRes.data);
      }

      if (paramsRes.data) {
        setParameterOptions(paramsRes.data);
      }
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

      const batchNo = formData.autoBatchNo ? generateBatchNo() : formData.batchNo;
      const batchCode = generateBatchCode(productType, formData.parameters);
      const numberOfRolls = parseInt(formData.numberOfRolls);

      // Create FormData for multipart/form-data submission
      const formDataToSend = new FormData();
      formDataToSend.append('location_id', formData.locationId);
      formDataToSend.append('product_type_id', formData.productTypeId);
      formDataToSend.append('brand_id', formData.brandId);
      formDataToSend.append('parameters', JSON.stringify(formData.parameters));
      formDataToSend.append('production_date', formData.productionDate);
      formDataToSend.append('quantity', formData.quantity);
      formDataToSend.append('batch_no', batchNo);
      formDataToSend.append('batch_code', batchCode);
      formDataToSend.append('notes', formData.notes);
      formDataToSend.append('number_of_rolls', numberOfRolls.toString());

      // Add attachment file if present
      if (attachmentFile) {
        formDataToSend.append('attachment', attachmentFile);
      }

      // Call production API with FormData
      const { data } = await production.createBatch(formDataToSend);

      toast.success(`Production batch ${data.batch_code} created successfully with ${numberOfRolls} roll(s)!`);

      // Reset form
      setFormData({
        locationId: '',
        productTypeId: '',
        brandId: '',
        productionDate: new Date().toISOString().slice(0, 10),
        productionTime: new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5),
        quantity: '',
        batchNo: '',
        autoBatchNo: true,
        parameters: {},
        notes: '',
        numberOfRolls: '1',
        lengthPerRoll: '500',
        cutRolls: [],
      });
      setAttachmentFile(null);
      setNewCutRollLength('');
    } catch (error: any) {
      console.error('Error creating batch:', error);
      toast.error(error.response?.data?.error || 'Failed to create production batch');
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
                      {param.type === 'select' || parameterOptions[param.name]?.length > 0 ? (
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
                            {parameterOptions[param.name]?.map((opt: any) => (
                              <SelectItem key={opt.id} value={opt.value}>{opt.value}</SelectItem>
                            ))}
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

              {/* Production Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productionDate">Production Date *</Label>
                  <Input
                    id="productionDate"
                    type="date"
                    value={formData.productionDate.slice(0, 10)}
                    onChange={(e) => setFormData({...formData, productionDate: e.target.value + 'T' + formData.productionTime})}
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productionTime">Production Time *</Label>
                  <Input
                    id="productionTime"
                    type="time"
                    value={formData.productionTime}
                    onChange={(e) => setFormData({...formData, productionTime: e.target.value})}
                    className="h-12"
                  />
                </div>
              </div>

              {/* Roll Information */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Roll Information *</Label>

                {/* Normal Rolls */}
                <Card className="p-4 bg-secondary/20">
                  <h3 className="font-medium mb-3">Standard Rolls</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="numberOfRolls">Number of Rolls</Label>
                      <Input
                        id="numberOfRolls"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={formData.numberOfRolls}
                        onChange={(e) => setFormData({...formData, numberOfRolls: e.target.value})}
                        className="h-10"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lengthPerRoll">
                        Length per Roll {selectedProductType && `(${selectedProductType.units?.abbreviation || 'm'})`}
                      </Label>
                      <Select value={formData.lengthPerRoll} onValueChange={(value) => setFormData({...formData, lengthPerRoll: value})}>
                        <SelectTrigger id="lengthPerRoll" className="h-10">
                          <SelectValue placeholder="Select length" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="500">500 m</SelectItem>
                          <SelectItem value="300">300 m</SelectItem>
                          <SelectItem value="200">200 m</SelectItem>
                          <SelectItem value="100">100 m</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>

                {/* Custom/Cut Rolls */}
                <Card className="p-4 bg-secondary/20">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">Cut Rolls (Custom Lengths)</h3>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="Enter length"
                        value={newCutRollLength}
                        onChange={(e) => setNewCutRollLength(e.target.value)}
                        className="h-9 w-32"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (newCutRollLength && parseFloat(newCutRollLength) > 0) {
                            setFormData({
                              ...formData,
                              cutRolls: [...formData.cutRolls, { length: newCutRollLength }]
                            });
                            setNewCutRollLength('');
                          } else {
                            toast.error('Please enter a valid length');
                          }
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>

                  {formData.cutRolls.length > 0 && (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {formData.cutRolls.map((roll, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-background rounded">
                          <span className="text-sm">
                            Roll {index + 1}: {roll.length} {selectedProductType?.units?.abbreviation || 'm'}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newCutRolls = formData.cutRolls.filter((_, i) => i !== index);
                              setFormData({...formData, cutRolls: newCutRolls});
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {formData.cutRolls.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No cut rolls added</p>
                  )}
                </Card>
              </div>

              {/* Quantity (Auto-calculated) */}
              <div className="space-y-2">
                <Label htmlFor="quantity">Total Quantity (Auto-calculated) {selectedProductType && `(${selectedProductType.units?.abbreviation || 'm'})`}</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.001"
                  placeholder="Auto-calculated"
                  value={formData.quantity}
                  readOnly
                  className="h-12 bg-muted font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  Standard: {parseInt(formData.numberOfRolls) || 0} rolls × {parseFloat(formData.lengthPerRoll) || 0}m = {((parseInt(formData.numberOfRolls) || 0) * (parseFloat(formData.lengthPerRoll) || 0)).toFixed(2)}m
                  {formData.cutRolls.length > 0 && (
                    <> | Cut: {formData.cutRolls.length} roll(s) = {formData.cutRolls.reduce((sum, r) => sum + (parseFloat(r.length) || 0), 0).toFixed(2)}m</>
                  )}
                </p>
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

              {/* File Attachment */}
              <div className="space-y-2">
                <Label htmlFor="attachment">Attachment (Optional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="attachment"
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // Validate file size (max 5MB)
                        if (file.size > 5 * 1024 * 1024) {
                          toast.error('File size must be less than 5MB');
                          e.target.value = '';
                          return;
                        }
                        setAttachmentFile(file);
                      }
                    }}
                    className="h-12"
                  />
                  {attachmentFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAttachmentFile(null);
                        const input = document.getElementById('attachment') as HTMLInputElement;
                        if (input) input.value = '';
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {attachmentFile && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Upload className="h-3 w-3" />
                    {attachmentFile.name} ({(attachmentFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Accepted formats: JPG, PNG, PDF (Max 5MB)
                </p>
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
