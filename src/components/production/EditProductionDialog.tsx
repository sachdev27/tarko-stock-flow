import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

interface BatchDetails {
  id: string;
  batch_no: string;
  batch_code: string;
  production_date: string;
  initial_quantity: number;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, unknown>;
  notes?: string;
  attachment_url?: string;
  weight_per_meter?: number;
  total_weight?: number;
  piece_length?: number;
  total_items: number;
  created_by_email: string;
  created_at: string;
}

interface EditProductionDialogProps {
  batch: BatchDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  token: string;
}

export function EditProductionDialog({
  batch,
  open,
  onOpenChange,
  onSave,
  token
}: EditProductionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [productionDate, setProductionDate] = useState<Date | undefined>(undefined);
  const [productionTime, setProductionTime] = useState({ hours: '00', minutes: '00' });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [formData, setFormData] = useState({
    batch_no: '',
    notes: '',
    weight_per_meter: '',
    total_weight: '',
    piece_length: '',
  });

  // Initialize form when batch changes
  useEffect(() => {
    if (batch) {
      setFormData({
        batch_no: batch.batch_no || '',
        notes: batch.notes || '',
        weight_per_meter: batch.weight_per_meter?.toString() || '',
        total_weight: batch.total_weight?.toString() || '',
        piece_length: batch.piece_length?.toString() || '',
      });

      // Parse production date - handle timezone-aware date strings
      if (batch.production_date) {
        // Parse the date string which may include timezone info
        const date = new Date(batch.production_date);

        // Set the date for the calendar (date only, no time)
        setProductionDate(date);

        // Extract and set the time components
        setProductionTime({
          hours: date.getHours().toString().padStart(2, '0'),
          minutes: date.getMinutes().toString().padStart(2, '0'),
        });
      }
    }
  }, [batch]);

  const handleSave = async () => {
    if (!batch) return;

    try {
      setLoading(true);

      // Combine date and time
      const combinedDate = productionDate ? new Date(productionDate) : new Date();
      combinedDate.setHours(parseInt(productionTime.hours) || 0);
      combinedDate.setMinutes(parseInt(productionTime.minutes) || 0);
      combinedDate.setSeconds(0);
      combinedDate.setMilliseconds(0);

      const updateData: any = {
        batch_no: formData.batch_no,
        production_date: combinedDate.toISOString(),
        notes: formData.notes || null,
      };

      // Only include weight fields if they have values
      if (formData.weight_per_meter) {
        updateData.weight_per_meter = parseFloat(formData.weight_per_meter);
      }
      if (formData.total_weight) {
        updateData.total_weight = parseFloat(formData.total_weight);
      }
      if (formData.piece_length) {
        updateData.piece_length = parseFloat(formData.piece_length);
      }

      const response = await fetch(`${API_URL}/production/history/${batch.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update batch');
      }

      toast.success('Production batch updated successfully');
      onOpenChange(false);
      if (onSave) {
        onSave();
      }
    } catch (error: any) {
      console.error('Error updating batch:', error);
      toast.error(error.message || 'Failed to update batch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Production Batch</DialogTitle>
          <DialogDescription>
            Update batch information. Product and quantity cannot be changed.
          </DialogDescription>
        </DialogHeader>

        {batch && (
          <div className="space-y-4 py-4">
            {/* Product Info (Read-only) */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Product:</span>
                <span className="text-sm">{batch.product_type_name} - {batch.brand_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Batch Code:</span>
                <span className="text-sm font-mono">{batch.batch_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Total Items:</span>
                <span className="text-sm">{batch.total_items}</span>
              </div>
            </div>

            {/* Batch Number */}
            <div className="space-y-2">
              <Label htmlFor="batch_no">Batch Number</Label>
              <Input
                id="batch_no"
                value={formData.batch_no}
                onChange={(e) => setFormData({ ...formData, batch_no: e.target.value })}
                placeholder="e.g., BATCH-001"
              />
            </div>

            {/* Production Date */}
            <div className="space-y-2">
              <Label>Production Date & Time *</Label>
              <div className="flex gap-2">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'flex-1 justify-start text-left font-normal',
                        !productionDate && 'text-muted-foreground'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCalendarOpen(true);
                      }}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {productionDate ? format(productionDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0 z-[9999] shadow-2xl border-2"
                    align="start"
                    side="bottom"
                    sideOffset={4}
                    onInteractOutside={() => {
                      setCalendarOpen(false);
                    }}
                    style={{
                      zIndex: 9999,
                      pointerEvents: 'auto'
                    }}
                  >
                    <div
                      className="p-0 relative z-[9999]"
                      style={{ pointerEvents: 'auto' }}
                      onMouseDown={(e) => {
                        console.log('🖱️ Calendar container mousedown');
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        console.log('🖱️ Calendar container clicked');
                        e.stopPropagation();
                      }}
                    >
                      <Calendar
                        mode="single"
                        selected={productionDate}
                        onSelect={(date) => {
                          console.log('🗓️ Calendar onSelect called:', date);
                          if (date) {
                            setProductionDate(date);
                          }
                        }}
                        initialFocus
                      />
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="flex gap-1 items-center">
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={productionTime.hours}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
                      setProductionTime({ ...productionTime, hours: val.toString().padStart(2, '0') });
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-16 text-center"
                    placeholder="HH"
                  />
                  <span>:</span>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={productionTime.minutes}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                      setProductionTime({ ...productionTime, minutes: val.toString().padStart(2, '0') });
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-16 text-center"
                    placeholder="MM"
                  />
                </div>
              </div>
            </div>

            {/* Weight per Meter */}
            {formData.weight_per_meter !== null && (
              <div className="space-y-2">
                <Label htmlFor="weight_per_meter">Weight per Meter (kg/m)</Label>
                <Input
                  id="weight_per_meter"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.weight_per_meter}
                  onChange={(e) => {
                    const newWeightPerMeter = e.target.value;
                    const calculatedTotalWeight = newWeightPerMeter && batch?.initial_quantity
                      ? (parseFloat(newWeightPerMeter) * batch.initial_quantity).toFixed(2)
                      : '';
                    setFormData({
                      ...formData,
                      weight_per_meter: newWeightPerMeter,
                      total_weight: calculatedTotalWeight
                    });
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="e.g., 0.450"
                />
              </div>
            )}

            {/* Total Weight - Auto-calculated */}
            {formData.total_weight !== null && (
              <div className="space-y-2">
                <Label htmlFor="total_weight">Total Weight (kg) - Auto-calculated</Label>
                <Input
                  id="total_weight"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.total_weight}
                  readOnly
                  disabled
                  className="bg-muted cursor-not-allowed"
                  placeholder="Auto-calculated from weight per meter"
                />
                <p className="text-xs text-muted-foreground">
                  Calculated as: Weight per meter × {batch?.initial_quantity || 0} {batch?.piece_length ? 'pcs' : 'm'}
                </p>
              </div>
            )}

            {/* Piece Length (for quantity-based products) */}
            {formData.piece_length !== null && batch.piece_length && (
              <div className="space-y-2">
                <Label htmlFor="piece_length">Piece Length (m)</Label>
                <Input
                  id="piece_length"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.piece_length}
                  onChange={(e) => setFormData({ ...formData, piece_length: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="e.g., 6.0"
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
