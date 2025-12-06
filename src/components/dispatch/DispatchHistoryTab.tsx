import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Search, Eye, TruckIcon, Package, Filter, X, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DispatchAPI } from '@/components/dispatch/dispatchAPI';
import { format } from 'date-fns';

interface Dispatch {
  id: string;
  dispatch_number: string;
  dispatch_date: string;
  status: string;
  customer_name: string;
  customer_city?: string;
  bill_to_name?: string;
  transport_name?: string;
  vehicle_driver?: string;
  vehicle_number?: string;
  total_items: number;
  total_quantity: number;
  invoice_number?: string;
  notes?: string;
  created_by_email: string;
  created_at: string;
}

interface DispatchItem {
  id: string;
  item_type: string;
  quantity: number;
  length_meters?: number;
  piece_count?: number;
  bundle_size?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  batch_code: string;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, unknown>;
  notes?: string;
}

interface DispatchDetails extends Dispatch {
  items: DispatchItem[];
}

export const DispatchHistoryTab = () => {
  const { token } = useAuth();
  const api = useMemo(() => new DispatchAPI(token || ''), [token]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [filteredDispatches, setFilteredDispatches] = useState<Dispatch[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchDetails | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [timePreset, setTimePreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const totalPages = Math.ceil((filteredDispatches?.length || 0) / itemsPerPage);

  const paginatedDispatches = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return (filteredDispatches || []).slice(startIndex, endIndex);
  }, [filteredDispatches, currentPage]);

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

  const fetchDispatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDispatches();
      setDispatches(data);
      setFilteredDispatches(data);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to fetch dispatches');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (token) {
      fetchDispatches();
    }
  }, [token, fetchDispatches]);

  useEffect(() => {
    if (!searchTerm.trim() && (!startDate || !endDate)) {
      setFilteredDispatches(dispatches);
      return;
    }

    let filtered = dispatches;

    // Text search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(d =>
        d.dispatch_number.toLowerCase().includes(term) ||
        d.customer_name.toLowerCase().includes(term) ||
        d.invoice_number?.toLowerCase().includes(term) ||
        d.transport_name?.toLowerCase().includes(term) ||
        d.vehicle_driver?.toLowerCase().includes(term)
      );
    }

    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      filtered = filtered.filter(d => {
        const dispatchDate = new Date(d.dispatch_date);
        return dispatchDate >= start && dispatchDate <= end;
      });
    }

    setFilteredDispatches(filtered);
    setCurrentPage(1); // Reset to first page on filter change
  }, [searchTerm, dispatches, startDate, endDate]);

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

  const fetchDispatchDetails = async (dispatchId: string) => {
    try {
      const data = await api.getDispatchDetails(dispatchId);
      setSelectedDispatch(data);
      setDetailsOpen(true);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to fetch dispatch details');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'DISPATCHED': return 'bg-red-100 text-red-800';
      case 'DELIVERED': return 'bg-green-100 text-green-800';
      case 'CANCELLED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getItemTypeLabel = (type: string) => {
    switch (type) {
      case 'FULL_ROLL': return 'Full Roll';
      case 'CUT_PIECE': return 'Cut Piece';
      case 'BUNDLE': return 'Bundle';
      case 'SPARE_PIECES': return 'Spare Pieces';
      default: return type;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const exportToCSV = () => {
    const headers = [
      'Dispatch #',
      'Date',
      'Customer',
      'City',
      'Bill To',
      'Transport',
      'Driver',
      'Vehicle',
      'Invoice #',
      'Items',
      'Quantity',
      'Status',
      'Notes',
      'Created By',
      'Created At'
    ];

    const rows = filteredDispatches.map(d => [
      d.dispatch_number,
      formatDate(d.dispatch_date),
      d.customer_name,
      d.customer_city || '',
      d.bill_to_name || '',
      d.transport_name || '',
      d.vehicle_driver || '',
      d.vehicle_number || '',
      d.invoice_number || '',
      d.total_items,
      d.total_quantity,
      d.status,
      d.notes || '',
      d.created_by_email,
      format(new Date(d.created_at), 'MMM dd, yyyy HH:mm')
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
    link.download = `dispatches_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Dispatch data exported to CSV');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TruckIcon className="h-6 w-6" />
              Dispatch History
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={exportToCSV}
                disabled={loading || filteredDispatches.length === 0}
                size="sm"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
              <Button onClick={fetchDispatches} disabled={loading} size="sm">
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
                  placeholder="Search by dispatch number, customer, invoice, transport, or driver..."
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
            <div className="text-center py-8 text-gray-500">Loading dispatches...</div>
          ) : filteredDispatches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <TruckIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No dispatches found</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {paginatedDispatches.map((dispatch) => (
                  <Card
                    key={dispatch.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => fetchDispatchDetails(dispatch.id)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-sm">{dispatch.dispatch_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(dispatch.dispatch_date)}
                            {' '}{format(new Date(dispatch.created_at), 'HH:mm')}
                          </div>
                        </div>
                        <Badge className={getStatusColor(dispatch.status)}>
                          {dispatch.status}
                        </Badge>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{dispatch.customer_name}</div>
                        {dispatch.customer_city && (
                          <div className="text-xs text-muted-foreground">{dispatch.customer_city}</div>
                        )}
                      </div>
                      {dispatch.transport_name && (
                        <div className="text-xs text-muted-foreground">
                          Transport: {dispatch.transport_name}
                        </div>
                      )}
                      {dispatch.vehicle_driver && (
                        <div className="text-xs text-muted-foreground">
                          Driver: {dispatch.vehicle_driver}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Qty: {dispatch.total_quantity}
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
                      <TableHead>Dispatch #</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Transport/Driver</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDispatches.map((dispatch) => (
                    <TableRow
                      key={dispatch.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => fetchDispatchDetails(dispatch.id)}
                    >
                      <TableCell className="font-medium">
                        {dispatch.dispatch_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{formatDate(dispatch.dispatch_date)}</div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(dispatch.created_at), 'HH:mm')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{dispatch.customer_name}</div>
                          {dispatch.customer_city && (
                            <div className="text-xs text-gray-500">{dispatch.customer_city}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {dispatch.transport_name && (
                            <div>{dispatch.transport_name}</div>
                          )}
                          {dispatch.vehicle_driver && (
                            <div className="text-xs text-gray-500">{dispatch.vehicle_driver}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="text-xs text-gray-500">Qty: {dispatch.total_quantity}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(dispatch.status)}>
                          {dispatch.status}
                        </Badge>
                      </TableCell>
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
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TruckIcon className="h-5 w-5" />
              Dispatch Details: {selectedDispatch?.dispatch_number}
            </DialogTitle>
          </DialogHeader>

          {selectedDispatch && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm text-gray-500">Customer</div>
                  <div className="font-medium">{selectedDispatch.customer_name}</div>
                  {selectedDispatch.customer_city && (
                    <div className="text-sm text-gray-500">{selectedDispatch.customer_city}</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-500">Date</div>
                  <div className="font-medium">{formatDate(selectedDispatch.dispatch_date)}</div>
                </div>
                {selectedDispatch.bill_to_name && (
                  <div>
                    <div className="text-sm text-gray-500">Bill To</div>
                    <div className="font-medium">{selectedDispatch.bill_to_name}</div>
                  </div>
                )}
                {selectedDispatch.transport_name && (
                  <div>
                    <div className="text-sm text-gray-500">Transport</div>
                    <div className="font-medium">{selectedDispatch.transport_name}</div>
                  </div>
                )}
                {selectedDispatch.vehicle_driver && (
                  <div>
                    <div className="text-sm text-gray-500">Driver / Vehicle</div>
                    <div className="font-medium">{selectedDispatch.vehicle_driver}</div>
                    {selectedDispatch.vehicle_number && (
                      <div className="text-sm text-gray-500">{selectedDispatch.vehicle_number}</div>
                    )}
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-500">Status</div>
                  <Badge className={getStatusColor(selectedDispatch.status)}>
                    {selectedDispatch.status}
                  </Badge>
                </div>
                {selectedDispatch.invoice_number && (
                  <div>
                    <div className="text-sm text-gray-500">Invoice Number</div>
                    <div className="font-medium">{selectedDispatch.invoice_number}</div>
                  </div>
                )}
                {selectedDispatch.notes && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-500">Notes</div>
                    <div className="text-sm">{selectedDispatch.notes}</div>
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                {(() => {
                  // Group items by product variant, type, and specs (ignoring batch)
                  const grouped = selectedDispatch.items.reduce((acc: any, item: any) => {
                    const paramStr = JSON.stringify(item.parameters || {});
                    // Include piece_count to distinguish spare pieces from bundles with same parameters
                    const key = `${item.product_variant_id}-${item.item_type}-${Number(item.length_meters || 0)}-${item.bundle_size || ''}-${item.piece_count || ''}-${item.piece_length_meters || ''}-${paramStr}`;

                    if (!acc[key]) {
                      acc[key] = {
                        ...item,
                        quantity: 0,
                        batches: []
                      };
                    }
                    acc[key].quantity += item.quantity || 0;
                    if (!acc[key].batches.includes(item.batch_code)) {
                      acc[key].batches.push(item.batch_code);
                    }
                    return acc;
                  }, {});

                  const groupedItems = Object.values(grouped);

                  return (
                    <>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Dispatched Items ({groupedItems.length})
                      </h3>
                      <div className="space-y-2">
                        {groupedItems.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium">
                            {item.product_type_name} - {item.brand_name}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {Object.entries(item.parameters).map(([key, value]) => (
                              <span key={key} className="mr-3">
                                {key}: {String(value)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">{getItemTypeLabel(item.item_type)}</Badge>
                          <div className="text-sm font-medium mt-1">Qty: {item.quantity}</div>
                          {item.length_meters && (
                            item.item_type === 'FULL_ROLL' && item.quantity > 1 ? (
                              <>
                                <div className="text-xs text-gray-500">Total: {(item.length_meters * item.quantity).toFixed(1)}m</div>
                                <div className="text-xs text-gray-500">Per roll: {item.length_meters}m</div>
                              </>
                            ) : (
                              <div className="text-xs text-gray-500">{item.length_meters}m</div>
                            )
                          )}
                          {item.piece_count && (
                            <div className="text-xs text-gray-500">{item.piece_count} pieces</div>
                          )}
                          {item.bundle_size && (
                            <div className="text-xs text-gray-500">
                              Bundle: {item.bundle_size} × {item.piece_length_meters}m
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="text-xs text-gray-500 pt-4 border-t">
                Created by {selectedDispatch.created_by_email} on {formatDate(selectedDispatch.created_at)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
