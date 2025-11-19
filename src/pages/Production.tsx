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
import { toISTDateTimeLocal } from '@/lib/utils';

const Production = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [parameterOptions, setParameterOptions] = useState<Record<string, any[]>>({});

  const [formData, setFormData] = useState({
    productTypeId: '',
    brandId: '',
    productionDate: toISTDateTimeLocal(new Date()),
    productionTime: '',
    quantity: '',
    batchNo: '',
    autoBatchNo: true,
    parameters: {} as Record<string, string>,
    notes: '',
    numberOfRolls: '1',
    lengthPerRoll: '500',
    cutRolls: [] as { length: string }[],
    // Bundle fields
    numberOfBundles: '1',
    bundleSize: '10',
    sparePipes: [] as { length: string }[],
    // Weight tracking
    weightPerMeter: '',
    totalWeight: '',
    lengthPerPiece: '6', // Default length for sprinkler pipes in meters
  });

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [newCutRollLength, setNewCutRollLength] = useState('');
  const [newSparePipeLength, setNewSparePipeLength] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    fetchMasterData();
  }, []);

  // Auto-calculate total quantity from rolls, bundles, cut rolls, and spare pipes
  useEffect(() => {
    const selectedPT = productTypes.find(pt => pt.id === formData.productTypeId);
    const config = selectedPT?.roll_configuration || { type: 'standard_rolls' };

    let total = 0;

    if (config.type === 'standard_rolls') {
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
    } else if (config.type === 'bundles') {
      if (config.quantity_based) {
        // Quantity-based (e.g., Sprinkler): count pieces not length
        const bundles = parseInt(formData.numberOfBundles) || 0;
        const bundleSize = parseInt(formData.bundleSize) || 0;
        if (bundles > 0 && bundleSize > 0) {
          total += bundles * bundleSize;
        }

        // Add spare pipes (as quantity)
        formData.sparePipes.forEach(pipe => {
          const qty = parseInt(pipe.length) || 0; // Reusing 'length' field for quantity
          total += qty;
        });
      } else {
        // Length-based: calculate bundles (number of bundles * bundle size * length per pipe)
        const bundles = parseInt(formData.numberOfBundles) || 0;
        const bundleSize = parseInt(formData.bundleSize) || 0;
        const lengthPerPipe = parseFloat(formData.lengthPerRoll) || 0;
        if (bundles > 0 && bundleSize > 0 && lengthPerPipe > 0) {
          total += bundles * bundleSize * lengthPerPipe;
        }

        // Add spare pipes
        formData.sparePipes.forEach(pipe => {
          const length = parseFloat(pipe.length) || 0;
          total += length;
        });
      }
    }

    setFormData(prev => ({ ...prev, quantity: total > 0 ? total.toFixed(2) : '' }));
  }, [formData.numberOfRolls, formData.lengthPerRoll, formData.cutRolls, formData.numberOfBundles, formData.bundleSize, formData.sparePipes, formData.productTypeId, productTypes]);

  // Auto-calculate total weight when quantity or weight per meter changes
  useEffect(() => {
    const qty = parseFloat(formData.quantity) || 0;
    const weightPerM = parseFloat(formData.weightPerMeter) || 0;
    const lengthPerPiece = parseFloat(formData.lengthPerPiece) || 0;

    if (qty > 0 && weightPerM > 0) {
      // Check if this is a quantity-based product (like sprinkler pipes)
      const selectedPT = productTypes.find(pt => pt.id === formData.productTypeId);
      const isQuantityBased = selectedPT?.roll_configuration?.quantity_based;

      let totalWeightGrams;
      if (isQuantityBased && lengthPerPiece > 0) {
        // For quantity-based: total_weight = quantity * lengthPerPiece * weightPerMeter
        totalWeightGrams = qty * lengthPerPiece * weightPerM;
      } else {
        // For length-based: total_weight = quantity * weightPerMeter
        totalWeightGrams = qty * weightPerM;
      }
      setFormData(prev => ({ ...prev, totalWeight: totalWeightGrams.toFixed(2) }));
    } else {
      setFormData(prev => ({ ...prev, totalWeight: '' }));
    }
  }, [formData.quantity, formData.weightPerMeter, formData.lengthPerPiece, formData.productTypeId, productTypes]);

  const fetchMasterData = async () => {
    try {
      const [productTypesRes, brandsRes, paramsRes] = await Promise.all([
        inventory.getProductTypes(),
        inventory.getBrands(),
        parameters.getOptions(),
      ]);

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
    const now = new Date();
    // Convert to IST for batch number
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `BATCH-${year}${month}-${random}`;
  };

  const generateBatchCode = (productType: any, params: Record<string, string>) => {
    const brand = brands.find(b => b.id === formData.brandId)?.name || 'BRAND';
    const now = new Date();
    // Convert to IST for batch code
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const year = istDate.getUTCFullYear();
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
    setSubmitAttempted(true);

    if (!formData.productTypeId || !formData.brandId || !formData.quantity) {
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
      formDataToSend.append('product_type_id', formData.productTypeId);
      formDataToSend.append('brand_id', formData.brandId);
      formDataToSend.append('parameters', JSON.stringify(formData.parameters));
      formDataToSend.append('production_date', formData.productionDate);
      formDataToSend.append('quantity', formData.quantity);
      formDataToSend.append('batch_no', batchNo);
      formDataToSend.append('batch_code', batchCode);
      formDataToSend.append('notes', formData.notes);
      formDataToSend.append('number_of_rolls', numberOfRolls.toString());
      formDataToSend.append('cut_rolls', JSON.stringify(formData.cutRolls));

      // Add length per roll/pipe (important for quantity-based products like Sprinkler Pipe)
      if (formData.lengthPerRoll) {
        formDataToSend.append('length_per_roll', formData.lengthPerRoll);
      }

      // Add bundle/spare pipe data
      formDataToSend.append('number_of_bundles', formData.numberOfBundles);
      formDataToSend.append('bundle_size', formData.bundleSize);
      formDataToSend.append('spare_pipes', JSON.stringify(formData.sparePipes));
      formDataToSend.append('roll_config_type', rollConfig.type);
      formDataToSend.append('quantity_based', rollConfig.quantity_based ? 'true' : 'false');

      // Add weight tracking if provided
      if (formData.weightPerMeter) {
        formDataToSend.append('weight_per_meter', formData.weightPerMeter);
      }
      if (formData.totalWeight) {
        formDataToSend.append('total_weight', formData.totalWeight);
      }

      // Add attachment file if present
      if (attachmentFile) {
        formDataToSend.append('attachment', attachmentFile);
      }

      // Call production API with FormData
      const { data } = await production.createBatch(formDataToSend);

      toast.success(`Production batch ${data.batch_code} created successfully with ${numberOfRolls} roll(s)!`);

      // Reset form
      setFormData({
        productTypeId: '',
        brandId: '',
        productionDate: toISTDateTimeLocal(new Date()),
        productionTime: '',
        quantity: '',
        batchNo: '',
        autoBatchNo: true,
        parameters: {},
        notes: '',
        numberOfRolls: '1',
        lengthPerRoll: '500',
        cutRolls: [],
        numberOfBundles: '1',
        bundleSize: '10',
        sparePipes: [],
        weightPerMeter: '',
        totalWeight: '',
        lengthPerPiece: '6',
      });
      setAttachmentFile(null);
      setNewCutRollLength('');
      setNewSparePipeLength('');
      setSubmitAttempted(false);
    } catch (error: any) {
      console.error('Error creating batch:', error);
      toast.error(error.response?.data?.error || 'Failed to create production batch');
    } finally {
      setLoading(false);
    }
  };

  const selectedProductType = productTypes.find(pt => pt.id === formData.productTypeId);
  const paramSchema = selectedProductType?.parameter_schema || [];
  const rollConfig = selectedProductType?.roll_configuration || {
    type: 'standard_rolls',
    options: [{ value: 500, label: '500m' }, { value: 300, label: '300m' }, { value: 200, label: '200m' }, { value: 100, label: '100m' }],
    allow_cut_rolls: true,
    bundle_sizes: [],
    allow_spare: false,
  };

  // Debug logging
  console.log('Selected Product Type:', selectedProductType?.name);
  console.log('Roll Configuration:', rollConfig);
  console.log('Allow Cut Rolls:', rollConfig.allow_cut_rolls);
  console.log('Type check:', typeof rollConfig.allow_cut_rolls);

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
              {/* Product Type */}
              <div className="space-y-2">
                <Label htmlFor="productType">Product Type *</Label>
                <Select value={formData.productTypeId} onValueChange={(value) => {
                  const selectedPT = productTypes.find(pt => pt.id === value);
                  const isQuantityBased = selectedPT?.roll_configuration?.quantity_based;
                  const defaultLength = isQuantityBased ? '6' : '500';
                  setFormData({
                    ...formData,
                    productTypeId: value,
                    parameters: {},
                    lengthPerRoll: defaultLength,
                    lengthPerPiece: defaultLength
                  });
                }}>
                  <SelectTrigger id="productType" className={`h-12 ${submitAttempted && !formData.productTypeId ? 'border-red-500 border-2' : ''}`}>
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
                  <SelectTrigger id="brand" className={`h-12 ${submitAttempted && !formData.brandId ? 'border-red-500 border-2' : ''}`}>
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
                          <SelectTrigger
                            id={param.name}
                            className={`h-12 ${submitAttempted && param.required && !formData.parameters[param.name] ? 'border-red-500 border-2' : ''}`}
                          >
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
                          className={`h-12 ${submitAttempted && param.required && !formData.parameters[param.name] ? 'border-red-500 border-2' : ''}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Roll/Bundle Information - Show only when product type is selected */}
              {formData.productTypeId && (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">
                    {rollConfig.type === 'bundles' ? 'Bundle Information' : 'Roll Information'} *
                  </Label>

                  {rollConfig.type === 'standard_rolls' && (
                    <>
                      {/* Standard Rolls */}
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
                            <div className="flex gap-2">
                              <Select
                                value={formData.lengthPerRoll === 'custom' || (formData.lengthPerRoll && !rollConfig.options.find((o: any) => o.value.toString() === formData.lengthPerRoll)) ? 'custom' : formData.lengthPerRoll}
                                onValueChange={(value) => {
                                  if (value === 'custom') {
                                    setFormData({...formData, lengthPerRoll: ''});
                                  } else {
                                    setFormData({...formData, lengthPerRoll: value});
                                  }
                                }}
                              >
                                <SelectTrigger id="lengthPerRoll" className="h-10 flex-1">
                                  <SelectValue placeholder="Select length" />
                                </SelectTrigger>
                                <SelectContent>
                                  {rollConfig.options.map((opt: any) => (
                                    <SelectItem key={opt.value} value={opt.value.toString()}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="custom">Custom</SelectItem>
                                </SelectContent>
                              </Select>
                              {(formData.lengthPerRoll === '' || formData.lengthPerRoll === 'custom' || (formData.lengthPerRoll && !rollConfig.options.find((o: any) => o.value.toString() === formData.lengthPerRoll))) && (
                                <Input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  placeholder="Enter length"
                                  value={formData.lengthPerRoll === 'custom' ? '' : formData.lengthPerRoll}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setFormData({...formData, lengthPerRoll: value});
                                  }}
                                  className="h-10 w-24"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>

                      {/* Cut Rolls */}
                      {rollConfig.allow_cut_rolls && (
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
                      )}
                    </>
                  )}

                  {rollConfig.type === 'bundles' && (
                    <>
                      {/* Bundles */}
                      <Card className="p-4 bg-secondary/20">
                        <h3 className="font-medium mb-3">Bundles</h3>
                        <div className={`grid gap-4 ${rollConfig.quantity_based ? 'grid-cols-2' : 'grid-cols-3'}`}>
                          <div className="space-y-2">
                            <Label htmlFor="numberOfBundles">Number of Bundles</Label>
                            <Input
                              id="numberOfBundles"
                              type="number"
                              min="0"
                              placeholder="0"
                              value={formData.numberOfBundles}
                              onChange={(e) => setFormData({...formData, numberOfBundles: e.target.value})}
                              className="h-10"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="bundleSize">{rollConfig.quantity_based ? 'Pieces' : 'Pipes'} per Bundle</Label>
                            <div className="flex gap-2">
                              <Select
                                value={formData.bundleSize === 'custom' || (formData.bundleSize && !rollConfig.bundle_sizes.includes(parseInt(formData.bundleSize))) ? 'custom' : formData.bundleSize}
                                onValueChange={(value) => {
                                  if (value === 'custom') {
                                    setFormData({...formData, bundleSize: ''});
                                  } else {
                                    setFormData({...formData, bundleSize: value});
                                  }
                                }}
                              >
                                <SelectTrigger id="bundleSize" className="h-10 flex-1">
                                  <SelectValue placeholder="Select size" />
                                </SelectTrigger>
                                <SelectContent>
                                  {rollConfig.bundle_sizes.map((size: number) => (
                                    <SelectItem key={size} value={size.toString()}>
                                      {size} {rollConfig.quantity_based ? 'pieces' : 'pipes'}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="custom">Custom</SelectItem>
                                </SelectContent>
                              </Select>
                              {(formData.bundleSize === '' || formData.bundleSize === 'custom' || (formData.bundleSize && !rollConfig.bundle_sizes.includes(parseInt(formData.bundleSize)))) && (
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="Enter size"
                                  value={formData.bundleSize === 'custom' ? '' : formData.bundleSize}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setFormData({...formData, bundleSize: value});
                                  }}
                                  className="h-10 w-24"
                                />
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="lengthPerPipe">
                              Length per {rollConfig.quantity_based ? 'Piece' : 'Pipe'} {selectedProductType && `(${selectedProductType.units?.abbreviation || 'm'})`}
                            </Label>
                            <Input
                              id="lengthPerPipe"
                              type="number"
                              step="0.001"
                              placeholder="Enter length"
                              value={formData.lengthPerRoll}
                              onChange={(e) => {
                                const value = e.target.value;
                                // For quantity-based products (Sprinkler), also update lengthPerPiece for weight calculation
                                if (rollConfig.quantity_based) {
                                  setFormData({...formData, lengthPerRoll: value, lengthPerPiece: value});
                                } else {
                                  setFormData({...formData, lengthPerRoll: value});
                                }
                              }}
                              className="h-10"
                            />
                          </div>
                        </div>
                      </Card>

                      {/* Spare Pipes */}
                      {rollConfig.allow_spare && (
                        <Card className="p-4 bg-secondary/20">
                          <div className="mb-3">
                            <h3 className="font-medium mb-2">Spare {rollConfig.quantity_based ? 'Pieces' : 'Pipes'} (Not Bundled)</h3>
                            {rollConfig.quantity_based ? (
                              // Single input for quantity-based products (sprinkler)
                              <div className="space-y-2">
                                <Label htmlFor="sparePieces">Total Spare Pieces</Label>
                                <Input
                                  id="sparePieces"
                                  type="number"
                                  step="1"
                                  min="0"
                                  placeholder="Enter total spare pieces"
                                  value={formData.sparePipes.length > 0 ? formData.sparePipes[0].length : ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '' || parseInt(value) === 0) {
                                      setFormData({...formData, sparePipes: []});
                                    } else {
                                      setFormData({...formData, sparePipes: [{length: value}]});
                                    }
                                  }}
                                  className="h-12"
                                />
                                {formData.sparePipes.length > 0 && formData.sparePipes[0].length && (
                                  <p className="text-sm text-muted-foreground">
                                    {formData.sparePipes[0].length} spare pieces will be added
                                  </p>
                                )}
                              </div>
                            ) : (
                              // Multiple entries for length-based products (HDPE)
                              <>
                                <div className="flex items-center gap-2 mb-3">
                                  <Input
                                    type="number"
                                    step="0.001"
                                    placeholder="Enter length"
                                    value={newSparePipeLength}
                                    onChange={(e) => setNewSparePipeLength(e.target.value)}
                                    className="h-9 flex-1"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                      if (newSparePipeLength && parseFloat(newSparePipeLength) > 0) {
                                        setFormData({
                                          ...formData,
                                          sparePipes: [...formData.sparePipes, { length: newSparePipeLength }]
                                        });
                                        setNewSparePipeLength('');
                                      } else {
                                        toast.error('Please enter a valid length');
                                      }
                                    }}
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Add
                                  </Button>
                                </div>

                                {formData.sparePipes.length > 0 && (
                                  <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {formData.sparePipes.map((pipe, index) => (
                                      <div key={index} className="flex items-center justify-between p-2 bg-background rounded">
                                        <span className="text-sm">
                                          Pipe {index + 1}: {pipe.length} {selectedProductType?.units?.abbreviation || 'm'}
                                        </span>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            const newSpares = formData.sparePipes.filter((_, i) => i !== index);
                                            setFormData({...formData, sparePipes: newSpares});
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {formData.sparePipes.length === 0 && (
                                  <p className="text-sm text-muted-foreground italic">No spare pipes added</p>
                                )}
                              </>
                            )}
                          </div>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Production Date and Time */}
              <div className="space-y-2">
                <Label htmlFor="productionDate">Production Date & Time (IST) *</Label>
                <Input
                  id="productionDate"
                  type="datetime-local"
                  value={formData.productionDate}
                  onChange={(e) => setFormData({...formData, productionDate: e.target.value})}
                  className="h-12"
                />
                <p className="text-xs text-muted-foreground">
                  All times are in Indian Standard Time (IST)
                </p>
              </div>

              {/* Quantity (Auto-calculated) */}
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  Total Quantity (Auto-calculated) {selectedProductType && `(${rollConfig.quantity_based ? 'pcs' : (selectedProductType.units?.abbreviation || 'm')})`}
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.001"
                  placeholder="Auto-calculated"
                  value={formData.quantity}
                  readOnly
                  className="h-12 bg-muted font-semibold"
                />
                {rollConfig.type === 'standard_rolls' && (
                  <p className="text-xs text-muted-foreground">
                    Standard: {parseInt(formData.numberOfRolls) || 0} rolls × {parseFloat(formData.lengthPerRoll) || 0}m = {((parseInt(formData.numberOfRolls) || 0) * (parseFloat(formData.lengthPerRoll) || 0)).toFixed(2)}m
                    {formData.cutRolls.length > 0 && (
                      <> | Cut: {formData.cutRolls.length} roll(s) = {formData.cutRolls.reduce((sum, r) => sum + (parseFloat(r.length) || 0), 0).toFixed(2)}m</>
                    )}
                  </p>
                )}
                {rollConfig.type === 'bundles' && rollConfig.quantity_based && (
                  <p className="text-xs text-muted-foreground">
                    Bundles: {parseInt(formData.numberOfBundles) || 0} × {parseInt(formData.bundleSize) || 0} pcs = {((parseInt(formData.numberOfBundles) || 0) * (parseInt(formData.bundleSize) || 0))} pcs
                    {formData.sparePipes.length > 0 && (
                      <> | Spare: {formData.sparePipes.reduce((sum, p) => sum + (parseInt(p.length) || 0), 0)} pcs</>
                    )}
                  </p>
                )}
                {rollConfig.type === 'bundles' && !rollConfig.quantity_based && (
                  <p className="text-xs text-muted-foreground">
                    Bundles: {parseInt(formData.numberOfBundles) || 0} × {parseInt(formData.bundleSize) || 0} pipes × {parseFloat(formData.lengthPerRoll) || 0}m = {((parseInt(formData.numberOfBundles) || 0) * (parseInt(formData.bundleSize) || 0) * (parseFloat(formData.lengthPerRoll) || 0)).toFixed(2)}m
                    {formData.sparePipes.length > 0 && (
                      <> | Spare: {formData.sparePipes.reduce((sum, p) => sum + (parseFloat(p.length) || 0), 0).toFixed(2)}m</>
                    )}
                  </p>
                )}
              </div>

              {/* Weight Tracking */}
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <h3 className="font-medium mb-3 text-blue-900 dark:text-blue-100">Weight Tracking (Optional)</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weightPerMeter">
                      Weight per Meter (g/m)
                    </Label>
                    <Input
                      id="weightPerMeter"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="e.g., 450.5"
                      value={formData.weightPerMeter}
                      onChange={(e) => setFormData({...formData, weightPerMeter: e.target.value})}
                      className="h-12"
                    />
                    <p className="text-xs text-muted-foreground">
                      Weight in grams per meter
                    </p>
                  </div>
                  {productTypes.find(pt => pt.id === formData.productTypeId)?.roll_configuration?.quantity_based && (
                    <div className="space-y-2">
                      <Label htmlFor="lengthPerPiece">
                        Length per Piece (m)
                      </Label>
                      <Input
                        id="lengthPerPiece"
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="e.g., 6"
                        value={formData.lengthPerPiece}
                        onChange={(e) => setFormData({...formData, lengthPerPiece: e.target.value})}
                        className="h-12"
                      />
                      <p className="text-xs text-muted-foreground">
                        Default length for each piece
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="totalWeight">
                      Total Weight (Auto-calculated)
                    </Label>
                    <Input
                      id="totalWeight"
                      type="number"
                      step="0.001"
                      placeholder="Auto-calculated"
                      value={formData.totalWeight}
                      readOnly
                      className="h-12 bg-muted font-semibold"
                    />
                    {formData.totalWeight && (
                      <p className="text-xs text-muted-foreground">
                        = {(parseFloat(formData.totalWeight) / 1000).toFixed(2)} kg
                      </p>
                    )}
                  </div>
                </div>
              </Card>

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
