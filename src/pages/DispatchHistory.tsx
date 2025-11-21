import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Search, Eye, TruckIcon, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DispatchAPI } from '@/components/dispatch/dispatchAPI';

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

const DispatchHistory = () => {
  const { token } = useAuth();
  const api = useMemo(() => new DispatchAPI(token || ''), [token]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [filteredDispatches, setFilteredDispatches] = useState<Dispatch[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchDetails | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
    if (!searchTerm.trim()) {
      setFilteredDispatches(dispatches);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = dispatches.filter(d =>
      d.dispatch_number.toLowerCase().includes(term) ||
      d.customer_name.toLowerCase().includes(term) ||
      d.invoice_number?.toLowerCase().includes(term) ||
      d.transport_name?.toLowerCase().includes(term) ||
      d.vehicle_driver?.toLowerCase().includes(term)
    );
    setFilteredDispatches(filtered);
  }, [searchTerm, dispatches]);

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TruckIcon className="h-6 w-6" />
              Dispatch History
            </div>
            <Button onClick={fetchDispatches} disabled={loading} size="sm">
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by dispatch number, customer, invoice, transport, or driver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
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
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dispatch #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Transport/Driver</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDispatches.map((dispatch) => (
                    <TableRow key={dispatch.id}>
                      <TableCell className="font-medium">
                        {dispatch.dispatch_number}
                      </TableCell>
                      <TableCell>{formatDate(dispatch.dispatch_date)}</TableCell>
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
                          <div>{dispatch.total_items} item(s)</div>
                          <div className="text-xs text-gray-500">Qty: {dispatch.total_quantity}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(dispatch.status)}>
                          {dispatch.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {dispatch.invoice_number || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchDispatchDetails(dispatch.id)}
                        >
                          <Eye className="h-4 w-4" />
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
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Dispatched Items ({selectedDispatch.items.length})
                </h3>
                <div className="space-y-2">
                  {selectedDispatch.items.map((item) => (
                    <div key={item.id} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium">
                            {item.product_type_name} - {item.brand_name}
                          </div>
                          <div className="text-sm text-gray-600">
                            Batch: {item.batch_code}
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
                            <div className="text-xs text-gray-500">{item.length_meters}m</div>
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

export default DispatchHistory;
