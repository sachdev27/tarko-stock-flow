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
  transaction_type: 'PRODUCTION' | 'SALE' | 'ADJUSTMENT';
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
  // Average roll lengths
  avg_standard_roll_length?: number;
  cut_rolls_details?: number[]; // Array of individual cut roll lengths
}

export default function TransactionsNew() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<TransactionRecord[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [modalTransaction, setModalTransaction] = useState<TransactionRecord | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [productTypeFilter, setProductTypeFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Master data for filters
  const [productTypes, setProductTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: number; name: string }>>([]);

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

      // Date range filter
      if (startDate) {
        filtered = filtered.filter(t => new Date(t.created_at) >= new Date(startDate));
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        filtered = filtered.filter(t => new Date(t.created_at) <= endDateTime);
      }

      setFilteredTransactions(filtered);
    };

    applyFilters();
  }, [transactions, searchQuery, typeFilter, productTypeFilter, brandFilter, startDate, endDate]);

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
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = searchQuery || typeFilter !== 'all' || productTypeFilter !== 'all' || brandFilter !== 'all' || startDate || endDate;

  const getTotalProductionWeight = () => {
    return filteredTransactions
      .filter(t => t.transaction_type === 'PRODUCTION')
      .reduce((sum, t) => sum + (t.total_weight || 0), 0);
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

  const formatWeight = (grams: number) => {
    return `${(grams / 1000).toFixed(2)} kg`;
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
    console.log('Standard rolls:', parsedTransaction.standard_rolls_count, 'Avg length:', parsedTransaction.avg_standard_roll_length);
    console.log('Cut rolls details:', parsedTransaction.cut_rolls_details);
    console.log('Parameters type:', typeof parsedTransaction.parameters, parsedTransaction.parameters);
    setModalTransaction(parsedTransaction);
    setDetailModalOpen(true);
  };

  const renderTransactionSummaryCards = (transaction: TransactionRecord) => {
    // For production batches, sum up the actual roll counts from breakdown
    // For sales, use quantity_change which could be rolls or meters depending on context
    const rollCount = transaction.transaction_type === 'PRODUCTION'
      ? (
          (transaction.standard_rolls_count || 0) +
          (transaction.cut_rolls_count || 0) +
          (transaction.bundles_count || 0) +
          (transaction.spare_pieces_count || 0)
        )
      : (transaction.roll_length_meters ? 1 : Math.abs(transaction.quantity_change || 0));

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              {transaction.transaction_type === 'PRODUCTION' ? 'Total Rolls/Items' : 'Quantity'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rollCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {transaction.transaction_type === 'SALE' ? 'Items sold' : 'Items produced'}
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
            <div className="text-2xl font-bold">{format(new Date(transaction.created_at), 'MMM dd')}</div>
            <p className="text-xs text-muted-foreground mt-1">{format(new Date(transaction.created_at), 'yyyy')}</p>
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
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Package className="h-5 w-5" />
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
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Weight className="h-5 w-5" />
                Quantity & Weight
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* For production, show number of rolls from breakdown counts */}
                {modalTransaction.transaction_type === 'PRODUCTION' ? (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Rolls/Items</p>
                      <p className="font-medium text-lg">
                        {(
                          (modalTransaction.standard_rolls_count || 0) +
                          (modalTransaction.cut_rolls_count || 0) +
                          (modalTransaction.bundles_count || 0) +
                          (modalTransaction.spare_pieces_count || 0)
                        )} items
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Length/Quantity</p>
                      <p className="font-medium text-lg">
                        {Math.abs(modalTransaction.quantity_change || 0).toFixed(2)} {modalTransaction.unit_abbreviation || 'm'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Quantity</p>
                      <p className="font-medium text-lg">
                        {modalTransaction.roll_length_meters
                          ? `${Number(modalTransaction.roll_length_meters).toFixed(2)} m`
                          : `${Math.abs(modalTransaction.quantity_change || 0)} items`
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
                <div>
                  <p className="text-sm text-muted-foreground">Total Weight</p>
                  <p className="font-medium text-lg">{formatWeight(modalTransaction.total_weight || 0)}</p>
                </div>
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
                      <div>
                        <p className="text-sm text-muted-foreground">Batch Code</p>
                        <p className="font-medium">{modalTransaction.batch_code}</p>
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
                        {modalTransaction.standard_rolls_count > 0 && (
                          <>
                            <div>
                              <p className="text-sm text-muted-foreground">Standard Rolls</p>
                              <div className="font-medium">
                                {modalTransaction.standard_rolls_count} rolls
                                <Badge variant="outline" className="ml-2">Standard</Badge>
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
                              <div>
                                <p className="text-sm text-muted-foreground">Total Standard Roll Length</p>
                                <p className="font-medium text-lg">
                                  {(Number(modalTransaction.avg_standard_roll_length) * modalTransaction.standard_rolls_count).toFixed(2)} m
                                </p>
                              </div>
                            )}
                          </>
                        )}
                        {modalTransaction.cut_rolls_details && modalTransaction.cut_rolls_details.length > 0 && (
                          <>
                            <div className="col-span-2">
                              <p className="text-sm text-muted-foreground mb-2">Cut Rolls ({modalTransaction.cut_rolls_details.length} rolls)</p>
                              <div className="grid grid-cols-3 gap-3">
                                {modalTransaction.cut_rolls_details.map((length, index) => (
                                  <div key={index} className="border rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">Cut Roll {index + 1}</p>
                                    <p className="font-medium text-lg">{Number(length).toFixed(2)} m</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                        {modalTransaction.bundles_count > 0 && (
                          <div>
                            <p className="text-sm text-muted-foreground">Bundles</p>
                            <div className="font-medium">
                              {modalTransaction.bundles_count} bundles
                              {modalTransaction.roll_bundle_size && (
                                <Badge variant="outline" className="ml-2">
                                  {modalTransaction.roll_bundle_size} pcs each
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                        {modalTransaction.spare_pieces_count > 0 && (
                          <div>
                            <p className="text-sm text-muted-foreground">Spare Pieces</p>
                            <div className="font-medium">
                              {modalTransaction.spare_pieces_count} pieces
                              <Badge variant="secondary" className="ml-2">Spare</Badge>
                            </div>
                          </div>
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

        {/* Show Total Production Weight when no transaction is selected */}
        {!selectedTransaction && (
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
        )}

        {/* Show transaction summary cards when a transaction is selected */}
        {selectedTransaction && renderTransactionSummaryCards(selectedTransaction)}

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
                      <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
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

                {/* Start Date */}
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                {/* End Date */}
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Results count */}
              <div className="mt-4 text-sm text-muted-foreground">
                Showing {filteredTransactions.length} of {transactions.length} transactions
              </div>
            </CardContent>
          )}
        </Card>

        {/* Transactions Table */}
        <Card>
        <CardHeader>
          <CardTitle>All Transactions</CardTitle>
          <CardDescription>
            Click on a row to view summary cards, or use the detail button for complete information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
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
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((transaction) => (
                <TableRow
                  key={transaction.id}
                  className={`cursor-pointer transition-colors ${
                    selectedTransaction?.id === transaction.id
                      ? 'bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedTransaction(selectedTransaction?.id === transaction.id ? null : transaction)}
                >
                  <TableCell className="font-medium">
                    <div>{format(new Date(transaction.created_at), 'PP')}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(transaction.created_at), 'p')}</div>
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
                    >
                      {transaction.transaction_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {/* For production: show total meters from quantity_change */}
                    {/* For sales with specific roll: show roll length */}
                    {/* Otherwise: show quantity change as meters or pieces */}
                    {transaction.transaction_type === 'PRODUCTION' ? (
                      <span className="text-green-600">
                        {Math.abs(transaction.quantity_change || 0).toFixed(2)} m
                      </span>
                    ) : transaction.roll_length_meters ? (
                      <span className="text-red-600">
                        {Number(transaction.roll_length_meters).toFixed(2)} m
                      </span>
                    ) : (
                      <span className={transaction.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}>
                        {Math.abs(transaction.quantity_change || 0).toFixed(2)} {transaction.unit_abbreviation || 'm'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{formatWeight(transaction.total_weight || 0)}</TableCell>
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
        </CardContent>
      </Card>

        {/* Detail Modal */}
        {renderDetailModal()}
      </div>
    </Layout>
  );
}
