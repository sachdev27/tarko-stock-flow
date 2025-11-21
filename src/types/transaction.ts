// Transaction type definitions

export interface TransactionRecord {
  // Core Transaction Fields
  id: string;
  dispatch_id?: string;
  transaction_type: 'PRODUCTION' | 'SALE' | 'CUT_ROLL' | 'ADJUSTMENT' | 'RETURN' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'INTERNAL_USE' | 'CUT' | 'SPLIT_BUNDLE' | 'COMBINE_SPARES';
  quantity_change: number;
  transaction_date: string;
  invoice_no?: string;
  notes?: string;
  created_at: string;

  // Batch Information
  batch_code: string;
  batch_no: string;
  initial_quantity: number;
  production_date: string;
  attachment_url?: string;

  // Product Information
  product_type: string;
  product_variant_id: string;
  product_type_id: number;
  brand_id: number;
  brand: string;
  parameters?: {
    OD?: string;
    PN?: string;
    PE?: string;
    Type?: string;
    [key: string]: string | undefined;
  };

  // Weight & Unit Information
  weight_per_meter?: number;
  total_weight: number;
  unit_abbreviation?: string;

  // Roll-Specific Information
  roll_length_meters?: number;
  roll_initial_length_meters?: number;
  roll_is_cut?: boolean;
  roll_type?: string;
  roll_bundle_size?: number;
  roll_weight?: number;

  // Production Breakdown Counts
  standard_rolls_count?: number;
  cut_rolls_count?: number;
  bundles_count?: number;
  spare_pieces_count?: number;
  bundle_size?: number;
  piece_length?: number;

  // Average & Detail Arrays
  avg_standard_roll_length?: number;
  cut_rolls_details?: number[];
  spare_pieces_details?: number[];

  // Customer Information
  customer_name?: string;

  // User/Creator Information
  created_by_email?: string;
  created_by_username?: string;
  created_by_name?: string;

  // Grouping Metadata
  _isGrouped?: boolean;
  _groupCount?: number;
  _groupTransactions?: TransactionRecord[];

  // Roll Snapshot
  roll_snapshot?: {
    // New stock_entries format
    stock_entries?: Array<{
      status: string;
      batch_id: string;
      quantity: number;
      stock_id: string;
      stock_type: string;
      length_per_unit: number;
      pieces_per_bundle?: number;
      piece_length_meters?: number;
      spare_piece_count?: number; // Actual piece count for SPARE stock type
      cut_piece_lengths?: number[]; // Individual lengths for CUT_ROLL stock type
      total_cut_length?: number; // Total length of all cut pieces
      // SPLIT_BUNDLE specific fields
      from_bundle_size?: number; // Original bundle size that was split
      piece_length?: number; // Length of each piece
      spare_groups?: number; // Number of spare groups created
    }>;
    total_items?: number;
    total_stock_entries?: number;
    // Old rolls format
    rolls?: Array<{
      roll_id: string;
      batch_id: string;
      batch_code?: string;
      batch_no?: string;
      product_type?: string;
      brand?: string;
      parameters?: Record<string, string>;
      quantity_dispatched: number;
      length_meters: number;
      initial_length_meters: number;
      is_cut_roll: boolean;
      roll_type: string;
      bundle_size?: number;
      status: string;
    }>;
    total_rolls?: number;
  };

  // Calculated fields
  total_rolls_count?: number; // Calculated from roll_snapshot
  quantity_breakdown?: {
    fullRolls: number;
    cutRolls: number;
    bundles: number;
    sparePieces: number;
    totalItems: number;
  };
}

export interface TransactionFilters {
  searchQuery: string;
  typeFilter: string;
  productTypeFilter: string;
  brandFilter: string;
  parameterFilter: string;
  odFilter: string;
  pnFilter: string;
  peFilter: string;
  typeParamFilter: string;
  timePreset: string;
  startDate: string;
  endDate: string;
}

export interface ProductType {
  id: number;
  name: string;
}

export interface Brand {
  id: number;
  name: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  created_at?: string;
}
