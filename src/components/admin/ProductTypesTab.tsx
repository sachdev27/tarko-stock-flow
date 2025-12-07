import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Package } from 'lucide-react';
import { admin } from '@/lib/api-typed';
import type * as API from '@/types';

interface ProductTypesTabProps {
  productTypes: any[];
  units: any[];
  onDataChange: () => void;
}

export const ProductTypesTab = ({ productTypes, units, onDataChange }: ProductTypesTabProps) => {
  const [productTypeDialog, setProductTypeDialog] = useState(false);
  const [editingProductType, setEditingProductType] = useState<any>(null);
  const [productTypeForm, setProductTypeForm] = useState({
    name: '',
    unit_id: '',
    description: '',
    parameter_schema: [] as any[],
    roll_configuration: {
      type: 'standard_rolls',
      options: [
        { value: 500, label: '500m' },
        { value: 300, label: '300m' },
        { value: 200, label: '200m' },
        { value: 100, label: '100m' }
      ],
      allow_cut_rolls: true,
      bundle_sizes: [],
      allow_spare: false
    }
  });
  const [newParameter, setNewParameter] = useState({
    name: '',
    type: 'text',
    required: false,
  });
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [unitForm, setUnitForm] = useState({ name: '', abbreviation: '' });
  const [editingUnit, setEditingUnit] = useState<any>(null);

  const handleAddProductType = async () => {
    if (!productTypeForm.name || !productTypeForm.unit_id) {
      toast.error('Product type name and unit are required');
      return;
    }

    try {
      if (editingProductType) {
        await admin.updateProductType(editingProductType.id, productTypeForm);
        toast.success('Product type updated successfully');
      } else {
        await admin.createProductType(productTypeForm);
        toast.success('Product type added successfully');
      }

      setProductTypeDialog(false);
      setEditingProductType(null);
      setProductTypeForm({
        name: '',
        unit_id: '',
        description: '',
        parameter_schema: [],
        roll_configuration: {
          type: 'standard_rolls',
          options: [
            { value: 500, label: '500m' },
            { value: 300, label: '300m' },
            { value: 200, label: '200m' },
            { value: 100, label: '100m' }
          ],
          allow_cut_rolls: true,
          bundle_sizes: [],
          allow_spare: false,
        },
      });
      setNewParameter({ name: '', type: 'text', required: false });
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save product type');
    }
  };

  const handleEditProductType = (productType: any) => {
    setEditingProductType(productType);
    setProductTypeForm({
      name: productType.name,
      unit_id: productType.unit_id,
      description: productType.description || '',
      parameter_schema: productType.parameter_schema || [],
      roll_configuration: productType.roll_configuration || {
        type: 'standard_rolls',
        options: [
          { value: 500, label: '500m' },
          { value: 300, label: '300m' },
          { value: 200, label: '200m' },
          { value: 100, label: '100m' }
        ],
        allow_cut_rolls: true,
        bundle_sizes: [],
        allow_spare: false,
      },
    });
    setProductTypeDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product type?')) return;

    try {
      await admin.deleteProductType(id);
      toast.success('Product type deleted successfully');
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete product type');
    }
  };

  const handleSaveUnit = async () => {
    if (!unitForm.name || !unitForm.abbreviation) {
      toast.error('Unit name and abbreviation are required');
      return;
    }

    try {
      if (editingUnit) {
        await admin.updateUnit(editingUnit.id, unitForm);
        toast.success('Unit updated successfully');
      } else {
        const result = await admin.createUnit(unitForm);
        toast.success('Unit created successfully');
        // Auto-select the newly created unit
        if (result && result.id) {
          setProductTypeForm({ ...productTypeForm, unit_id: result.id });
        }
      }
      setShowUnitForm(false);
      setUnitForm({ name: '', abbreviation: '' });
      setEditingUnit(null);
      onDataChange();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to save unit');
    }
  };

  const handleEditUnit = (unit: any) => {
    setEditingUnit(unit);
    setUnitForm({ name: unit.name, abbreviation: unit.abbreviation });
    setShowUnitForm(true);
  };

  const handleDeleteUnit = async (id: string) => {
    if (!confirm('Are you sure you want to delete this unit?')) return;

    try {
      await admin.deleteUnit(id);
      toast.success('Unit deleted successfully');
      onDataChange();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to delete unit');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg sm:text-xl">Product Types</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Product categories with parameter definitions</CardDescription>
          </div>
          <Dialog open={productTypeDialog} onOpenChange={(open) => {
            setProductTypeDialog(open);
            if (!open) {
              setEditingProductType(null);
              setProductTypeForm({
                name: '',
                unit_id: '',
                description: '',
                parameter_schema: [],
                roll_configuration: {
                  type: 'standard_rolls',
                  options: [
                    { value: 500, label: '500m' },
                    { value: 300, label: '300m' },
                    { value: 200, label: '200m' },
                    { value: 100, label: '100m' }
                  ],
                  allow_cut_rolls: true,
                  bundle_sizes: [],
                  allow_spare: false,
                },
              });
              setNewParameter({ name: '', type: 'text', required: false });
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add Product Type
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
              <DialogHeader>
                <DialogTitle>{editingProductType ? 'Edit' : 'Add'} Product Type</DialogTitle>
                <DialogDescription>Define a product type with its parameters</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ptName">Product Type Name *</Label>
                  <Input
                    id="ptName"
                    value={productTypeForm.name}
                    onChange={(e) => setProductTypeForm({ ...productTypeForm, name: e.target.value })}
                    placeholder="e.g., HDPE Pipe"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ptUnit">Unit *</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowUnitForm(!showUnitForm);
                        setEditingUnit(null);
                        setUnitForm({ name: '', abbreviation: '' });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {showUnitForm ? 'Cancel' : 'New Unit'}
                    </Button>
                  </div>

                  {showUnitForm ? (
                    <div className="border rounded-lg p-3 space-y-3 bg-secondary/20">
                      <div className="space-y-2">
                        <Label htmlFor="unitName" className="text-xs">Unit Name *</Label>
                        <Input
                          id="unitName"
                          value={unitForm.name}
                          onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                          placeholder="e.g., Meters, Kilograms"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unitAbbr" className="text-xs">Abbreviation *</Label>
                        <Input
                          id="unitAbbr"
                          value={unitForm.abbreviation}
                          onChange={(e) => setUnitForm({ ...unitForm, abbreviation: e.target.value })}
                          placeholder="e.g., m, kg"
                          className="h-9"
                        />
                      </div>
                      <Button type="button" onClick={handleSaveUnit} size="sm" className="w-full">
                        {editingUnit ? 'Update' : 'Create'} Unit
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={productTypeForm.unit_id}
                      onValueChange={(value) => setProductTypeForm({ ...productTypeForm, unit_id: value })}
                    >
                      <SelectTrigger id="ptUnit">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                            {unit.is_system && ' • System'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {!showUnitForm && units.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-2">
                      <div className="flex flex-wrap gap-2">
                        {units.map((unit) => (
                          <div key={unit.id} className="flex items-center gap-1 bg-secondary/30 rounded px-2 py-1">
                            <span>{unit.name} ({unit.abbreviation})</span>
                            {unit.is_system ? (
                              <Badge variant="secondary" className="text-xs ml-1">System</Badge>
                            ) : (
                              <div className="flex gap-1 ml-1">
                                <button
                                  type="button"
                                  onClick={() => handleEditUnit(unit)}
                                  className="text-primary hover:text-primary/80"
                                >
                                  <Edit className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUnit(unit.id)}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ptDesc">Description</Label>
                  <Textarea
                    id="ptDesc"
                    value={productTypeForm.description}
                    onChange={(e) => setProductTypeForm({ ...productTypeForm, description: e.target.value })}
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Parameters</Label>
                  <div className="border rounded-lg p-3 space-y-2">
                    {productTypeForm.parameter_schema.map((param, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm">
                          {param.name} ({param.type}) {param.required && <Badge variant="outline" className="ml-2">Required</Badge>}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newSchema = productTypeForm.parameter_schema.filter((_, i) => i !== idx);
                            setProductTypeForm({ ...productTypeForm, parameter_schema: newSchema });
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}

                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <Input
                        placeholder="Parameter name"
                        value={newParameter.name}
                        onChange={(e) => setNewParameter({ ...newParameter, name: e.target.value })}
                      />
                      <Select
                        value={newParameter.type}
                        onValueChange={(value) => setNewParameter({ ...newParameter, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="select">Select</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={newParameter.required}
                          onChange={(e) => setNewParameter({ ...newParameter, required: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm">Required</span>
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (newParameter.name) {
                            setProductTypeForm({
                              ...productTypeForm,
                              parameter_schema: [...productTypeForm.parameter_schema, newParameter]
                            });
                            setNewParameter({ name: '', type: 'text', required: false });
                          }
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Roll Configuration */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Roll/Bundle Configuration</Label>

                  <div className="space-y-2">
                    <Label htmlFor="rollType">Roll Type</Label>
                    <Select
                      value={productTypeForm.roll_configuration.type}
                      onValueChange={(value) => {
                        const baseConfig = productTypeForm.roll_configuration;
                        const newConfig = {
                          ...baseConfig,
                          type: value,
                          options: baseConfig.options || [
                            { value: 500, label: '500m' },
                            { value: 300, label: '300m' },
                            { value: 200, label: '200m' },
                            { value: 100, label: '100m' }
                          ],
                          allow_cut_rolls: baseConfig.allow_cut_rolls ?? true,
                          bundle_sizes: baseConfig.bundle_sizes || [],
                          allow_spare: baseConfig.allow_spare ?? false,
                        };
                        setProductTypeForm({
                          ...productTypeForm,
                          roll_configuration: newConfig
                        });
                      }}
                    >
                      <SelectTrigger id="rollType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard_rolls">Standard Rolls (HDPE Pipe)</SelectItem>
                        <SelectItem value="bundles">Bundles (Sprinkler Pipe)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {productTypeForm.roll_configuration.type === 'standard_rolls' && (
                    <div className="space-y-2">
                      <Label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={productTypeForm.roll_configuration.allow_cut_rolls ?? true}
                          onChange={(e) => setProductTypeForm({
                            ...productTypeForm,
                            roll_configuration: { ...productTypeForm.roll_configuration, allow_cut_rolls: e.target.checked }
                          })}
                          className="rounded"
                        />
                        <span>Allow Cut Rolls</span>
                      </Label>
                    </div>
                  )}

                  {productTypeForm.roll_configuration.type === 'bundles' && (
                    <div className="space-y-2">
                      <Label>Bundle Sizes</Label>
                      <div className="flex gap-2">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={(productTypeForm.roll_configuration.bundle_sizes || []).includes(10)}
                            onChange={(e) => {
                              const sizes = e.target.checked
                                ? [...(productTypeForm.roll_configuration.bundle_sizes || []), 10]
                                : (productTypeForm.roll_configuration.bundle_sizes || []).filter(s => s !== 10);
                              setProductTypeForm({
                                ...productTypeForm,
                                roll_configuration: { ...productTypeForm.roll_configuration, bundle_sizes: sizes }
                              });
                            }}
                            className="rounded"
                          />
                          <span>10 pipes</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={(productTypeForm.roll_configuration.bundle_sizes || []).includes(20)}
                            onChange={(e) => {
                              const sizes = e.target.checked
                                ? [...(productTypeForm.roll_configuration.bundle_sizes || []), 20]
                                : (productTypeForm.roll_configuration.bundle_sizes || []).filter(s => s !== 20);
                              setProductTypeForm({
                                ...productTypeForm,
                                roll_configuration: { ...productTypeForm.roll_configuration, bundle_sizes: sizes }
                              });
                            }}
                            className="rounded"
                          />
                          <span>20 pipes</span>
                        </label>
                      </div>
                      <Label className="flex items-center space-x-2 mt-2">
                        <input
                          type="checkbox"
                          checked={productTypeForm.roll_configuration.allow_spare ?? false}
                          onChange={(e) => setProductTypeForm({
                            ...productTypeForm,
                            roll_configuration: { ...productTypeForm.roll_configuration, allow_spare: e.target.checked }
                          })}
                          className="rounded"
                        />
                        <span>Allow Spare Pipes (not bundled)</span>
                      </Label>
                    </div>
                  )}
                </div>

                <Button onClick={handleAddProductType} className="w-full">
                  {editingProductType ? 'Update' : 'Add'} Product Type
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {productTypes.map((type) => (
            <div
              key={type.id}
              className="p-4 bg-secondary/30 rounded-lg"
            >
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                <div className="flex items-start space-x-3 min-w-0 flex-1">
                  <Package className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-base sm:text-lg">{type.name}</div>
                    {type.description && (
                      <div className="text-xs sm:text-sm text-muted-foreground mt-1">{type.description}</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">Unit: {type.unit_name || 'N/A'}</Badge>
                      <Badge variant="outline" className="text-xs">
                        {type.parameter_schema?.length || 0} parameters
                      </Badge>
                    </div>
                    {(type.parameter_schema || []).length > 0 && (
                      <div className="mt-2 text-xs sm:text-sm">
                        <strong>Parameters:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(type.parameter_schema || []).map((param: any, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {param.name} ({param.type})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
                  {!type.is_system ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-initial"
                        onClick={() => handleEditProductType(type)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        <span className="sm:inline">Edit</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-initial"
                        onClick={() => handleDelete(type.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                        <span className="sm:inline">Delete</span>
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary" className="w-full sm:w-auto justify-center">
                      System
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
