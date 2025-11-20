import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { inventory as inventoryAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface HDPEExportRow {
  batch_code: string;
  batch_no: string;
  product_type: string;
  brand: string;
  production_date: string;
  pe: string;
  od: string;
  pn: string;
  item_type: string;
  original_length?: number;
  current_length?: number;
  roll_count: number;
  total_meters: number;
  weight_per_meter?: number;
  total_weight?: number;
}

export default function ExportHDPE() {
  const [loading, setLoading] = useState(false);
  const [exportData, setExportData] = useState<HDPEExportRow[]>([]);

  useEffect(() => {
    loadHDPEInventory();
  }, []);

  const loadHDPEInventory = async () => {
    try {
      setLoading(true);
      const { data: allBatches } = await inventoryAPI.getBatches();

      // Filter only HDPE/pipe batches (not sprinkler)
      const hdpeBatches = (allBatches || []).filter((batch: Record<string, unknown>) => {
        const productType = (batch.product_type_name as string) || '';
        return productType.toLowerCase().includes('hdpe') ||
               (productType.toLowerCase().includes('pipe') && !productType.toLowerCase().includes('sprinkler'));
      });

      const data: HDPEExportRow[] = [];

      hdpeBatches.forEach((batch: Record<string, unknown>) => {
        const params = (batch.parameters as Record<string, string>) || {};
        const rolls = (batch.rolls as Record<string, unknown>[]) || [];

        // Group by standard vs cut rolls
        const standardRolls = rolls.filter(r => !r.is_cut_roll && (!r.roll_type || r.roll_type === 'standard'));
        const cutRolls = rolls.filter(r => r.is_cut_roll || r.roll_type === 'cut');

        // Standard rolls
        if (standardRolls.length > 0) {
          const lengthGroups: Record<string, Record<string, unknown>[]> = {};
          standardRolls.forEach(roll => {
            const initialLength = parseFloat(String(roll.initial_length_meters || 0));
            const key = initialLength.toFixed(0);
            if (!lengthGroups[key]) lengthGroups[key] = [];
            lengthGroups[key].push(roll);
          });

          Object.entries(lengthGroups).forEach(([initialLength, rollsGroup]) => {
            const currentTotal = rollsGroup.reduce((sum, r) => {
              const length = parseFloat(String(r.length_meters || 0));
              return sum + length;
            }, 0);
            const weightPerMeter = batch.weight_per_meter ? parseFloat(String(batch.weight_per_meter)) : undefined;

            data.push({
              batch_code: batch.batch_code as string,
              batch_no: batch.batch_no as string,
              product_type: batch.product_type_name as string,
              brand: batch.brand_name as string,
              production_date: batch.production_date as string,
              pe: params.PE || '',
              od: params.OD || '',
              pn: params.PN || '',
              item_type: 'Standard Roll',
              original_length: parseFloat(initialLength),
              current_length: currentTotal,
              roll_count: rollsGroup.length,
              total_meters: currentTotal,
              weight_per_meter: weightPerMeter,
              total_weight: weightPerMeter ? currentTotal * weightPerMeter : undefined
            });
          });
        }

        // Cut rolls
        if (cutRolls.length > 0) {
          const cutLengthGroups: Record<string, Record<string, unknown>[]> = {};
          cutRolls.forEach(roll => {
            const length = parseFloat(String(roll.length_meters || 0));
            const key = length.toFixed(2);
            if (!cutLengthGroups[key]) cutLengthGroups[key] = [];
            cutLengthGroups[key].push(roll);
          });

          Object.entries(cutLengthGroups).forEach(([length, rollsGroup]) => {
            const totalLength = rollsGroup.reduce((sum, r) => {
              const len = parseFloat(String(r.length_meters || 0));
              return sum + len;
            }, 0);
            const avgOriginal = rollsGroup.reduce((sum, r) => {
              const initial = parseFloat(String(r.initial_length_meters || 0));
              const current = parseFloat(String(r.length_meters || 0));
              return sum + (initial || current);
            }, 0) / rollsGroup.length;
            const weightPerMeter = batch.weight_per_meter ? parseFloat(String(batch.weight_per_meter)) : undefined;

            data.push({
              batch_code: batch.batch_code as string,
              batch_no: batch.batch_no as string,
              product_type: batch.product_type_name as string,
              brand: batch.brand_name as string,
              production_date: batch.production_date as string,
              pe: params.PE || '',
              od: params.OD || '',
              pn: params.PN || '',
              item_type: 'Cut Roll',
              original_length: avgOriginal,
              current_length: parseFloat(length),
              roll_count: rollsGroup.length,
              total_meters: totalLength,
              weight_per_meter: weightPerMeter,
              total_weight: weightPerMeter ? totalLength * weightPerMeter : undefined
            });
          });
        }
      });

      setExportData(data);
    } catch (error) {
      console.error('Error loading HDPE inventory:', error);
      toast.error('Failed to load HDPE inventory');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (exportData.length === 0) {
      toast.error('No HDPE inventory to export');
      return;
    }

    // Group by batch to consolidate rolls per batch
    const batchMap = new Map<string, HDPEExportRow[]>();
    exportData.forEach(row => {
      const key = row.batch_code;
      if (!batchMap.has(key)) batchMap.set(key, []);
      batchMap.get(key)!.push(row);
    });

    const headers = [
      'Product Type',
      'Brand',
      'Production Date',
      'Roll Length (m)',
      'Number of Rolls',
      'Weight per Meter',
      'PE (SDR)',
      'OD (mm)',
      'PN (bar)'
    ];

    const rows: string[][] = [];
    batchMap.forEach((batchRows) => {
      const firstRow = batchRows[0];

      // Calculate totals for standard rolls
      const standardRolls = batchRows.filter(r => r.item_type === 'Standard Roll');
      if (standardRolls.length > 0) {
        const totalRolls = standardRolls.reduce((sum, r) => sum + r.roll_count, 0);
        const avgLength = standardRolls.length > 0
          ? standardRolls.reduce((sum, r) => sum + (r.original_length || 0), 0) / standardRolls.length
          : 0;

        rows.push([
          firstRow.product_type,
          firstRow.brand,
          firstRow.production_date,
          avgLength.toFixed(0),
          totalRolls.toString(),
          firstRow.weight_per_meter ? (firstRow.weight_per_meter / 1000).toFixed(3) : '0', // Convert g/m to kg/m
          firstRow.pe,
          firstRow.od,
          firstRow.pn
        ]);
      }

      // Add cut rolls as separate entries if any
      const cutRolls = batchRows.filter(r => r.item_type === 'Cut Roll');
      cutRolls.forEach(cutRow => {
        rows.push([
          cutRow.product_type,
          cutRow.brand,
          cutRow.production_date,
          (cutRow.original_length || 0).toFixed(2),
          '1', // Cut rolls are individual
          cutRow.weight_per_meter ? (cutRow.weight_per_meter / 1000).toFixed(3) : '0',
          cutRow.pe,
          cutRow.od,
          cutRow.pn
        ]);
      });
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hdpe_inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('HDPE inventory exported successfully');
  };

  const totalMeters = exportData.reduce((sum, row) => sum + row.total_meters, 0);
  const totalRolls = exportData.reduce((sum, row) => sum + row.roll_count, 0);
  const totalWeight = exportData.reduce((sum, row) => sum + (row.total_weight || 0), 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">HDPE Pipe Inventory Export</h1>
            <p className="text-muted-foreground">Export detailed HDPE inventory data</p>
          </div>
          <Button onClick={exportToCSV} disabled={loading || exportData.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export to CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Rolls</CardDescription>
              <CardTitle className="text-3xl">{totalRolls}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Length</CardDescription>
              <CardTitle className="text-3xl">{totalMeters.toFixed(0)} m</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Weight</CardDescription>
              <CardTitle className="text-3xl">{(totalWeight / 1000).toFixed(2)} ton</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>HDPE Inventory Details</CardTitle>
            <CardDescription>{exportData.length} entries ready for export</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : exportData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No HDPE inventory found</p>
              </div>
            ) : (
              <div className="border rounded-md max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch Code</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>PE</TableHead>
                      <TableHead>OD</TableHead>
                      <TableHead>PN</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Original (m)</TableHead>
                      <TableHead className="text-right">Current (m)</TableHead>
                      <TableHead className="text-right">Rolls</TableHead>
                      <TableHead className="text-right">Total (m)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">{row.batch_code}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{row.product_type}</div>
                          <div className="text-xs text-muted-foreground">{row.brand}</div>
                        </TableCell>
                        <TableCell>{row.pe}</TableCell>
                        <TableCell>{row.od}</TableCell>
                        <TableCell>{row.pn}</TableCell>
                        <TableCell>{row.item_type}</TableCell>
                        <TableCell className="text-right">{row.original_length?.toFixed(0)}</TableCell>
                        <TableCell className="text-right">{row.current_length?.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{row.roll_count}</TableCell>
                        <TableCell className="text-right font-medium">{row.total_meters.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
