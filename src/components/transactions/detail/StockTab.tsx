import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TransactionRecord } from '@/types/transaction';
import { Box } from 'lucide-react';

interface StockTabProps {
  transaction: TransactionRecord;
  isScrap: boolean;
}

export function StockTab({ transaction, isScrap }: StockTabProps) {
  // Aggregate spare pieces stock entries before displaying
  const aggregateStockEntries = (entries: any[]) => {
    const aggregated: any[] = [];
    const spareGroups = new Map<string, any[]>();

    entries.forEach((entry) => {
      if (entry.stock_type === 'SPARE' || entry.stock_type === 'SPARE_PIECES') {
        // Group spare pieces by piece_length and status
        const key = `${entry.stock_type}-${entry.piece_length_meters || 0}-${entry.status || 'IN_STOCK'}`;
        if (!spareGroups.has(key)) {
          spareGroups.set(key, []);
        }
        spareGroups.get(key)!.push(entry);
      } else {
        // Non-spare entries go through as-is
        aggregated.push(entry);
      }
    });

    // Convert aggregated spare groups to single entries
    spareGroups.forEach((entries) => {
      const totalPieces = entries.reduce((sum, e) => sum + (e.spare_piece_count || e.quantity || 1), 0);
      const template = entries[0];
      aggregated.push({
        ...template,
        quantity: entries.length, // Number of stock records
        spare_piece_count: totalPieces, // Total pieces
      });
    });

    return aggregated;
  };

  const stockEntries = transaction.roll_snapshot?.stock_entries
    ? aggregateStockEntries(transaction.roll_snapshot.stock_entries)
    : [];

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Box className="h-5 w-5" />
            {isScrap ? 'Scrapped Items' : 'Stock Details'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stockEntries.length > 0 ? (
            <div className="space-y-2">
              {stockEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="font-medium text-lg">
                      {entry.stock_type === 'SPARE' || entry.stock_type === 'SPARE_PIECES' ? (
                        // Show actual piece count for spares
                        <>{entry.spare_piece_count || entry.quantity} pcs × {entry.stock_type.replace('_', ' ')}</>
                      ) : (
                        <>{entry.quantity} × {entry.stock_type.replace('_', ' ')}</>
                      )}
                    </div>
                    <Badge variant={entry.status === 'IN_STOCK' ? 'default' : 'secondary'}>
                      {entry.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {entry.length_per_unit && (
                      <div>
                        <span className="text-muted-foreground">Length per unit:</span>
                        <span className="ml-2 font-medium">{Number(entry.length_per_unit).toFixed(2)}m</span>
                      </div>
                    )}
                    {entry.pieces_per_bundle && (
                      <div>
                        <span className="text-muted-foreground">Pieces per bundle:</span>
                        <span className="ml-2 font-medium">{entry.pieces_per_bundle}</span>
                      </div>
                    )}
                    {entry.piece_length_meters && (
                      <div>
                        <span className="text-muted-foreground">Piece length:</span>
                        <span className="ml-2 font-medium">{Number(entry.piece_length_meters).toFixed(2)}m</span>
                      </div>
                    )}
                    {entry.cut_piece_lengths && entry.cut_piece_lengths.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Cut pieces:</span>
                        <div className="ml-2 mt-1 flex flex-wrap gap-1">
                          {entry.cut_piece_lengths.map((length, idx) => (
                            <span key={idx} className="text-xs bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded">
                              {length.toFixed(2)}m
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Calculate total meters and weight for this entry */}
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="text-sm font-medium">
                      {entry.stock_type === 'FULL_ROLL' ? (
                        <>Total: {(entry.quantity * (entry.length_per_unit || 0)).toFixed(2)}m</>
                      ) : entry.stock_type === 'BUNDLE' ? (
                        <>Total: {(entry.quantity * (entry.pieces_per_bundle || 0) * (entry.piece_length_meters || 0)).toFixed(2)}m ({entry.quantity * (entry.pieces_per_bundle || 0)} pieces)</>
                      ) : (entry.stock_type === 'SPARE_PIECES' || entry.stock_type === 'SPARE') ? (
                        <>Total: {((entry.spare_piece_count || entry.quantity) * (entry.piece_length_meters || 0)).toFixed(2)}m ({entry.spare_piece_count || entry.quantity} piece{(entry.spare_piece_count || entry.quantity) !== 1 ? 's' : ''})</>
                      ) : entry.stock_type === 'CUT_ROLL' && entry.cut_piece_lengths ? (
                        <>Total: {entry.cut_piece_lengths.reduce((sum, len) => sum + len, 0).toFixed(2)}m ({entry.cut_piece_lengths.length} cut piece{entry.cut_piece_lengths.length !== 1 ? 's' : ''})</>
                      ) : null}
                    </div>
                    {transaction.weight_per_meter && typeof transaction.weight_per_meter === 'number' && (
                      <div className="text-sm text-muted-foreground">
                        {entry.stock_type === 'FULL_ROLL' ? (
                          <>Weight: {(entry.quantity * (entry.length_per_unit || 0) * transaction.weight_per_meter).toFixed(2)} kg
                            <span className="text-xs ml-1">({entry.quantity} rolls × {(entry.length_per_unit || 0).toFixed(2)}m × {transaction.weight_per_meter.toFixed(3)} kg/m)</span>
                          </>
                        ) : entry.stock_type === 'BUNDLE' ? (
                          <>Weight: {(entry.quantity * (entry.pieces_per_bundle || 0) * (entry.piece_length_meters || 0) * transaction.weight_per_meter).toFixed(2)} kg
                            <span className="text-xs ml-1">({entry.quantity * (entry.pieces_per_bundle || 0)} pieces × {(entry.piece_length_meters || 0).toFixed(2)}m × {transaction.weight_per_meter.toFixed(3)} kg/m)</span>
                          </>
                        ) : (entry.stock_type === 'SPARE_PIECES' || entry.stock_type === 'SPARE') ? (
                          <>Weight: {((entry.spare_piece_count || entry.quantity) * (entry.piece_length_meters || 0) * transaction.weight_per_meter).toFixed(2)} kg
                            <span className="text-xs ml-1">({entry.spare_piece_count || entry.quantity} pieces × {(entry.piece_length_meters || 0).toFixed(2)}m × {transaction.weight_per_meter.toFixed(3)} kg/m)</span>
                          </>
                        ) : entry.stock_type === 'CUT_ROLL' && entry.cut_piece_lengths ? (
                          <>Weight: {(entry.cut_piece_lengths.reduce((sum, len) => sum + len, 0) * transaction.weight_per_meter).toFixed(2)} kg
                            <span className="text-xs ml-1">({entry.cut_piece_lengths.length} cut pieces × {entry.cut_piece_lengths.reduce((sum, len) => sum + len, 0).toFixed(2)}m total × {transaction.weight_per_meter.toFixed(3)} kg/m)</span>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : transaction.roll_snapshot?.rolls && transaction.roll_snapshot.rolls.length > 0 ? (
            <div className="space-y-2">
              {transaction.roll_snapshot.rolls.map((roll, idx) => (
                <div
                  key={idx}
                  className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-mono font-medium">{roll.roll_id}</div>
                    <Badge variant={roll.is_cut_roll ? 'destructive' : 'default'}>
                      {roll.roll_type}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Batch:</span>
                      <span className="ml-2">{roll.batch_code}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Qty Dispatched:</span>
                      <span className="ml-2">{roll.quantity_dispatched}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Length:</span>
                      <span className="ml-2">{Number(roll.length_meters).toFixed(2)}m</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Initial Length:</span>
                      <span className="ml-2">
                        {Number(roll.initial_length_meters).toFixed(2)}m
                      </span>
                    </div>
                    {roll.bundle_size && (
                      <div>
                        <span className="text-muted-foreground">Bundle Size:</span>
                        <span className="ml-2">{roll.bundle_size}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant="outline" className="ml-2">
                        {roll.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No stock details available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
