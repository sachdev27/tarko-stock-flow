import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { PackageX, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { format } from 'date-fns';
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

  // Detail dialog
  const [selectedReturn, setSelectedReturn] = useState<ReturnDetail | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (token) {
      fetchReturns();
    }
  }, [token]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredReturns(returns);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = returns.filter((ret) =>
      ret.return_number.toLowerCase().includes(query) ||
      ret.customer_name.toLowerCase().includes(query) ||
      ret.customer_city?.toLowerCase().includes(query)
    );
    setFilteredReturns(filtered);
  }, [searchQuery, returns]);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const response = await api.get('/returns/history');
      setReturns(response.data.returns || []);
    } catch (error) {
      toast.error('Failed to fetch returns');
    } finally {
      setLoading(false);
    }
  };

  const fetchReturnDetails = async (returnId: string) => {
    try {
      const response = await api.get(`/returns/${returnId}`);
      setSelectedReturn(response.data);
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

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-6">
        <PackageX className="h-8 w-8 text-orange-600" />
        <h1 className="text-3xl font-bold">Return History</h1>
      </div>

      {/* Search Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by return number, customer name, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((ret) => (
                    <TableRow key={ret.id}>
                      <TableCell className="font-medium">
                        {ret.return_number}
                      </TableCell>
                      <TableCell>
                        {format(new Date(ret.return_date), 'MMM dd, yyyy')}
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
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fetchReturnDetails(ret.id)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
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

                          <div className="text-sm text-muted-foreground">
                            Quantity: {item.quantity}
                          </div>

                          {item.rolls && item.rolls.length > 0 && (
                            <div className="text-sm">
                              <span className="font-medium">Rolls:</span>{' '}
                              {item.rolls.map((r, i) => (
                                <span key={i}>
                                  {r.length_meters}m
                                  {i < item.rolls!.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </div>
                          )}

                          {item.bundles && item.bundles.length > 0 && (
                            <div className="text-sm">
                              <span className="font-medium">Bundles:</span>{' '}
                              {item.bundles.map((b, i) => (
                                <span key={i}>
                                  {b.bundle_size} pcs × {b.piece_length_meters}m
                                  {i < item.bundles!.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </div>
                          )}

                          {item.piece_count && (
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
