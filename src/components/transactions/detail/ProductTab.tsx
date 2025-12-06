import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TransactionRecord } from '@/types/transaction';
import { ParameterBadges } from '../ParameterBadges';
import { ScrapItemsDisplay } from './ScrapItemsDisplay';
import { DispatchItemsDisplay } from './DispatchItemsDisplay';
import { ReturnItemsDisplay } from './ReturnItemsDisplay';
import { formatDateTime } from '@/utils/transactions/formatters';
import { Factory, Tag } from 'lucide-react';

interface ProductTabProps {
  transaction: TransactionRecord;
  isDispatch: boolean;
  isReturn: boolean;
  isScrap: boolean;
}

export function ProductTab({ transaction, isDispatch, isReturn, isScrap }: ProductTabProps) {
  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Product Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isReturn && transaction.roll_snapshot?.item_breakdown && Array.isArray(transaction.roll_snapshot.item_breakdown) && transaction.roll_snapshot.item_breakdown.length > 0 ? (
            <ReturnItemsDisplay items={transaction.roll_snapshot.item_breakdown} />
          ) : isReturn && transaction.roll_snapshot ? (
            <div>
              <div className="text-sm font-medium mb-3">Return Summary</div>
              <div className="p-4 bg-green-50/50 rounded-lg border">
                <div className="text-muted-foreground text-sm">
                  This return was created before detailed item tracking was implemented.
                </div>
                {typeof transaction.roll_snapshot.item_breakdown === 'string' && (
                  <div className="mt-3">
                    <span className="font-medium">Items: </span>
                    <span className="text-lg">{transaction.roll_snapshot.item_breakdown}</span>
                  </div>
                )}
                {transaction.roll_snapshot.full_rolls > 0 && (
                  <div className="mt-2">
                    <span className="font-medium">Full Rolls: </span>
                    <span>{transaction.roll_snapshot.full_rolls}</span>
                  </div>
                )}
                {transaction.roll_snapshot.cut_rolls > 0 && (
                  <div className="mt-2">
                    <span className="font-medium">Cut Rolls: </span>
                    <span>{transaction.roll_snapshot.cut_rolls}</span>
                  </div>
                )}
                {transaction.roll_snapshot.bundles > 0 && (
                  <div className="mt-2">
                    <span className="font-medium">Bundles: </span>
                    <span>{transaction.roll_snapshot.bundles}</span>
                  </div>
                )}
                {transaction.roll_snapshot.spare_pieces > 0 && (
                  <div className="mt-2">
                    <span className="font-medium">Spare Pieces: </span>
                    <span>{transaction.roll_snapshot.spare_pieces}</span>
                  </div>
                )}
              </div>
            </div>
          ) : isScrap && transaction.roll_snapshot?.item_breakdown && Array.isArray(transaction.roll_snapshot.item_breakdown) && transaction.roll_snapshot.item_breakdown.length > 0 ? (
            <ScrapItemsDisplay items={transaction.roll_snapshot.item_breakdown} />
          ) : isDispatch && transaction.roll_snapshot?.item_breakdown && transaction.roll_snapshot.item_breakdown.length > 0 ? (
            <DispatchItemsDisplay items={transaction.roll_snapshot.item_breakdown} />
          ) : !isDispatch && !isReturn ? (
            <>
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

              <Separator />

              {/* Parameters */}
              {transaction.parameters && Object.keys(transaction.parameters).length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Parameters</div>
                  <ParameterBadges parameters={transaction.parameters} />
                </div>
              )}
            </>
          ) : null}

          {!isDispatch && (
            <>
              <Separator />

              {/* Production Details */}
              {transaction.production_date && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Production Date</div>
                  <div className="font-medium">
                    {formatDateTime(transaction.production_date)}
                  </div>
                </div>
              )}

              {transaction.weight_per_meter && typeof transaction.weight_per_meter === 'number' && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Weight per Meter</div>
                  <div className="font-medium">
                    {transaction.weight_per_meter.toFixed(3)} kg/m
                  </div>
                </div>
              )}

              {/* Production Breakdown from quantity_breakdown */}
              {transaction.quantity_breakdown &&
                (transaction.quantity_breakdown.fullRolls > 0 ||
                  transaction.quantity_breakdown.cutRolls > 0 ||
                  transaction.quantity_breakdown.bundles > 0 ||
                  transaction.quantity_breakdown.sparePieces > 0) && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-sm font-medium mb-3">Quantity Breakdown</div>
                      <div className="grid grid-cols-2 gap-3">
                        {transaction.quantity_breakdown.fullRolls > 0 && (
                          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                            <div className="text-xs text-muted-foreground">Full Rolls</div>
                            <div className="text-lg font-bold">
                              {transaction.quantity_breakdown.fullRolls}
                            </div>
                          </div>
                        )}
                        {transaction.quantity_breakdown.cutRolls > 0 && (
                          <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md">
                            <div className="text-xs text-muted-foreground">Cut Rolls</div>
                            <div className="text-lg font-bold">
                              {transaction.quantity_breakdown.cutRolls}
                            </div>
                          </div>
                        )}
                        {transaction.quantity_breakdown.bundles > 0 && (
                          <div className="bg-green-50 dark:bg-green-950 p-3 rounded-md">
                            <div className="text-xs text-muted-foreground">Bundles</div>
                            <div className="text-lg font-bold">
                              {transaction.quantity_breakdown.bundles}
                            </div>
                          </div>
                        )}
                        {transaction.quantity_breakdown.sparePieces > 0 && (
                          <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-md">
                            <div className="text-xs text-muted-foreground">Spare Pieces</div>
                            <div className="text-lg font-bold">
                              {transaction.quantity_breakdown.sparePieces}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

              {/* Legacy Production Breakdown (fallback) */}
              {!transaction.quantity_breakdown &&
                (transaction.standard_rolls_count ||
                  transaction.cut_rolls_count ||
                  transaction.bundles_count ||
                  transaction.spare_pieces_count) && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-sm font-medium mb-3">Production Breakdown</div>
                      <div className="grid grid-cols-2 gap-3">
                        {transaction.standard_rolls_count ? (
                          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                            <div className="text-xs text-muted-foreground">Standard Rolls</div>
                            <div className="text-lg font-bold">
                              {transaction.standard_rolls_count}
                            </div>
                            {transaction.avg_standard_roll_length && typeof transaction.avg_standard_roll_length === 'number' && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Avg: {transaction.avg_standard_roll_length.toFixed(2)}m
                              </div>
                            )}
                          </div>
                        ) : null}
                        {transaction.cut_rolls_count ? (
                          <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md">
                            <div className="text-xs text-muted-foreground">Cut Rolls</div>
                            <div className="text-lg font-bold">
                              {transaction.cut_rolls_count}
                            </div>
                          </div>
                        ) : null}
                        {transaction.bundles_count ? (
                          <div className="bg-green-50 dark:bg-green-950 p-3 rounded-md">
                            <div className="text-xs text-muted-foreground">Bundles</div>
                            <div className="text-lg font-bold">
                              {transaction.bundles_count}
                            </div>
                            {transaction.bundle_size && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Size: {transaction.bundle_size} pieces
                              </div>
                            )}
                          </div>
                        ) : null}
                        {transaction.spare_pieces_count ? (
                          <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-md">
                            <div className="text-xs text-muted-foreground">Spare Pieces</div>
                            <div className="text-lg font-bold">
                              {transaction.spare_pieces_count}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
