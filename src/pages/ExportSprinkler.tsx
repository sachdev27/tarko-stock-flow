import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { inventory as inventoryAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface SprinklerExportRow {
  batch_code: string;
  batch_no: string;
  product_type: string;
  brand: string;
  production_date: string;
  od: string;
  pn: string;
  type: string;
  item_type: string;
  bundle_size?: number;
  bundle_count: number;
  spare_count: number;
  total_pieces: number;
}

export default function ExportSprinkler() {
  const [loading, setLoading] = useState(false);
  const [exportData, setExportData] = useState<SprinklerExportRow[]>([]);

  useEffect(() => {
    loadSprinklerInventory();
  }, []);

  const loadSprinklerInventory = async () => {
    try {
      setLoading(true);
      const { data: allBatches } = await inventoryAPI.getBatches();

      // Filter only Sprinkler batches
      const sprinklerBatches = (allBatches || []).filter((batch: Record<string, unknown>) => {
        const productType = (batch.product_type_name as string) || '';
        return productType.toLowerCase().includes('sprinkler');
      });

      const data: SprinklerExportRow[] = [];

      sprinklerBatches.forEach((batch: Record<string, unknown>) => {
        const params = (batch.parameters as Record<string, string>) || {};
        const rolls = (batch.rolls as Record<string, unknown>[]) || [];

        // Group bundles by size
        const bundlesBySize: Record<number, Record<string, unknown>[]> = {};
        const spareRolls: Record<string, unknown>[] = [];

        rolls.forEach(roll => {
          if (roll.roll_type === 'spare') {
            spareRolls.push(roll);
          } else if (typeof roll.roll_type === 'string' && roll.roll_type.startsWith('bundle_')) {
            const bundleSize = roll.bundle_size ? parseInt(String(roll.bundle_size)) : 0;
            const rollTypeParts = roll.roll_type.split('_');
            const size = bundleSize || parseInt(rollTypeParts[1] || '0');
            if (!bundlesBySize[size]) bundlesBySize[size] = [];
            bundlesBySize[size].push(roll);
          }
        });

        // Add rows for each bundle size
        Object.entries(bundlesBySize).forEach(([bundleSize, bundleRolls]) => {
          const size = parseInt(bundleSize);
          const sparePieces = spareRolls.reduce((sum, r) => {
            const pieces = r.bundle_size ? parseInt(String(r.bundle_size)) : 1;
            return sum + pieces;
          }, 0);

          data.push({
            batch_code: batch.batch_code as string,
            batch_no: batch.batch_no as string,
            product_type: batch.product_type_name as string,
            brand: batch.brand_name as string,
            production_date: batch.production_date as string,
            od: params.OD || '',
            pn: params.PN || '',
            type: params.Type || '',
            item_type: `Bundle (${size} pieces)`,
            bundle_size: size,
            bundle_count: bundleRolls.length,
            spare_count: spareRolls.length > 0 ? sparePieces : 0,
            total_pieces: (bundleRolls.length * size) + (spareRolls.length > 0 ? sparePieces : 0)
          });
        });

        // Add row for spares only if no bundles
        if (spareRolls.length > 0 && Object.keys(bundlesBySize).length === 0) {
          const sparePieces = spareRolls.reduce((sum, r) => {
            const pieces = r.bundle_size ? parseInt(String(r.bundle_size)) : 1;
            return sum + pieces;
          }, 0);

          data.push({
            batch_code: batch.batch_code as string,
            batch_no: batch.batch_no as string,
            product_type: batch.product_type_name as string,
            brand: batch.brand_name as string,
            production_date: batch.production_date as string,
            od: params.OD || '',
            pn: params.PN || '',
            type: params.Type || '',
            item_type: 'Spare Pieces Only',
            bundle_count: 0,
            spare_count: sparePieces,
            total_pieces: sparePieces
          });
        }
      });

      setExportData(data);
    } catch (error) {
      console.error('Error loading Sprinkler inventory:', error);
      toast.error('Failed to load Sprinkler inventory');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (exportData.length === 0) {
      toast.error('No Sprinkler inventory to export');
      return;
    }

    // Group by batch
    const batchMap = new Map<string, SprinklerExportRow[]>();
    exportData.forEach(row => {
      const key = row.batch_code;
      if (!batchMap.has(key)) batchMap.set(key, []);
      batchMap.get(key)!.push(row);
    });

    const headers = [
      'Product Type',
      'Brand',
      'Production Date',
      'Bundle Size (pcs)',
      'Piece Length (m)',
      'Number of Bundles',
      'OD (mm)',
      'PN (bar)',
      'Type/PE'
    ];

    const rows: string[][] = [];
    batchMap.forEach((batchRows) => {
      const firstRow = batchRows[0];

      // Group bundles by size
      const bundlesBySize = new Map<number, SprinklerExportRow[]>();
      batchRows.filter(r => r.item_type.startsWith('Bundle')).forEach(row => {
        const size = row.bundle_size || 0;
        if (!bundlesBySize.has(size)) bundlesBySize.set(size, []);
        bundlesBySize.get(size)!.push(row);
      });

      // Add each bundle size group
      bundlesBySize.forEach((bundleRows, bundleSize) => {
        const totalBundles = bundleRows.reduce((sum, r) => sum + r.bundle_count, 0);
        // Assume piece length of 6m (standard for sprinkler)
        const pieceLength = 6;

        rows.push([
          firstRow.product_type,
          firstRow.brand,
          firstRow.production_date,
          bundleSize.toString(),
          pieceLength.toString(),
          totalBundles.toString(),
          firstRow.od,
          firstRow.pn,
          firstRow.type
        ]);
      });

      // Add spare pieces as a separate row if any
      const spareRows = batchRows.filter(r => r.item_type === 'Spare Pieces');
      if (spareRows.length > 0) {
        const totalSpares = spareRows.reduce((sum, r) => sum + r.spare_count, 0);
        rows.push([
          firstRow.product_type,
          firstRow.brand,
          firstRow.production_date,
          totalSpares.toString(), // Spare count as bundle size
          '6', // Standard piece length
          '1', // Treat as 1 "bundle" of spares
          firstRow.od,
          firstRow.pn,
          firstRow.type
        ]);
      }
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sprinkler_inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('Sprinkler inventory exported successfully');
  };

  const totalBundles = exportData.reduce((sum, row) => sum + row.bundle_count, 0);
  const totalSpares = exportData.reduce((sum, row) => sum + row.spare_count, 0);
  const totalPieces = exportData.reduce((sum, row) => sum + row.total_pieces, 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sprinkler Pipe Inventory Export</h1>
            <p className="text-muted-foreground">Export detailed Sprinkler inventory data</p>
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
              <CardDescription>Total Bundles</CardDescription>
              <CardTitle className="text-3xl">{totalBundles}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Spare Pieces</CardDescription>
              <CardTitle className="text-3xl">{totalSpares}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Pieces</CardDescription>
              <CardTitle className="text-3xl">{totalPieces}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>Sprinkler Inventory Details</CardTitle>
            <CardDescription>{exportData.length} entries ready for export</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : exportData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No Sprinkler inventory found</p>
              </div>
            ) : (
              <div className="border rounded-md max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch Code</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>OD</TableHead>
                      <TableHead>PN</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Item Type</TableHead>
                      <TableHead className="text-right">Bundles</TableHead>
                      <TableHead className="text-right">Spares</TableHead>
                      <TableHead className="text-right">Total Pieces</TableHead>
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
                        <TableCell>{row.od}</TableCell>
                        <TableCell>{row.pn}</TableCell>
                        <TableCell>{row.type}</TableCell>
                        <TableCell>{row.item_type}</TableCell>
                        <TableCell className="text-right">{row.bundle_count}</TableCell>
                        <TableCell className="text-right">{row.spare_count || '-'}</TableCell>
                        <TableCell className="text-right font-medium">{row.total_pieces}</TableCell>
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
