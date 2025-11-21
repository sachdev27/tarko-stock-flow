import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { production as productionAPI } from '@/lib/api';

interface Batch {
  id: string;
  batch_code: string;
  batch_no: string;
  current_quantity: number;
  production_date: string;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, unknown>;
  stock_entries: StockEntry[];
}

interface StockEntry {
  stock_id: string;
  stock_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE';
  quantity: number;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  piece_count?: number;
  total_available: number;
}

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: Batch[];
  productTypes: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  onImportComplete: () => void;
}

export const ImportExportDialog = ({
  open,
  onOpenChange,
  batches,
  productTypes,
  brands,
  onImportComplete
}: ImportExportDialogProps) => {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [templateType, setTemplateType] = useState<'hdpe' | 'sprinkler'>('hdpe');

  const downloadTemplate = (type: 'hdpe' | 'sprinkler') => {
    let template: Array<Record<string, string>>;
    let filename: string;

    if (type === 'hdpe') {
      template = [
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-15',
          'Roll Length (m)': '100',
          'Number of Rolls': '10',
          'Weight per Meter': '0.85',
          'PE (SDR)': '100',
          'OD (mm)': '32',
          'PN (bar)': '10'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-20',
          'Roll Length (m)': '100',
          'Number of Rolls': '8',
          'Weight per Meter': '1.20',
          'PE (SDR)': '100',
          'OD (mm)': '40',
          'PN (bar)': '10'
        }
      ];
      filename = 'hdpe_import_template.csv';
    } else {
      template = [
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-10',
          'Bundle Size (pcs)': '10',
          'Piece Length (m)': '6',
          'Number of Bundles': '20',
          'OD (mm)': '16',
          'PN (bar)': '4',
          'Weight per Meter': '0.15',
          'Type/PE': 'L'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-15',
          'Bundle Size (pcs)': '20',
          'Piece Length (m)': '6',
          'Number of Bundles': '15',
          'OD (mm)': '20',
          'PN (bar)': '4',
          'Weight per Meter': '0.20',
          'Type/PE': 'L'
        }
      ];
      filename = 'sprinkler_import_template.csv';
    }

    const csv = [
      Object.keys(template[0]).join(','),
      ...template.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success(`${type.toUpperCase()} template downloaded`);
  };

  const exportInventory = () => {
    if (batches.length === 0) {
      toast.error('No inventory to export');
      return;
    }

    const exportData: Array<Record<string, string | number>> = [];

    batches.forEach(batch => {
      const isSprinkler = batch.product_type_name.toLowerCase().includes('sprinkler');

      const baseData = {
        'Product Type': batch.product_type_name,
        'Brand': batch.brand_name,
        'Batch Code': batch.batch_code,
        'Batch No': batch.batch_no,
        'Production Date': new Date(batch.production_date).toLocaleDateString('en-IN'),
        ...(batch.parameters as Record<string, string>)
      };

      batch.stock_entries.forEach(entry => {
        exportData.push({
          ...baseData,
          'Stock Type': entry.stock_type,
          'Quantity': entry.quantity,
          'Total Available': entry.total_available,
          ...(entry.length_per_unit && { 'Length per Unit': entry.length_per_unit }),
          ...(entry.pieces_per_bundle && { 'Pieces per Bundle': entry.pieces_per_bundle }),
          ...(entry.piece_length_meters && { 'Piece Length': entry.piece_length_meters }),
          ...(entry.piece_count && { 'Piece Count': entry.piece_count })
        });
      });
    });

    const headers = Object.keys(exportData[0]);
    const csv = [
      headers.join(','),
      ...exportData.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Inventory exported successfully');
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error('Please select a file');
      return;
    }

    setImporting(true);
    try {
      const text = await importFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim());

      const data = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj: Record<string, string> = {};
        headers.forEach((header, index) => {
          obj[header] = values[index] || '';
        });
        return obj;
      });

      // Process each row and create batches
      let successCount = 0;
      for (const row of data) {
        try {
          const getValue = (key: string, alternatives: string[] = []) => {
            const value = row[key] || alternatives.map(alt => row[alt]).find(v => v);
            return value?.replace(/[^0-9.]/g, '') || '';
          };

          const productTypeName = row['Product Type'] || row['product_type'];
          const brandName = row['Brand'] || row['brand'];

          const productType = productTypes.find(pt =>
            pt.name.toLowerCase() === productTypeName?.toLowerCase()
          );
          const brand = brands.find(b =>
            b.name.toLowerCase() === brandName?.toLowerCase()
          );

          if (!productType || !brand) {
            console.warn(`Skipping row: Product type or brand not found`);
            continue;
          }

          // Determine if HDPE or Sprinkler based on available fields
          const pe = getValue('PE (SDR)', ['PE', 'pe']);
          const type = getValue('Type/PE', ['Type', 'type']);
          const isHDPE = pe !== '';
          const isSprinkler = !isHDPE && type !== '';

          if (!isHDPE && !isSprinkler) {
            console.warn(`Skipping row: Cannot determine product type`);
            continue;
          }

          const od = getValue('OD (mm)', ['OD', 'od']);
          const pn = getValue('PN (bar)', ['PN', 'pn']);
          const weightPerMeter = getValue('Weight per Meter', ['weight_per_meter']);
          const prodDate = row['Production Date'] || row['production_date'];

          // Build form data based on product type
          const formData = new FormData();
          formData.append('product_type_id', productType.id);
          formData.append('brand_id', brand.id);
          formData.append('production_date', prodDate);

          if (weightPerMeter) {
            formData.append('weight_per_meter', weightPerMeter);
          }

          if (isHDPE) {
            const rollLength = getValue('Roll Length (m)', ['roll_length']);
            const numRolls = getValue('Number of Rolls', ['number_of_rolls']);

            formData.append('config_type', 'standard_rolls');
            formData.append('roll_length', rollLength);
            formData.append('number_of_rolls', numRolls);
            formData.append('OD', od);
            formData.append('PN', pn);
            formData.append('PE', pe);
          } else {
            const bundleSize = getValue('Bundle Size (pcs)', ['bundle_size']);
            const pieceLength = getValue('Piece Length (m)', ['piece_length']);
            const numBundles = getValue('Number of Bundles', ['number_of_bundles']);

            formData.append('config_type', 'bundles');
            formData.append('bundle_size', bundleSize);
            formData.append('piece_length', pieceLength);
            formData.append('number_of_bundles', numBundles);
            formData.append('OD', od);
            formData.append('PN', pn);
            formData.append('Type', type);
          }

          await productionAPI.createBatch(formData);
          successCount++;
        } catch (err) {
          console.error('Error importing row:', err);
        }
      }

      toast.success(`Successfully imported ${successCount} batches`);
      onImportComplete();
      onOpenChange(false);
      setImportFile(null);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import inventory');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import/Export Inventory</DialogTitle>
          <DialogDescription>
            Download templates, import CSV data, or export current inventory
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div>
                <Label>Download Template</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    onClick={() => downloadTemplate('hdpe')}
                    className="flex-1"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    HDPE Template
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => downloadTemplate('sprinkler')}
                    className="flex-1"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Sprinkler Template
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4">
                <Label htmlFor="import-file">Upload CSV File</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="mt-2"
                />
                {importFile && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Selected: {importFile.name}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {importing ? 'Importing...' : 'Import Batches'}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Export current inventory to CSV file including all batches and stock entries.
              </p>

              <div className="p-4 border rounded-lg bg-muted">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Current Inventory</p>
                    <p className="text-sm text-muted-foreground">
                      {batches.length} batch{batches.length !== 1 ? 'es' : ''} available
                    </p>
                  </div>
                  <Button onClick={exportInventory} disabled={batches.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
