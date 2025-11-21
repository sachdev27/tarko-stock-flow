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
      setIsLoading(true);
      const response = await transactionsAPI.getAll();

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
          // New stock_entries format
          quantityBreakdown = calculateQuantityBreakdown(rollSnapshot.stock_entries);
          totalMeters = calculateTotalMeters(rollSnapshot.stock_entries);
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
        };
      });

      setTransactions(parsedTransactions);

      // Extract parameter options
      const options = extractParameterOptions(parsedTransactions);
      setParameterOptions(options);

    } catch (error) {
      console.error('Error loading transactions:', error);
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
