import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Package, Search, Filter, QrCode, ChevronDown, ChevronUp, MapPin, Edit2, CheckCircle, XCircle, Clock, Paperclip, Calendar, FileText, Download, ScissorsIcon, PlusIcon, TrashIcon, Upload, FileSpreadsheet, MessageCircle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { inventory as inventoryAPI, transactions as transactionsAPI, production as productionAPI, ledger as ledgerAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toISTDateTimeLocal, fromISTDateTimeLocal } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Separator } from '@/components/ui/separator';

interface ProductInventory {
  product_type: string;
  product_type_id: string;
  brand: string;
  brand_id: string;
  product_variant_id: string;  // THE KEY - used for exact matching
  parameters: any;
  total_quantity: number;
  batches: BatchInventory[];
  roll_config?: any; // Configuration for determining units
}

interface BatchInventory {
  id: string;
  batch_code: string;
  batch_no: string;
  current_quantity: number;
  production_date: string;
  attachment_url?: string;
  rolls: RollInventory[];
}

interface RollInventory {
  id: string;
  length_meters: number;
  initial_length_meters: number;
  status: string;
  is_cut_roll?: boolean;
  roll_type?: string; // 'standard', 'cut', 'bundle_10', 'bundle_20', 'spare'
  bundle_size?: number; // 10 or 20 for bundles
}

interface TransactionRecord {
  id: string;
  transaction_type: string;
  quantity_change: number;
  transaction_date: string;
  invoice_no?: string;
  notes?: string;
  created_at: string;
  batch_code: string;
  batch_no: string;
  initial_quantity: number;
  weight_per_meter?: number;
  total_weight?: number;
  attachment_url?: string;
  production_date: string;
  product_type: string;
  product_type_id: string;
  brand_id: string;
  product_variant_id: string | number;
  brand: string;
  parameters: Record<string, string>;
  roll_length_meters?: number;
  roll_initial_length_meters?: number;
  roll_is_cut?: boolean;
  roll_type?: string;
  roll_bundle_size?: number;
  roll_weight?: number;
  unit_abbreviation?: string;
  customer_name?: string;
  created_by_email?: string;
  created_by_username?: string;
  created_by_name?: string;
}

interface TransactionDiagnostic {
  id: string;
  matchType: boolean;
  matchBrand: boolean;
  matchParams: boolean;
  txnParams: Record<string, string>;
}

const Inventory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<ProductInventory[]>([]);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [selectedProductType, setSelectedProductType] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [parameterFilters, setParameterFilters] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyCutRolls, setShowOnlyCutRolls] = useState(false);
  const [showOnlySpares, setShowOnlySpares] = useState(false);

  // Edit dialogs
  const [editingBatch, setEditingBatch] = useState<any>(null);
  const [editingRoll, setEditingRoll] = useState<any>(null);

  // Product history dialog
  const [productHistoryDialogOpen, setProductHistoryDialogOpen] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<ProductInventory | null>(null);
  const [productHistory, setProductHistory] = useState<TransactionRecord[]>([]);
  const [productHistoryDiagnostics, setProductHistoryDiagnostics] = useState<TransactionDiagnostic[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [transactionDetailDialogOpen, setTransactionDetailDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);

  // Cut roll dialog
  const [cutDialogOpen, setCutDialogOpen] = useState(false);
  const [rollToCut, setRollToCut] = useState<RollInventory | null>(null);
  const [cutLength, setCutLength] = useState<string>('');
  const [cuttingLoading, setCuttingLoading] = useState(false);
  const [availableRolls, setAvailableRolls] = useState<RollInventory[]>([]);

  // Cut bundle dialog (for sprinkler pipes)
  const [cutBundleDialogOpen, setCutBundleDialogOpen] = useState(false);
  const [bundleToCut, setBundleToCut] = useState<RollInventory | null>(null);
  const [cutPiecesCount, setCutPiecesCount] = useState<string>('');
  const [availableBundles, setAvailableBundles] = useState<RollInventory[]>([]);

  // Combine spares dialog (for sprinkler pipes)
  const [combineSparesDialogOpen, setCombineSparesDialogOpen] = useState(false);
  const [selectedSparesToCombine, setSelectedSparesToCombine] = useState<Set<string>>(new Set());
  const [newBundleSize, setNewBundleSize] = useState<string>('');
  const [numberOfBundles, setNumberOfBundles] = useState<string>('');
  const [availableSpares, setAvailableSpares] = useState<RollInventory[]>([]);
  const [combiningLoading, setCombiningLoading] = useState(false);

  // Import/Export
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [templateType, setTemplateType] = useState<'hdpe' | 'sprinkler'>('hdpe');

  // WhatsApp sharing
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [selectedRollsForWhatsApp, setSelectedRollsForWhatsApp] = useState<Set<string>>(new Set());
  const [expandedProductsInWhatsApp, setExpandedProductsInWhatsApp] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchProductTypes();
    fetchBrands();
    fetchInventory();
  }, [selectedProductType, selectedBrand, parameterFilters]);

  const fetchProductTypes = async () => {
    try {
      const { data } = await inventoryAPI.getProductTypes();
      setProductTypes(data || []);
      // Set default to first product type if currently 'all'
      if (selectedProductType === 'all' && data && data.length > 0) {
        setSelectedProductType(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching product types:', error);
    }
  };

  const fetchBrands = async () => {
    try {
      const { data } = await inventoryAPI.getBrands();
      setBrands(data || []);
    } catch (error) {
      console.error('Error fetching brands:', error);
    }
  };

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryAPI.getBatches();

      // Transform backend flat batch data to grouped ProductInventory structure
      const productMap = new Map<string, ProductInventory>();

      (data || []).forEach((batch: any) => {
        const key = `${batch.product_type_name}-${batch.brand_name}-${batch.product_variant_id}`;

        if (!productMap.has(key)) {
          // Get product type config to determine unit
          const productType = productTypes.find(pt => pt.id === batch.product_type_id);
          const rollConfig = productType?.roll_configuration || { type: 'standard_rolls' };

          productMap.set(key, {
            product_type: batch.product_type_name,
            product_type_id: batch.product_type_id,
            brand: batch.brand_name,
            brand_id: batch.brand_id,
            product_variant_id: batch.product_variant_id, // Store for exact matching
            parameters: batch.parameters,
            total_quantity: 0,
            batches: [],
            roll_config: rollConfig, // Store config for unit display
          });
        }

        const product = productMap.get(key)!;

        // Calculate quantity based on product type
        if (product.roll_config?.type === 'bundles' && product.roll_config?.quantity_based) {
          // For quantity-based bundles (sprinkler), count pieces not meters
          const bundleRolls = (batch.rolls || []).filter((r: any) => r.roll_type?.startsWith('bundle_'));
          const spareRolls = (batch.rolls || []).filter((r: any) => r.roll_type === 'spare');

          // Count total pieces from bundles
          const bundlePieces = bundleRolls.reduce((sum, r) => {
            const bundleSize = r.bundle_size || parseInt(r.roll_type?.split('_')[1] || '0');
            return sum + bundleSize;
          }, 0);

          // Count total pieces from spare rolls (each spare roll has bundle_size field with quantity)
          const sparePieces = spareRolls.reduce((sum, r) => sum + (r.bundle_size || 1), 0);
          product.total_quantity += bundlePieces + sparePieces;
        } else if (product.roll_config?.type === 'bundles') {
          // For length-based bundles, count pieces but still use meters
          const bundleRolls = (batch.rolls || []).filter((r: any) => r.roll_type?.startsWith('bundle_'));
          const spareRolls = (batch.rolls || []).filter((r: any) => r.roll_type === 'spare');
          product.total_quantity += bundleRolls.length + spareRolls.length;
        } else {
          // For standard rolls, use meters
          product.total_quantity += parseFloat(batch.current_quantity || 0);
        }

        product.batches.push({
          id: batch.id,
          batch_code: batch.batch_code,
          batch_no: batch.batch_no,
          current_quantity: parseFloat(batch.current_quantity || 0),
          production_date: batch.production_date,
          attachment_url: batch.attachment_url,
          rolls: (batch.rolls || []).map((roll: any) => ({
            ...roll,
            length_meters: parseFloat(roll.length_meters || 0),
            initial_length_meters: parseFloat(roll.initial_length_meters || 0),
          })),
        });
      });

      setInventory(Array.from(productMap.values()));
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchProductHistory = async (product: ProductInventory) => {
    setLoadingHistory(true);
    setProductHistory([]);
    setProductHistoryDiagnostics([]);

    try {
      console.log('📊 Fetching history for product variant:', product.product_variant_id);

      // Use the new dedicated ledger API endpoint
      const { data } = await ledgerAPI.getProductLedger(product.product_variant_id);

      if (!data || !data.transactions || data.transactions.length === 0) {
        toast.info('No transactions found for this product');
        setLoadingHistory(false);
        return;
      }

      console.log(`✅ Found ${data.transactions.length} transactions`);
      console.log('📈 Summary:', data.summary);

      setProductHistory(data.transactions);

      if (data.transactions.length === 0) {
        toast.info('No transactions found for this product variant');
      }
    } catch (error: any) {
      console.error('❌ Error fetching product history:', error);
      toast.error(`Failed to load product history: ${error.message || 'Unknown error'}`);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openProductHistory = (product: ProductInventory) => {
    setSelectedProductForHistory(product);
    setProductHistoryDialogOpen(true);
    fetchProductHistory(product);
  };

  const openCutDialog = (roll: RollInventory) => {
    setRollToCut(roll);
    setCutLength('');
    setAvailableRolls([]);
    setCutDialogOpen(true);
  };

  const openCutDialogWithRolls = (rolls: RollInventory[]) => {
    // Automatically select the first roll and don't show the list
    setRollToCut(rolls[0]);
    setAvailableRolls([]);
    setCutLength('');
    setCutDialogOpen(true);
  };

  const handleCutRoll = async () => {
    if (!rollToCut) return;

    const cutLengthValue = parseFloat(cutLength);
    if (isNaN(cutLengthValue) || cutLengthValue <= 0) {
      toast.error('Please enter a valid cut length');
      return;
    }

    if (cutLengthValue >= rollToCut.length_meters) {
      toast.error(`Cut length must be less than roll length (${rollToCut.length_meters}m)`);
      return;
    }

    const remainingLength = rollToCut.length_meters - cutLengthValue;

    setCuttingLoading(true);
    try {
      const { dispatch } = await import('@/lib/api');
      await dispatch.cutRoll({
        roll_id: rollToCut.id,
        cuts: [{ length: cutLengthValue }, { length: remainingLength }],
      });

      toast.success(`Roll cut into 2 pieces: ${cutLengthValue}m and ${remainingLength.toFixed(2)}m`);
      setCutDialogOpen(false);
      setRollToCut(null);

      // Refresh inventory
      await fetchInventory();
    } catch (error: any) {
      console.error('Error cutting roll:', error);
      toast.error(error.response?.data?.error || 'Failed to cut roll');
    } finally {
      setCuttingLoading(false);
    }
  };

  // Bundle cutting functions (for sprinkler pipes)
  const openCutBundleDialog = (bundle: RollInventory) => {
    setBundleToCut(bundle);
    setCutPiecesCount('');
    setAvailableBundles([]);
    setCutBundleDialogOpen(true);
  };

  const openCutBundleDialogWithBundles = (bundles: RollInventory[]) => {
    setBundleToCut(bundles[0]);
    setAvailableBundles([]);
    setCutPiecesCount('');
    setCutBundleDialogOpen(true);
  };

  const handleCutBundle = async () => {
    if (!bundleToCut) return;

    const piecesCount = parseInt(cutPiecesCount);
    const bundleSize = bundleToCut.bundle_size || 0;

    if (isNaN(piecesCount) || piecesCount <= 0) {
      toast.error('Please enter a valid number of pieces');
      return;
    }

    if (piecesCount >= bundleSize) {
      toast.error(`Cut pieces must be less than bundle size (${bundleSize} pieces)`);
      return;
    }

    const remainingPieces = bundleSize - piecesCount;

    setCuttingLoading(true);
    try {
      const { dispatch } = await import('@/lib/api');
      await dispatch.cutBundle({
        roll_id: bundleToCut.id,
        cuts: [
          { pieces: piecesCount },
          { pieces: remainingPieces }
        ],
      });

      toast.success(`Bundle split: ${piecesCount} spare pieces + ${remainingPieces} spare pieces`);
      setCutBundleDialogOpen(false);
      setBundleToCut(null);

      await fetchInventory();
    } catch (error: any) {
      console.error('Error cutting bundle:', error);
      toast.error(error.response?.data?.error || 'Failed to cut bundle');
    } finally {
      setCuttingLoading(false);
    }
  };

  // Combine spares functions (for sprinkler pipes)
  const openCombineSparesDialog = (spares: RollInventory[]) => {
    setAvailableSpares(spares);
    setSelectedSparesToCombine(new Set());
    setNewBundleSize('');
    setCombineSparesDialogOpen(true);
  };

  const handleCombineSpares = async () => {
    const bundleSize = parseInt(newBundleSize);
    if (isNaN(bundleSize) || bundleSize <= 0) {
      toast.error('Please enter a valid bundle size');
      return;
    }

    // Use all available spare pieces
    const totalPieces = availableSpares.reduce((sum, s) => sum + (s.bundle_size || 1), 0);

    // Calculate number of bundles to create (default to 1 if not specified)
    const numBundles = numberOfBundles && parseInt(numberOfBundles) > 0
      ? parseInt(numberOfBundles)
      : 1;

    const totalPiecesNeeded = numBundles * bundleSize;

    if (totalPiecesNeeded > totalPieces) {
      toast.error(`Not enough pieces: need ${totalPiecesNeeded}, have ${totalPieces}`);
      return;
    }

    setCombiningLoading(true);

    try {
      const { dispatch } = await import('@/lib/api');

      // Create all bundles in one API call (creates one transaction)
      await dispatch.combineSpares({
        spare_roll_ids: availableSpares.map(s => s.id),
        bundle_size: bundleSize,
        number_of_bundles: numBundles,
      });

      const remainingPieces = totalPieces - totalPiecesNeeded;

      if (numBundles > 1) {
        toast.success(`Created ${numBundles} bundles of ${bundleSize} pieces each${remainingPieces > 0 ? `. ${remainingPieces} pieces remaining as spares` : ''}`);
      } else {
        toast.success(`Created bundle of ${bundleSize} pieces${remainingPieces > 0 ? `. ${remainingPieces} pieces remaining as spares` : ''}`);
      }

      setCombineSparesDialogOpen(false);
      setNewBundleSize('');
      setNumberOfBundles('');

      await fetchInventory();
    } catch (error: any) {
      console.error('Error combining spares:', error);
      toast.error(error.response?.data?.error || 'Failed to combine spares');
    } finally {
      setCombiningLoading(false);
    }
  };  // Helper function to fetch current spare rolls for a batch
  const fetchCurrentSpareRolls = async (): Promise<RollInventory[]> => {
    if (availableSpares.length === 0) return [];

    const batchId = (availableSpares[0] as any).batch_id;
    if (!batchId) {
      console.error('No batch_id found on spare rolls');
      return [];
    }

    const { inventory } = await import('@/lib/api');
    const response = await inventory.getBatches();
    const data = response.data || response;

    const batch = data.find((b: any) => b.id === batchId);
    if (!batch || !batch.rolls) {
      console.log('Batch not found or has no rolls:', batchId);
      return [];
    }

    const spares = batch.rolls.filter((r: any) => r.roll_type === 'spare').map((r: any) => ({
      id: r.id,
      length_meters: r.length_meters || 0,
      weight: r.weight,
      status: r.status,
      roll_type: r.roll_type,
      bundle_size: r.bundle_size,
      batch_id: batchId,
    }));

    console.log(`Found ${spares.length} spare rolls in batch ${batchId}, total pieces:`,
      spares.reduce((sum, s) => sum + (s.bundle_size || 1), 0));

    return spares;
  };

  const formatWeight = (weightInGrams: number | null | undefined): string => {
    if (weightInGrams == null) return '-';
    if (weightInGrams >= 1000) {
      return `${(weightInGrams / 1000).toFixed(2)} kg`;
    }
    return `${weightInGrams.toFixed(0)} g`;
  };

  const exportProductHistoryCSV = () => {
    if (!selectedProductForHistory || productHistory.length === 0) return;

    const headers = ['Date', 'Type', 'Batch Code', 'Quantity', 'Customer', 'Invoice', 'Notes'];
    const headersWithRoll = [...headers, 'Roll Length (m)', 'Roll Weight', 'Roll Type', 'Is Cut'];
    const rows = productHistory.map((txn) => [
      new Date(txn.transaction_date).toLocaleString('en-IN'),
      txn.transaction_type,
      txn.batch_code || '-',
      `${txn.quantity_change} m`,
      txn.customer_name || '-',
      txn.invoice_no || '-',
      txn.notes || '-',
      txn.roll_length_meters != null ? txn.roll_length_meters : '-',
      formatWeight(txn.roll_weight),
      txn.roll_type || '-',
      txn.roll_is_cut ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headersWithRoll.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedProductForHistory.product_type}-${selectedProductForHistory.brand}-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredInventory = inventory.filter((item) => {
    // Product type filter
    if (selectedProductType !== 'all' && item.product_type_id !== selectedProductType) {
      return false;
    }

    // Brand filter
    if (selectedBrand !== 'all' && item.brand_id !== selectedBrand) {
      return false;
    }

    // Parameter filters
    for (const [paramKey, paramValue] of Object.entries(parameterFilters)) {
      if (paramValue && item.parameters[paramKey] !== paramValue) {
        return false;
      }
    }

    // Cut rolls filter
    if (showOnlyCutRolls) {
      const hasCutRolls = item.batches.some(batch =>
        batch.rolls.some(roll => roll.is_cut_roll || roll.roll_type === 'cut')
      );
      if (!hasCutRolls) {
        return false;
      }
    }

    // Spare pieces filter
    if (showOnlySpares) {
      const hasSpares = item.batches.some(batch =>
        batch.rolls.some(roll => roll.roll_type === 'spare')
      );
      if (!hasSpares) {
        return false;
      }
    }

    // Search query
    const searchLower = searchQuery.toLowerCase();
    if (searchQuery && !(
      item.product_type.toLowerCase().includes(searchLower) ||
      item.brand.toLowerCase().includes(searchLower) ||
      JSON.stringify(item.parameters).toLowerCase().includes(searchLower) ||
      item.batches.some(b =>
        b.batch_code.toLowerCase().includes(searchLower) ||
        b.batch_no.toLowerCase().includes(searchLower)
      )
    )) {
      return false;
    }

    return true;
  });

  const getRollStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-green-500';
      case 'PARTIAL': return 'bg-orange-500';
      case 'SOLD_OUT': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const handleRollUpdate = async () => {
    if (!editingRoll) return;

    try {
      // Check if status changed to SOLD_OUT
      const statusChangedToSoldOut = editingRoll.originalStatus !== 'SOLD_OUT' && editingRoll.status === 'SOLD_OUT';

      await inventoryAPI.updateRoll(editingRoll.id, {
        length_meters: editingRoll.length_meters,
        status: editingRoll.status,
        create_transaction: statusChangedToSoldOut
      });

      toast.success(statusChangedToSoldOut
        ? 'Roll marked as sold out and transaction created'
        : 'Roll updated successfully'
      );
      setEditingRoll(null);
      fetchInventory();
    } catch (error) {
      console.error('Error updating roll:', error);
      toast.error('Failed to update roll');
    }
  };

  const downloadTemplate = () => {
    let template: any[];
    let filename: string;

    if (templateType === 'hdpe') {
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
        },
        {
          'Product Type': 'HDPE Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-25',
          'Roll Length (m)': '100',
          'Number of Rolls': '6',
          'Weight per Meter': '1.85',
          'PE (SDR)': '100',
          'OD (mm)': '50',
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
        },
        {
          'Product Type': 'Sprinkler Pipe',
          'Brand': 'Tarko',
          'Production Date': '2025-01-20',
          'Bundle Size (pcs)': '10',
          'Piece Length (m)': '6',
          'Number of Bundles': '25',
          'OD (mm)': '16',
          'PN (bar)': '4',
          'Weight per Meter': '0.15',
          'Type/PE': 'C'
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
    toast.success(`${templateType.toUpperCase()} template downloaded`);
  };

  const exportInventory = () => {
    const exportData: any[] = [];

    inventory.forEach(product => {
      const isSprinklerPipe = product.product_type?.toLowerCase().includes('sprinkler');
      const isBundle = product.roll_config?.type === 'bundles';

      product.batches.forEach(batch => {
        if (isSprinklerPipe || isBundle) {
          // For Sprinkler/Bundle products: Group by bundle type
          const bundleGroups = batch.rolls.reduce((acc, roll) => {
            const key = `${roll.roll_type}_${roll.bundle_size}`;
            if (!acc[key]) {
              acc[key] = {
                rolls: [],
                roll_type: roll.roll_type || 'bundle',
                bundle_size: roll.bundle_size || 0
              };
            }
            acc[key].rolls.push(roll);
            return acc;
          }, {} as Record<string, any>);

          Object.values(bundleGroups).forEach((group: any) => {
            const params = product.parameters || {};
            exportData.push({
              'Product Type': product.product_type,
              'Brand': product.brand,
              'OD (mm)': params.OD || params.od || '',
              'PN (bar)': params.PN || params.pn || '',
              'Type/PE': params.Type || params.PE || '',
              'Batch Code': batch.batch_code,
              'Batch No': batch.batch_no,
              'Production Date': batch.production_date,
              'Item Type': group.roll_type === 'spare' ? 'Spare Pieces' : `Bundle (${group.bundle_size} pcs)`,
              'Quantity': group.rolls.length,
              'Total Pieces': group.rolls.length * (group.bundle_size || 1),
              'Status': 'AVAILABLE'
            });
          });
        } else {
          // For HDPE/Standard rolls: Group by standard vs cut
          const standardRolls = batch.rolls.filter(r => !r.is_cut_roll && (!r.roll_type || r.roll_type === 'standard'));
          const cutRolls = batch.rolls.filter(r => r.is_cut_roll || r.roll_type === 'cut');

          if (standardRolls.length > 0) {
            // Group standard rolls by initial length (since they might be consumed)
            const lengthGroups = standardRolls.reduce((acc, roll) => {
              const key = roll.initial_length_meters.toFixed(2);
              if (!acc[key]) {
                acc[key] = [];
              }
              acc[key].push(roll);
              return acc;
            }, {} as Record<string, typeof standardRolls>);

            Object.entries(lengthGroups).forEach(([initialLength, rolls]) => {
              const params = product.parameters || {};
              const currentTotalLength = rolls.reduce((sum, r) => sum + r.length_meters, 0);
              exportData.push({
                'Product Type': product.product_type,
                'Brand': product.brand,
                'OD (mm)': params.OD || params.od || '',
                'PN (bar)': params.PN || params.pn || '',
                'Type/PE': params.Type || params.PE || '',
                'Batch Code': batch.batch_code,
                'Batch No': batch.batch_no,
                'Production Date': batch.production_date,
                'Item Type': 'Standard Roll',
                'Original Roll Length (m)': initialLength,
                'Number of Rolls': rolls.length,
                'Current Total Length (m)': currentTotalLength.toFixed(2),
                'Status': 'AVAILABLE'
              });
            });
          }

          if (cutRolls.length > 0) {
            // Group cut rolls by current length
            const cutLengthGroups = cutRolls.reduce((acc, roll) => {
              const key = roll.length_meters.toFixed(2);
              if (!acc[key]) {
                acc[key] = [];
              }
              acc[key].push(roll);
              return acc;
            }, {} as Record<string, typeof cutRolls>);

            Object.entries(cutLengthGroups).forEach(([length, rolls]) => {
              const params = product.parameters || {};
              const totalLength = rolls.reduce((sum, r) => sum + r.length_meters, 0);
              const avgOriginalLength = rolls.reduce((sum, r) => sum + (r.initial_length_meters || r.length_meters), 0) / rolls.length;
              exportData.push({
                'Product Type': product.product_type,
                'Brand': product.brand,
                'OD (mm)': params.OD || params.od || '',
                'PN (bar)': params.PN || params.pn || '',
                'Type/PE': params.Type || params.PE || '',
                'Batch Code': batch.batch_code,
                'Batch No': batch.batch_no,
                'Production Date': batch.production_date,
                'Item Type': 'Cut Roll',
                'Cut Length (m)': length,
                'Number of Cut Pieces': rolls.length,
                'Total Length (m)': totalLength.toFixed(2),
                'Avg Original Length (m)': avgOriginalLength.toFixed(2),
                'Status': 'AVAILABLE'
              });
            });
          }
        }
      });
    });

    if (exportData.length === 0) {
      toast.error('No inventory to export');
      return;
    }

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

  const openWhatsAppDialog = () => {
    // Pre-select all rolls from visible products
    const allRollIds = new Set<string>();
    filteredInventory.forEach(product => {
      product.batches.forEach(batch => {
        batch.rolls.forEach(roll => {
          allRollIds.add(roll.id);
        });
      });
    });
    setSelectedRollsForWhatsApp(allRollIds);
    setWhatsappDialogOpen(true);
  };

  const shareOnWhatsApp = () => {
    if (selectedRollsForWhatsApp.size === 0) {
      toast.error('Please select at least one item to share');
      return;
    }

    // Generate inventory message with improved formatting
    let message = '📦 *INVENTORY REPORT*\n';
    message += `📅 ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`;
    message += '━━━━━━━━━━━━━━━━━━━━\n\n';

    // Group products by their selection type
    const productGroups = new Map<string, {
      product: ProductInventory;
      standardRolls: RollInventory[];
      cutRolls: RollInventory[];
    }>();

    filteredInventory.forEach((product) => {
      const uniqueKey = `${product.product_type_id}_${product.brand_id}_${JSON.stringify(product.parameters)}`;
      const allRolls = product.batches.flatMap(b => b.rolls);
      const standardRolls = allRolls.filter(r => !r.is_cut_roll && r.roll_type !== 'cut');
      const cutRolls = allRolls.filter(r => r.is_cut_roll || r.roll_type === 'cut');

      // Check if this product (standard rolls) is selected
      const isProductSelected = selectedRollsForWhatsApp.has(uniqueKey);

      // Get selected cut rolls
      const selectedCutRolls = cutRolls.filter(r => selectedRollsForWhatsApp.has(r.id));

      if (isProductSelected || selectedCutRolls.length > 0) {
        productGroups.set(uniqueKey, {
          product,
          standardRolls: isProductSelected ? standardRolls : [],
          cutRolls: selectedCutRolls
        });
      }
    });

    // Group by product type
    const groupedByType: Record<string, Array<{ product: ProductInventory; standardRolls: RollInventory[]; cutRolls: RollInventory[] }>> = {};
    productGroups.forEach((data) => {
      const productType = data.product.product_type;
      if (!groupedByType[productType]) {
        groupedByType[productType] = [];
      }
      groupedByType[productType].push(data);
    });

    Object.entries(groupedByType).forEach(([productType, productList]) => {
      message += `🏷️ *${productType.toUpperCase()}*\n`;
      message += '─────────────────\n';

      productList.forEach(({ product, standardRolls, cutRolls }) => {
        const params = product.parameters || {};
        const paramsLine = Object.entries(params)
          .filter(([k, v]) => v && k !== 'Type' && k !== 'type')
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ');

        message += `\n📌 *${product.brand}*`;
        if (paramsLine) message += ` (${paramsLine})`;
        message += '\n';

        const isSprinkler = product.product_type.toLowerCase().includes('sprinkler');

        if (isSprinkler) {
          const allRolls = [...standardRolls, ...cutRolls];
          const bundles = allRolls.filter(r => r.roll_type?.startsWith('bundle_'));
          const spares = allRolls.filter(r => r.roll_type === 'spare');

          const bundleGroups = bundles.reduce((acc, roll) => {
            const key = roll.bundle_size || 0;
            if (!acc[key]) acc[key] = [];
            acc[key].push(roll);
            return acc;
          }, {} as Record<number, RollInventory[]>);

          Object.entries(bundleGroups).forEach(([size, rollGroup]) => {
            const totalPieces = rollGroup.length * parseInt(size);
            message += `   📦 ${rollGroup.length} bundles × ${size} pcs = *${totalPieces} pieces*\n`;
          });

          if (spares.length > 0) {
            const sparePieces = spares.reduce((sum, r) => sum + (r.bundle_size || 1), 0);
            message += `   📍 Spare pieces: *${sparePieces}*\n`;
          }
        } else {
          if (standardRolls.length > 0) {
            const lengthGroups = standardRolls.reduce((acc, roll) => {
              const key = roll.initial_length_meters.toFixed(0);
              if (!acc[key]) acc[key] = [];
              acc[key].push(roll);
              return acc;
            }, {} as Record<string, RollInventory[]>);

            Object.entries(lengthGroups).forEach(([length, rollGroup]) => {
              const totalLength = rollGroup.reduce((sum, r) => sum + r.length_meters, 0);
              message += `   🔄 ${rollGroup.length} rolls × ${length}m = *${totalLength.toFixed(2)}m*\n`;
            });
          }

          if (cutRolls.length > 0) {
            const cutLengthGroups = cutRolls.reduce((acc, roll) => {
              const key = roll.length_meters.toFixed(2);
              if (!acc[key]) acc[key] = [];
              acc[key].push(roll);
              return acc;
            }, {} as Record<string, RollInventory[]>);

            Object.entries(cutLengthGroups).forEach(([length, rollGroup]) => {
              const totalLength = rollGroup.reduce((sum, r) => sum + r.length_meters, 0);
              message += `   ✂️  ${rollGroup.length} cut pieces × ${length}m = *${totalLength.toFixed(2)}m*\n`;
            });
          }
        }

        const allRolls = [...standardRolls, ...cutRolls];
        const totalQty = allRolls.reduce((sum, r) => sum + r.length_meters, 0);
        const unit = product.roll_config?.type === 'bundles' ? 'pcs' : 'm';
        message += `   ➡️ *Total: ${totalQty.toFixed(2)} ${unit}*\n`;
      });

      message += '\n';
    });

    message += '━━━━━━━━━━━━━━━━━━━━\n';
    message += '✅ _Stock Updated_';

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    setWhatsappDialogOpen(false);
    setExpandedProductsInWhatsApp(new Set());
    toast.success('Opening WhatsApp...');
  };  const handleImport = async () => {
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
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, '')); // Remove quotes
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = values[index];
        });
        return obj;
      });

      // Group by product variant to create batches
      const batches: any[] = [];

      for (const row of data) {
        // Helper function to extract value from column with or without units
        const getValue = (key: string, alternatives: string[] = []) => {
          if (row[key]) return row[key];
          for (const alt of alternatives) {
            if (row[alt]) return row[alt];
          }
          return '';
        };

        // Determine if it's HDPE or Sprinkler based on available fields
        const pe = getValue('PE (SDR)', ['PE', 'pe']);
        const type = getValue('Type/PE', ['Type', 'type']);
        const isHDPE = pe !== undefined && pe !== '';
        const isSprinkler = !isHDPE && type !== undefined && type !== '';

        if (!isHDPE && !isSprinkler) {
          console.warn('Skipping row - cannot determine product type:', row);
          continue;
        }

        // Find matching product type and brand
        const productTypeName = getValue('Product Type', ['product_type']);
        const brandName = getValue('Brand', ['brand']);

        const productType = productTypes.find(pt =>
          pt.name.toLowerCase() === productTypeName?.toLowerCase()
        );
        const brand = brands.find(b =>
          b.name.toLowerCase() === brandName?.toLowerCase()
        );

        if (!productType || !brand) {
          console.warn('Product type or brand not found:', productTypeName, brandName);
          continue;
        }

        // Build parameters - extract values with or without units
        const od = getValue('OD (mm)', ['OD', 'od']);
        const pn = getValue('PN (bar)', ['PN', 'pn']);

        const parameters: any = {};
        if (isHDPE) {
          parameters.OD = od;
          parameters.PN = pn;
          parameters.PE = pe;
        } else {
          parameters.OD = od;
          parameters.PN = pn;
          parameters.Type = type;
        }

        // Get batch details
        const batchCode = getValue('Batch Code', ['batch_code']);
        const batchNo = getValue('Batch No', ['batch_no']);
        const prodDate = getValue('Production Date', ['production_date']);

        // Get quantity details based on product type
        let initialQuantity, rollLength, numRolls, bundleSize, pieceLength, numBundles, weightPerMeter;

        if (isSprinkler) {
          bundleSize = parseFloat(getValue('bundle_size (pcs)', ['bundle_size', 'Bundle Size (pcs)']) || '10');
          pieceLength = parseFloat(getValue('piece_length (m)', ['piece_length', 'Piece Length (m)']) || '6');
          numBundles = parseInt(getValue('number_of_bundles', ['Number of Bundles']) || '1');
          weightPerMeter = parseFloat(getValue('weight_per_meter (kg/m)', ['weight_per_meter', 'Weight per Meter']) || '0');
          initialQuantity = numBundles * bundleSize * pieceLength;
        } else {
          rollLength = parseFloat(getValue('roll_length (m)', ['roll_length_meters', 'Roll Length (m)']) || '100');
          numRolls = parseInt(getValue('number_of_rolls', ['Number of Rolls']) || '1');
          weightPerMeter = parseFloat(getValue('weight_per_meter (kg/m)', ['weight_per_meter', 'Weight per Meter']) || '0');
          initialQuantity = rollLength * numRolls;
        }

        batches.push({
          product_type_id: productType.id,
          brand_id: brand.id,
          parameters,
          batch_code: batchCode,
          batch_no: batchNo,
          production_date: prodDate,
          initial_quantity: initialQuantity,
          weight_per_meter: weightPerMeter || 0,
          notes: getValue('notes', ['Notes']) || 'Imported from CSV',
          // Roll configuration
          roll_config_type: isSprinkler ? 'bundles' : 'standard_rolls',
          quantity_based: isSprinkler ? 'true' : 'false',
          roll_length: isSprinkler ? null : rollLength,
          number_of_rolls: isSprinkler ? null : numRolls,
          bundle_size: isSprinkler ? bundleSize : null,
          piece_length: isSprinkler ? pieceLength : null,
          number_of_bundles: isSprinkler ? numBundles : null
        });
      }

      console.log('Importing batches:', batches);

      // Create batches via API
      for (const batch of batches) {
        await productionAPI.createBatch(batch);
      }

      toast.success(`Successfully imported ${batches.length} batches`);
      setImportDialogOpen(false);
      setImportFile(null);
      fetchInventory();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import inventory');
    } finally {
      setImporting(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Package className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
              <p className="text-muted-foreground">Track stock across products, batches, and rolls</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {user?.role === 'admin' && (
              <>
                <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="flex-1 sm:flex-initial">
                  <Upload className="h-4 w-4 mr-2" />
                  {isMobile ? '' : 'Import'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex-1 sm:flex-initial">
                      <Download className="h-4 w-4 mr-2" />
                      {isMobile ? '' : 'Export'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate('/export/hdpe')}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export HDPE Inventory
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/export/sprinkler')}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export Sprinkler Inventory
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <Button variant="outline" onClick={openWhatsAppDialog} className="flex-1 sm:flex-initial bg-green-50 hover:bg-green-100 border-green-200">
              <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
              <span className="text-green-700">{isMobile ? 'WhatsApp' : 'Share on WhatsApp'}</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products, batches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>

              {/* Product Type Filter */}
              <Select value={selectedProductType} onValueChange={setSelectedProductType}>
                <SelectTrigger className={`h-12 ${selectedProductType === 'all' ? 'border-red-500 border-2' : ''}`}>
                  <div className="flex items-center">
                    <Package className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Select Product Type *" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Brand Filter */}
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger className="h-12">
                  <div className="flex items-center">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All Brands" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Dynamic Parameter Filters */}
              {selectedProductType !== 'all' && (() => {
                const selectedPT = productTypes.find(pt => pt.id === selectedProductType);
                const paramSchema = selectedPT?.parameter_schema || [];
                return paramSchema.map((param: any) => (
                  <Select
                    key={param.name}
                    value={parameterFilters[param.name] || 'all'}
                    onValueChange={(value) => {
                      setParameterFilters(prev => ({
                        ...prev,
                        [param.name]: value === 'all' ? '' : value
                      }));
                    }}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder={`All ${param.name}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {param.name}</SelectItem>
                      {/* Get unique values from inventory for this parameter */}
                      {Array.from(new Set(
                        inventory
                          .filter(item => item.product_type_id === selectedProductType)
                          .map(item => item.parameters[param.name])
                          .filter(Boolean)
                      )).map((value: any) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ));
              })()}

              {/* Cut Rolls Filter */}
              <div className="flex items-center space-x-2 border rounded-md px-3 h-12">
                <input
                  type="checkbox"
                  id="cut-rolls-filter"
                  checked={showOnlyCutRolls}
                  onChange={(e) => setShowOnlyCutRolls(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="cut-rolls-filter" className="text-sm font-medium cursor-pointer">
                  Show Only Cut Rolls
                </Label>
              </div>

              {/* Spare Pieces Filter */}
              <div className="flex items-center space-x-2 border rounded-md px-3 h-12">
                <input
                  type="checkbox"
                  id="spare-pieces-filter"
                  checked={showOnlySpares}
                  onChange={(e) => setShowOnlySpares(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="spare-pieces-filter" className="text-sm font-medium cursor-pointer">
                  Show Only Spare Pieces
                </Label>
              </div>

              {/* Clear Filters Button */}
              {(selectedBrand !== 'all' || showOnlyCutRolls || showOnlySpares || Object.keys(parameterFilters).length > 0) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedBrand('all');
                    setParameterFilters({});
                    setShowOnlyCutRolls(false);
                    setShowOnlySpares(false);
                  }}
                  className="h-12"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{filteredInventory.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {filteredInventory.reduce((acc, p) => acc + p.batches.length, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Rolls/Bundles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {filteredInventory.reduce((acc, p) =>
                  acc + p.batches.reduce((bAcc, b) => bAcc + b.rolls.length, 0), 0
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {(() => {
                  const bundleProducts = filteredInventory.filter(p => p.roll_config?.type === 'bundles');
                  const rollProducts = filteredInventory.filter(p => p.roll_config?.type !== 'bundles');
                  const bundleQty = bundleProducts.reduce((acc, p) => acc + p.total_quantity, 0);
                  const rollQty = rollProducts.reduce((acc, p) => acc + p.total_quantity, 0);

                  if (bundleQty > 0 && rollQty > 0) {
                    return `${rollQty.toFixed(2)} m / ${bundleQty} pcs`;
                  } else if (bundleQty > 0) {
                    return `${bundleQty} pieces`;
                  } else {
                    return `${rollQty.toFixed(2)} m`;
                  }
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Inventory List */}
        {loading ? (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted animate-pulse rounded"></div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : filteredInventory.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">No inventory found</p>
            </CardContent>
          </Card>
        ) : (
          /* Product View with Colorful Pills and Aggregated Rolls */
          <div className="space-y-4">
            {filteredInventory.map((product, idx) => {
              const isBundle = product.roll_config?.type === 'bundles';
              const unit = isBundle ? 'pieces' : 'm';
              const displayQty = isBundle ? product.total_quantity : product.total_quantity.toFixed(2);

              // Aggregate ALL rolls from ALL batches (preserve batch_id)
              let allRolls = product.batches.flatMap(batch =>
                batch.rolls.map(roll => ({ ...roll, batch_id: batch.id }))
              );

              // Apply filters if active
              if (showOnlyCutRolls) {
                allRolls = allRolls.filter(r => r.is_cut_roll || r.roll_type === 'cut');
              }

              if (showOnlySpares) {
                allRolls = allRolls.filter(r => r.roll_type === 'spare');
              }

              // Standard rolls grouped by length
              const standardRolls = allRolls.filter(r => r.roll_type === 'standard' || (!r.roll_type && !r.is_cut_roll));
              const standardByLength = standardRolls.reduce((acc, roll) => {
                const length = roll.initial_length_meters;
                if (!acc[length]) {
                  acc[length] = [];
                }
                acc[length].push(roll);
                return acc;
              }, {} as Record<number, typeof standardRolls>);

              // Cut rolls - no grouping, just filter
              const cutRolls = allRolls.filter(r => r.roll_type === 'cut' || r.is_cut_roll);

              // Bundles grouped by size
              const bundleRolls = allRolls.filter(r => r.roll_type?.startsWith('bundle_'));
              const bundlesBySize = bundleRolls.reduce((acc, roll) => {
                const bundleSize = roll.bundle_size || parseInt(roll.roll_type?.split('_')[1] || '0');
                if (!acc[bundleSize]) {
                  acc[bundleSize] = [];
                }
                acc[bundleSize].push(roll);
                return acc;
              }, {} as Record<number, typeof bundleRolls>);

              // Spare pipes
              const spareRolls = allRolls.filter(r => r.roll_type === 'spare');

              return (
                <Card key={idx}>
                  <Collapsible>
                    <CardHeader className="pb-3">
                      {isMobile ? (
                        /* Mobile Layout - Stacked */
                        <div className="space-y-3">
                          {/* Badges */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-sm px-2 py-1">
                              {product.brand}
                            </Badge>
                            {(() => {
                              const paramOrder = ['PE', 'PN', 'OD'];
                              const sortedParams = Object.entries(product.parameters).sort(([keyA], [keyB]) => {
                                const indexA = paramOrder.indexOf(keyA);
                                const indexB = paramOrder.indexOf(keyB);
                                if (indexA === -1 && indexB === -1) return 0;
                                if (indexA === -1) return 1;
                                if (indexB === -1) return -1;
                                return indexA - indexB;
                              });

                              return sortedParams.map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-sm px-2 py-1">
                                  {key}: {String(value)}
                                </Badge>
                              ));
                            })()}
                          </div>

                          {/* Quantity and Actions */}
                          <div className="flex items-center justify-between gap-2">
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">
                                    <span className="font-bold">{displayQty}</span> {unit}
                                  </span>
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </Button>
                            </CollapsibleTrigger>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openProductHistory(product);
                              }}
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              History
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Desktop Layout - Horizontal */
                        <div className="flex items-center justify-between w-full gap-4">
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between flex-1 gap-3 cursor-pointer">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className="text-base px-3 py-1">
                                  {product.brand}
                                </Badge>
                                {(() => {
                                  const paramOrder = ['PE', 'PN', 'OD'];
                                  const sortedParams = Object.entries(product.parameters).sort(([keyA], [keyB]) => {
                                    const indexA = paramOrder.indexOf(keyA);
                                    const indexB = paramOrder.indexOf(keyB);
                                    if (indexA === -1 && indexB === -1) return 0;
                                    if (indexA === -1) return 1;
                                    if (indexB === -1) return -1;
                                    return indexA - indexB;
                                  });

                                  return sortedParams.map(([key, value]) => (
                                    <Badge key={key} variant="outline" className="text-base px-3 py-1">
                                      {key}: {String(value)}
                                    </Badge>
                                  ));
                                })()}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-2xl whitespace-nowrap">
                                  <span className="font-bold">{displayQty}</span> {unit}
                                </span>
                                <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openProductHistory(product);
                            }}
                            className="ml-2"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            History
                          </Button>
                        </div>
                      )}
                    </CardHeader>

                    <CollapsibleContent>
                    <CardContent>
                      <div className="space-y-6">
                        {/* Standard Rolls - Hide for quantity-based products */}
                        {!product.roll_config?.quantity_based && Object.keys(standardByLength).length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground mb-3">
                              Standard Rolls ({standardRolls.length} total)
                            </div>
                            <div className="space-y-2">
                              {Object.entries(standardByLength)
                                .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
                                .map(([length, rolls]) => {
                                  const totalLength = rolls.reduce((sum, r) => sum + r.length_meters, 0);
                                  return (
                                    <div
                                      key={length}
                                      className="p-4 bg-secondary/50 rounded-lg flex items-center justify-between gap-3"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="text-base font-semibold">
                                          <span className="font-bold">{parseFloat(length).toFixed(0)}m</span> × {rolls.length}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {rolls.length} roll{rolls.length > 1 ? 's' : ''}
                                        </div>
                                      </div>
                                      <div className={`text-primary mr-2 ${isMobile ? 'text-xl' : 'text-3xl'}`}>
                                        <span className="font-bold">{totalLength.toFixed(0)}m</span>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openCutDialogWithRolls(rolls)}
                                        className="flex-shrink-0"
                                      >
                                        <ScissorsIcon className="h-4 w-4 mr-1" />
                                        {isMobile ? '' : 'Cut'}
                                      </Button>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {/* Cut Rolls - Hide for quantity-based products */}
                        {!product.roll_config?.quantity_based && cutRolls.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground mb-3">
                              Cut Rolls ({cutRolls.length} total)
                            </div>
                            <div className="space-y-2">
                              {cutRolls
                                .sort((a, b) => b.length_meters - a.length_meters)
                                .map((roll) => (
                                  <div
                                    key={roll.id}
                                    className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-base font-semibold text-amber-700 dark:text-amber-400">
                                        {roll.length_meters.toFixed(2)}m
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openCutDialog(roll)}
                                      className="flex-shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900"
                                    >
                                      <ScissorsIcon className="h-4 w-4 mr-1" />
                                      {isMobile ? '' : 'Cut'}
                                    </Button>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Bundles */}
                        {Object.keys(bundlesBySize).length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span>Bundles ({bundleRolls.length} total)</span>
                              {bundleRolls.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openCutBundleDialogWithBundles(bundleRolls)}
                                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 w-full sm:w-auto"
                                >
                                  <ScissorsIcon className="h-3 w-3 mr-1" />
                                  Cut into Spares
                                </Button>
                              )}
                            </div>
                            <div className="space-y-2">
                              {Object.entries(bundlesBySize)
                                .sort(([a], [b]) => parseInt(b) - parseInt(a))
                                .map(([bundleSize, rolls]) => {
                                  const totalPieces = rolls.reduce((sum, r) => {
                                    const size = r.bundle_size || parseInt(r.roll_type?.split('_')[1] || '0');
                                    return sum + size;
                                  }, 0);
                                  const totalLength = rolls.reduce((sum, r) => sum + r.length_meters, 0);

                                  return (
                                    <div
                                      key={bundleSize}
                                      className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg flex items-center justify-between gap-3 border border-blue-200 dark:border-blue-800"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="text-base font-semibold">
                                          Bundle of {bundleSize} × {rolls.length}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {totalPieces} pieces total
                                          {!product.roll_config?.quantity_based && ` (${totalLength.toFixed(2)} m)`}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className={`font-bold text-blue-600 ${isMobile ? 'text-xl' : 'text-3xl'}`}>
                                          {totalPieces} pcs
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => openCutBundleDialog(rolls[0])}
                                          className="flex-shrink-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                        >
                                          <ScissorsIcon className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {/* Spare Pipes */}
                        {spareRolls.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span>Spare Pipes ({spareRolls.length} total)</span>
                              {spareRolls.length >= 1 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openCombineSparesDialog(spareRolls)}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50 w-full sm:w-auto"
                                >
                                  <PlusIcon className="h-3 w-3 mr-1" />
                                  Combine into Bundle
                                </Button>
                              )}
                            </div>
                            <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg flex items-center justify-between gap-3 border border-purple-200 dark:border-purple-800">
                              <div className="flex-1 min-w-0">
                                <div className="text-base font-semibold">
                                  Spare Pipes × {spareRolls.length}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {spareRolls.reduce((sum, r) => sum + (r.bundle_size || 1), 0)} pieces total
                                  {!product.roll_config?.quantity_based && ` (${spareRolls.reduce((sum, r) => sum + r.length_meters, 0).toFixed(2)} m)`}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`font-bold text-purple-600 ${isMobile ? 'text-xl' : 'text-3xl'}`}>
                                  {spareRolls.reduce((sum, r) => sum + (r.bundle_size || 1), 0)} pcs
                                </div>
                                {spareRolls.length >= 1 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openCombineSparesDialog(spareRolls)}
                                    className="flex-shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  >
                                    <PlusIcon className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
            })}
          </div>
        )}
      </div>

      {/* Roll Edit Dialog */}
      {/* Roll Edit Dialog */}
      <Dialog open={!!editingRoll} onOpenChange={() => setEditingRoll(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Roll</DialogTitle>
            <DialogDescription>
              Update roll length and status
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Length (meters)</Label>
              <Input
                type="number"
                step="0.01"
                value={editingRoll?.length_meters || ''}
                onChange={(e) => setEditingRoll({...editingRoll, length_meters: parseFloat(e.target.value)})}
              />
              <p className="text-xs text-muted-foreground">
                Initial length: {editingRoll?.initial_length_meters?.toFixed(2)} m
              </p>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editingRoll?.status} onValueChange={(value) => setEditingRoll({...editingRoll, status: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="PARTIAL">Partial</SelectItem>
                  <SelectItem value="SOLD_OUT">Sold Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRoll(null)}>Cancel</Button>
            <Button onClick={handleRollUpdate}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product History Dialog */}
      <Dialog open={productHistoryDialogOpen} onOpenChange={setProductHistoryDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[1400px] h-[calc(100vh-2rem)] max-h-[900px] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              Product History - {selectedProductForHistory?.product_type} ({selectedProductForHistory?.brand})
              {selectedProductForHistory?.parameters && (() => {
                const paramOrder = ['PE', 'PN', 'OD'];
                const sortedParams = Object.entries(selectedProductForHistory.parameters).sort(([keyA], [keyB]) => {
                  const indexA = paramOrder.indexOf(keyA);
                  const indexB = paramOrder.indexOf(keyB);
                  if (indexA === -1 && indexB === -1) return 0;
                  if (indexA === -1) return 1;
                  if (indexB === -1) return -1;
                  return indexA - indexB;
                });
                return sortedParams.map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="text-sm px-3 py-1 bg-primary/10 text-primary border-primary/20">
                    {key}: {String(value)}
                  </Badge>
                ));
              })()}
            </DialogTitle>
            <DialogDescription>
              Complete transaction history and current outstanding inventory
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">{loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
              <p className="text-muted-foreground">Loading transaction history...</p>
            </div>
          ) : productHistory.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Transactions Found</h3>
              <p className="text-muted-foreground mb-4">
                There are no transactions recorded for this product variant yet.
              </p>
              {selectedProductForHistory && (
                <div className="bg-secondary/30 rounded-lg p-4 max-w-md mx-auto">
                  <p className="text-sm text-muted-foreground">
                    <strong>Product Variant ID:</strong> {selectedProductForHistory.product_variant_id}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Total Transactions</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {productHistory.length}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Total Produced</div>
                    <div className="text-2xl font-bold text-green-600">
                      {productHistory
                        .filter((txn) => txn.transaction_type === 'PRODUCTION')
                        .reduce((sum, txn) => sum + Math.abs(txn.quantity_change || 0), 0)
                        .toFixed(2)} m
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Total Sold</div>
                    <div className="text-2xl font-bold text-red-600">
                      {productHistory
                        .filter((txn) => txn.transaction_type === 'SALE')
                        .reduce((sum, txn) => sum + Math.abs(txn.quantity_change || 0), 0)
                        .toFixed(2)} m
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Current Stock</div>
                    <div className="text-2xl font-bold text-primary">
                      {selectedProductForHistory?.total_quantity.toFixed(2)} {selectedProductForHistory?.roll_config?.type === 'bundles' ? 'pcs' : 'm'}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Transaction Table */}
              <div className="border rounded-lg">
                <div className="bg-secondary/30 px-4 py-3 border-b">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Transaction History ({productHistory.length} records)
                  </h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {isMobile ? (
                    /* Mobile Card View */
                    <div className="divide-y">
                      {productHistory.map((txn) => (
                        <div key={txn.id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant={txn.transaction_type === 'PRODUCTION' ? 'default' : 'destructive'}>
                                  {txn.transaction_type}
                                </Badge>
                                <span className={`text-lg font-semibold ${txn.transaction_type === 'PRODUCTION' ? 'text-green-600' : 'text-red-600'}`}>
                                  {txn.transaction_type === 'PRODUCTION' ? '+' : '-'}
                                  {Math.abs(txn.quantity_change || 0).toFixed(2)} m
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {new Date(txn.transaction_date).toLocaleString('en-IN', {
                                  dateStyle: 'short',
                                  timeStyle: 'short'
                                })}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTransaction(txn);
                                setTransactionDetailDialogOpen(true);
                              }}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <div className="text-muted-foreground text-xs">Batch</div>
                              <div className="font-mono">
                                {txn.batch_code || '-'}
                                {txn.batch_no && <span className="text-xs text-muted-foreground"> #{txn.batch_no}</span>}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground text-xs">Invoice</div>
                              <div className="font-mono">{txn.invoice_no || '-'}</div>
                            </div>
                          </div>

                          {txn.roll_length_meters != null && (
                            <div className="text-sm">
                              <div className="text-muted-foreground text-xs mb-1">Roll Details</div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{txn.roll_length_meters.toFixed(2)} m</span>
                                {txn.roll_weight && <span className="text-muted-foreground">{formatWeight(txn.roll_weight)}</span>}
                                {txn.roll_type && <Badge variant="outline" className="text-xs">{txn.roll_type}{txn.roll_is_cut ? ' • Cut' : ''}</Badge>}
                              </div>
                            </div>
                          )}

                          {txn.customer_name && (
                            <div className="text-sm">
                              <div className="text-muted-foreground text-xs">Customer</div>
                              <div>{txn.customer_name}</div>
                            </div>
                          )}

                          {txn.notes && (
                            <div className="text-sm">
                              <div className="text-muted-foreground text-xs">Notes</div>
                              <div className="line-clamp-2">{txn.notes}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Desktop Table View */
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead>Roll Details</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productHistory.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="whitespace-nowrap">
                              {new Date(txn.transaction_date).toLocaleString('en-IN', {
                                dateStyle: 'short',
                                timeStyle: 'short'
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge variant={txn.transaction_type === 'PRODUCTION' ? 'default' : 'destructive'}>
                                {txn.transaction_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {txn.batch_code || '-'}
                              {txn.batch_no && <div className="text-xs text-muted-foreground">#{txn.batch_no}</div>}
                            </TableCell>
                            <TableCell>
                              {txn.roll_length_meters != null ? (
                                <div className="text-sm">
                                  <div className="font-medium">{txn.roll_length_meters.toFixed(2)} m</div>
                                  <div className="text-xs text-muted-foreground">{formatWeight(txn.roll_weight)}</div>
                                  {txn.roll_type && <div className="text-xs text-muted-foreground">{txn.roll_type}{txn.roll_is_cut ? ' • Cut' : ''}</div>}
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">-</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              <span className={txn.transaction_type === 'PRODUCTION' ? 'text-green-600' : 'text-red-600'}>
                                {txn.transaction_type === 'PRODUCTION' ? '+' : '-'}
                                {Math.abs(txn.quantity_change || 0).toFixed(2)} m
                              </span>
                            </TableCell>
                            <TableCell>{txn.customer_name || '-'}</TableCell>
                            <TableCell className="font-mono text-sm">{txn.invoice_no || '-'}</TableCell>
                            <TableCell className="max-w-xs">
                              <div className="truncate" title={txn.notes || ''}>
                                {txn.notes || '-'}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTransaction(txn);
                                  setTransactionDetailDialogOpen(true);
                                }}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Details
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>

          <DialogFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setProductHistoryDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={exportProductHistoryCSV} disabled={productHistory.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Detail Dialog */}
      <Dialog open={transactionDetailDialogOpen} onOpenChange={setTransactionDetailDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Transaction Details - {selectedTransaction?.transaction_type}
            </DialogTitle>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-4">
              {/* Product Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Product Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-lg">{selectedTransaction.product_type}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="font-semibold text-lg">{selectedTransaction.brand}</span>
                  </div>
                  {selectedTransaction.parameters && Object.keys(selectedTransaction.parameters).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(selectedTransaction.parameters).map(([key, value]) => (
                        <Badge key={key} variant="secondary" className="text-sm">
                          {key}: {String(value)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Transaction Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Transaction Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Transaction Date</p>
                    <p className="font-medium">{new Date(selectedTransaction.transaction_date).toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <Badge variant={selectedTransaction.transaction_type === 'PRODUCTION' ? 'default' : 'destructive'}>
                      {selectedTransaction.transaction_type}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Batch Code</p>
                    <p className="font-mono font-medium">{selectedTransaction.batch_code || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Batch Number</p>
                    <p className="font-medium">{selectedTransaction.batch_no || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Quantity Change</p>
                    <p className={`font-semibold text-lg ${selectedTransaction.transaction_type === 'PRODUCTION' ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedTransaction.transaction_type === 'PRODUCTION' ? '+' : '-'}
                      {Math.abs(selectedTransaction.quantity_change || 0).toFixed(2)} {selectedTransaction.unit_abbreviation || 'm'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Production Date</p>
                    <p className="font-medium">{selectedTransaction.production_date ? new Date(selectedTransaction.production_date).toLocaleDateString('en-IN') : '-'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Roll Details */}
              {selectedTransaction.roll_length_meters != null && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Roll Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Roll Length</p>
                      <p className="font-medium">{selectedTransaction.roll_length_meters.toFixed(2)} m</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Initial Length</p>
                      <p className="font-medium">{selectedTransaction.roll_initial_length_meters?.toFixed(2)} m</p>
                    </div>
                    {selectedTransaction.roll_type && (
                      <div>
                        <p className="text-sm text-muted-foreground">Roll Type</p>
                        <Badge variant="outline">{selectedTransaction.roll_type}</Badge>
                      </div>
                    )}
                    {selectedTransaction.roll_is_cut && (
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <Badge variant="secondary">Cut Roll</Badge>
                      </div>
                    )}
                    {selectedTransaction.roll_bundle_size && (
                      <div>
                        <p className="text-sm text-muted-foreground">Bundle Size</p>
                        <p className="font-medium">{selectedTransaction.roll_bundle_size} pieces</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Customer & Invoice Information */}
              {(selectedTransaction.customer_name || selectedTransaction.invoice_no) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Customer & Invoice</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    {selectedTransaction.customer_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Customer</p>
                        <p className="font-medium">{selectedTransaction.customer_name}</p>
                      </div>
                    )}
                    {selectedTransaction.invoice_no && (
                      <div>
                        <p className="text-sm text-muted-foreground">Invoice Number</p>
                        <p className="font-mono font-medium">{selectedTransaction.invoice_no}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Notes */}
              {selectedTransaction.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageCircle className="h-4 w-4" />
                      Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{selectedTransaction.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Created By */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Created By</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">User</p>
                    <p className="font-medium">{selectedTransaction.created_by_name || selectedTransaction.created_by_username || selectedTransaction.created_by_email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created At</p>
                    <p className="font-medium">{new Date(selectedTransaction.created_at).toLocaleString('en-IN')}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cut Roll Dialog */}
      <Dialog open={cutDialogOpen} onOpenChange={setCutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-orange-600 flex items-center gap-2">
              <ScissorsIcon className="h-5 w-5" />
              Cut Roll
            </DialogTitle>
            <DialogDescription>
              {availableRolls.length > 0 ? 'Select a roll and enter cut length' : 'Split this roll into two pieces'}
            </DialogDescription>
          </DialogHeader>

          {availableRolls.length > 0 ? (
            // Show roll selection with cut interface
            <div className="space-y-4">
              <div>
                <Label>Select Roll to Cut</Label>
                <div className="space-y-2 max-h-60 overflow-y-auto mt-2">
                  {availableRolls.map((roll) => (
                    <div
                      key={roll.id}
                      className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors border-2 ${
                        rollToCut?.id === roll.id
                          ? 'bg-orange-100 dark:bg-orange-950 border-orange-400'
                          : 'bg-secondary/50 border-transparent hover:bg-secondary/70'
                      }`}
                      onClick={() => setRollToCut(roll)}
                    >
                      <div className="flex-1">
                        <div className="text-base font-semibold">
                          {roll.length_meters.toFixed(2)}m
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {roll.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {rollToCut && (
                <>
                  {/* Cut Length Input */}
                  <div className="space-y-2">
                    <Label htmlFor="cut-length">Cut Length (meters)</Label>
                    <Input
                      id="cut-length"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={rollToCut.length_meters - 0.01}
                      value={cutLength}
                      onChange={(e) => setCutLength(e.target.value)}
                      placeholder="Enter length to cut"
                      autoFocus
                    />
                  </div>

                  {/* Preview */}
                  {cutLength && parseFloat(cutLength) > 0 && parseFloat(cutLength) < rollToCut.length_meters && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Result Preview:</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                          <div className="text-xs text-muted-foreground">Cut Piece</div>
                          <div className="text-xl font-bold text-orange-600">
                            {parseFloat(cutLength).toFixed(2)}m
                          </div>
                        </div>
                        <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                          <div className="text-xs text-muted-foreground">Remaining</div>
                          <div className="text-xl font-bold text-orange-600">
                            {(rollToCut.length_meters - parseFloat(cutLength)).toFixed(2)}m
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : rollToCut ? (
            <div className="space-y-4">
              {/* Original Roll Info */}
              <div className="p-3 bg-secondary/50 rounded-lg">
                <div className="text-sm text-muted-foreground">Original Roll</div>
                <div className="text-2xl font-bold">{rollToCut.length_meters.toFixed(2)}m</div>
              </div>

              {/* Cut Length Input */}
              <div className="space-y-2">
                <Label htmlFor="cut-length">Cut Length (meters)</Label>
                <Input
                  id="cut-length"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={rollToCut.length_meters - 0.01}
                  value={cutLength}
                  onChange={(e) => setCutLength(e.target.value)}
                  placeholder="Enter length to cut"
                  autoFocus
                />
              </div>

              {/* Preview */}
              {cutLength && parseFloat(cutLength) > 0 && parseFloat(cutLength) < rollToCut.length_meters && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Result Preview:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                      <div className="text-xs text-muted-foreground">Cut Piece</div>
                      <div className="text-xl font-bold text-orange-600">
                        {parseFloat(cutLength).toFixed(2)}m
                      </div>
                    </div>
                    <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                      <div className="text-xs text-muted-foreground">Remaining</div>
                      <div className="text-xl font-bold text-orange-600">
                        {(rollToCut.length_meters - parseFloat(cutLength)).toFixed(2)}m
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCutDialogOpen(false);
                setRollToCut(null);
                setCutLength('');
                setAvailableRolls([]);
              }}
              disabled={cuttingLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCutRoll}
              disabled={
                cuttingLoading ||
                !rollToCut ||
                !cutLength ||
                parseFloat(cutLength) <= 0 ||
                (rollToCut && parseFloat(cutLength) >= rollToCut.length_meters)
              }
              className="bg-orange-600 hover:bg-orange-700"
            >
              {cuttingLoading ? (
                <>Processing...</>
              ) : (
                <>
                  <ScissorsIcon className="h-4 w-4 mr-2" />
                  Cut Roll
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cut Bundle Dialog (for Sprinkler Pipes) */}
      <Dialog open={cutBundleDialogOpen} onOpenChange={setCutBundleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-orange-600 flex items-center gap-2">
              <ScissorsIcon className="h-5 w-5" />
              Cut Bundle into Spare Pieces
            </DialogTitle>
            <DialogDescription>
              {availableBundles.length > 0 ? 'Select a bundle and enter pieces to extract' : 'Split this bundle into spare pieces'}
            </DialogDescription>
          </DialogHeader>

          {availableBundles.length > 0 ? (
            <div className="space-y-4">
              <div>
                <Label>Select Bundle to Cut</Label>
                <div className="space-y-2 max-h-60 overflow-y-auto mt-2">
                  {availableBundles.map((bundle) => (
                    <div
                      key={bundle.id}
                      className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors border-2 ${
                        bundleToCut?.id === bundle.id
                          ? 'bg-orange-100 dark:bg-orange-950 border-orange-400'
                          : 'bg-secondary/50 border-transparent hover:bg-secondary/70'
                      }`}
                      onClick={() => setBundleToCut(bundle)}
                    >
                      <div className="flex-1">
                        <div className="text-base font-semibold">
                          Bundle of {bundle.bundle_size} pieces
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {bundle.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {bundleToCut && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cut-pieces">Number of Pieces to Extract</Label>
                    <Input
                      id="cut-pieces"
                      type="number"
                      step="1"
                      min="1"
                      max={(bundleToCut.bundle_size || 0) - 1}
                      value={cutPiecesCount}
                      onChange={(e) => setCutPiecesCount(e.target.value)}
                      placeholder="Enter pieces count"
                      autoFocus
                    />
                  </div>

                  {cutPiecesCount && parseInt(cutPiecesCount) > 0 && parseInt(cutPiecesCount) < (bundleToCut.bundle_size || 0) && (
                    <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg space-y-2 text-sm">
                      <div className="flex justify-between font-medium">
                        <span>Original Bundle:</span>
                        <span>{bundleToCut.bundle_size} pieces</span>
                      </div>
                      <div className="flex justify-between text-orange-600 dark:text-orange-400">
                        <span>→ Spare Batch 1:</span>
                        <span>{cutPiecesCount} pieces</span>
                      </div>
                      <div className="flex justify-between text-orange-600 dark:text-orange-400">
                        <span>→ Spare Batch 2:</span>
                        <span>{(bundleToCut.bundle_size || 0) - parseInt(cutPiecesCount)} pieces</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            bundleToCut && (
              <div className="space-y-4">
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <div className="text-sm font-semibold mb-1">Selected Bundle</div>
                  <div className="text-2xl font-bold">
                    {bundleToCut.bundle_size} pieces
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cut-pieces-single">Number of Pieces to Extract</Label>
                  <Input
                    id="cut-pieces-single"
                    type="number"
                    step="1"
                    min="1"
                    max={(bundleToCut.bundle_size || 0) - 1}
                    value={cutPiecesCount}
                    onChange={(e) => setCutPiecesCount(e.target.value)}
                    placeholder="Enter pieces count"
                    autoFocus
                  />
                </div>

                {cutPiecesCount && parseInt(cutPiecesCount) > 0 && parseInt(cutPiecesCount) < (bundleToCut.bundle_size || 0) && (
                  <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>Original Bundle:</span>
                      <span>{bundleToCut.bundle_size} pieces</span>
                    </div>
                    <div className="flex justify-between text-orange-600 dark:text-orange-400">
                      <span>→ Spare Batch 1:</span>
                      <span>{cutPiecesCount} pieces</span>
                    </div>
                    <div className="flex justify-between text-orange-600 dark:text-orange-400">
                      <span>→ Spare Batch 2:</span>
                      <span>{(bundleToCut.bundle_size || 0) - parseInt(cutPiecesCount)} pieces</span>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCutBundleDialogOpen(false);
                setBundleToCut(null);
                setCutPiecesCount('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCutBundle}
              disabled={
                cuttingLoading ||
                !bundleToCut ||
                !cutPiecesCount ||
                parseInt(cutPiecesCount) <= 0 ||
                (bundleToCut && parseInt(cutPiecesCount) >= (bundleToCut.bundle_size || 0))
              }
              className="bg-orange-600 hover:bg-orange-700"
            >
              {cuttingLoading ? (
                <>Processing...</>
              ) : (
                <>
                  <ScissorsIcon className="h-4 w-4 mr-2" />
                  Cut Bundle
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Combine Spares Dialog (for Sprinkler Pipes) */}
      <Dialog open={combineSparesDialogOpen} onOpenChange={setCombineSparesDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-green-600 flex items-center gap-2">
              <PlusIcon className="h-5 w-5" />
              Combine Spare Pieces into Bundle
            </DialogTitle>
            <DialogDescription>
              Create custom-sized bundles from available spare pieces
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto max-h-[60vh]">
            {availableSpares.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No spare pieces available</p>
              </div>
            ) : (
              <>
                {/* Total Available Pieces */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                  <div className="text-sm font-medium mb-1 text-muted-foreground">Total Available Spare Pieces</div>
                  <div className="text-3xl font-bold text-blue-600">
                    {availableSpares.reduce((sum, s) => sum + (s.bundle_size || 1), 0)} pieces
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Bundle Size Input */}
                  <div className="space-y-2">
                    <Label htmlFor="new-bundle-size">Bundle Size (pieces per bundle)</Label>
                    <Input
                      id="new-bundle-size"
                      type="number"
                      step="1"
                      min="1"
                      max={availableSpares.reduce((sum, s) => sum + (s.bundle_size || 1), 0)}
                      value={newBundleSize}
                      onChange={(e) => setNewBundleSize(e.target.value)}
                      placeholder="e.g., 10, 20, 50"
                      className="text-lg"
                    />
                  </div>

                  {/* Number of Bundles Input */}
                  <div className="space-y-2">
                    <Label htmlFor="number-of-bundles">Number of Bundles</Label>
                    <Input
                      id="number-of-bundles"
                      type="number"
                      step="1"
                      min="1"
                      max={newBundleSize ? Math.floor(availableSpares.reduce((sum, s) => sum + (s.bundle_size || 1), 0) / parseInt(newBundleSize)) : undefined}
                      value={numberOfBundles}
                      onChange={(e) => setNumberOfBundles(e.target.value)}
                      placeholder="1"
                      className="text-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty for 1 bundle
                    </p>
                  </div>
                </div>

                {/* Preview */}
                {newBundleSize && parseInt(newBundleSize) > 0 && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg space-y-3 border-2 border-green-200 dark:border-green-800">
                    <div className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Bundle Preview
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between font-medium">
                        <span>Available Pieces:</span>
                        <span>{availableSpares.reduce((sum, s) => sum + (s.bundle_size || 1), 0)} pieces</span>
                      </div>
                      {(() => {
                        const totalAvailable = availableSpares.reduce((sum, s) => sum + (s.bundle_size || 1), 0);
                        const bundleSize = parseInt(newBundleSize);
                        const numBundles = numberOfBundles && parseInt(numberOfBundles) > 0
                          ? parseInt(numberOfBundles)
                          : 1;
                        const totalPiecesUsed = numBundles * bundleSize;
                        const remaining = totalAvailable - totalPiecesUsed;

                        return (
                          <>
                            <div className="flex justify-between text-green-600 dark:text-green-400 font-semibold text-base">
                              <span>→ Create {numBundles} bundle{numBundles > 1 ? 's' : ''}:</span>
                              <span>{numBundles} × {bundleSize} pcs = {totalPiecesUsed} pieces</span>
                            </div>
                            {remaining > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>→ Remaining Spares:</span>
                                <span>{remaining} pieces</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCombineSparesDialogOpen(false);
                setNewBundleSize('');
                setNumberOfBundles('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCombineSpares}
              disabled={
                combiningLoading ||
                !newBundleSize ||
                parseInt(newBundleSize) <= 0 ||
                parseInt(newBundleSize) > availableSpares.reduce((sum, s) => sum + (s.bundle_size || 1), 0)
              }
              className="bg-green-600 hover:bg-green-700"
            >
              {combiningLoading ? (
                <>Processing...</>
              ) : (
                <>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create Bundle
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Initial Inventory</DialogTitle>
            <DialogDescription>
              Upload a CSV file to import your initial inventory. Download the template first to see the required format.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-muted rounded-lg p-8">
              <div className="text-center space-y-2">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <Label htmlFor="file-upload" className="cursor-pointer text-primary hover:underline">
                    Click to upload
                  </Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <p className="text-sm text-muted-foreground mt-1">or drag and drop</p>
                </div>
                <p className="text-xs text-muted-foreground">CSV file only</p>
              </div>
              {importFile && (
                <div className="mt-4 text-center">
                  <Badge variant="secondary" className="text-sm">
                    <FileText className="h-3 w-3 mr-1" />
                    {importFile.name}
                  </Badge>
                </div>
              )}
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Template Format (with units)
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Your CSV should include these columns with units specified:
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <strong className="text-blue-600 dark:text-blue-400">For HDPE Pipe:</strong>
                  <ul className="list-disc list-inside mt-1 text-muted-foreground space-y-0.5">
                    <li>product_type, brand</li>
                    <li><strong>OD (mm)</strong>, <strong>PN (bar)</strong>, <strong>PE (SDR)</strong></li>
                    <li>batch_code, batch_no</li>
                    <li>production_date (YYYY-MM-DD)</li>
                    <li><strong>roll_length (m)</strong>, number_of_rolls</li>
                    <li><strong>weight_per_meter (kg/m)</strong></li>
                    <li>notes</li>
                  </ul>
                </div>
                <div className="space-y-1">
                  <strong className="text-purple-600 dark:text-purple-400">For Sprinkler Pipe:</strong>
                  <ul className="list-disc list-inside mt-1 text-muted-foreground space-y-0.5">
                    <li>product_type, brand</li>
                    <li><strong>OD (mm)</strong>, <strong>PN (bar)</strong>, Type</li>
                    <li>batch_code, batch_no</li>
                    <li>production_date (YYYY-MM-DD)</li>
                    <li><strong>bundle_size (pcs)</strong></li>
                    <li><strong>piece_length (m)</strong></li>
                    <li>number_of_bundles</li>
                    <li>notes</li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-amber-200 dark:border-amber-800">
                <p className="text-xs text-muted-foreground italic">
                  💡 Units are shown in parentheses (mm, bar, m, kg/m, pcs) to help you enter correct values
                </p>
              </div>
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm font-medium mb-3 text-blue-900 dark:text-blue-100">📥 Download Template</p>
                <div className="flex items-center gap-2">
                  <Select value={templateType} onValueChange={(value: 'hdpe' | 'sprinkler') => setTemplateType(value)}>
                    <SelectTrigger className="w-[180px] h-9 bg-white dark:bg-gray-800">
                      <SelectValue placeholder="Select template type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hdpe">HDPE Template</SelectItem>
                      <SelectItem value="sprinkler">Sprinkler Template</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={downloadTemplate}
                    className="h-9"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Template
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportDialogOpen(false);
                setImportFile(null);
              }}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!importFile || importing}
            >
              {importing ? (
                <>Importing...</>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Inventory
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Share Dialog */}
      <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              Share on WhatsApp
            </DialogTitle>
            <DialogDescription>
              Select products to share. Standard rolls/bundles show total quantity, cut rolls and spare pieces can be individually selected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="max-h-[550px] overflow-y-auto space-y-2 border rounded-lg p-4">
              {filteredInventory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No products match your current filters</p>
                </div>
              ) : (
                filteredInventory.map((product) => {
                  const uniqueKey = `${product.product_type_id}_${product.brand_id}_${JSON.stringify(product.parameters)}`;
                  const isSelected = selectedRollsForWhatsApp.has(uniqueKey);
                  const isExpanded = expandedProductsInWhatsApp.has(uniqueKey);

                  const allRolls = product.batches.flatMap(b => b.rolls);
                  const standardRolls = allRolls.filter(r => !r.is_cut_roll && r.roll_type !== 'cut' && r.roll_type !== 'spare' && !r.roll_type?.startsWith('bundle_'));
                  const bundleRolls = allRolls.filter(r => r.roll_type?.startsWith('bundle_'));
                  const cutRolls = allRolls.filter(r => r.is_cut_roll || r.roll_type === 'cut');
                  const spareRolls = allRolls.filter(r => r.roll_type === 'spare');

                  const standardTotal = standardRolls.reduce((sum, r) => sum + r.length_meters, 0);
                  const bundleTotal = bundleRolls.reduce((sum, r) => sum + (r.bundle_size || 0), 0);
                  const isSprinkler = product.product_type.toLowerCase().includes('sprinkler');

                  const selectedCutRolls = cutRolls.filter(r => selectedRollsForWhatsApp.has(r.id));
                  const selectedSpares = spareRolls.filter(r => selectedRollsForWhatsApp.has(r.id));
                  const hasExpandableItems = cutRolls.length > 0 || spareRolls.length > 0;

                  const params = product.parameters || {};
                  const paramsText = Object.entries(params)
                    .filter(([k, v]) => v && k !== 'Type' && k !== 'type')
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ');

                  return (
                    <div key={uniqueKey} className="border rounded-lg overflow-hidden">
                      {/* Product Header - Clickable for standard rolls, shows checkbox */}
                      <div
                        className={`flex items-center space-x-3 p-3 cursor-pointer transition-colors ${
                          isSelected ? 'bg-green-50 border-green-500' : 'bg-secondary/30 hover:bg-secondary/50'
                        }`}
                        onClick={() => {
                          if (hasExpandableItems) {
                            // If has cut rolls or spares, toggle expansion
                            setExpandedProductsInWhatsApp(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(uniqueKey)) {
                                newSet.delete(uniqueKey);
                              } else {
                                newSet.add(uniqueKey);
                              }
                              return newSet;
                            });
                          } else {
                            // If only standard rolls/bundles, toggle selection
                            setSelectedRollsForWhatsApp(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(uniqueKey)) {
                                newSet.delete(uniqueKey);
                              } else {
                                newSet.add(uniqueKey);
                              }
                              return newSet;
                            });
                          }
                        }}
                      >
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedRollsForWhatsApp(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(uniqueKey)) {
                                  newSet.delete(uniqueKey);
                                } else {
                                  newSet.add(uniqueKey);
                                }
                                return newSet;
                              });
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-green-600"
                          />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold">{product.product_type} - {product.brand}</div>
                          {paramsText && (
                            <div className="text-sm text-muted-foreground">{paramsText}</div>
                          )}
                          <div className="text-sm text-muted-foreground mt-1">
                            {isSprinkler ? (
                              <>
                                {bundleTotal > 0 && (
                                  <span>{bundleTotal} pcs in bundles</span>
                                )}
                                {spareRolls.length > 0 && (
                                  <span className="ml-2">• {spareRolls.reduce((sum, r) => sum + (r.bundle_size || 1), 0)} spare pieces</span>
                                )}
                              </>
                            ) : (
                              <>
                                {standardTotal > 0 && (
                                  <span>{standardTotal.toFixed(2)}m standard</span>
                                )}
                                {cutRolls.length > 0 && (
                                  <span className="ml-2">• {cutRolls.length} cut piece{cutRolls.length !== 1 ? 's' : ''}</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {hasExpandableItems && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedProductsInWhatsApp(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(uniqueKey)) {
                                  newSet.delete(uniqueKey);
                                } else {
                                  newSet.add(uniqueKey);
                                }
                                return newSet;
                              });
                            }}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        )}
                        {isSelected && <CheckCircle className="h-5 w-5 text-green-600" />}
                      </div>

                      {/* Cut Rolls List (when expanded) */}
                      {isExpanded && cutRolls.length > 0 && (
                        <div className="p-3 space-y-2 bg-background border-t">
                          <div className="flex items-center justify-between pb-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              Cut Pieces ({cutRolls.length})
                            </span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedRollsForWhatsApp(prev => {
                                    const newSet = new Set(prev);
                                    cutRolls.forEach(r => newSet.add(r.id));
                                    return newSet;
                                  });
                                }}
                              >
                                Select All
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedRollsForWhatsApp(prev => {
                                    const newSet = new Set(prev);
                                    cutRolls.forEach(r => newSet.delete(r.id));
                                    return newSet;
                                  });
                                }}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1 max-h-64 overflow-y-auto">
                            {cutRolls.map((roll) => {
                              const isRollSelected = selectedRollsForWhatsApp.has(roll.id);

                              return (
                                <div
                                  key={roll.id}
                                  className={`flex items-center space-x-3 p-2 rounded border cursor-pointer transition-colors ${
                                    isRollSelected ? 'bg-green-50 border-green-500' : 'border-gray-200 hover:bg-secondary/30'
                                  }`}
                                  onClick={() => {
                                    setSelectedRollsForWhatsApp(prev => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(roll.id)) {
                                        newSet.delete(roll.id);
                                      } else {
                                        newSet.add(roll.id);
                                      }
                                      return newSet;
                                    });
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isRollSelected}
                                    onChange={() => {}}
                                    className="h-4 w-4 rounded border-gray-300 text-green-600"
                                  />
                                  <div className="flex-1 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="destructive" className="text-xs">Cut</Badge>
                                      <span className="text-sm font-medium">
                                        {roll.length_meters.toFixed(2)}m
                                      </span>
                                      {roll.initial_length_meters && roll.initial_length_meters !== roll.length_meters && (
                                        <span className="text-xs text-muted-foreground">
                                          (originally {roll.initial_length_meters.toFixed(0)}m)
                                        </span>
                                      )}
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                      {roll.status}
                                    </Badge>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Spare Pieces List (when expanded) */}
                      {isExpanded && spareRolls.length > 0 && (
                        <div className="p-3 space-y-2 bg-background border-t">
                          <div className="flex items-center justify-between pb-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              Spare Pieces ({spareRolls.length})
                            </span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedRollsForWhatsApp(prev => {
                                    const newSet = new Set(prev);
                                    spareRolls.forEach(r => newSet.add(r.id));
                                    return newSet;
                                  });
                                }}
                              >
                                Select All
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedRollsForWhatsApp(prev => {
                                    const newSet = new Set(prev);
                                    spareRolls.forEach(r => newSet.delete(r.id));
                                    return newSet;
                                  });
                                }}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1 max-h-64 overflow-y-auto">
                            {spareRolls.map((spare) => {
                              const isSpareSelected = selectedRollsForWhatsApp.has(spare.id);

                              return (
                                <div
                                  key={spare.id}
                                  className={`flex items-center space-x-3 p-2 rounded border cursor-pointer transition-colors ${
                                    isSpareSelected ? 'bg-green-50 border-green-500' : 'border-gray-200 hover:bg-secondary/30'
                                  }`}
                                  onClick={() => {
                                    setSelectedRollsForWhatsApp(prev => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(spare.id)) {
                                        newSet.delete(spare.id);
                                      } else {
                                        newSet.add(spare.id);
                                      }
                                      return newSet;
                                    });
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSpareSelected}
                                    onChange={() => {}}
                                    className="h-4 w-4 rounded border-gray-300 text-green-600"
                                  />
                                  <div className="flex-1 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">Spare</Badge>
                                      <span className="text-sm font-medium">
                                        {spare.bundle_size || 1} pieces
                                      </span>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                      {spare.status}
                                    </Badge>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Summary and Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newSet = new Set<string>();
                    filteredInventory.forEach(p => {
                      const uniqueKey = `${p.product_type_id}_${p.brand_id}_${JSON.stringify(p.parameters)}`;
                      newSet.add(uniqueKey);
                      // Also select all cut rolls and spare pieces
                      p.batches.forEach(b => {
                        b.rolls.filter(r => r.is_cut_roll || r.roll_type === 'cut' || r.roll_type === 'spare').forEach(r => newSet.add(r.id));
                      });
                    });
                    setSelectedRollsForWhatsApp(newSet);
                  }}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRollsForWhatsApp(new Set())}
                >
                  Clear All
                </Button>
                <span className="text-sm text-muted-foreground font-medium">
                  {selectedRollsForWhatsApp.size} item{selectedRollsForWhatsApp.size !== 1 ? 's' : ''} selected
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWhatsappDialogOpen(false);
                setExpandedProductsInWhatsApp(new Set());
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={shareOnWhatsApp}
              disabled={selectedRollsForWhatsApp.size === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Share ({selectedRollsForWhatsApp.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Inventory;
