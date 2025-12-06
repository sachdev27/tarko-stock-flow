import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TransactionRecord } from '@/types/transaction';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { InventoryOperationView } from './detail/InventoryOperationView';
import { OverviewTab } from './detail/OverviewTab';
import { ProductTab } from './detail/ProductTab';
import { LogisticsTab } from './detail/LogisticsTab';
import { StockTab } from './detail/StockTab';
import { MetadataTab } from './detail/MetadataTab';
import { getProductName } from '@/utils/transactions/formatters';

interface TransactionDetailModalProps {
  transaction: TransactionRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionDetailModal({
  transaction,
  open,
  onOpenChange,
}: TransactionDetailModalProps) {
  if (!transaction) return null;

  // Check if this is an inventory operation (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES)
  const isInventoryOperation = ['CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES'].includes(transaction.transaction_type);

  // Check if this is a dispatch transaction
  const isDispatch = transaction.transaction_type === 'DISPATCH';

  // Check if this is a return transaction
  const isReturn = transaction.transaction_type === 'RETURN';

  // Check if this is a scrap transaction
  const isScrap = transaction.transaction_type === 'SCRAP';

  // Check if this is a reverted transaction
  const isReverted = transaction.transaction_type === 'REVERTED';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <TransactionTypeBadge transaction={transaction} />
            <span>
              {transaction.product_type === 'Mixed' && transaction.brand === 'Mixed'
                ? 'Mixed Products'
                : getProductName(transaction)}
            </span>
          </DialogTitle>
          <DialogDescription>
            Transaction ID: {transaction.id}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          {isInventoryOperation || isReverted ? (
            <InventoryOperationView transaction={transaction} isReverted={isReverted} />
          ) : (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="product">Product</TabsTrigger>
                {isDispatch ? (
                  <>
                    <TabsTrigger value="logistics">Logistics</TabsTrigger>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </>
                ) : isScrap ? (
                  <>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </>
                ) : !isReturn ? (
                  <>
                    <TabsTrigger value="rolls">Stock</TabsTrigger>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </>
                )}
              </TabsList>

              <TabsContent value="overview">
                <OverviewTab
                  transaction={transaction}
                  isDispatch={isDispatch}
                  isReturn={isReturn}
                  isScrap={isScrap}
                />
              </TabsContent>

              <TabsContent value="product">
                <ProductTab
                  transaction={transaction}
                  isDispatch={isDispatch}
                  isReturn={isReturn}
                  isScrap={isScrap}
                />
              </TabsContent>

              {isDispatch && (
                <TabsContent value="logistics">
                  <LogisticsTab transaction={transaction} />
                </TabsContent>
              )}

              {!isDispatch && (
                <TabsContent value="rolls">
                  <StockTab transaction={transaction} isScrap={isScrap} />
                </TabsContent>
              )}

              <TabsContent value="metadata">
                <MetadataTab transaction={transaction} />
              </TabsContent>
            </Tabs>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
