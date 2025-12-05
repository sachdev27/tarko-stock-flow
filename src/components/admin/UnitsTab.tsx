import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Ruler } from 'lucide-react';
import { admin } from '@/lib/api';

interface Unit {
  id: string;
  name: string;
  abbreviation: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

interface UnitsTabProps {
  units: Unit[];
  onDataChange: () => void;
}

export const UnitsTab = ({ units, onDataChange }: UnitsTabProps) => {
  const [unitDialog, setUnitDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitForm, setUnitForm] = useState({
    name: '',
    abbreviation: '',
  });

  const handleAddUnit = async () => {
    if (!unitForm.name || !unitForm.abbreviation) {
      toast.error('Unit name and abbreviation are required');
      return;
    }

    try {
      if (editingUnit) {
        await admin.updateUnit(editingUnit.id, unitForm);
        toast.success('Unit updated successfully');
      } else {
        await admin.createUnit(unitForm);
        toast.success('Unit added successfully');
      }

      setUnitDialog(false);
      setEditingUnit(null);
      setUnitForm({ name: '', abbreviation: '' });
      onDataChange();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to save unit');
    }
  };

  const handleEditUnit = (unit: Unit) => {
    setEditingUnit(unit);
    setUnitForm({
      name: unit.name,
      abbreviation: unit.abbreviation,
    });
    setUnitDialog(true);
  };

  const handleDelete = async (id: string) => {
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Units of Measurement</CardTitle>
            <CardDescription>Manage units used in the system (meters, pieces, kg, etc.)</CardDescription>
          </div>
          <Dialog open={unitDialog} onOpenChange={(open) => {
            setUnitDialog(open);
            if (!open) {
              setEditingUnit(null);
              setUnitForm({ name: '', abbreviation: '' });
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Unit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingUnit ? 'Edit' : 'Add'} Unit</DialogTitle>
                <DialogDescription>Define a unit of measurement</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="unitName">Unit Name *</Label>
                  <Input
                    id="unitName"
                    value={unitForm.name}
                    onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                    placeholder="e.g., Meters, Kilograms, Pieces"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unitAbbr">Abbreviation *</Label>
                  <Input
                    id="unitAbbr"
                    value={unitForm.abbreviation}
                    onChange={(e) => setUnitForm({ ...unitForm, abbreviation: e.target.value })}
                    placeholder="e.g., m, kg, pcs"
                  />
                </div>

                <Button onClick={handleAddUnit} className="w-full">
                  {editingUnit ? 'Update' : 'Add'} Unit
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {units.map((unit) => (
            <div
              key={unit.id}
              className="p-4 bg-secondary/30 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <Ruler className="h-5 w-5 text-muted-foreground mt-1" />
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {unit.name}
                      {unit.is_system && (
                        <Badge variant="secondary" className="text-xs">
                          System
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Abbreviation: <span className="font-mono">{unit.abbreviation}</span>
                    </div>
                  </div>
                </div>
                {!unit.is_system && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditUnit(unit)}
                    >
                      <Edit className="h-4 w-4 text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(unit.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
