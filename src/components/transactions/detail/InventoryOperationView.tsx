import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TransactionRecord } from '@/types/transaction';
import { ParameterBadges } from '../ParameterBadges';
import { formatDateTime } from '@/utils/transactions/formatters';
import {
  Calendar,
  Package,
  FileText,
  Box,
  Tag,
} from 'lucide-react';

interface InventoryOperationViewProps {
  transaction: TransactionRecord;
  isReverted: boolean;
}

export function InventoryOperationView({ transaction, isReverted }: InventoryOperationViewProps) {
  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Operation Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date
            </div>
            <div className="font-medium">
              {formatDateTime(transaction.transaction_date)}
            </div>
          </div>

          {transaction.notes && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">What Happened</div>
              <div className="text-sm bg-muted p-3 rounded-md">
                {transaction.notes}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product details for reverted operations */}
      {isReverted && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Product Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Product Type</div>
                  <div className="font-medium">{transaction.product_type}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                    <Tag className="h-4 w-4" />
                    Brand
                  </div>
                  <Badge variant="outline">{transaction.brand}</Badge>
                </div>
              </div>

              {transaction.parameters && Object.keys(transaction.parameters).length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Parameters</div>
                  <ParameterBadges parameters={transaction.parameters} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Details for both regular and reverted operations */}
      {transaction.roll_snapshot?.stock_entries && transaction.roll_snapshot.stock_entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Box className="h-5 w-5" />
              {isReverted ? 'What Was Reverted' : 'Result'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transaction.roll_snapshot.stock_entries.map((entry, idx) => (
              <div key={idx} className="border rounded-lg p-4">
                {entry.stock_type === 'SPLIT_BUNDLE' ? (
                  // SPLIT_BUNDLE specific display
                  <div className="space-y-3">
                    <div className="font-medium text-lg">
                      Split from bundle of {entry.from_bundle_size} pieces
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Piece length: {entry.piece_length?.toFixed(2)}m each
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Result: {entry.spare_groups} spare group{entry.spare_groups !== 1 ? 's' : ''}
                    </div>
                  </div>
                ) : entry.stock_type === 'BUNDLE' ? (
                  // COMBINE_SPARES specific display
                  <div className="space-y-3">
                    <div className="font-medium text-lg">
                      {entry.bundles_created} × BUNDLE
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Bundles Created:</span>
                      <div className="mt-2 space-y-2">
                        <div className="text-sm bg-purple-100 dark:bg-purple-900 px-3 py-2 rounded">
                          <span className="font-medium">{entry.bundles_created} bundle{entry.bundles_created !== 1 ? 's' : ''}</span>
                          <span className="text-muted-foreground"> • </span>
                          <span>{entry.bundle_size} pieces per bundle</span>
                          <span className="text-muted-foreground"> • </span>
                          <span>{entry.piece_length?.toFixed(2)}m per piece</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // CUT_ROLL display
                  <>
                    <div className="font-medium text-lg mb-3">
                      {entry.cut_piece_lengths && entry.cut_piece_lengths.length > 0
                        ? `${entry.cut_piece_lengths.length} × CUT PIECES`
                        : `${entry.quantity} × ${entry.stock_type.replace('_', ' ')}`
                      }
                    </div>
                    {entry.cut_piece_lengths && entry.cut_piece_lengths.length > 0 && (
                      <div>
                        <span className="text-sm text-muted-foreground">Pieces:</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.cut_piece_lengths.map((length, idx) => (
                            <span key={idx} className="text-sm bg-amber-100 dark:bg-amber-900 px-3 py-1.5 rounded font-medium">
                              {length.toFixed(2)}m
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
