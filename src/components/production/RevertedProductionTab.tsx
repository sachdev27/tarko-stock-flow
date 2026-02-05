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
import { Search, Undo2, Package, Filter, X, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { production } from '@/lib/api-typed';
import { format } from 'date-fns';

interface RevertedBatch {
  id: string;
  batch_no: string;
  batch_code: string;
  production_date: string;
  initial_quantity: number;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, unknown>;
  notes?: string;
  weight_per_meter?: number;
  total_weight?: number;
  piece_length?: number;
  total_items: number;
  created_by_email: string;
  created_at: string;
  status: 'REVERTED';
  reverted_at?: string;
  reverted_by_email?: string;
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

interface BatchDetails extends RevertedBatch {
  attachment_url?: string;
  updated_at: string;
  items: StockItem[];
}

// Helper to get human-readable stock type labels
const getStockTypeLabel = (stockType: string): string => {
  const labels: Record<string, string> = {
    'FULL_ROLL': 'Full Roll',
    'CUT_ROLL': 'Cut Roll',
    'BUNDLE': 'Bundle',
    'SPARE': 'Spare Pieces',
    'SPARE_PIECES': 'Spare Pieces'
  };
  return labels[stockType] || stockType;
};

export const RevertedProductionTab = () => {
  const [batches, setBatches] = useState<RevertedBatch[]>([]);
  const [filteredBatches, setFilteredBatches] = useState<RevertedBatch[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetails | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    fetchRevertedBatches();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim() && (!startDate || !endDate)) {
      setFilteredBatches(batches);
      return;
    }

    let filtered = batches;

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

    // Date range filter (based on reverted_at if available, otherwise production_date)
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      filtered = filtered.filter(b => {
        const dateToCheck = b.reverted_at ? new Date(b.reverted_at) : new Date(b.production_date);
        return dateToCheck >= start && dateToCheck <= end;
      });
    }

    setFilteredBatches(filtered);
    setCurrentPage(1);
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

  const fetchRevertedBatches = async () => {
    setLoading(true);
    try {
      const data = await production.getHistory();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchesArray = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.batches || []) as any[];

      // Filter only reverted batches (excluding return batches)
      const revertedBatches = batchesArray.filter(
        (batch: Record<string, unknown>) => batch.status === 'REVERTED' && !(batch.batch_code as string)?.startsWith('RET-')
      ) as RevertedBatch[];

      setBatches(revertedBatches);
      setFilteredBatches(revertedBatches);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to fetch reverted production entries');
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchDetails = async (batchId: string) => {
    try {
      const data = await production.getDetails(batchId);
      setSelectedBatch(data as unknown as BatchDetails);
      setDetailsOpen(true);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to fetch batch details');
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
      'Reverted At',
      'Reverted By',
      'Created By',
    ];

    const rows = (filteredBatches || []).map(b => [
      b.batch_no,
      b.batch_code,
      formatDateStr(b.production_date),
      b.product_type_name,
      b.brand_name,
      Object.entries(b.parameters).map(([k, v]) => `${k}:${v}`).join('; '),
      b.initial_quantity,
      b.reverted_at ? format(new Date(b.reverted_at), 'MMM dd, yyyy HH:mm') : '',
      b.reverted_by_email || '',
      b.created_by_email,
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
    link.download = `reverted_production_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Reverted production data exported to CSV');
  };

  const formatDateStr = (dateStr: string) => {
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
              <Undo2 className="h-6 w-6" />
              <div>
                <div>Reverted Production</div>
                <div className="text-sm font-normal text-muted-foreground">
                  {filteredBatches.length} {filteredBatches.length === 1 ? 'entry' : 'entries'}
                  {filteredBatches.length !== batches.length && ` (filtered from ${batches.length})`}
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
              <Button onClick={fetchRevertedBatches} disabled={loading} size="sm">
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
            <div className="text-center py-8 text-gray-500">Loading reverted entries...</div>
          ) : filteredBatches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Undo2 className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No reverted production entries found</p>
              <p className="text-sm mt-1">Reverted production batches will appear here</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {paginatedBatches.map((batch) => (
                  <Card
                    key={batch.id}
                    className="cursor-pointer hover:shadow-md transition-shadow border-orange-200 bg-orange-50/30"
                    onClick={() => fetchBatchDetails(batch.id)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{batch.batch_code}</div>
                          <div className="text-xs text-muted-foreground">#{batch.batch_no}</div>
                        </div>
                        <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                          Reverted
                        </Badge>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{batch.product_type_name}</div>
                        <div className="text-xs text-muted-foreground">{batch.brand_name}</div>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Produced: {formatDateStr(batch.production_date)}</span>
                        <span>{batch.initial_quantity} {batch.piece_length ? 'pcs' : 'm'}</span>
                      </div>
                      {batch.reverted_at && (
                        <div className="text-xs text-orange-600">
                          Reverted: {format(new Date(batch.reverted_at), 'MMM dd, yyyy HH:mm')}
                          {batch.reverted_by_email && ` by ${batch.reverted_by_email}`}
                        </div>
                      )}
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
                      <TableHead>Reverted At</TableHead>
                      <TableHead>Reverted By</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedBatches.map((batch) => (
                      <TableRow
                        key={batch.id}
                        className="cursor-pointer hover:bg-orange-50/50"
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
                          <div>{formatDateStr(batch.production_date)}</div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(batch.created_at), 'HH:mm')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {batch.initial_quantity} {batch.piece_length ? 'pcs' : 'm'}
                          </div>
                          {batch.total_weight && (
                            <div className="text-xs text-gray-500">
                              {batch.total_weight.toFixed(2)} kg
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {batch.reverted_at ? (
                            <div>
                              <div>{formatDateStr(batch.reverted_at)}</div>
                              <div className="text-sm text-muted-foreground">
                                {format(new Date(batch.reverted_at), 'HH:mm')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {batch.reverted_by_email || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                            Reverted
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredBatches.length)} of {filteredBatches.length} entries
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToFirstPage}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToPrevPage}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToLastPage}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Batch Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Reverted Batch Details
            </DialogTitle>
          </DialogHeader>

          {selectedBatch && (
            <div className="space-y-6">
              {/* Batch Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Batch Code</Label>
                  <div className="font-medium">{selectedBatch.batch_code}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Batch Number</Label>
                  <div className="font-medium">#{selectedBatch.batch_no}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Product Type</Label>
                  <div className="font-medium">{selectedBatch.product_type_name}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Brand</Label>
                  <div className="font-medium">{selectedBatch.brand_name}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Production Date</Label>
                  <div className="font-medium">{formatDateStr(selectedBatch.production_date)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Initial Quantity</Label>
                  <div className="font-medium">
                    {selectedBatch.initial_quantity} {selectedBatch.piece_length ? 'pcs' : 'm'}
                  </div>
                </div>
                {selectedBatch.reverted_at && (
                  <>
                    <div>
                      <Label className="text-muted-foreground">Reverted At</Label>
                      <div className="font-medium text-orange-600">
                        {format(new Date(selectedBatch.reverted_at), 'MMM dd, yyyy HH:mm')}
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Reverted By</Label>
                      <div className="font-medium text-orange-600">
                        {selectedBatch.reverted_by_email || '-'}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Parameters */}
              {selectedBatch.parameters && Object.keys(selectedBatch.parameters).length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Parameters</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(selectedBatch.parameters).map(([key, value]) => (
                      <Badge key={key} variant="secondary">
                        {key}: {String(value)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedBatch.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <div className="mt-1 p-3 bg-muted rounded-md text-sm">
                    {selectedBatch.notes}
                  </div>
                </div>
              )}

              {/* Stock Items */}
              {selectedBatch.items && selectedBatch.items.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Stock Items ({selectedBatch.items.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedBatch.items.map((item, idx) => (
                      <div key={idx} className="p-3 border rounded-lg bg-orange-50/50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">{getStockTypeLabel(item.stock_type)}</Badge>
                              <Badge variant="secondary" className="text-orange-700 bg-orange-100">
                                Deleted
                              </Badge>
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
                              <div className="text-xs text-muted-foreground mt-2">{item.notes}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Badge */}
              <div className="flex justify-center">
                <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 text-lg px-4 py-2">
                  This production batch has been reverted
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
