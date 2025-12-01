// Custom hook for transaction data management
import { useState, useEffect } from 'react';
import { TransactionRecord, ProductType, Brand } from '@/types/transaction';
import { transactions as transactionsAPI, admin } from '@/lib/api';
import { toast } from 'sonner';
import { extractParameterOptions } from '@/utils/transactions/filtering';
import { calculateQuantityBreakdown, calculateTotalMeters } from '@/utils/transactions/quantityFormatters';

export const useTransactionData = () => {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [parameterOptions, setParameterOptions] = useState({
    odOptions: [] as string[],
    pnOptions: [] as string[],
    peOptions: [] as string[],
    typeOptions: [] as string[],
  });

  const loadTransactions = async () => {
    try {
      console.log('[TransactionData] loadTransactions() called - Fetching all transactions');
      setIsLoading(true);
      const response = await transactionsAPI.getAll();

      console.log('[TransactionData] API response received:', {
        count: response.data?.length,
        transactions: response.data?.slice(0, 3).map((t: any) => ({
          id: t.id,
          type: t.transaction_type,
          batch_code: t.batch_code
        }))
      });

      const parsedTransactions = response.data.map((t: TransactionRecord) => {
        let params = t.parameters;
        if (typeof params === 'string') {
          try {
            params = JSON.parse(params);
          } catch (e) {
            console.error('Failed to parse parameters:', e);
            params = {};
          }
        }

        // Parse roll_snapshot if it's a string
        let rollSnapshot = t.roll_snapshot;
        if (typeof rollSnapshot === 'string') {
          try {
            rollSnapshot = JSON.parse(rollSnapshot);
          } catch (e) {
            console.error('Failed to parse roll_snapshot:', e);
            rollSnapshot = undefined;
          }
        }

        // Calculate total meters and quantity breakdown from roll_snapshot
        let totalMeters = 0;
        let quantityBreakdown = calculateQuantityBreakdown([]);

        if (rollSnapshot && rollSnapshot.stock_entries && Array.isArray(rollSnapshot.stock_entries)) {
          // New stock_entries format (for dispatches)
          quantityBreakdown = calculateQuantityBreakdown(rollSnapshot.stock_entries);
          totalMeters = calculateTotalMeters(rollSnapshot.stock_entries);
        } else if (rollSnapshot && rollSnapshot.item_breakdown && Array.isArray(rollSnapshot.item_breakdown)) {
          // Return format - use pre-calculated counts from roll_snapshot
          console.log('[TransactionData] Processing return transaction:', {
            transaction_type: t.transaction_type,
            batch_code: t.batch_code,
            roll_length_meters_from_backend: t.roll_length_meters,
            roll_snapshot_keys: Object.keys(rollSnapshot),
            full_rolls: rollSnapshot.full_rolls,
            cut_rolls: rollSnapshot.cut_rolls,
            bundles: rollSnapshot.bundles,
            spare_pieces: rollSnapshot.spare_pieces,
            total_rolls: rollSnapshot.total_rolls
          });

          quantityBreakdown = {
            fullRolls: Number(rollSnapshot.full_rolls) || 0,
            cutRolls: Number(rollSnapshot.cut_rolls) || 0,
            bundles: Number(rollSnapshot.bundles) || 0,
            sparePieces: Number(rollSnapshot.spare_pieces) || 0,
            totalItems: Number(rollSnapshot.total_rolls) || 0,
          };
          // Total meters will come from roll_length_meters field (already calculated in query)
          totalMeters = 0; // Let backend value be used

          console.log('[TransactionData] Return processed:', {
            quantityBreakdown,
            totalMeters_override: totalMeters,
            will_use_backend_value: t.roll_length_meters
          });
        } else if (rollSnapshot && rollSnapshot.rolls && Array.isArray(rollSnapshot.rolls)) {
          // Old rolls format - treat as full rolls
          quantityBreakdown.fullRolls = rollSnapshot.rolls.length;
          quantityBreakdown.totalItems = rollSnapshot.rolls.length;
          totalMeters = rollSnapshot.rolls.reduce((sum: number, roll: any) =>
            sum + (Number(roll.length_meters) || 0), 0
          );
        } else if (rollSnapshot && rollSnapshot.total_rolls) {
          quantityBreakdown.fullRolls = rollSnapshot.total_rolls;
          quantityBreakdown.totalItems = rollSnapshot.total_rolls;
        }

        return {
          ...t,
          parameters: params || {},
          roll_snapshot: rollSnapshot,
          roll_length_meters: totalMeters || t.roll_length_meters,
          total_rolls_count: quantityBreakdown.totalItems,
          quantity_breakdown: quantityBreakdown,
          // Ensure numeric fields are properly typed
          total_weight: typeof t.total_weight === 'string' ? parseFloat(t.total_weight) : t.total_weight,
          weight_per_meter: typeof t.weight_per_meter === 'string' ? parseFloat(t.weight_per_meter) : t.weight_per_meter,
          quantity_change: typeof t.quantity_change === 'string' ? parseFloat(t.quantity_change) : t.quantity_change,
        };
      });

      // Log returns specifically
      const returns = parsedTransactions.filter((t: any) => t.transaction_type === 'RETURN');
      if (returns.length > 0) {
        console.log('[TransactionData] Return transactions after parsing:', returns.map((r: any) => ({
          batch_code: r.batch_code,
          roll_length_meters: r.roll_length_meters,
          quantity_breakdown: r.quantity_breakdown
        })));
      }

      console.log('[TransactionData] Transactions parsed and set:', {
        count: parsedTransactions.length,
        firstFew: parsedTransactions.slice(0, 3).map((t: any) => ({
          id: t.id,
          type: t.transaction_type,
          batch_code: t.batch_code
        }))
      });

      console.log('[TransactionData] Transaction data loaded successfully');

      // Filter out REVERTED transactions that came from DISPATCH/RETURN reverts
      // But KEEP reverted inventory operations (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES)
      // These show up with notes like '[REVERTED] Cut Roll' and we want to show them
      const filteredTransactions = parsedTransactions.filter((t: any) => {
        // Keep everything that's not REVERTED
        if (t.transaction_type !== 'REVERTED') {
          return true;
        }
        // For REVERTED transactions, check if they're inventory operations
        // Inventory operation reverts have notes starting with '[REVERTED] Cut Roll', '[REVERTED] Split Bundle', etc.
        const notes = t.notes || '';
        const isInventoryOpRevert = notes.includes('[REVERTED] Cut Roll') ||
                                     notes.includes('[REVERTED] Split Bundle') ||
                                     notes.includes('[REVERTED] Combine Spares');
        return isInventoryOpRevert; // Keep inventory operation reverts, filter out dispatch/return reverts
      });

      console.log(`[TransactionData] Filtered out ${parsedTransactions.length - filteredTransactions.length} REVERTED dispatch/return transactions`);

      setTransactions(filteredTransactions);

      // Extract parameter options from filtered transactions
      const options = extractParameterOptions(filteredTransactions);
      setParameterOptions(options);

    } catch (error) {
      console.error('[TransactionData] Error loading transactions:', error);
      toast.error('Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMasterData = async () => {
    try {
      const [productTypesRes, brandsRes] = await Promise.all([
        admin.getProductTypes(),
        admin.getBrands()
      ]);
      setProductTypes(productTypesRes.data);
      setBrands(brandsRes.data);
    } catch (error) {
      console.error('Error loading master data:', error);
      toast.error('Failed to load filter options');
    }
  };

  useEffect(() => {
    loadTransactions();
    loadMasterData();
  }, []);

  return {
    transactions,
    productTypes,
    brands,
    isLoading,
    parameterOptions,
    reloadTransactions: loadTransactions,
  };
};
