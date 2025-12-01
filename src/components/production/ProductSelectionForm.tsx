import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';

interface ProductType {
  id: string;
  name: string;
  parameter_schema?: Array<{
    name: string;
    required: boolean;
    type?: string;
    options?: string[];
  }>;
  roll_configuration?: {
    type: 'standard_rolls' | 'bundles';
    quantity_based?: boolean;
  };
}

interface Brand {
  id: string;
  name: string;
}

interface ProductSelectionFormProps {
  productTypes: ProductType[];
  brands: Brand[];
  formData: {
    productTypeId: string;
    brandId: string;
    parameters: Record<string, string>;
  };
  parameterOptions: Record<string, Array<{ id?: string; value: string }>>;
  onChange: (field: string, value: string) => void;
  onParameterChange: (key: string, value: string) => void;
  submitAttempted: boolean;
}

export const ProductSelectionForm = ({
  productTypes,
  brands,
  formData,
  parameterOptions,
  onChange,
  onParameterChange,
  submitAttempted
}: ProductSelectionFormProps) => {
  const selectedProductType = productTypes.find(pt => pt.id === formData.productTypeId);
  const paramSchema = selectedProductType?.parameter_schema || [];

  return (
    <>
      {/* Product Type */}
      <div className="space-y-2">
        <Label htmlFor="productType">
          Product Type <span className="text-red-500">*</span>
        </Label>
        <Select value={formData.productTypeId} onValueChange={(value) => onChange('productTypeId', value)}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Select product type" />
          </SelectTrigger>
          <SelectContent>
            {productTypes.map((pt) => (
              <SelectItem key={pt.id} value={pt.id}>
                {pt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {submitAttempted && !formData.productTypeId && (
          <p className="text-xs text-red-500">Product type is required</p>
        )}
      </div>

      {/* Brand */}
      <div className="space-y-2">
        <Label htmlFor="brand">
          Brand <span className="text-red-500">*</span>
        </Label>
        <Select value={formData.brandId} onValueChange={(value) => onChange('brandId', value)}>
          <SelectTrigger className="h-12">
            <SelectValue placeholder="Select brand" />
          </SelectTrigger>
          <SelectContent>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {submitAttempted && !formData.brandId && (
          <p className="text-xs text-red-500">Brand is required</p>
        )}
      </div>

      {/* Dynamic Parameters */}
      {paramSchema.length > 0 && (
        <Card className="p-4 bg-muted/50">
          <h3 className="font-semibold mb-3">Product Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paramSchema.map((param) => {
              const options = parameterOptions[param.name] || [];
              const label = param.name;

              return (
                <div key={param.name} className="space-y-2">
                  <Label htmlFor={param.name}>
                    {label} {param.required && <span className="text-red-500">*</span>}
                  </Label>
                  <Select
                    value={formData.parameters[param.name] || ''}
                    onValueChange={(value) => onParameterChange(param.name, value)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={`Select ${label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option: { id?: string; value: string }) => (
                        <SelectItem key={option.id || option.value} value={option.value}>
                          {option.value}
                        </SelectItem>
                      ))}
                      {param.options?.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {submitAttempted && param.required && !formData.parameters[param.name] && (
                    <p className="text-xs text-red-500">{label} is required</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
};
