import type { UUID, StockType, Parameters } from './api';

export interface StockEntry {
  stock_id: string;
  piece_ids?: string[];
  stock_type: 'FULL_ROLL' | 'CUT_ROLL' | 'CUT_PIECE' | 'BUNDLE' | 'SPARE' | 'SPARE_PIECES';
  quantity: number;
  status: string;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  piece_count?: number;
  total_available: number;
  product_type_name: string;
  batch_id?: string;
  batch_code?: string;
  batch_no?: string;
  piece_id?: string;
  spare_id?: string;
  spare_ids?: string[];
}

export interface InventoryBatchUI {
  id: string;
  batch_no: string;
  batch_code?: string;
  product_variant_id: string;
  product_type_id: string;
  product_type_name: string;
  brand_id: string;
  brand_name: string;
  parameters: Record<string, unknown> | Parameters;
  current_quantity: number;
  initial_quantity: number;
  production_date?: string;
  created_at: string;
  created_by_name: string;
  stock?: StockEntry[];
  stock_entries: StockEntry[];
}
