import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface VehicleFormData {
  vehicle_number: string;
  vehicle_type: string;
  driver_name: string;
  driver_phone: string;
}

interface VehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: VehicleFormData;
  onFormChange: (form: VehicleFormData) => void;
  onSave: () => void;
  loading: boolean;
  isEditing: boolean;
}

export const VehicleDialog = ({ open, onOpenChange, form, onFormChange, onSave, loading, isEditing }: VehicleDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Driver Name *</Label>
            <Input
              value={form.driver_name}
              onChange={(e) => onFormChange({ ...form, driver_name: e.target.value })}
              placeholder="e.g. Rajesh Kumar"
              autoFocus
            />
          </div>
          <div>
            <Label>Vehicle Number</Label>
            <Input
              value={form.vehicle_number}
              onChange={(e) => onFormChange({ ...form, vehicle_number: e.target.value })}
              placeholder="e.g. GJ01AB1234"
            />
          </div>
          <div>
            <Label>Driver Phone</Label>
            <Input
              value={form.driver_phone}
              onChange={(e) => onFormChange({ ...form, driver_phone: e.target.value })}
              placeholder="e.g. +91 98765 43210"
              type="tel"
            />
          </div>
          <div>
            <Label>Vehicle Type</Label>
            <Input
              value={form.vehicle_type}
              onChange={(e) => onFormChange({ ...form, vehicle_type: e.target.value })}
              placeholder="e.g. Truck, Tempo, Mini Truck"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
