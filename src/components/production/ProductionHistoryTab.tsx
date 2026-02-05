import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, Factory, Package, Filter, X, Paperclip, ExternalLink, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pencil } from 'lucide-react';
import { production } from '@/lib/api-typed';
import type * as API from '@/types';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { EditProductionDialog } from '@/components/production/EditProductionDialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

interface Batch {
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
  status: 'ACTIVE' | 'CONSUMED' | 'REVERTED';
  reverted_at?: string;
  reverted_by_email?: string;
  items?: StockItem[];
}

interface StockItem {
  id: string;
  stock_type: string;
  quantity: number;
  status: string;
  notes?: string;
  length_per_unit?: number;
  total_length?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  total_pieces?: number;
  cut_pieces?: Array<{ length_meters: number; status: string }>;
  spare_pieces?: Array<{ piece_count: number; piece_length_meters?: number; status: string }>;
}

interface BatchDetails extends Batch {
  attachment_url?: string;
  updated_at: string;
  items: StockItem[];
  status: 'ACTIVE' | 'CONSUMED' | 'REVERTED';
  reverted_at?: string;
  reverted_by_email?: string;
}

export const ProductionHistoryTab = () => {
  const { token, user, isAdmin } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [filteredBatches, setFilteredBatches] = useState<Batch[]>([]);
  const [activeBatchCount, setActiveBatchCount] = useState(0); // Count of non-reverted batches
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetails | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [timePreset, setTimePreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const totalPages = Math.ceil((filteredBatches?.length || 0) / itemsPerPage);

  const paginatedBatches = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return (filteredBatches || []).slice(startIndex, endIndex);
  }, [filteredBatches, currentPage]);

  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const goToPrevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));

  const timePresets = [
    { label: 'All Time', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'Last 7 Days', value: '7days' },
    { label: 'Last 30 Days', value: '30days' },
    { label: 'This Month', value: 'month' },
    { label: 'Last Month', value: 'lastmonth' },
  ];

  useEffect(() => {
    fetchBatches();
  }, []);

  useEffect(() => {
    // Always filter out reverted batches first
    const nonRevertedBatches = batches.filter(b => b.status !== 'REVERTED');
    setActiveBatchCount(nonRevertedBatches.length);

    if (!searchTerm.trim() && (!startDate || !endDate)) {
      setFilteredBatches(nonRevertedBatches);
      return;
    }

    let filtered = nonRevertedBatches;

    // Text search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(b =>
        b.batch_code.toLowerCase().includes(term) ||
        b.batch_no.toLowerCase().includes(term) ||
        b.product_type_name.toLowerCase().includes(term) ||
        b.brand_name.toLowerCase().includes(term)
      );
    }

    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      filtered = filtered.filter(b => {
        const productionDate = new Date(b.production_date);
        return productionDate >= start && productionDate <= end;
      });
    }

    setFilteredBatches(filtered);
    setCurrentPage(1); // Reset to first page on filter change
  }, [searchTerm, batches, startDate, endDate]);

  // Handle time preset changes
  useEffect(() => {
    if (timePreset === 'all' || timePreset === '') {
      setStartDate('');
      setEndDate('');
      return;
    }

    const now = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (timePreset === 'today') {
      const today = formatDate(now);
      setStartDate(today);
      setEndDate(today);
    } else if (timePreset === '7days') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      setStartDate(formatDate(sevenDaysAgo));
      setEndDate(formatDate(now));
    } else if (timePreset === '30days') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      setStartDate(formatDate(thirtyDaysAgo));
      setEndDate(formatDate(now));
    } else if (timePreset === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatDate(monthStart));
      setEndDate(formatDate(now));
    } else if (timePreset === 'lastmonth') {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(formatDate(lastMonthStart));
      setEndDate(formatDate(lastMonthEnd));
    }
  }, [timePreset]);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const data = await production.getHistory();
      // Backend returns {batches: []} format - extract array
      const batchesArray = Array.isArray(data) ? data : ((data as any)?.batches || []);
      // Cast API response to component's Batch interface
      const batches = batchesArray as any[];

      // Filter out return batches (batch_code starts with "RET-")
      const productionBatches = batches.filter(batch => !batch.batch_code?.startsWith('RET-'));

      // For spare-piece-only batches, fetch actual counts
      const batchesWithCounts = await Promise.all(
        productionBatches.map(async (batch) => {
          // Only fetch details for spare-piece-only batches (piece_length exists AND total_items = 1)
          // If total_items > 1, it means there are bundles + spare pieces
          if (batch.piece_length && batch.total_items === 1) {
            try {
              const details = await production.getDetails(batch.id);
              return { ...batch, items: (details as any).items };
            } catch {
              return batch;
            }
          }
          return batch;
        })
      );

      setBatches(batchesWithCounts as any);
      setFilteredBatches(batchesWithCounts as any);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to fetch production history');
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchDetails = async (batchId: string) => {
    try {
      const data = await production.getDetails(batchId);
      // Cast API response to component's BatchDetails interface
      setSelectedBatch(data as any);
      setDetailsOpen(true);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to fetch batch details');
    }
  };

  const getStockTypeLabel = (type: string) => {
    switch (type) {
      case 'FULL_ROLL': return 'Full Roll';
      case 'CUT_ROLL': return 'Cut Roll';
      case 'BUNDLE': return 'Bundle';
      case 'SPARE':
      case 'SPARE_PIECES': return 'Spare Pieces';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_STOCK': return 'bg-green-100 text-green-800';
      case 'DISPATCHED': return 'bg-red-100 text-red-800';
      case 'PARTIALLY_DISPATCHED': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Batch #',
      'Batch Code',
      'Production Date',
      'Product Type',
      'Brand',
      'Parameters',
      'Quantity',
      'Piece Length',
      'Weight/Meter',
      'Total Weight',
      'Items',
      'Notes',
      'Created By',
      'Created At'
    ];

    const rows = (filteredBatches || []).map(b => [
      b.batch_no,
      b.batch_code,
      formatDate(b.production_date),
      b.product_type_name,
      b.brand_name,
      Object.entries(b.parameters).map(([k, v]) => `${k}:${v}`).join('; '),
      b.initial_quantity,
      b.piece_length || '',
      b.weight_per_meter || '',
      b.total_weight || '',
      b.total_items,
      b.notes || '',
      b.created_by_email,
      format(new Date(b.created_at), 'MMM dd, yyyy HH:mm')
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `production_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Production data exported to CSV');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Factory className="h-6 w-6" />
              <div>
                <div>Production History</div>
                <div className="text-sm font-normal text-muted-foreground">
                  {filteredBatches.length} {filteredBatches.length === 1 ? 'entry' : 'entries'}
                  {filteredBatches.length !== activeBatchCount && ` (filtered from ${activeBatchCount})`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={exportToCSV}
                disabled={loading || filteredBatches.length === 0}
                size="sm"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
              <Button onClick={fetchBatches} disabled={loading} size="sm">
                Refresh
              </Button>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search and Filters */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by batch code, number, product type, or brand..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {(timePreset !== 'all' || startDate || endDate) && (
                  <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    {(timePreset !== 'all' ? 1 : 0) + (startDate && endDate ? 1 : 0)}
                  </span>
                )}
              </Button>
              {(timePreset !== 'all' || startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTimePreset('all');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              )}
            </div>

            {/* Expanded Filters Panel */}
            {showFilters && (
              <div className="rounded-lg border bg-card p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Time Period Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="time-filter">Time Period</Label>
                    <Select
                      value={timePreset}
                      onValueChange={(value) => setTimePreset(value)}
                    >
                      <SelectTrigger id="time-filter">
                        <SelectValue placeholder="All Time" />
                      </SelectTrigger>
                      <SelectContent>
                        {timePresets.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Start Date */}
                  <div className="space-y-2">
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (timePreset !== 'all') setTimePreset('all');
                      }}
                    />
                  </div>

                  {/* End Date */}
                  <div className="space-y-2">
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        if (timePreset !== 'all') setTimePreset('all');
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading production history...</div>
          ) : filteredBatches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Factory className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No production batches found</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {paginatedBatches.map((batch) => (
                  <Card
                    key={batch.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => fetchBatchDetails(batch.id)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{batch.batch_code}</div>
                          <div className="text-xs text-muted-foreground">#{batch.batch_no}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {(() => {
                              const spareItem = batch.items?.find(item =>
                                item.stock_type === 'SPARE' || item.stock_type === 'SPARE_PIECES'
                              );
                              if (spareItem) {
                                const actualCount = spareItem.total_pieces ??
                                  (spareItem.spare_pieces?.[0]?.piece_count) ??
                                  spareItem.quantity ?? 0;
                                return `${actualCount} pcs`;
                              }
                              return `${batch.initial_quantity} ${batch.piece_length ? 'pcs' : 'm'}`;
                            })()}
                          </Badge>
                          {isAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBatch(batch);
                                setEditOpen(true);
                              }}
                              className="flex items-center gap-1 p-1 h-7"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{batch.product_type_name}</div>
                        <div className="text-xs text-muted-foreground">{batch.brand_name}</div>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatDate(batch.production_date)}</span>
                        <span>{batch.total_items} items</span>
                      </div>
                      {batch.total_weight && (
                        <div className="text-xs text-muted-foreground">
                          Weight: {batch.total_weight.toFixed(2)} kg
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        By: {batch.created_by_email}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch Code</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Production Date</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Weight</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Attachment</TableHead>
                      <TableHead>Created By</TableHead>
                      {isAdmin && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedBatches.map((batch) => (
                      <TableRow
                        key={batch.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => fetchBatchDetails(batch.id)}
                      >
                        <TableCell className="font-medium">
                          <div>{batch.batch_code}</div>
                          <div className="text-xs text-muted-foreground">#{batch.batch_no}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{batch.product_type_name}</div>
                          <div className="text-xs text-gray-500">{batch.brand_name}</div>
                          {batch.parameters && Object.keys(batch.parameters).length > 0 && (
                            <div className="text-xs text-gray-500">
                              {Object.entries(batch.parameters)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(', ')}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>{formatDate(batch.production_date)}</div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(batch.created_at), 'HH:mm')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {(() => {
                              const spareItem = batch.items?.find(item =>
                                item.stock_type === 'SPARE' || item.stock_type === 'SPARE_PIECES'
                              );
                              if (spareItem) {
                                const actualCount = spareItem.total_pieces ??
                                  (spareItem.spare_pieces?.[0]?.piece_count) ??
                                  spareItem.quantity ?? 0;
                                return `${actualCount} pcs`;
                              }
                              return `${batch.initial_quantity} ${batch.piece_length ? 'pcs' : 'm'}`;
                            })()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {batch.total_weight ? (
                            <div>
                              <div className="font-medium">{batch.total_weight.toFixed(2)} kg</div>
                              {batch.weight_per_meter && (
                                <div className="text-xs text-gray-500">
                                  {batch.weight_per_meter.toFixed(3)} kg/m
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{batch.total_items}</div>
                        </TableCell>
                        <TableCell>
                          {batch.attachment_url ? (
                            <a
                              href={`${API_URL}${batch.attachment_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Paperclip className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{batch.created_by_email}</div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBatch(batch);
                                setEditOpen(true);
                              }}
                              className="flex items-center gap-1"
                            >
                              <Pencil className="h-3 w-3" />
                              <span className="hidden sm:inline">Edit</span>
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToFirstPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                    <span className="ml-2 hidden sm:inline">First</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrevPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="ml-2 hidden sm:inline">Previous</span>
                  </Button>

                  <div className="flex items-center gap-2 px-4">
                    <span className="text-sm">
                      Page <span className="font-medium">{currentPage}</span> of{' '}
                      <span className="font-medium">{totalPages}</span>
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                  >
                    <span className="mr-2 hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToLastPage}
                    disabled={currentPage === totalPages}
                  >
                    <span className="mr-2 hidden sm:inline">Last</span>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Batch Details: {selectedBatch?.batch_code}
            </DialogTitle>
          </DialogHeader>

          {selectedBatch && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm text-gray-500">Batch Code</div>
                  <div className="font-medium">{selectedBatch.batch_code}</div>
                  <div className="text-xs text-gray-500">#{selectedBatch.batch_no}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Production Date</div>
                  <div className="font-medium">{formatDate(selectedBatch.production_date)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Product</div>
                  <div className="font-medium">
                    {selectedBatch.product_type_name} - {selectedBatch.brand_name}
                  </div>
                  {selectedBatch.parameters && Object.keys(selectedBatch.parameters).length > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      {Object.entries(selectedBatch.parameters)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ')}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-500">Quantity</div>
                  <div className="font-medium">
                    {(() => {
                      // For spare pieces, calculate actual total from stock items
                      const spareItem = selectedBatch.items?.find(item =>
                        item.stock_type === 'SPARE' || item.stock_type === 'SPARE_PIECES'
                      );
                      if (spareItem) {
                        // Use total_pieces if available, otherwise sum from spare_pieces array
                        const actualCount = spareItem.total_pieces ||
                          (spareItem.spare_pieces?.[0]?.piece_count) ||
                          spareItem.quantity || 0;
                        return `${actualCount} pcs`;
                      }
                      return `${selectedBatch.initial_quantity} ${selectedBatch.piece_length ? 'pcs' : 'm'}`;
                    })()}
                  </div>
                </div>
                {selectedBatch.total_weight && (
                  <div>
                    <div className="text-sm text-gray-500">Weight</div>
                    <div className="font-medium">{selectedBatch.total_weight.toFixed(2)} kg</div>
                    {selectedBatch.weight_per_meter && (
                      <div className="text-xs text-gray-500">
                        {selectedBatch.weight_per_meter.toFixed(3)} kg/m
                      </div>
                    )}
                  </div>
                )}
                {selectedBatch.piece_length && (
                  <div>
                    <div className="text-sm text-gray-500">Piece Length</div>
                    <div className="font-medium">{selectedBatch.piece_length} m</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-500">Created By</div>
                  <div className="font-medium">{selectedBatch.created_by_email}</div>
                  <div className="text-xs text-gray-500">
                    {formatDate(selectedBatch.created_at)}
                  </div>
                </div>
                {selectedBatch.notes && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-500">Notes</div>
                    <div className="text-sm">{selectedBatch.notes}</div>
                  </div>
                )}
                {selectedBatch.attachment_url && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-500 mb-1">Attachment</div>
                    <a
                      href={`${API_URL}${selectedBatch.attachment_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                    >
                      <Paperclip className="h-4 w-4" />
                      View Attachment
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Stock Items */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Stock Items ({selectedBatch.items?.length || 0})
                </h3>
                <div className="space-y-2">
                  {selectedBatch.items?.map((item, idx) => (
                    <div key={idx} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{getStockTypeLabel(item.stock_type)}</Badge>
                          </div>

                          {/* Full Roll Details */}
                          {item.stock_type === 'FULL_ROLL' && (
                            <div className="text-sm space-y-1">
                              <div>
                                <span className="font-medium">Quantity:</span> {item.quantity} rolls
                              </div>
                              {item.length_per_unit && (
                                <div>
                                  <span className="font-medium">Length per roll:</span> {item.length_per_unit}m
                                </div>
                              )}
                              {item.total_length && (
                                <div>
                                  <span className="font-medium">Total length:</span> {item.total_length}m
                                </div>
                              )}
                            </div>
                          )}

                          {/* Bundle Details */}
                          {item.stock_type === 'BUNDLE' && (
                            <div className="text-sm space-y-1">
                              <div>
                                <span className="font-medium">Quantity:</span> {item.quantity} bundles
                              </div>
                              {item.pieces_per_bundle && (
                                <div>
                                  <span className="font-medium">Pieces per bundle:</span> {item.pieces_per_bundle}
                                </div>
                              )}
                              {item.piece_length_meters && (
                                <div>
                                  <span className="font-medium">Piece length:</span> {item.piece_length_meters}m
                                </div>
                              )}
                              {item.total_pieces && (
                                <div>
                                  <span className="font-medium">Total pieces:</span> {item.total_pieces}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Cut Roll Details */}
                          {item.stock_type === 'CUT_ROLL' && item.cut_pieces && (
                            <div className="text-sm space-y-1">
                              <div>
                                <span className="font-medium">Cut pieces:</span> {item.cut_pieces.length}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {item.cut_pieces.map((piece, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {piece.length_meters}m
                                  </Badge>
                                ))}
                              </div>
                              {item.total_length && (
                                <div>
                                  <span className="font-medium">Total length:</span> {item.total_length}m
                                </div>
                              )}
                            </div>
                          )}

                          {/* Spare Pieces Details */}
                          {(item.stock_type === 'SPARE' || item.stock_type === 'SPARE_PIECES') && item.spare_pieces && (
                            <div className="text-sm space-y-1">
                              {item.spare_pieces.length > 1 ? (
                                <>
                                  <div>
                                    <span className="font-medium">Spare pieces by status:</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {item.spare_pieces.map((spare, i) => (
                                      <Badge key={i} variant="secondary" className="text-xs">
                                        {spare.status}: {spare.piece_count} pcs
                                        {spare.piece_length_meters && ` × ${spare.piece_length_meters}m`}
                                      </Badge>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <div>
                                  <span className="font-medium">Spare pieces:</span> {item.total_pieces ?? item.spare_pieces[0]?.piece_count ?? 0} pcs
                                  {item.spare_pieces[0]?.piece_length_meters && ` × ${item.spare_pieces[0].piece_length_meters}m`}
                                </div>
                              )}
                              {item.total_pieces && item.spare_pieces.length > 1 && (
                                <div>
                                  <span className="font-medium">Total pieces:</span> {item.total_pieces}
                                </div>
                              )}
                            </div>
                          )}

                          {item.notes && (
                            <div className="text-xs text-gray-500 mt-2">{item.notes}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="text-xs text-gray-500 pt-4 border-t">
                Last updated: {formatDate(selectedBatch.updated_at)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Production Dialog */}
      <EditProductionDialog
        batch={selectedBatch}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={fetchBatches}
        token={token || ''}
      />
    </>
  );
};
