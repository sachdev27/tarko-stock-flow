import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CustomerFormData {
  name: string;
  city: string;
  contact_person: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
}

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CustomerFormData;
  onFormChange: (form: CustomerFormData) => void;
  onSave: () => void;
  loading: boolean;
  isEditing: boolean;
}

export const CustomerDialog = ({ open, onOpenChange, form, onFormChange, onSave, loading, isEditing }: CustomerDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder="e.g. ABC Industries"
              autoFocus
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              value={form.city}
              onChange={(e) => onFormChange({ ...form, city: e.target.value })}
              placeholder="e.g. Mumbai, Delhi, Ahmedabad"
            />
          </div>
          <div>
            <Label>Contact Person</Label>
            <Input
              value={form.contact_person}
              onChange={(e) => onFormChange({ ...form, contact_person: e.target.value })}
              placeholder="e.g. Mr. Sharma"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
              placeholder="e.g. +91 98765 43210"
              type="tel"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={form.email}
              onChange={(e) => onFormChange({ ...form, email: e.target.value })}
              placeholder="e.g. contact@example.com"
              type="email"
            />
          </div>
          <div>
            <Label>GSTIN</Label>
            <Input
              value={form.gstin}
              onChange={(e) => onFormChange({ ...form, gstin: e.target.value })}
              placeholder="e.g. 22AAAAA0000A1Z5"
              maxLength={15}
            />
          </div>
          <div>
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => onFormChange({ ...form, address: e.target.value })}
              placeholder="e.g. 123 Street Name, Area"
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
