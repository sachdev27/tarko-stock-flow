import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { transactions as transactionsAPI, inventory as inventoryAPI } from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Separator } from '../components/ui/separator';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Package, Weight, FileText, User, Calendar, Truck, Scale, Ruler, Info, Filter, X, Search, Download, Paperclip } from 'lucide-react';
import { format } from 'date-fns';

interface TransactionRecord {
  id: string;
  dispatch_id?: string;
  transaction_type: 'PRODUCTION' | 'SALE' | 'ADJUSTMENT' | 'CUT';
  quantity_change: number; // This is total meters/quantity, not roll count
  transaction_date: string;
  invoice_no?: string;
  notes?: string;
  created_at: string;
  batch_code: string;
  batch_no: string;
  initial_quantity: number; // Number of rolls in batch
  weight_per_meter?: number;
  total_weight: number;
  attachment_url?: string;
  production_date: string;
  product_type: string;
  product_variant_id: string;
  product_type_id: number;
  brand_id: number;
  brand: string;
  parameters?: {
    quality?: string;
    color?: string;
    size?: string;
    thickness?: string;
    [key: string]: string | undefined;
  };
  roll_length_meters?: number; // Length of the specific roll if transaction is for a single roll
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
  // Roll breakdown counts
  standard_rolls_count?: number;
  cut_rolls_count?: number;
  bundles_count?: number;
  spare_pieces_count?: number;
  bundle_size?: number; // Pieces per bundle from batch rolls
  piece_length?: number; // Length of each piece in meters (for Sprinkler Pipe)
  // Average roll lengths
  avg_standard_roll_length?: number;
  cut_rolls_details?: number[]; // Array of individual cut roll lengths
  spare_pieces_details?: number[]; // Array of individual spare piece lengths
  // Grouping metadata for dispatches
  _isGrouped?: boolean;
  _groupCount?: number;
  _groupTransactions?: TransactionRecord[];
  // Roll snapshot for SALE transactions (stores sold rolls)
  roll_snapshot?: {
    rolls?: Array<{
      roll_id: string;
      batch_id: string;
      quantity_dispatched: number;
      length_meters: number;
      initial_length_meters: number;
      is_cut_roll: boolean;
      roll_type: string;
      bundle_size?: number;
      status: string;
    }>;
    total_rolls?: number;
  };
}

export default function TransactionsNew() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [modalTransaction, setModalTransaction] = useState<TransactionRecord | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [productTypeFilter, setProductTypeFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [parameterFilter, setParameterFilter] = useState<string>('all');
  // Separate parameter filters
  const [odFilter, setOdFilter] = useState<string>('all');
  const [pnFilter, setPnFilter] = useState<string>('all');
  const [peFilter, setPeFilter] = useState<string>('all');
  const [typeParamFilter, setTypeParamFilter] = useState<string>('all'); // For Sprinkler Pipe Type (A/B/C)
  const [timePreset, setTimePreset] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Master data for filters
  const [productTypes, setProductTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: number; name: string }>>([]);
  // Parameter options extracted from transactions
  const [odOptions, setOdOptions] = useState<string[]>([]);
  const [pnOptions, setPnOptions] = useState<string[]>([]);
  const [peOptions, setPeOptions] = useState<string[]>([]);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  useEffect(() => {
    loadTransactions();
    loadMasterData();
  }, []);

  useEffect(() => {
    const applyFilters = () => {
      let filtered = [...transactions];

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(t =>
          t.batch_code?.toLowerCase().includes(query) ||
          t.batch_no?.toLowerCase().includes(query) ||
          t.product_type?.toLowerCase().includes(query) ||
          t.brand?.toLowerCase().includes(query) ||
          t.customer_name?.toLowerCase().includes(query) ||
          t.invoice_no?.toLowerCase().includes(query)
        );
      }

      // Transaction type filter
      if (typeFilter !== 'all') {
        filtered = filtered.filter(t => t.transaction_type === typeFilter);
      }

      // Product type filter
      if (productTypeFilter !== 'all') {
        filtered = filtered.filter(t => t.product_type === productTypeFilter);
      }

      // Brand filter
      if (brandFilter !== 'all') {
        filtered = filtered.filter(t => t.brand === brandFilter);
      }

      // Parameter filter
      if (parameterFilter !== 'all') {
        filtered = filtered.filter(t => {
          const params = t.parameters || {};
          const paramStr = JSON.stringify(params).toLowerCase();
          return paramStr.includes(parameterFilter.toLowerCase());
        });
      }

      // Separate parameter filters
      if (odFilter !== 'all') {
        filtered = filtered.filter(t => t.parameters?.OD === odFilter);
      }
      if (pnFilter !== 'all') {
        filtered = filtered.filter(t => t.parameters?.PN === pnFilter);
      }
      if (peFilter !== 'all') {
        filtered = filtered.filter(t => t.parameters?.PE === peFilter);
      }
      if (typeParamFilter !== 'all') {
        filtered = filtered.filter(t => t.parameters?.Type === typeParamFilter);
      }

      // Time preset filter
      const now = new Date();
      if (timePreset === 'today') {
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        filtered = filtered.filter(t => new Date(t.transaction_date) >= todayStart);
      } else if (timePreset === 'yesterday') {
        const yesterdayStart = new Date(now.setHours(0, 0, 0, 0));
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        const yesterdayEnd = new Date(yesterdayStart);
        yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
        filtered = filtered.filter(t => new Date(t.transaction_date) >= yesterdayStart && new Date(t.transaction_date) < yesterdayEnd);
      } else if (timePreset === 'last7days') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        filtered = filtered.filter(t => new Date(t.transaction_date) >= sevenDaysAgo);
      } else if (timePreset === 'last30days') {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        filtered = filtered.filter(t => new Date(t.transaction_date) >= thirtyDaysAgo);
      } else if (timePreset === 'thisMonth') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        filtered = filtered.filter(t => new Date(t.transaction_date) >= monthStart);
      } else if (timePreset === 'lastMonth') {
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        filtered = filtered.filter(t => new Date(t.transaction_date) >= lastMonthStart && new Date(t.transaction_date) < lastMonthEnd);
      } else if (timePreset === 'custom') {
        // Date range filter
        if (startDate) {
          filtered = filtered.filter(t => new Date(t.transaction_date) >= new Date(startDate));
        }
        if (endDate) {
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          filtered = filtered.filter(t => new Date(t.transaction_date) <= endDateTime);
        }
      }

      setFilteredTransactions(filtered);
      setCurrentPage(1); // Reset to first page when filters change
    };

    applyFilters();
  }, [transactions, searchQuery, typeFilter, productTypeFilter, brandFilter, parameterFilter, odFilter, pnFilter, peFilter, typeParamFilter, timePreset, startDate, endDate]);

  const loadTransactions = async () => {
    try {
      const response = await transactionsAPI.getAll();
      // Parse parameters if they come as JSON strings, but they might already be objects
      const parsedTransactions = response.data.map((t: TransactionRecord) => {
        let params = t.parameters;
        if (typeof params === 'string') {
          try {
            params = JSON.parse(params);
          } catch (e) {
            console.error('Failed to parse parameters:', e);
            params = {};
          }
        }
        console.log('Transaction parameters:', t.batch_code, params, typeof params);
        return {
          ...t,
          parameters: params || {}
        };
      });
      setTransactions(parsedTransactions);

      // Extract unique parameter values for filters
      const ods = new Set<string>();
      const pns = new Set<string>();
      const pes = new Set<string>();
      const types = new Set<string>();

      parsedTransactions.forEach((t: TransactionRecord) => {
        if (t.parameters) {
          if (t.parameters.OD) ods.add(t.parameters.OD);
          if (t.parameters.PN) pns.add(t.parameters.PN);
          if (t.parameters.PE) pes.add(t.parameters.PE);
          if (t.parameters.Type) types.add(t.parameters.Type);
        }
      });

      setOdOptions(Array.from(ods).sort());
      setPnOptions(Array.from(pns).sort());
      setPeOptions(Array.from(pes).sort());
      setTypeOptions(Array.from(types).sort());
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMasterData = async () => {
    try {
      const [productTypesRes, brandsRes] = await Promise.all([
        inventoryAPI.getProductTypes(),
        inventoryAPI.getBrands(),
      ]);
      setProductTypes(productTypesRes.data || []);
      setBrands(brandsRes.data || []);
    } catch (error) {
      console.error('Failed to load master data:', error);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setProductTypeFilter('all');
    setBrandFilter('all');
    setParameterFilter('all');
    setOdFilter('all');
    setPnFilter('all');
    setPeFilter('all');
    setTypeParamFilter('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = searchQuery || typeFilter !== 'all' || productTypeFilter !== 'all' ||
    brandFilter !== 'all' || parameterFilter !== 'all' || odFilter !== 'all' || pnFilter !== 'all' ||
    peFilter !== 'all' || typeParamFilter !== 'all' || startDate || endDate;

  const getTotalProductionWeight = () => {
    return filteredTransactions
      .filter(t => t.transaction_type === 'PRODUCTION')
      .reduce((sum, t) => {
        const weight = Number(t.total_weight) || 0;
        return sum + (isNaN(weight) ? 0 : weight);
      }, 0);
  };

  const getProductCode = (transaction: TransactionRecord) => {
    return transaction.batch_code || `${transaction.brand}-${transaction.product_type}`;
  };

  const getProductName = (transaction: TransactionRecord) => {
    const params = transaction.parameters || {};
    const parts = [transaction.brand, transaction.product_type];
    if (params.quality) parts.push(params.quality);
    if (params.color) parts.push(params.color);
    if (params.size) parts.push(params.size);
    if (params.thickness) parts.push(params.thickness);
    return parts.filter(Boolean).join(' - ');
  };

  const formatWeight = (grams: number | null | undefined, unitAbbreviation?: string) => {
    // For sprinkler pipes (counted in pieces), weight is already total weight
    // For pipes (counted in meters), weight might need conversion
    if (!grams || isNaN(grams) || grams === 0) return '0 kg (0 ton)';
    const kg = grams / 1000;
    const tons = kg / 1000;
    return `${kg.toFixed(2)} kg (${tons.toFixed(3)} ton)`;
  };

  const openDetailModal = (transaction: TransactionRecord) => {
    // Parse parameters if they're a string, but they might already be an object
    let params = transaction.parameters;
    if (typeof params === 'string') {
      try {
        params = JSON.parse(params);
      } catch (e) {
        console.error('Failed to parse parameters:', e);
        params = {};
      }
    }
    const parsedTransaction = {
      ...transaction,
      parameters: params || {}
    };
    console.log('Opening modal with transaction:', parsedTransaction);
    console.log('Product Type:', parsedTransaction.product_type);
    console.log('Standard rolls:', parsedTransaction.standard_rolls_count, 'Avg length:', parsedTransaction.avg_standard_roll_length);
    console.log('Cut rolls details:', parsedTransaction.cut_rolls_details);
    console.log('Bundles count:', parsedTransaction.bundles_count);
    console.log('Spare pieces count:', parsedTransaction.spare_pieces_count);
    console.log('Spare pieces details:', parsedTransaction.spare_pieces_details);
    console.log('Parameters type:', typeof parsedTransaction.parameters, parsedTransaction.parameters);
    setModalTransaction(parsedTransaction);
    setDetailModalOpen(true);
  };

  const renderTransactionSummaryCards = (transaction: TransactionRecord) => {
    // For production batches, calculate based on product type
    let rollCount = 0;
    let displayLabel = 'Total Rolls/Items';

    if (transaction.transaction_type === 'PRODUCTION') {
      if (transaction.product_type === 'Sprinkler Pipe') {
        // For Sprinkler Pipe: show total pieces (bundles × bundle_size + spare pieces)
        const bundlePieces = (transaction.bundles_count || 0) * (transaction.bundle_size || 0);
        const sparePiecesTotal = transaction.spare_pieces_details
          ? transaction.spare_pieces_details.reduce((sum, count) => sum + Number(count), 0)
          : 0;
        rollCount = bundlePieces + sparePiecesTotal;
        displayLabel = 'Total Pieces';
      } else {
        // For HDPE: show number of roll items
        rollCount = (
          (transaction.standard_rolls_count || 0) +
          (transaction.cut_rolls_count || 0) +
          (transaction.bundles_count || 0) +
          (transaction.spare_pieces_count || 0)
        );
        displayLabel = 'Total Rolls';
      }
    } else if (transaction.transaction_type === 'SALE') {
      // For sales: use roll_snapshot if available
      if (transaction.roll_snapshot && transaction.roll_snapshot.total_rolls) {
        rollCount = transaction.roll_snapshot.total_rolls;
      } else {
        rollCount = 1;
      }
      displayLabel = 'Rolls Sold';
    } else {
      rollCount = 1;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              {displayLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rollCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {transaction.transaction_type === 'SALE' ? 'Items sold' : transaction.transaction_type === 'PRODUCTION' ? 'Items produced' : 'Items'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Weight className="h-4 w-4" />
              Total Weight
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatWeight(transaction.total_weight)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {transaction.transaction_type === 'SALE' ? 'Weight sold' : 'Weight produced'}
            </p>
          </CardContent>
        </Card>

        {transaction.transaction_type === 'PRODUCTION' && transaction.weight_per_meter ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Weight/Meter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Number(transaction.weight_per_meter).toFixed(2)} g/m</div>
              <p className="text-xs text-muted-foreground mt-1">Average weight per meter</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold truncate">{transaction.customer_name || 'N/A'}</div>
              <p className="text-xs text-muted-foreground mt-1">Customer name</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{format(new Date(transaction.transaction_date), 'MMM dd')}</div>
            <p className="text-xs text-muted-foreground mt-1">{format(new Date(transaction.transaction_date), 'yyyy')}</p>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderDetailModal = () => {
    if (!modalTransaction) return null;

    return (
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Transaction Details - {modalTransaction.transaction_type}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Product Information */}
            <div className="bg-blue-50/50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Product Information
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-xl">{modalTransaction.product_type}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="font-semibold text-xl">{modalTransaction.brand}</span>
                  {modalTransaction.parameters && Object.keys(modalTransaction.parameters).length > 0 && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <div className="flex flex-wrap gap-2">
                        {modalTransaction.parameters.PE && (
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                            PE: {modalTransaction.parameters.PE}
                          </Badge>
                        )}
                        {modalTransaction.parameters.OD && (
                          <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                            OD: {modalTransaction.parameters.OD}
                          </Badge>
                        )}
                        {modalTransaction.parameters.PN && (
                          <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
                            PN: {modalTransaction.parameters.PN}
                          </Badge>
                        )}
                        {modalTransaction.parameters.Type && (
                          <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                            Type: {modalTransaction.parameters.Type}
                          </Badge>
                        )}
                        {modalTransaction.parameters.size && (
                          <Badge variant="secondary" className="bg-pink-50 text-pink-700 border-pink-200">
                            Size: {modalTransaction.parameters.size}
                          </Badge>
                        )}
                        {modalTransaction.parameters.quality && (
                          <Badge variant="secondary" className="bg-cyan-50 text-cyan-700 border-cyan-200">
                            Quality: {modalTransaction.parameters.quality}
                          </Badge>
                        )}
                        {modalTransaction.parameters.color && (
                          <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                            Color: {modalTransaction.parameters.color}
                          </Badge>
                        )}
                      </div>
                    </>
                  )}
                </div>
            </div>

            <Separator />

            {/* Quantity and Weight Information */}
            <div className="bg-green-50/50 dark:bg-green-950/30 p-4 rounded-lg border border-green-200/50 dark:border-green-800/50">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Weight className="h-5 w-5 text-green-600 dark:text-green-400" />
                {modalTransaction.transaction_type === 'CUT' ? 'Cut Roll Details' : 'Quantity & Weight'}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* CUT Transaction - Show original roll and resulting pieces */}
                {modalTransaction.transaction_type === 'CUT' ? (
                  <>
                    <div className="bg-orange-100/50 dark:bg-orange-900/30 p-3 rounded-md border border-orange-300/50 dark:border-orange-700/50">
                      <p className="text-sm text-muted-foreground">Original Roll Length</p>
                      <p className="font-semibold text-lg text-orange-700 dark:text-orange-300">
                        {modalTransaction.roll_initial_length_meters
                          ? `${Number(modalTransaction.roll_initial_length_meters).toFixed(2)} m`
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-orange-100/50 dark:bg-orange-900/30 p-3 rounded-md border border-orange-300/50 dark:border-orange-700/50">
                      <p className="text-sm text-muted-foreground">Amount Cut</p>
                      <p className="font-semibold text-lg text-orange-700 dark:text-orange-300">
                        {Math.abs(modalTransaction.quantity_change || 0).toFixed(2)} m
                      </p>
                    </div>
                    {modalTransaction.notes && (
                      <div className="col-span-2 bg-orange-50/50 dark:bg-orange-900/20 p-3 rounded-md border border-orange-200/50 dark:border-orange-800/50">
                        <p className="text-sm text-muted-foreground mb-1">Cut Details</p>
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                          {modalTransaction.notes}
                        </p>
                      </div>
                    )}
                  </>
                ) : modalTransaction.transaction_type === 'PRODUCTION' ? (
                  <>
                    {modalTransaction.roll_snapshot?.rolls && modalTransaction.roll_snapshot.rolls.length > 0 ? (
                      <>
                        <div className="bg-green-100/50 dark:bg-green-900/30 p-3 rounded-md border border-green-300/50 dark:border-green-700/50">
                          <p className="text-sm text-muted-foreground">Total Rolls/Items (At Production)</p>
                          <p className="font-semibold text-lg text-green-700 dark:text-green-300">
                            {modalTransaction.roll_snapshot.total_rolls} items
                          </p>
                        </div>
                        <div className="bg-green-100/50 dark:bg-green-900/30 p-3 rounded-md border border-green-300/50 dark:border-green-700/50">
                          <p className="text-sm text-muted-foreground">Original Production Quantity</p>
                          <p className="font-semibold text-lg text-green-700 dark:text-green-300">
                            {Math.abs(modalTransaction.quantity_change || 0).toFixed(2)} {modalTransaction.unit_abbreviation || 'm'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-green-100/50 dark:bg-green-900/30 p-3 rounded-md border border-green-300/50 dark:border-green-700/50">
                          <p className="text-sm text-muted-foreground">Total Rolls/Items</p>
                          <p className="font-semibold text-lg text-green-700 dark:text-green-300">
                            {modalTransaction.product_type === 'Sprinkler Pipe'
                              ? ((modalTransaction.bundles_count || 0) + (modalTransaction.spare_pieces_count || 0))
                              : (
                                (modalTransaction.standard_rolls_count || 0) +
                                (modalTransaction.cut_rolls_count || 0) +
                                (modalTransaction.bundles_count || 0) +
                                (modalTransaction.spare_pieces_count || 0)
                              )
                            } items
                          </p>
                        </div>
                        <div className="bg-green-100/50 dark:bg-green-900/30 p-3 rounded-md border border-green-300/50 dark:border-green-700/50">
                          <p className="text-sm text-muted-foreground">Original Production Quantity</p>
                          <p className="font-semibold text-lg text-green-700 dark:text-green-300">
                            {Math.abs(modalTransaction.quantity_change || 0).toFixed(2)} {modalTransaction.unit_abbreviation || 'm'}
                          </p>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* SALE Transaction - Show roll breakdown if available */}
                    {modalTransaction.roll_snapshot?.rolls && modalTransaction.roll_snapshot.rolls.length > 0 ? (
                      <div className="col-span-2">
                        <div className="bg-blue-50/50 dark:bg-blue-900/30 p-3 rounded-md border border-blue-300/50 dark:border-blue-700/50">
                          <p className="text-sm text-muted-foreground mb-2">
                            {modalTransaction.product_type?.toLowerCase().includes('sprinkler') ? 'Dispatched Items' : 'Dispatched Rolls'}
                          </p>
                          <div className="space-y-2">
                            {(() => {
                              // Group identical rolls together
                              interface RollGroup {
                                roll_type: string;
                                quantity_dispatched: number;
                                is_cut_roll?: boolean;
                                initial_length_meters?: number;
                                bundle_size?: number;
                                count: number;
                              }
                              const rollGroups: Record<string, RollGroup> = modalTransaction.roll_snapshot.rolls.reduce((acc: Record<string, RollGroup>, roll) => {
                                const key = `${roll.roll_type}_${roll.quantity_dispatched}_${roll.is_cut_roll ? roll.initial_length_meters : 'standard'}`;
                                if (!acc[key]) {
                                  acc[key] = { ...roll, count: 0 };
                                }
                                acc[key].count++;
                                return acc;
                              }, {});

                              return Object.values(rollGroups).map((group: RollGroup, idx) => {
                                const isBundle = group.roll_type?.startsWith('bundle_');
                                const isSprinklerPipe = modalTransaction.product_type?.toLowerCase().includes('sprinkler');

                                return (
                                  <div key={idx} className="flex items-center justify-between text-sm bg-white dark:bg-slate-800 p-2 rounded">
                                    <div className="flex items-center gap-2">
                                      <Badge variant={group.is_cut_roll ? "secondary" : "default"} className="text-xs">
                                        {group.roll_type === 'standard' ? 'Standard Roll' :
                                         group.is_cut_roll ? 'Cut Roll' :
                                         isBundle ? `Bundle (${group.bundle_size || 0} pcs)` :
                                         'Spare'}
                                      </Badge>
                                      <span className="font-medium">
                                        {isBundle && isSprinklerPipe ? (
                                          // For Sprinkler Pipe bundles, just show the count
                                          group.count > 1 ? `× ${group.count}` : ''
                                        ) : (
                                          // For other products, show meters
                                          `${group.quantity_dispatched.toFixed(2)} m ${group.count > 1 ? `× ${group.count}` : ''}`
                                        )}
                                      </span>
                                    </div>
                                    <span className="text-muted-foreground text-xs">
                                      {group.is_cut_roll && `from ${group.initial_length_meters}m roll`}
                                    </span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800 flex justify-between font-semibold">
                            <span>
                              {modalTransaction.roll_snapshot.total_rolls} {modalTransaction.product_type?.toLowerCase().includes('sprinkler') ? 'item(s)' : 'roll(s)'} total
                            </span>
                            {!modalTransaction.product_type?.toLowerCase().includes('sprinkler') && (
                              <span>{Math.abs(modalTransaction.quantity_change || 0).toFixed(2)} m</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">Quantity</p>
                          <p className="font-medium text-lg">
                            {modalTransaction.roll_length_meters && modalTransaction.roll_length_meters > 0
                              ? `${Number(modalTransaction.roll_length_meters).toFixed(2)} m`
                              : `${Math.abs(modalTransaction.quantity_change || 0).toFixed(2)} m`
                            }
                          </p>
                        </div>
                        {modalTransaction.roll_initial_length_meters && (
                          <div>
                            <p className="text-sm text-muted-foreground">Original Length</p>
                            <p className="font-medium text-lg">{Number(modalTransaction.roll_initial_length_meters).toFixed(2)} m</p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                {modalTransaction.transaction_type !== 'SALE' && modalTransaction.transaction_type !== 'CUT' && (
                  <div className="bg-emerald-100/50 dark:bg-emerald-900/30 p-3 rounded-md border border-emerald-300/50 dark:border-emerald-700/50">
                    <p className="text-sm text-muted-foreground">
                      {modalTransaction.transaction_type === 'PRODUCTION' ? 'Batch Total Weight' : 'Weight'}
                    </p>
                    <p className="font-semibold text-lg text-emerald-700 dark:text-emerald-300">
                      {formatWeight(
                        modalTransaction.transaction_type === 'PRODUCTION'
                          ? (modalTransaction.total_weight || 0)
                          : (modalTransaction.roll_weight || modalTransaction.total_weight || 0)
                      )}
                    </p>
                  </div>
                )}
                {modalTransaction.roll_is_cut && (
                  <div>
                    <p className="text-sm text-muted-foreground">Roll Type</p>
                    <p className="font-medium text-lg">
                      <Badge variant="secondary">Cut Roll</Badge>
                    </p>
                  </div>
                )}
                {modalTransaction.roll_bundle_size && (
                  <div>
                    <p className="text-sm text-muted-foreground">Bundle Size</p>
                    <p className="font-medium text-lg">
                      <Badge variant="secondary">{modalTransaction.roll_bundle_size} pieces</Badge>
                    </p>
                  </div>
                )}
                {modalTransaction.product_type === 'Sprinkler Pipe' && modalTransaction.piece_length && Number(modalTransaction.piece_length) > 0 && (
                  <div className="bg-purple-50/50 dark:bg-purple-900/30 p-3 rounded-md border border-purple-300/50 dark:border-purple-700/50">
                    <p className="text-sm text-muted-foreground">Length per Piece</p>
                    <p className="font-semibold text-lg text-purple-700 dark:text-purple-300">
                      {Number(modalTransaction.piece_length).toFixed(2)} m
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Roll Information (Production specific) */}
            {modalTransaction.transaction_type === 'PRODUCTION' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Ruler className="h-5 w-5" />
                    Batch & Roll Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {modalTransaction.batch_code && (
                      <div className="bg-slate-50/50 dark:bg-slate-950/30 p-3 rounded-md border border-slate-200/50 dark:border-slate-800/50">
                        <p className="text-sm text-muted-foreground">Batch Code</p>
                        <p className="font-medium text-slate-700 dark:text-slate-300">{modalTransaction.batch_code}</p>
                      </div>
                    )}
                    {modalTransaction.batch_no && (
                      <div>
                        <p className="text-sm text-muted-foreground">Batch Number</p>
                        <p className="font-medium">{modalTransaction.batch_no}</p>
                      </div>
                    )}
                    {modalTransaction.transaction_type === 'PRODUCTION' && (
                      <>
                        {/* Show roll breakdown from roll_snapshot (original state at production) */}
                        {modalTransaction.roll_snapshot?.rolls && modalTransaction.roll_snapshot.rolls.length > 0 ? (
                          <div className="col-span-2">
                            <div className="bg-blue-50/50 dark:bg-blue-900/30 p-3 rounded-md border border-blue-300/50 dark:border-blue-700/50">
                              <p className="text-sm text-muted-foreground mb-2 font-semibold">Original Production Breakdown</p>
                              <div className="space-y-2">
                                {(() => {
                                  const rolls = modalTransaction.roll_snapshot.rolls;
                                  const standardRolls = rolls.filter((r: { roll_type: string }) => r.roll_type === 'standard');
                                  const cutRolls = rolls.filter((r: { is_cut_roll: boolean }) => r.is_cut_roll);
                                  const bundles = rolls.filter((r: { roll_type: string }) => r.roll_type?.startsWith('bundle_'));
                                  const spares = rolls.filter((r: { roll_type: string }) => r.roll_type === 'spare');

                                  return (
                                    <>
                                      {standardRolls.length > 0 && (
                                        <div className="bg-white dark:bg-slate-800 p-3 rounded">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <Badge variant="default" className="text-xs">Standard Rolls</Badge>
                                              <span className="font-medium">{standardRolls.length} rolls</span>
                                            </div>
                                            <span className="text-sm text-muted-foreground">
                                              Avg: {(standardRolls.reduce((sum: number, r: { length_meters: number }) => sum + r.length_meters, 0) / standardRolls.length).toFixed(2)}m
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                      {cutRolls.length > 0 && (
                                        <div className="bg-white dark:bg-slate-800 p-3 rounded">
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                              <Badge variant="secondary" className="text-xs">Cut Rolls</Badge>
                                              <span className="font-medium">{cutRolls.length} rolls</span>
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-4 gap-2">
                                            {cutRolls.map((roll: { length_meters: number }, idx: number) => (
                                              <div key={idx} className="text-xs bg-slate-100 dark:bg-slate-700 p-2 rounded">
                                                {roll.length_meters.toFixed(2)}m
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {bundles.length > 0 && (
                                        <div className="bg-white dark:bg-slate-800 p-3 rounded">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <Badge variant="outline" className="text-xs border-purple-300">Bundles</Badge>
                                              <span className="font-medium">{bundles.length} bundles</span>
                                            </div>
                                            {bundles[0]?.bundle_size && (
                                              <span className="text-sm text-muted-foreground">
                                                {bundles[0].bundle_size} pcs each
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      {spares.length > 0 && (
                                        <div className="bg-white dark:bg-slate-800 p-3 rounded">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <Badge variant="outline" className="text-xs border-amber-300">Spare Pieces</Badge>
                                              <span className="font-medium">{spares.length} pieces</span>
                                            </div>
                                            <span className="text-sm text-muted-foreground">
                                              Total: {spares.reduce((sum: number, r: { length_meters: number }) => sum + r.length_meters, 0)} pcs
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Fallback to old aggregated data for transactions without roll_snapshot */}
                            {modalTransaction.standard_rolls_count > 0 && (
                          <>
                            <div className="bg-blue-50/50 dark:bg-blue-950/30 p-3 rounded-md border border-blue-200/50 dark:border-blue-800/50">
                              <p className="text-sm text-muted-foreground">Standard Rolls</p>
                              <div className="font-medium text-blue-700 dark:text-blue-300">
                                {modalTransaction.standard_rolls_count} rolls
                                <Badge variant="outline" className="ml-2 border-blue-300 dark:border-blue-700">Standard</Badge>
                              </div>
                            </div>
                            {modalTransaction.avg_standard_roll_length && (
                              <div>
                                <p className="text-sm text-muted-foreground">Avg. Standard Roll Length</p>
                                <p className="font-medium">
                                  {Number(modalTransaction.avg_standard_roll_length).toFixed(2)} m
                                </p>
                              </div>
                            )}
                            {modalTransaction.avg_standard_roll_length && modalTransaction.standard_rolls_count && (
                              <div className="bg-cyan-50/50 dark:bg-cyan-950/30 p-3 rounded-md border border-cyan-200/50 dark:border-cyan-800/50">
                                <p className="text-sm text-muted-foreground">Total Standard Roll Length</p>
                                <p className="font-semibold text-lg text-cyan-700 dark:text-cyan-300">
                                  {(Number(modalTransaction.avg_standard_roll_length) * modalTransaction.standard_rolls_count).toFixed(2)} m
                                </p>
                              </div>
                            )}
                          </>
                        )}
                        {modalTransaction.cut_rolls_details && modalTransaction.cut_rolls_details.length > 0 && modalTransaction.product_type !== 'Sprinkler Pipe' && (
                          <>
                            <div className="col-span-2 bg-orange-50/50 dark:bg-orange-950/30 p-3 rounded-md border border-orange-200/50 dark:border-orange-800/50">
                              <p className="text-sm text-muted-foreground mb-2">
                                Cut Rolls ({modalTransaction.cut_rolls_details.length} rolls)
                              </p>
                              <div className="grid grid-cols-3 gap-3">
                                {modalTransaction.cut_rolls_details.map((length, index) => (
                                  <div key={index} className="border rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">Cut Roll {index + 1}</p>
                                    <p className="font-medium text-lg">{Number(length).toFixed(2)} {modalTransaction.unit_abbreviation || 'm'}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                        {modalTransaction.spare_pieces_details && modalTransaction.spare_pieces_details.length > 0 && modalTransaction.product_type === 'Sprinkler Pipe' && (
                          <>
                            <div className="col-span-2 bg-amber-50/50 dark:bg-amber-950/30 p-3 rounded-md border border-amber-200/50 dark:border-amber-800/50">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm text-muted-foreground">
                                  Spare Pieces ({modalTransaction.spare_pieces_details.length} pieces)
                                </p>
                                {modalTransaction.piece_length && modalTransaction.piece_length > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {modalTransaction.piece_length}m per piece
                                  </Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                {modalTransaction.spare_pieces_details.map((length, index) => (
                                  <div key={index} className="border rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">Spare Piece {index + 1}</p>
                                    <p className="font-medium text-lg">
                                      {Number(length).toFixed(0)} pcs
                                      {modalTransaction.piece_length && modalTransaction.piece_length > 0 && (
                                        <span className="text-sm text-muted-foreground ml-1">
                                          ({(Number(length) * modalTransaction.piece_length).toFixed(2)}m)
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                        {modalTransaction.bundles_count > 0 && (
                          <div className="col-span-2 bg-purple-50/50 dark:bg-purple-950/30 p-3 rounded-md border border-purple-200/50 dark:border-purple-800/50">
                            <p className="text-sm text-muted-foreground">Bundles (Sprinkler Pipe)</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <div className="font-medium text-lg text-purple-700 dark:text-purple-300">
                                {modalTransaction.bundles_count} {modalTransaction.bundles_count === 1 ? 'bundle' : 'bundles'}
                              </div>
                              {modalTransaction.bundle_size && (
                                <>
                                  <span className="text-muted-foreground">×</span>
                                  <Badge variant="outline" className="text-sm border-purple-300 dark:border-purple-700">
                                    {modalTransaction.bundle_size} pcs each
                                  </Badge>
                                  {modalTransaction.piece_length && modalTransaction.piece_length > 0 && (
                                    <>
                                      <span className="text-muted-foreground">×</span>
                                      <Badge variant="outline" className="text-sm border-purple-300 dark:border-purple-700">
                                        {modalTransaction.piece_length}m per piece
                                      </Badge>
                                    </>
                                  )}
                                  <span className="text-muted-foreground">=</span>
                                  <div className="font-semibold text-lg text-purple-700 dark:text-purple-300">
                                    {modalTransaction.bundles_count * modalTransaction.bundle_size} total pieces
                                    {modalTransaction.piece_length && modalTransaction.piece_length > 0 && (
                                      <span className="text-sm ml-2">(
                                        {(modalTransaction.bundles_count * modalTransaction.bundle_size * modalTransaction.piece_length).toFixed(2)}m
                                      )</span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        </>
                      )}
                    </>
                    )}
                    {modalTransaction.weight_per_meter && (
                      <div>
                        <p className="text-sm text-muted-foreground">Weight per Meter</p>
                        <p className="font-medium">{Number(modalTransaction.weight_per_meter).toFixed(2)} g/m</p>
                      </div>
                    )}
                    {modalTransaction.production_date && (
                      <div>
                        <p className="text-sm text-muted-foreground">Production Date</p>
                        <p className="font-medium">{format(new Date(modalTransaction.production_date), 'PPp')}</p>
                      </div>
                    )}
                    {modalTransaction.transaction_date && (
                      <div>
                        <p className="text-sm text-muted-foreground">Transaction Date</p>
                        <p className="font-medium">{format(new Date(modalTransaction.transaction_date), 'PPp')}</p>
                      </div>
                    )}
                  </div>
                  {modalTransaction.attachment_url && (
                    <div className="mt-4">
                      <p className="text-sm text-muted-foreground mb-2">Attachment</p>
                      <a
                        href={modalTransaction.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View Attachment
                      </a>
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Customer Information (Sale specific) */}
            {modalTransaction.transaction_type === 'SALE' && modalTransaction.customer_name && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Customer Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Customer Name</p>
                      <p className="font-medium text-lg">{modalTransaction.customer_name}</p>
                    </div>
                    {modalTransaction.invoice_no && (
                      <div>
                        <p className="text-sm text-muted-foreground">Invoice Number</p>
                        <p className="font-medium text-lg">{modalTransaction.invoice_no}</p>
                      </div>
                    )}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Transaction Metadata */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Info className="h-5 w-5" />
                Transaction Metadata
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Transaction ID</p>
                  <p className="font-medium">{modalTransaction.id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Transaction Type</p>
                  <Badge variant={modalTransaction.transaction_type === 'PRODUCTION' ? 'default' : 'secondary'}>
                    {modalTransaction.transaction_type}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created By</p>
                  <p className="font-medium">{modalTransaction.created_by_name || modalTransaction.created_by_username || modalTransaction.created_by_email || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created At</p>
                  <p className="font-medium">{format(new Date(modalTransaction.created_at), 'PPp')}</p>
                </div>
                {modalTransaction.notes && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="font-medium">{modalTransaction.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading transactions...</p>
      </div>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Transaction History</h1>
          <p className="text-muted-foreground">View all production and sales transactions</p>
        </div>

        {/* Total Production Weight */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Weight className="h-5 w-5" />
              Total Production Weight
            </CardTitle>
            <CardDescription>Cumulative weight of all production transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{formatWeight(getTotalProductionWeight())}</div>
          </CardContent>
        </Card>

        {/* Filters Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
              <div className="flex gap-2">
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear Filters
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
                  {showFilters ? 'Hide' : 'Show'} Filters
                </Button>
              </div>
            </div>
          </CardHeader>
          {showFilters && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Search */}
                <div className="space-y-2">
                  <Label>Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Batch, customer, invoice..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>

                {/* Transaction Type */}
                <div className="space-y-2">
                  <Label>Transaction Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="PRODUCTION">Production</SelectItem>
                      <SelectItem value="SALE">Sale</SelectItem>
                      <SelectItem value="CUT">Cut Roll</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Product Type */}
                <div className="space-y-2">
                  <Label>Product Type</Label>
                  <Select value={productTypeFilter} onValueChange={setProductTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Product Types</SelectItem>
                      {productTypes.map(pt => (
                        <SelectItem key={pt.id} value={pt.name}>{pt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Brand */}
                <div className="space-y-2">
                  <Label>Brand</Label>
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Brands</SelectItem>
                      {brands.map(brand => (
                        <SelectItem key={brand.id} value={brand.name}>{brand.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Parameter Filter - Show when product type is selected */}
                {productTypeFilter !== 'all' && (
                  <>
                    {productTypeFilter === 'HDPE Pipe' && (
                      <>
                        <div className="space-y-2">
                          <Label>OD (Outer Diameter)</Label>
                          <Select value={odFilter} onValueChange={setOdFilter}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All OD</SelectItem>
                              {odOptions.map(od => (
                                <SelectItem key={od} value={od}>{od}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>PN (Pressure Nominal)</Label>
                          <Select value={pnFilter} onValueChange={setPnFilter}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All PN</SelectItem>
                              {pnOptions.map(pn => (
                                <SelectItem key={pn} value={pn}>{pn}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>PE (Polyethylene Grade)</Label>
                          <Select value={peFilter} onValueChange={setPeFilter}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All PE</SelectItem>
                              {peOptions.map(pe => (
                                <SelectItem key={pe} value={pe}>{pe}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    {productTypeFilter === 'Sprinkler Pipe' && (
                      <>
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select value={typeParamFilter} onValueChange={setTypeParamFilter}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Types</SelectItem>
                              {typeOptions.map(type => (
                                <SelectItem key={type} value={type}>Type {type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>PN (Pressure Nominal)</Label>
                          <Select value={pnFilter} onValueChange={setPnFilter}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All PN</SelectItem>
                              {pnOptions.map(pn => (
                                <SelectItem key={pn} value={pn}>{pn}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>OD (Outer Diameter)</Label>
                          <Select value={odFilter} onValueChange={setOdFilter}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All OD</SelectItem>
                              {odOptions.map(od => (
                                <SelectItem key={od} value={od}>{od}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Time Period */}
                <div className="space-y-2">
                  <Label>Time Period</Label>
                  <Select
                    value={timePreset}
                    onValueChange={(value) => {
                      setTimePreset(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="last7days">Last 7 Days</SelectItem>
                      <SelectItem value="last30days">Last 30 Days</SelectItem>
                      <SelectItem value="thisMonth">This Month</SelectItem>
                      <SelectItem value="lastMonth">Last Month</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Start Date - Always visible */}
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (e.target.value || endDate) {
                        setTimePreset('custom');
                      }
                    }}
                  />
                </div>

                {/* End Date - Always visible */}
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      if (e.target.value || startDate) {
                        setTimePreset('custom');
                      }
                    }}
                  />
                </div>
              </div>

              {/* Results count */}
              <div className="mt-4 text-sm text-muted-foreground">
                Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredTransactions.length)}-{Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} transactions
              </div>
            </CardContent>
          )}
        </Card>

        {/* Transactions Table */}
        <Card>
        <CardHeader>
          <CardTitle>All Transactions</CardTitle>
          <CardDescription>
            View all transactions or click the detail button for complete information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Product Type & Brand</TableHead>
                <TableHead>Parameters</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Length (m)</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Attachment</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((transaction) => (
                <TableRow
                  key={transaction.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <TableCell className="font-medium">
                    <div>{format(new Date(transaction.transaction_date), 'PP')}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(transaction.transaction_date), 'p')}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{transaction.batch_code || '-'}</div>
                    {transaction.batch_no && (
                      <div className="text-xs text-muted-foreground">{transaction.batch_no}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-base">{transaction.product_type}</div>
                    <div className="text-sm text-muted-foreground">{transaction.brand}</div>
                  </TableCell>
                  <TableCell>
                    {transaction.parameters && typeof transaction.parameters === 'object' && Object.keys(transaction.parameters).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {transaction.parameters.PE && (
                          <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            PE: {transaction.parameters.PE}
                          </Badge>
                        )}
                        {transaction.parameters.OD && (
                          <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-200">
                            OD: {transaction.parameters.OD}
                          </Badge>
                        )}
                        {transaction.parameters.PN && (
                          <Badge variant="secondary" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                            PN: {transaction.parameters.PN}
                          </Badge>
                        )}
                        {transaction.parameters.Type && (
                          <Badge variant="secondary" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                            Type: {transaction.parameters.Type}
                          </Badge>
                        )}
                        {transaction.parameters.size && (
                          <Badge variant="secondary" className="text-xs bg-pink-50 text-pink-700 border-pink-200">
                            Size: {transaction.parameters.size}
                          </Badge>
                        )}
                        {transaction.parameters.quality && (
                          <Badge variant="secondary" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200">
                            Quality: {transaction.parameters.quality}
                          </Badge>
                        )}
                        {transaction.parameters.color && (
                          <Badge variant="secondary" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                            Color: {transaction.parameters.color}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={transaction.transaction_type === 'PRODUCTION' ? 'default' : 'secondary'}
                      className={
                        transaction.transaction_type === 'SALE'
                          ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700'
                          : transaction.transaction_type === 'CUT'
                          ? 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700'
                          : ''
                      }
                    >
                      {transaction.transaction_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {/* Calculate proper length in meters for all product types */}
                    {transaction.product_type === 'Sprinkler Pipe' ? (
                      // Sprinkler Pipe: Calculate total meters (pieces × piece_length)
                      <span className={transaction.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}>
                        {(() => {
                          const pieces = Math.abs(transaction.quantity_change || 0);
                          const pieceLength = transaction.piece_length || 0;

                          // Fallback: try to get from spare_pieces_details if piece_length is 0
                          if (pieceLength === 0 && transaction.spare_pieces_details && transaction.spare_pieces_details.length > 0) {
                            // spare_pieces_details contains the actual piece count (stored in bundle_size)
                            // We need a different approach - just show pieces for now
                            console.log('Sprinkler Pipe - showing pieces (piece_length unavailable):', {
                              batch_code: transaction.batch_code,
                              pieces,
                              spare_pieces_details: transaction.spare_pieces_details
                            });
                          }

                          const totalMeters = pieces * pieceLength;
                          return totalMeters > 0 ? `${totalMeters.toFixed(2)} m` : `${pieces.toFixed(0)} pcs`;
                        })()}
                      </span>
                    ) : transaction.transaction_type === 'PRODUCTION' ? (
                      // HDPE Production: Calculate from roll details
                      <span className="text-green-600">
                        {(() => {
                          let totalLength = 0;
                          // Add standard rolls length
                          if (transaction.avg_standard_roll_length && transaction.standard_rolls_count) {
                            totalLength += Number(transaction.avg_standard_roll_length) * transaction.standard_rolls_count;
                          }
                          // Add cut rolls length
                          if (transaction.cut_rolls_details && transaction.cut_rolls_details.length > 0) {
                            totalLength += transaction.cut_rolls_details.reduce((sum, length) => sum + Number(length), 0);
                          }
                          return totalLength.toFixed(2);
                        })()} m
                      </span>
                    ) : transaction.roll_length_meters && transaction.roll_length_meters > 0 ? (
                      // HDPE Sale: Show specific roll length
                      <span className="text-red-600">
                        {Number(transaction.roll_length_meters).toFixed(2)} m
                      </span>
                    ) : transaction.transaction_type === 'SALE' && Math.abs(transaction.quantity_change) > 0 ? (
                      // HDPE Sale (Cut Roll): Use quantity_change (negative for sales)
                      <span className="text-red-600">
                        {Math.abs(transaction.quantity_change || 0).toFixed(2)} m
                      </span>
                    ) : (
                      // Fallback
                      <span className={transaction.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}>
                        {Math.abs(transaction.quantity_change || 0).toFixed(2)} {transaction.unit_abbreviation || 'm'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {transaction.transaction_type === 'SALE' || transaction.transaction_type === 'CUT' ? '-' : formatWeight(transaction.total_weight || 0)}
                  </TableCell>
                  <TableCell>{transaction.customer_name || '-'}</TableCell>
                  <TableCell>
                    {transaction.attachment_url ? (
                      <a
                        href={transaction.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <Paperclip className="h-4 w-4" />
                        View
                      </a>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>{transaction.created_by_name || transaction.created_by_username || transaction.created_by_email || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetailModal(transaction);
                      }}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {filteredTransactions.length > itemsPerPage && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {Math.ceil(filteredTransactions.length / itemsPerPage)}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredTransactions.length / itemsPerPage), prev + 1))}
                  disabled={currentPage === Math.ceil(filteredTransactions.length / itemsPerPage)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

        {/* Detail Modal */}
        {renderDetailModal()}
      </div>
    </Layout>
  );
}
