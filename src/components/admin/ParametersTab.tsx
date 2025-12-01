import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Sliders } from 'lucide-react';
import { parameters } from '@/lib/api';

interface ParametersTabProps {
  parameterOptions: Record<string, any[]>;
  onDataChange: () => void;
}

export const ParametersTab = ({ parameterOptions, onDataChange }: ParametersTabProps) => {
  const [parameterDialog, setParameterDialog] = useState(false);
  const [editingParameter, setEditingParameter] = useState<any>(null);
  const [parameterForm, setParameterForm] = useState({
    id: '',
    parameter_name: 'PE',
    option_value: '',
  });

  const handleAddParameter = async () => {
    if (!parameterForm.option_value.trim()) {
      toast.error('Please enter a value');
      return;
    }

    try {
      if (editingParameter) {
        await parameters.updateOption(parameterForm.id, {
          parameter_name: parameterForm.parameter_name,
          option_value: parameterForm.option_value.trim(),
        });
        toast.success('Parameter option updated successfully');
      } else {
        await parameters.addOption({
          parameter_name: parameterForm.parameter_name,
          option_value: parameterForm.option_value.trim(),
        });
        toast.success('Parameter option added successfully');
      }

      setParameterDialog(false);
      setEditingParameter(null);
      setParameterForm({
        id: '',
        parameter_name: 'PE',
        option_value: '',
      });
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || `Failed to ${editingParameter ? 'update' : 'add'} parameter option`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this parameter option?')) return;

    try {
      await parameters.deleteOption(parseInt(id));
      toast.success('Parameter option deleted successfully');
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete parameter option');
    }
  };

  const renderParameterSection = (paramName: string, displayName: string) => (
    <div>
      <h3 className="font-semibold mb-3 text-sm">{displayName}</h3>
      <div className="space-y-2">
        {(parameterOptions[paramName] || []).map((option) => (
          <div
            key={option.id}
            className="flex items-center justify-between p-2 bg-secondary/20 rounded"
          >
            <span className="text-sm">{option.value}</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingParameter(option);
                  setParameterForm({
                    id: option.id,
                    parameter_name: paramName,
                    option_value: option.value,
                  });
                  setParameterDialog(true);
                }}
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(option.id.toString())}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        {(!parameterOptions[paramName] || parameterOptions[paramName].length === 0) && (
          <p className="text-sm text-muted-foreground italic">No options added</p>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <Sliders className="h-5 w-5 mr-2" />
              Parameter Options
            </CardTitle>
            <CardDescription>Manage PE, PN, OD, and Type parameter values</CardDescription>
          </div>
          <Dialog open={parameterDialog} onOpenChange={(open) => {
            setParameterDialog(open);
            if (!open) {
              setEditingParameter(null);
              setParameterForm({
                id: '',
                parameter_name: 'PE',
                option_value: '',
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Option
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingParameter ? 'Edit' : 'Add'} Parameter Option</DialogTitle>
                <DialogDescription>{editingParameter ? 'Update' : 'Add a new'} value for a parameter</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="paramName">Parameter *</Label>
                  <Select
                    value={parameterForm.parameter_name}
                    onValueChange={(value) =>
                      setParameterForm({ ...parameterForm, parameter_name: value })
                    }
                  >
                    <SelectTrigger id="paramName">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PE">PE (Polyethylene)</SelectItem>
                      <SelectItem value="PN">PN (Pressure Nominal)</SelectItem>
                      <SelectItem value="OD">OD (Outer Diameter)</SelectItem>
                      <SelectItem value="Type">Type (Sprinkler Type)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paramValue">Value *</Label>
                  <Input
                    id="paramValue"
                    value={parameterForm.option_value}
                    onChange={(e) =>
                      setParameterForm({ ...parameterForm, option_value: e.target.value })
                    }
                    placeholder="e.g., PE80, PN10, 50mm"
                  />
                </div>
                <Button onClick={handleAddParameter} className="w-full">
                  {editingParameter ? 'Update' : 'Add'} Option
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {renderParameterSection('PE', 'PE (Polyethylene)')}
          {renderParameterSection('PN', 'PN (Pressure Nominal)')}
          {renderParameterSection('OD', 'OD (Outer Diameter)')}
          {renderParameterSection('Type', 'Type (Sprinkler Type)')}
        </div>
      </CardContent>
    </Card>
  );
};
