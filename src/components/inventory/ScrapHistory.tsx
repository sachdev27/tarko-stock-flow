import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
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
import { Search, Trash2, Package, Filter, X } from 'lucide-react';
import { scrap as scrapAPI } from '@/lib/api';
import { format } from 'date-fns';

interface Scrap {
  id: string;
  scrap_number: string;
  scrap_date: string;
  reason: string;
  status: string;
  total_quantity: number;
  estimated_loss: number | null;
  notes?: string;
  total_items: number;
  total_batches: number;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

interface ScrapItem {
  id: string;
  stock_id: string;
  stock_type: string;
  quantity_scrapped: number;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  original_quantity: number;
  original_status: string;
  estimated_value?: number;
  item_notes?: string;
  batch_code: string;
  batch_no: string;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, unknown>;
  pieces?: Array<{
    id: string;
    piece_type: string;
    length_meters?: number;
    piece_count?: number;
    piece_length_meters?: number;
  }>;
}

interface ScrapDetails extends Scrap {
  items: ScrapItem[];
}

interface ScrapHistoryProps {
  embedded?: boolean;
}

const ScrapHistory = ({ embedded = false }: ScrapHistoryProps) => {
  const [scraps, setScraps] = useState<Scrap[]>([]);
  const [filteredScraps, setFilteredScraps] = useState<Scrap[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedScrap, setSelectedScrap] = useState<ScrapDetails | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [timePreset, setTimePreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const timePresets = [
    { label: 'All Time', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'Last 7 Days', value: '7days' },
    { label: 'Last 30 Days', value: '30days' },
    { label: 'This Month', value: 'month' },
    { label: 'Last Month', value: 'lastmonth' },
  ];

  const statusOptions = [
    { label: 'All Statuses', value: 'all' },
    { label: 'Scrapped', value: 'SCRAPPED' },
    { label: 'Disposed', value: 'DISPOSED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  useEffect(() => {
    fetchScraps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterScraps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, scraps]);

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

  const filterScraps = () => {
    let filtered = [...scraps];

    // Text search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.scrap_number.toLowerCase().includes(term) ||
          s.reason.toLowerCase().includes(term) ||
          s.notes?.toLowerCase().includes(term)
      );
    }

    setFilteredScraps(filtered);
  };

  const fetchScraps = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (reasonFilter) params.reason = reasonFilter;
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;

      const { data } = await scrapAPI.getHistory(params);
      setScraps(data.scraps || []);
      setFilteredScraps(data.scraps || []);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to fetch scrap history');
    } finally {
      setLoading(false);
    }
  };

  const fetchScrapDetails = async (scrapId: string) => {
    try {
      const { data } = await scrapAPI.getDetails(scrapId);
      setSelectedScrap(data);
      setDetailsOpen(true);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to fetch scrap details');
    }
  };

  const getStockTypeLabel = (type: string) => {
    switch (type) {
      case 'FULL_ROLL': return 'Full Roll';
      case 'CUT_ROLL': return 'Cut Roll';
      case 'BUNDLE': return 'Bundle';
      case 'SPARE': return 'Spare Pieces';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCRAPPED': return 'bg-red-100 text-red-800';
      case 'DISPOSED': return 'bg-gray-100 text-gray-800';
      case 'CANCELLED': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const applyFilters = () => {
    fetchScraps();
  };

  const clearFilters = () => {
    setTimePreset('all');
    setStartDate('');
    setEndDate('');
    setReasonFilter('');
    setStatusFilter('all');
    fetchScraps();
  };

  const content = (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Trash2 className="h-8 w-8" />
              Scrap History
            </h1>
            <p className="text-muted-foreground mt-1">
              View and track scrapped inventory items
            </p>
          </div>
          <Button onClick={fetchScraps} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      )}

      <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              Search & Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Search Bar */}
            <Input
              placeholder="Search by scrap number, reason, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9"
            />

            {/* Filter Toggle */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                <span>Filters</span>
                {(timePreset !== 'all' || reasonFilter || statusFilter !== 'all') && (
                  <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    {[timePreset !== 'all' ? 1 : 0, reasonFilter ? 1 : 0, statusFilter !== 'all' ? 1 : 0].reduce(
                      (a, b) => a + b,
                      0
                    )}
                  </span>
                )}
              </Button>
              {(timePreset !== 'all' || reasonFilter || statusFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>

            {/* Expanded Filters */}
            {showFilters && (
              <div className="rounded-lg border bg-card p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Time Period */}
                  <div className="space-y-2">
                    <Label>Time Period</Label>
                    <Select value={timePreset} onValueChange={(value) => setTimePreset(value)}>
                      <SelectTrigger>
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

                  {/* Status */}
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
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
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (timePreset !== 'all') setTimePreset('all');
                      }}
                    />
                  </div>

                  {/* End Date */}
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        if (timePreset !== 'all') setTimePreset('all');
                      }}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={clearFilters}>
                    Clear All
                  </Button>
                  <Button onClick={applyFilters}>Apply Filters</Button>
                </div>
              </div>
            )}

            {/* Results Count */}
            <div className="text-xs text-muted-foreground">
              Showing {filteredScraps.length} scrap records
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        {loading ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">Loading scrap history...</div>
            </CardContent>
          </Card>
        ) : filteredScraps.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Trash2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No scrap records found</h3>
                <p className="text-muted-foreground">
                  {scraps.length === 0
                    ? 'No scrap history available'
                    : 'Try adjusting your filters'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {/* Mobile Card View */}
              <div className="md:hidden p-4 space-y-3">
                {filteredScraps.map((scrap) => (
                  <Card
                    key={scrap.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => fetchScrapDetails(scrap.id)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-sm">{scrap.scrap_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(scrap.scrap_date)}
                            {' '}{format(new Date(scrap.created_at), 'HH:mm')}
                          </div>
                        </div>
                        <Badge className={getStatusColor(scrap.status)}>
                          {scrap.status}
                        </Badge>
                      </div>
                      <div className="text-sm">
                        <div className="font-medium">Reason:</div>
                        <div className="text-muted-foreground truncate">{scrap.reason}</div>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{scrap.total_items} items ({scrap.total_batches} batches)</span>
                        <span className="font-medium">Qty: {scrap.total_quantity}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        By: {scrap.created_by_email}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scrap Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Created By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredScraps.map((scrap) => (
                    <TableRow
                      key={scrap.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => fetchScrapDetails(scrap.id)}
                    >
                      <TableCell className="font-medium">{scrap.scrap_number}</TableCell>
                      <TableCell>
                        <div>{formatDate(scrap.scrap_date)}</div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(scrap.created_at), 'HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate">{scrap.reason}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(scrap.status)}>{scrap.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {scrap.total_quantity}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {scrap.total_items} items
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {scrap.total_batches} batches
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{scrap.created_by_email}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </CardContent>
          </Card>
        )}

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Scrap Details: {selectedScrap?.scrap_number}
            </DialogTitle>
          </DialogHeader>

          {selectedScrap && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm text-gray-500">Scrap Number</div>
                  <div className="font-medium">{selectedScrap.scrap_number}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Scrap Date</div>
                  <div className="font-medium">{formatDate(selectedScrap.scrap_date)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Reason</div>
                  <div className="font-medium">{selectedScrap.reason}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Status</div>
                  <Badge className={getStatusColor(selectedScrap.status)}>
                    {selectedScrap.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Total Quantity</div>
                  <div className="font-medium">{selectedScrap.total_quantity}</div>
                </div>
                {selectedScrap.estimated_loss && (
                  <div>
                    <div className="text-sm text-gray-500">Estimated Loss</div>
                    <div className="font-medium text-red-600">
                      {formatCurrency(selectedScrap.estimated_loss)}
                    </div>
                  </div>
                )}
                <div className="col-span-2">
                  <div className="text-sm text-gray-500">Created By</div>
                  <div className="font-medium">{selectedScrap.created_by_email}</div>
                  <div className="text-xs text-gray-500">
                    {formatDate(selectedScrap.created_at)}
                  </div>
                </div>
                {selectedScrap.notes && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-500">Notes</div>
                    <div className="text-sm">{selectedScrap.notes}</div>
                  </div>
                )}
              </div>

              {/* Scrap Items */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Scrapped Items ({(() => {
                    // Group items by stock_type, length/size, and parameters to consolidate display
                    const grouped = selectedScrap.items.reduce((acc: Record<string, any>, item: ScrapItem) => {
                      const paramStr = JSON.stringify(item.parameters || {});
                      const key = `${item.stock_type}-${item.length_per_unit || ''}-${item.pieces_per_bundle || ''}-${item.piece_length_meters || ''}-${paramStr}`;

                      if (!acc[key]) {
                        acc[key] = {
                          ...item,
                          quantity_scrapped: 0,
                          batch_codes: [],
                          batch_nos: [],
                          pieces: [],
                          estimated_values: []
                        };
                      }
                      acc[key].quantity_scrapped += item.quantity_scrapped || 0;

                      // Collect batch info
                      if (item.batch_code && !acc[key].batch_codes.includes(item.batch_code)) {
                        acc[key].batch_codes.push(item.batch_code);
                      }
                      if (item.batch_no && !acc[key].batch_nos.includes(item.batch_no)) {
                        acc[key].batch_nos.push(item.batch_no);
                      }

                      // Aggregate pieces for CUT_ROLL/SPARE
                      if (item.pieces && Array.isArray(item.pieces)) {
                        acc[key].pieces.push(...item.pieces);
                      }

                      // Sum estimated values
                      if (item.estimated_value) {
                        acc[key].estimated_values.push(item.estimated_value);
                      }

                      return acc;
                    }, {});

                    return Object.keys(grouped).length;
                  })()})
                </h3>
                <div className="space-y-2">
                  {(() => {
                    // Group items by stock_type, length/size, and parameters to consolidate display
                    const grouped = selectedScrap.items.reduce((acc: Record<string, any>, item: ScrapItem) => {
                      const paramStr = JSON.stringify(item.parameters || {});
                      const key = `${item.stock_type}-${item.length_per_unit || ''}-${item.pieces_per_bundle || ''}-${item.piece_length_meters || ''}-${paramStr}`;

                      if (!acc[key]) {
                        acc[key] = {
                          ...item,
                          quantity_scrapped: 0,
                          batch_codes: [],
                          batch_nos: [],
                          pieces: [],
                          estimated_values: []
                        };
                      }
                      acc[key].quantity_scrapped += item.quantity_scrapped || 0;

                      // Collect batch info
                      if (item.batch_code && !acc[key].batch_codes.includes(item.batch_code)) {
                        acc[key].batch_codes.push(item.batch_code);
                      }
                      if (item.batch_no && !acc[key].batch_nos.includes(item.batch_no)) {
                        acc[key].batch_nos.push(item.batch_no);
                      }

                      // Aggregate pieces for CUT_ROLL/SPARE
                      if (item.pieces && Array.isArray(item.pieces)) {
                        acc[key].pieces.push(...item.pieces);
                      }

                      // Sum estimated values
                      if (item.estimated_value) {
                        acc[key].estimated_values.push(item.estimated_value);
                      }

                      return acc;
                    }, {});

                    return Object.values(grouped).map((item: any, idx: number) => {
                      // Calculate total estimated value
                      const totalEstimatedValue = item.estimated_values.length > 0
                        ? item.estimated_values.reduce((sum: number, val: number) => sum + val, 0)
                        : null;

                      return (
                    <div key={idx} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{getStockTypeLabel(item.stock_type)}</Badge>
                            <span className="text-sm font-medium">
                              {item.product_type_name} - {item.brand_name}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            Batch{item.batch_codes.length > 1 ? 'es' : ''}: {item.batch_codes.map((bc: string, i: number) => {
                              const batchNo = item.batch_nos[i];
                              return `${bc} (#${batchNo})`;
                            }).join(', ')}
                          </div>
                          {item.parameters && Object.keys(item.parameters).length > 0 && (
                            <div className="text-xs text-gray-500">
                              {Object.entries(item.parameters)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(', ')}
                            </div>
                          )}
                        </div>
                        {totalEstimatedValue && (
                          <div className="text-right">
                            <div className="text-sm font-medium text-red-600">
                              {formatCurrency(totalEstimatedValue)}
                            </div>
                            <div className="text-xs text-gray-500">Est. Value</div>
                          </div>
                        )}
                      </div>

                      <div className="text-sm space-y-1">
                        <div>
                          <span className="font-medium">Quantity Scrapped:</span>{' '}
                          {item.quantity_scrapped}
                        </div>
                        {item.stock_type === 'FULL_ROLL' && item.length_per_unit && (
                          <div>
                            <span className="font-medium">Length per roll:</span>{' '}
                            {item.length_per_unit}m
                          </div>
                        )}
                        {item.stock_type === 'BUNDLE' && (
                          <>
                            {item.pieces_per_bundle && (
                              <div>
                                <span className="font-medium">Pieces per bundle:</span>{' '}
                                {item.pieces_per_bundle}
                              </div>
                            )}
                            {item.piece_length_meters && (
                              <div>
                                <span className="font-medium">Piece length:</span>{' '}
                                {item.piece_length_meters}m
                              </div>
                            )}
                          </>
                        )}

                        {/* Show pieces for CUT_ROLL and SPARE */}
                        {item.pieces && item.pieces.length > 0 && (
                          <div className="mt-2">
                            <div className="font-medium mb-1">Pieces scrapped:</div>
                            <div className="flex flex-wrap gap-1">
                              {item.pieces.map((piece: any, i: number) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {piece.piece_type === 'CUT_PIECE'
                                    ? `${piece.length_meters}m`
                                    : `${piece.piece_count} pcs`}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {item.item_notes && (
                          <div className="text-xs text-gray-500 mt-2">{item.item_notes}</div>
                        )}
                      </div>
                    </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  return embedded ? content : <Layout>{content}</Layout>;
};

export default ScrapHistory;
