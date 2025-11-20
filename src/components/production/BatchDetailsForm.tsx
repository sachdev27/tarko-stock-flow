import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';

interface BatchDetailsFormProps {
  formData: {
    productionDate: string;
    batchNo: string;
    autoBatchNo: boolean;
    notes: string;
  };
  attachmentFile: File | null;
  onChange: (field: string, value: string | boolean) => void;
  onFileChange: (file: File | null) => void;
  submitAttempted: boolean;
}

export const BatchDetailsForm = ({
  formData,
  attachmentFile,
  onChange,
  onFileChange,
  submitAttempted
}: BatchDetailsFormProps) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        e.target.value = '';
        return;
      }
      onFileChange(file);
    }
  };

  const handleClearFile = () => {
    onFileChange(null);
    const input = document.getElementById('attachment') as HTMLInputElement;
    if (input) input.value = '';
  };

  return (
    <>
      {/* Production Date */}
      <div className="space-y-2">
        <Label htmlFor="productionDate">
          Production Date <span className="text-red-500">*</span>
        </Label>
        <Input
          id="productionDate"
          type="date"
          value={formData.productionDate}
          onChange={(e) => onChange('productionDate', e.target.value)}
          className="h-12"
        />
        {submitAttempted && !formData.productionDate && (
          <p className="text-xs text-red-500">Production date is required</p>
        )}
      </div>

      {/* Batch Number */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="batchNo">Batch Number</Label>
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={formData.autoBatchNo}
              onChange={(e) => onChange('autoBatchNo', e.target.checked)}
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
          onChange={(e) => onChange('batchNo', e.target.value)}
          disabled={formData.autoBatchNo}
          className="h-12"
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (Optional)</Label>
        <Textarea
          id="notes"
          placeholder="Additional notes about this production batch"
          value={formData.notes}
          onChange={(e) => onChange('notes', e.target.value)}
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
            onChange={handleFileChange}
            className="h-12"
          />
          {attachmentFile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearFile}
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
    </>
  );
};
