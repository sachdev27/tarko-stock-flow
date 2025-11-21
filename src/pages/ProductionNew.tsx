import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Factory, Plus } from 'lucide-react';
import { inventory, production, parameters } from '@/lib/api';
import { toISTDateTimeLocal } from '@/lib/utils';
import { ProductSelectionForm } from '@/components/production/ProductSelectionForm';
import { QuantityConfigForm } from '@/components/production/QuantityConfigForm';
import { BatchDetailsForm } from '@/components/production/BatchDetailsForm';

interface ProductType {
  id: string;
  name: string;
  parameter_schema?: Array<{ name: string; required: boolean }>;
  roll_configuration?: {
    type: 'standard_rolls' | 'bundles';
    quantity_based?: boolean;
  };
}

interface Brand {
  id: string;
  name: string;
}

const ProductionNew = () => {
  const [loading, setLoading] = useState(false);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [parameterOptions, setParameterOptions] = useState<Record<string, Array<{ value: string }>>>({});

  const [formData, setFormData] = useState({
    productTypeId: '',
    brandId: '',
    productionDate: toISTDateTimeLocal(new Date()),
    quantity: '',
    batchNo: '',
    autoBatchNo: true,
    parameters: {} as Record<string, string>,
    notes: '',
    // Roll config
    numberOfRolls: '1',
    lengthPerRoll: '500',
    cutRolls: [] as { length: string }[],
    // Bundle config
    numberOfBundles: '1',
    bundleSize: '10',
    lengthPerPiece: '6',
    sparePipes: [] as { length: string }[],
    // Weight tracking
    weightPerMeter: '',
    totalWeight: '',
  });

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    fetchMasterData();
  }, []);

  // Auto-calculate total quantity
  useEffect(() => {
    const selectedPT = productTypes.find(pt => pt.id === formData.productTypeId);
    const config = selectedPT?.roll_configuration || { type: 'standard_rolls' };

    let total = 0;

    if (config.type === 'standard_rolls') {
      const rolls = parseInt(formData.numberOfRolls) || 0;
      const lengthPerRoll = parseFloat(formData.lengthPerRoll) || 0;
      total = rolls * lengthPerRoll;
      formData.cutRolls.forEach(roll => {
        total += parseFloat(roll.length) || 0;
      });
    } else if (config.type === 'bundles') {
      const bundles = parseInt(formData.numberOfBundles) || 0;
      const bundleSize = parseInt(formData.bundleSize) || 0;

      if (config.quantity_based) {
        // Quantity-based (Sprinkler): count pieces
        total = bundles * bundleSize;
        formData.sparePipes.forEach(pipe => {
          total += parseInt(pipe.length) || 0;
        });
      } else {
        // Length-based: calculate total length
        const lengthPerPipe = parseFloat(formData.lengthPerRoll) || 0;
        total = bundles * bundleSize * lengthPerPipe;
        formData.sparePipes.forEach(pipe => {
          total += parseFloat(pipe.length) || 0;
        });
      }
    }

    if (total > 0 && formData.quantity !== total.toString()) {
      setFormData(prev => ({ ...prev, quantity: total.toString() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.productTypeId,
    formData.numberOfRolls,
    formData.lengthPerRoll,
    formData.cutRolls.length,
    formData.numberOfBundles,
    formData.bundleSize,
    formData.lengthPerPiece,
    formData.sparePipes.length,
    productTypes.length
  ]);

  // Auto-calculate total weight
  useEffect(() => {
    const weightPerM = parseFloat(formData.weightPerMeter) || 0;
    if (weightPerM <= 0) {
      setFormData(prev => ({ ...prev, totalWeight: '' }));
      return;
    }

    const selectedPT = productTypes.find(pt => pt.id === formData.productTypeId);
    const config = selectedPT?.roll_configuration || { type: 'standard_rolls' };
    let totalLengthMeters = 0;

    if (config.type === 'standard_rolls') {
      const rolls = parseInt(formData.numberOfRolls) || 0;
      const lengthPerRoll = parseFloat(formData.lengthPerRoll) || 0;
      totalLengthMeters += rolls * lengthPerRoll;
      formData.cutRolls.forEach(roll => {
        totalLengthMeters += parseFloat(roll.length) || 0;
      });
    } else if (config.type === 'bundles') {
      const bundles = parseInt(formData.numberOfBundles) || 0;
      const bundleSize = parseInt(formData.bundleSize) || 0;
      const lengthPerPiece = parseFloat(formData.lengthPerPiece) || 0;
      totalLengthMeters += bundles * bundleSize * lengthPerPiece;

      if (config.quantity_based) {
        const spareCount = formData.sparePipes.reduce((sum, pipe) => sum + (parseInt(pipe.length) || 0), 0);
        totalLengthMeters += spareCount * lengthPerPiece;
      } else {
        formData.sparePipes.forEach(pipe => {
          totalLengthMeters += parseFloat(pipe.length) || 0;
        });
      }
    }

    const totalWeightKg = totalLengthMeters * weightPerM;
    setFormData(prev => ({ ...prev, totalWeight: totalWeightKg.toFixed(3) }));
  }, [formData.weightPerMeter, formData.numberOfRolls, formData.lengthPerRoll, formData.cutRolls, formData.numberOfBundles, formData.bundleSize, formData.lengthPerPiece, formData.sparePipes, formData.productTypeId, productTypes]);

  const fetchMasterData = async () => {
    try {
      const [ptRes, brandRes, paramsRes] = await Promise.all([
        inventory.getProductTypes(),
        inventory.getBrands(),
        parameters.getOptions()
      ]);

      setProductTypes(ptRes.data);
      setBrands(brandRes.data);
      setParameterOptions(paramsRes.data);
    } catch (error) {
      toast.error('Failed to load master data');
    }
  };

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleParameterChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      parameters: { ...prev.parameters, [key]: value }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);

    // Validate required fields
    if (!formData.productTypeId || !formData.brandId || !formData.quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    const quantity = parseFloat(formData.quantity);
    if (quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    // Validate weight per meter
    if (!formData.weightPerMeter || parseFloat(formData.weightPerMeter) <= 0) {
      toast.error('Weight per Meter is required and must be greater than 0');
      return;
    }

    // Validate parameters
    const productType = productTypes.find(pt => pt.id === formData.productTypeId);
    const paramSchema = productType?.parameter_schema || [];
    for (const param of paramSchema) {
      if (param.required && !formData.parameters[param.name]) {
        toast.error(`${param.name} is required`);
        return;
      }
    }

    setLoading(true);

    try {
      const config = productType?.roll_configuration || { type: 'standard_rolls' };

      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append('product_type_id', formData.productTypeId);
      formDataToSend.append('brand_id', formData.brandId);
      formDataToSend.append('parameters', JSON.stringify(formData.parameters));
      formDataToSend.append('production_date', formData.productionDate);
      formDataToSend.append('quantity', formData.quantity);
      formDataToSend.append('batch_no', formData.batchNo);
      formDataToSend.append('notes', formData.notes);

      // Add configuration based on type
      formDataToSend.append('roll_config_type', config.type);
      formDataToSend.append('quantity_based', config.quantity_based ? 'true' : 'false');

      if (config.type === 'standard_rolls') {
        formDataToSend.append('number_of_rolls', formData.numberOfRolls);
        formDataToSend.append('length_per_roll', formData.lengthPerRoll);
        formDataToSend.append('cut_rolls', JSON.stringify(formData.cutRolls));
      } else {
        formDataToSend.append('number_of_bundles', formData.numberOfBundles);
        formDataToSend.append('bundle_size', formData.bundleSize);
        formDataToSend.append('piece_length', formData.lengthPerPiece);
        formDataToSend.append('spare_pipes', JSON.stringify(formData.sparePipes));
      }

      // Add weight tracking if provided
      if (formData.weightPerMeter) {
        formDataToSend.append('weight_per_meter', formData.weightPerMeter);
      }
      if (formData.totalWeight) {
        formDataToSend.append('total_weight', formData.totalWeight);
      }

      if (attachmentFile) {
        formDataToSend.append('attachment', attachmentFile);
      }

      const { data } = await production.createBatch(formDataToSend);

      toast.success(`Production batch ${data.batch_code} created successfully!`);

      // Reset form
      setFormData({
        productTypeId: '',
        brandId: '',
        productionDate: toISTDateTimeLocal(new Date()),
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
        lengthPerPiece: '6',
        sparePipes: [],
        weightPerMeter: '',
        totalWeight: '',
      });
      setAttachmentFile(null);
      setSubmitAttempted(false);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to create production batch');
    } finally {
      setLoading(false);
    }
  };

  const selectedProductType = productTypes.find(pt => pt.id === formData.productTypeId);
  const rollConfig = selectedProductType?.roll_configuration || { type: 'standard_rolls', quantity_based: false };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Factory className="h-8 w-8" />
              Production Entry
            </h1>
            <p className="text-muted-foreground mt-1">
              Create new production batches and track inventory
            </p>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>New Production Batch</CardTitle>
            <CardDescription>
              Enter production details to create a new batch
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Product Selection */}
              <ProductSelectionForm
                productTypes={productTypes}
                brands={brands}
                formData={formData}
                parameterOptions={parameterOptions}
                onChange={handleFieldChange}
                onParameterChange={handleParameterChange}
                submitAttempted={submitAttempted}
              />

              {/* Quantity Configuration */}
              {formData.productTypeId && (
                <QuantityConfigForm
                  configType={rollConfig.type}
                  isQuantityBased={rollConfig.quantity_based || false}
                  rollConfig={{
                    numberOfRolls: formData.numberOfRolls,
                    lengthPerRoll: formData.lengthPerRoll,
                    cutRolls: formData.cutRolls
                  }}
                  bundleConfig={{
                    numberOfBundles: formData.numberOfBundles,
                    bundleSize: formData.bundleSize,
                    lengthPerPiece: formData.lengthPerPiece,
                    sparePipes: formData.sparePipes
                  }}
                  onRollChange={(field, value) => handleFieldChange(field, value)}
                  onBundleChange={(field, value) => handleFieldChange(field, value)}
                  onAddCutRoll={(length) => {
                    setFormData(prev => ({
                      ...prev,
                      cutRolls: [...prev.cutRolls, { length }]
                    }));
                  }}
                  onRemoveCutRoll={(index) => {
                    setFormData(prev => ({
                      ...prev,
                      cutRolls: prev.cutRolls.filter((_, i) => i !== index)
                    }));
                  }}
                  onAddSparePipe={(length) => {
                    setFormData(prev => ({
                      ...prev,
                      sparePipes: [...prev.sparePipes, { length }]
                    }));
                  }}
                  onRemoveSparePipe={(index) => {
                    setFormData(prev => ({
                      ...prev,
                      sparePipes: prev.sparePipes.filter((_, i) => i !== index)
                    }));
                  }}
                  submitAttempted={submitAttempted}
                />
              )}

              {/* Total Quantity Display */}
              {formData.quantity && (
                <div className="bg-primary/10 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Total Quantity:</span>
                    <span className="text-2xl font-bold text-primary">
                      {formData.quantity} {rollConfig.quantity_based ? 'pieces' : 'meters'}
                    </span>
                  </div>
                </div>
              )}

              {/* Weight Tracking */}
              {formData.productTypeId && (
                <Card className="p-4 bg-red-50 dark:bg-red-950/20 border-2 border-red-400 dark:border-red-600">
                  <h3 className="font-bold text-lg mb-3 text-red-900 dark:text-red-100">⚖️ Weight Tracking</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weightPerMeter">
                        Weight per Meter (kg/m) *
                      </Label>
                      <input
                        id="weightPerMeter"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="e.g., 0.450"
                        value={formData.weightPerMeter}
                        onChange={(e) => handleFieldChange('weightPerMeter', e.target.value)}
                        className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Weight in kilograms per meter
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="totalWeight">
                        Total Production Weight (Auto-calculated)
                      </Label>
                      <div className="bg-red-100 dark:bg-red-900/20 p-3 rounded-lg border-2 border-red-400">
                        <span className="text-3xl font-bold text-red-600 dark:text-red-400">
                          {formData.totalWeight ? `${parseFloat(formData.totalWeight).toFixed(2)} kg` : '0.00 kg'}
                        </span>
                      </div>
                      {formData.totalWeight && (
                        <p className="text-xs font-semibold text-red-600">
                          Total Production Weight
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* Batch Details */}
              <BatchDetailsForm
                formData={formData}
                attachmentFile={attachmentFile}
                onChange={handleFieldChange}
                onFileChange={setAttachmentFile}
                submitAttempted={submitAttempted}
              />

              {/* Submit Button */}
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

export default ProductionNew;
