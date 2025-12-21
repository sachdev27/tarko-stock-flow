import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { PackageX, Search, Filter, X, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { returns as returnsAPI } from '@/lib/api-typed';
import { format } from 'date-fns';
import type * as API from '@/types';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Return {
  id: string;
  return_number: string;
  return_date: string;
  status: string;
  customer_name: string;
  customer_city?: string;
  item_count: number;
  total_quantity: number;
  notes?: string;
  created_at: string;
}

interface ReturnDetail {
  id: string;
  return_number: string;
  return_date: string;
  status: string;
  notes?: string;
  customer: {
    name: string;
    city?: string;
    phone?: string;
    address?: string;
  };
  items: Array<{
    product_type_name: string;
    brand_name: string;
    item_type: string;
    quantity: number;
    length_meters?: number;
    bundle_size?: number;
    piece_count?: number;
    piece_length_meters?: number;
    parameters?: Record<string, string | number>;
    rolls?: Array<{ length_meters: number }>;
    bundles?: Array<{ bundle_size: number; piece_length_meters: number }>;
  }>;
}

const ReturnHistory = () => {
  const { token } = useAuth();

  const [returns, setReturns] = useState<Return[]>([]);
  const [filteredReturns, setFilteredReturns] = useState<Return[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [timePreset, setTimePreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Detail dialog
  const [selectedReturn, setSelectedReturn] = useState<ReturnDetail | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const totalPages = Math.ceil((filteredReturns?.length || 0) / itemsPerPage);

  const paginatedReturns = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return (filteredReturns || []).slice(startIndex, endIndex);
  }, [filteredReturns, currentPage]);

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
    if (token) {
      fetchReturns();
    }
  }, [token]);

  useEffect(() => {
    if (!searchQuery.trim() && (!startDate || !endDate)) {
      setFilteredReturns(returns);
      return;
    }

    let filtered = returns;

    // Text search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((ret) =>
        ret.return_number.toLowerCase().includes(query) ||
        ret.customer_name.toLowerCase().includes(query) ||
        ret.customer_city?.toLowerCase().includes(query)
      );
    }

    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      filtered = filtered.filter(ret => {
        const returnDate = new Date(ret.return_date);
        return returnDate >= start && returnDate <= end;
      });
    }

    setFilteredReturns(filtered);
    setCurrentPage(1); // Reset to first page on filter change
  }, [searchQuery, returns, startDate, endDate]);

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

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const response = await returnsAPI.getHistory();
      // Backend returns { returns: [...] } structure
      // Handle both wrapped and unwrapped responses
      const returnsData = (response as any)?.returns || (Array.isArray(response) ? response : []);
      setReturns(returnsData);
    } catch (error) {
      toast.error('Failed to fetch returns');
    } finally {
      setLoading(false);
    }
  };

  const fetchReturnDetails = async (returnId: string) => {
    try {
      const response = await returnsAPI.getDetails(returnId);
      setSelectedReturn(response);
      setDetailsOpen(true);
    } catch (error) {
      toast.error('Failed to fetch return details');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return 'bg-blue-100 text-blue-800';
      case 'INSPECTED':
        return 'bg-yellow-100 text-yellow-800';
      case 'RESTOCKED':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatItemType = (type: string) => {
    return type.replace('_', ' ');
  };

  const exportToCSV = () => {
    const headers = [
      'Return #',
      'Date',
      'Customer',
      'City',
      'Items',
      'Quantity',
      'Status',
      'Notes',
      'Created At'
    ];

    const rows = filteredReturns.map(r => [
      r.return_number,
      format(new Date(r.return_date), 'MMM dd, yyyy'),
      r.customer_name,
      r.customer_city || '',
      r.item_count,
      r.total_quantity,
      r.status,
      r.notes || '',
      format(new Date(r.created_at), 'MMM dd, yyyy HH:mm')
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
    link.download = `returns_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Return data exported to CSV');
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <PackageX className="h-8 w-8 text-orange-600" />
          <h1 className="text-3xl font-bold">Return History</h1>
        </div>
        <Button
          variant="outline"
          onClick={exportToCSV}
          disabled={loading || filteredReturns.length === 0}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export CSV</span>
        </Button>
      </div>

      {/* Search and Filter Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search */}
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by return number, customer name, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button
                variant={showFilters ? 'default' : 'outline'}
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? <X className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
              </Button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Time Range</Label>
                  <Select value={timePreset} onValueChange={setTimePreset}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time range" />
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
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setTimePreset('');
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setTimePreset('');
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Returns Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Returns ({filteredReturns.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading returns...
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'No returns found matching your search' : 'No returns yet'}
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {paginatedReturns.map((ret) => (
                  <Card
                    key={ret.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleViewDetails(ret.id)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-sm">{ret.return_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(ret.return_date), 'dd MMM yyyy, HH:mm')}
                          </div>
                        </div>
                        <Badge
                          variant={ret.status === 'completed' ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {ret.status}
                        </Badge>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{ret.customer_name}</div>
                        {ret.customer_city && (
                          <div className="text-xs text-muted-foreground">{ret.customer_city}</div>
                        )}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{ret.item_count} items</span>
                        <span>Qty: {ret.total_quantity}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return #</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedReturns.map((ret) => (
                    <TableRow
                      key={ret.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => fetchReturnDetails(ret.id)}
                    >
                      <TableCell className="font-medium">
                        {ret.return_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{format(new Date(ret.return_date), 'MMM dd, yyyy')}</div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(ret.created_at), 'HH:mm')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{ret.customer_name}</div>
                          {ret.customer_city && (
                            <div className="text-sm text-muted-foreground">
                              {ret.customer_city}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{ret.item_count}</TableCell>
                      <TableCell>{ret.total_quantity}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(ret.status)}>
                          {ret.status}
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

      {/* Return Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Return Details</DialogTitle>
            <DialogDescription>
              {selectedReturn?.return_number}
            </DialogDescription>
          </DialogHeader>

          {selectedReturn && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Date</div>
                  <div>{format(new Date(selectedReturn.return_date), 'PPP')}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                  <Badge className={getStatusColor(selectedReturn.status)}>
                    {selectedReturn.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Customer</div>
                  <div>{selectedReturn.customer.name}</div>
                  {selectedReturn.customer.city && (
                    <div className="text-sm text-muted-foreground">
                      {selectedReturn.customer.city}
                    </div>
                  )}
                </div>
                {selectedReturn.customer.phone && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Phone</div>
                    <div>{selectedReturn.customer.phone}</div>
                  </div>
                )}
              </div>

              {selectedReturn.notes && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Notes</div>
                  <div className="p-3 bg-muted rounded-md">{selectedReturn.notes}</div>
                </div>
              )}

              {/* Items */}
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">
                  Returned Items
                </div>
                <div className="space-y-3">
                  {selectedReturn.items.map((item, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">
                              {item.product_type_name} - {item.brand_name}
                            </div>
                            <Badge variant="outline">
                              {formatItemType(item.item_type)}
                            </Badge>
                          </div>

                          {item.parameters && Object.keys(item.parameters).length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium">Parameters:</span>{' '}
                              {Object.entries(item.parameters)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(', ')}
                            </div>
                          )}

                          <div className="text-sm text-muted-foreground">
                            Quantity: {item.quantity}
                          </div>

                          {item.rolls && item.rolls.length > 0 && (
                            <div className="text-sm">
                              <span className="font-medium">Rolls:</span>{' '}
                              {item.quantity} × {item.rolls[0].length_meters}m
                            </div>
                          )}

                          {item.bundles && item.bundles.length > 0 && (
                            <div className="text-sm">
                              <span className="font-medium">Bundles:</span>{' '}
                              {item.quantity} × ({item.bundles[0].bundle_size} pcs × {item.bundles[0].piece_length_meters}m)
                            </div>
                          )}

                          {item.item_type === 'SPARE_PIECES' && item.piece_count && (
                            <div className="text-sm">
                              <span className="font-medium">Spare Pieces:</span>{' '}
                              {item.piece_count} pcs × {item.piece_length_meters}m
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReturnHistory;
