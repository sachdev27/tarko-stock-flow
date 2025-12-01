import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TransportFormData {
  name: string;
  contact_person: string;
  phone: string;
}

interface TransportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: TransportFormData;
  onFormChange: (form: TransportFormData) => void;
  onSave: () => void;
  loading: boolean;
  isEditing: boolean;
}

export const TransportDialog = ({ open, onOpenChange, form, onFormChange, onSave, loading, isEditing }: TransportDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Transport' : 'Add Transport'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder="e.g. Express Logistics, Fast Transport"
              autoFocus
            />
          </div>
          <div>
            <Label>Contact Person</Label>
            <Input
              value={form.contact_person}
              onChange={(e) => onFormChange({ ...form, contact_person: e.target.value })}
              placeholder="e.g. Mr. Patel"
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
