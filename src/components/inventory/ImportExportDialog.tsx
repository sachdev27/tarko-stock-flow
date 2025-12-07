import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { production as productionAPI } from '@/lib/api-typed';
import type * as API from '@/types';

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
          'roll_length (m)': '500',
          'number_of_rolls': '25',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '0.75',
          'PE (SDR)': '10',
          'OD (mm)': '32',
          'PN (bar)': '6'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-16',
          'roll_length (m)': '500',
          'number_of_rolls': '30',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '1.25',
          'PE (SDR)': '10',
          'OD (mm)': '40',
          'PN (bar)': '6'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-17',
          'roll_length (m)': '500',
          'number_of_rolls': '20',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '2.10',
          'PE (SDR)': '10',
          'OD (mm)': '50',
          'PN (bar)': '6'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-18',
          'roll_length (m)': '500',
          'number_of_rolls': '15',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '3.50',
          'PE (SDR)': '10',
          'OD (mm)': '63',
          'PN (bar)': '6'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-19',
          'roll_length (m)': '500',
          'number_of_rolls': '12',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '5.80',
          'PE (SDR)': '10',
          'OD (mm)': '75',
          'PN (bar)': '6'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Supreme',
          'Production Date': '2025-01-20',
          'roll_length (m)': '400',
          'number_of_rolls': '10',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '0.95',
          'PE (SDR)': '11',
          'OD (mm)': '32',
          'PN (bar)': '8'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Supreme',
          'Production Date': '2025-01-21',
          'roll_length (m)': '400',
          'number_of_rolls': '8',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '1.45',
          'PE (SDR)': '11',
          'OD (mm)': '40',
          'PN (bar)': '8'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Finolex',
          'Production Date': '2025-01-22',
          'roll_length (m)': '300',
          'number_of_rolls': '20',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '0.65',
          'PE (SDR)': '13.6',
          'OD (mm)': '25',
          'PN (bar)': '10'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Finolex',
          'Production Date': '2025-01-23',
          'roll_length (m)': '300',
          'number_of_rolls': '15',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '1.10',
          'PE (SDR)': '13.6',
          'OD (mm)': '32',
          'PN (bar)': '10'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Jain',
          'Production Date': '2025-01-24',
          'roll_length (m)': '200',
          'number_of_rolls': '30',
          'cut_pieces': '',
          'weight_per_meter (kg/m)': '0.55',
          'PE (SDR)': '17',
          'OD (mm)': '20',
          'PN (bar)': '12.5'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-25',
          'roll_length (m)': '',
          'number_of_rolls': '',
          'cut_pieces': '140;120;120;100',
          'weight_per_meter (kg/m)': '0.75',
          'PE (SDR)': '10',
          'OD (mm)': '32',
          'PN (bar)': '6'
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Supreme',
          'Production Date': '2025-01-26',
          'roll_length (m)': '',
          'number_of_rolls': '',
          'cut_pieces': '200;150;100;50',
          'weight_per_meter (kg/m)': '1.25',
          'PE (SDR)': '10',
          'OD (mm)': '40',
          'PN (bar)': '6'
        }
      ];
      filename = 'hdpe_import_template.csv';
    } else {
      template = [
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-10',
          'bundle_size (pcs)': '10',
          'piece_length (m)': '6',
          'number_of_bundles': '50',
          'spare_pieces': '',
          'OD (mm)': '16',
          'PN (bar)': '4',
          'weight_per_meter (kg/m)': '0.15',
          'Type/PE': 'L'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-11',
          'bundle_size (pcs)': '20',
          'piece_length (m)': '6',
          'number_of_bundles': '30',
          'spare_pieces': '',
          'OD (mm)': '16',
          'PN (bar)': '4',
          'weight_per_meter (kg/m)': '0.15',
          'Type/PE': 'L'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-12',
          'bundle_size (pcs)': '10',
          'piece_length (m)': '6',
          'number_of_bundles': '40',
          'spare_pieces': '',
          'OD (mm)': '20',
          'PN (bar)': '4',
          'weight_per_meter (kg/m)': '0.20',
          'Type/PE': 'L'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-13',
          'bundle_size (pcs)': '20',
          'piece_length (m)': '6',
          'number_of_bundles': '25',
          'spare_pieces': '',
          'OD (mm)': '20',
          'PN (bar)': '4',
          'weight_per_meter (kg/m)': '0.20',
          'Type/PE': 'L'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-14',
          'bundle_size (pcs)': '10',
          'piece_length (m)': '6',
          'number_of_bundles': '35',
          'spare_pieces': '',
          'OD (mm)': '25',
          'PN (bar)': '6',
          'weight_per_meter (kg/m)': '0.35',
          'Type/PE': 'M'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Supreme',
          'Production Date': '2025-01-15',
          'bundle_size (pcs)': '20',
          'piece_length (m)': '6',
          'number_of_bundles': '20',
          'spare_pieces': '',
          'OD (mm)': '25',
          'PN (bar)': '6',
          'weight_per_meter (kg/m)': '0.35',
          'Type/PE': 'M'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Supreme',
          'Production Date': '2025-01-16',
          'bundle_size (pcs)': '10',
          'piece_length (m)': '6',
          'number_of_bundles': '30',
          'spare_pieces': '',
          'OD (mm)': '32',
          'PN (bar)': '6',
          'weight_per_meter (kg/m)': '0.55',
          'Type/PE': 'H'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Finolex',
          'Production Date': '2025-01-17',
          'bundle_size (pcs)': '20',
          'piece_length (m)': '6',
          'number_of_bundles': '25',
          'spare_pieces': '',
          'OD (mm)': '32',
          'PN (bar)': '6',
          'weight_per_meter (kg/m)': '0.55',
          'Type/PE': 'H'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Jain',
          'Production Date': '2025-01-18',
          'bundle_size (pcs)': '10',
          'piece_length (m)': '6',
          'number_of_bundles': '40',
          'spare_pieces': '',
          'OD (mm)': '40',
          'PN (bar)': '8',
          'weight_per_meter (kg/m)': '0.85',
          'Type/PE': 'H'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Jain',
          'Production Date': '2025-01-19',
          'bundle_size (pcs)': '20',
          'piece_length (m)': '6',
          'number_of_bundles': '20',
          'spare_pieces': '',
          'OD (mm)': '40',
          'PN (bar)': '8',
          'weight_per_meter (kg/m)': '0.85',
          'Type/PE': 'H'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-20',
          'bundle_size (pcs)': '',
          'piece_length (m)': '6',
          'number_of_bundles': '',
          'spare_pieces': '45',
          'OD (mm)': '16',
          'PN (bar)': '4',
          'weight_per_meter (kg/m)': '0.15',
          'Type/PE': 'L'
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Supreme',
          'Production Date': '2025-01-21',
          'bundle_size (pcs)': '',
          'piece_length (m)': '5.8',
          'number_of_bundles': '',
          'spare_pieces': '30',
          'OD (mm)': '20',
          'PN (bar)': '6',
          'weight_per_meter (kg/m)': '0.20',
          'Type/PE': 'M'
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

      console.log('CSV Headers:', headers);
      console.log('Available Product Types:', productTypes.map(pt => pt.name));
      console.log('Available Brands:', brands.map(b => b.name));

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
      const errors: string[] = [];
      let rowNum = 1; // Start from 1 (after header)

      for (const row of data) {
        rowNum++;
        try {
          const getValue = (key: string, alternatives: string[] = []) => {
            const value = row[key] || alternatives.map(alt => row[alt]).find(v => v);
            return value || '';
          };

          const productTypeName = getValue('Product Type', ['product_type']);
          const brandName = getValue('Brand', ['brand']);

          const productType = productTypes.find(pt =>
            pt.name.toLowerCase() === productTypeName?.toLowerCase()
          );
          const brand = brands.find(b =>
            b.name.toLowerCase() === brandName?.toLowerCase()
          );

          if (!productType) {
            errors.push(`Row ${rowNum}: Product type "${productTypeName}" not found. Available: ${productTypes.map(pt => pt.name).join(', ')}`);
            continue;
          }

          if (!brand) {
            errors.push(`Row ${rowNum}: Brand "${brandName}" not found. Available: ${brands.map(b => b.name).join(', ')}`);
            continue;
          }

          // Determine if HDPE or Sprinkler based on available fields
          const pe = getValue('PE (SDR)', ['PE', 'pe']);
          const type = getValue('Type/PE', ['Type', 'type']);
          const isHDPE = pe !== '';
          const isSprinkler = !isHDPE && type !== '';

          if (!isHDPE && !isSprinkler) {
            errors.push(`Row ${rowNum}: Missing PE (SDR) or Type/PE field. Cannot determine if HDPE or Sprinkler.`);
            continue;
          }

          const od = getValue('OD (mm)', ['OD', 'od']);
          const pn = getValue('PN (bar)', ['PN', 'pn']);
          const weightPerMeter = getValue('weight_per_meter (kg/m)', ['weight_per_meter', 'Weight per Meter']);
          const prodDate = getValue('Production Date', ['production_date']);

          // Build parameters object based on product type
          const parameters: Record<string, string> = {
            OD: od,
            PN: pn
          };

          if (isHDPE) {
            parameters.PE = pe;
          } else {
            parameters.Type = type;
          }

          // Build form data based on product type
          const formData = new FormData();
          formData.append('product_type_id', productType.id);
          formData.append('brand_id', brand.id);
          formData.append('production_date', prodDate);
          formData.append('parameters', JSON.stringify(parameters));

          if (weightPerMeter) {
            // weight_per_meter is stored in kg/m in the database
            formData.append('weight_per_meter', parseFloat(weightPerMeter).toString());
          }

          if (isHDPE) {
            // HDPE: Check if full rolls or cut pieces
            const rollLength = getValue('roll_length (m)', ['roll_length', 'Roll Length (m)']);
            const numRolls = getValue('number_of_rolls', ['Number of Rolls']);
            const cutPieces = getValue('cut_pieces', ['Cut Pieces', 'cut_pieces']);

            if (cutPieces && cutPieces !== '') {
              // Cut pieces production (semicolon or comma-separated lengths: 140;120;100)
              const separator = cutPieces.includes(';') ? ';' : ',';
              const lengths = cutPieces.split(separator).map(l => l.trim()).filter(l => l !== '');
              if (lengths.length === 0) {
                errors.push(`Row ${rowNum}: cut_pieces must contain at least one length`);
                continue;
              }

              const totalLength = lengths.reduce((sum, len) => sum + parseFloat(len), 0);

              // Backend expects cut_rolls as array of objects with 'length' property
              const cutRollsArray = lengths.map(len => ({ length: parseFloat(len) }));

              formData.append('roll_config_type', 'standard_rolls');
              formData.append('quantity_based', 'false');
              formData.append('number_of_rolls', '0');
              formData.append('cut_rolls', JSON.stringify(cutRollsArray));
              formData.append('quantity', totalLength.toString());
            } else if (rollLength && numRolls) {
              // Full rolls production
              const quantity = parseFloat(rollLength) * parseInt(numRolls);

              formData.append('roll_config_type', 'standard_rolls');
              formData.append('quantity_based', 'false');
              formData.append('roll_length', rollLength);
              formData.append('length_per_roll', rollLength);
              formData.append('number_of_rolls', numRolls);
              formData.append('quantity', quantity.toString());
            } else {
              errors.push(`Row ${rowNum}: HDPE requires either (roll_length + number_of_rolls) or cut_pieces`);
              continue;
            }
          } else {
            // Sprinkler: Check if bundles or spare pieces
            const bundleSize = getValue('bundle_size (pcs)', ['bundle_size', 'Bundle Size (pcs)']);
            const pieceLength = getValue('piece_length (m)', ['piece_length', 'Piece Length (m)']);
            const numBundles = getValue('number_of_bundles', ['Number of Bundles']);
            const sparePieces = getValue('spare_pieces', ['Spare Pieces', 'spare_pieces']);

            if (!pieceLength) {
              errors.push(`Row ${rowNum}: Sprinkler requires piece_length`);
              continue;
            }

            if (sparePieces && sparePieces !== '') {
              // Spare pieces production
              // Backend expects spare_pipes as array of objects with 'length' property (which is actually piece count)
              const sparePiecesArray = [{ length: parseInt(sparePieces) }];
              const quantity = parseInt(sparePieces) * parseFloat(pieceLength);

              formData.append('roll_config_type', 'bundles');
              formData.append('quantity_based', 'true');
              formData.append('number_of_bundles', '0');
              formData.append('spare_pipes', JSON.stringify(sparePiecesArray));
              formData.append('piece_length', pieceLength);
              formData.append('length_per_roll', pieceLength);
              formData.append('quantity', quantity.toString());
            } else if (bundleSize && numBundles) {
              // Bundle production
              const quantity = parseInt(numBundles) * parseInt(bundleSize) * parseFloat(pieceLength);

              formData.append('roll_config_type', 'bundles');
              formData.append('quantity_based', 'true');
              formData.append('bundle_size', bundleSize);
              formData.append('piece_length', pieceLength);
              formData.append('length_per_roll', pieceLength);
              formData.append('number_of_bundles', numBundles);
              formData.append('quantity', quantity.toString());
            } else {
              errors.push(`Row ${rowNum}: Sprinkler requires either (bundle_size + number_of_bundles) or spare_pieces`);
              continue;
            }
          }

          await productionAPI.createBatch(formData);
          successCount++;
        } catch (err) {
          console.error('Error importing row:', err);
          errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Show errors if any rows were skipped
      if (errors.length > 0) {
        console.error('Import errors:', errors);

        const errorList = errors.slice(0, 10).join('\n');
        const moreErrors = errors.length > 10 ? `\n\n...and ${errors.length - 10} more errors. Check console for full list.` : '';

        toast.error(
          <div className="space-y-2">
            <div className="font-semibold">Import Errors Found:</div>
            <pre className="text-xs whitespace-pre-wrap max-h-[300px] overflow-auto">{errorList}{moreErrors}</pre>
          </div>,
          { duration: 15000 }
        );
      }

      // Show appropriate message based on results
      if (successCount === 0) {
        toast.error(
          <div className="space-y-2">
            <div className="font-semibold">No batches imported</div>
            <div className="text-xs">
              <div>Total rows: {data.length}</div>
              <div>Errors: {errors.length}</div>
              <div className="mt-2">Check the error messages above for details.</div>
            </div>
          </div>,
          { duration: 15000 }
        );
      } else if (successCount === data.length) {
        toast.success(`Successfully imported all ${successCount} batches`);
        onImportComplete();
        onOpenChange(false);
        setImportFile(null);
      } else {
        toast.success(`Successfully imported ${successCount} of ${data.length} batches. ${errors.length} rows had errors.`);
        onImportComplete();
        onOpenChange(false);
        setImportFile(null);
      }
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
