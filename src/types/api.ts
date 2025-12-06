/**
 * Complete TypeScript type definitions for Tarko Inventory API
 * This file ensures strict type-safety between frontend and backend
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

export type UUID = string;
export type ISO8601DateTime = string;
export type StockType = 'FULL_ROLL' | 'CUT_ROLL' | 'CUT_PIECE' | 'BUNDLE' | 'SPARE' | 'SPARE_PIECES';
export type StockStatus = 'IN_STOCK' | 'DISPATCHED' | 'SCRAPPED' | 'RETURNED';
export type DispatchStatus = 'PENDING' | 'DISPATCHED' | 'REVERTED';
export type ReturnStatus = 'PENDING' | 'COMPLETED' | 'REVERTED';
export type ScrapStatus = 'SCRAPPED' | 'REVERTED';
export type TransactionType =
  | 'PRODUCTION'
  | 'DISPATCH'
  | 'RETURN'
  | 'SCRAP'
  | 'CUT_ROLL'
  | 'SPLIT_BUNDLE'
  | 'COMBINE_SPARES'
  | 'REVERT_DISPATCH'
  | 'REVERT_RETURN'
  | 'REVERT_SCRAP';

export interface Parameters {
  [key: string]: string | number;
}

// ============================================================================
// AUTH API TYPES
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

export interface User {
  id: UUID;
  email: string;
  name?: string;
  role: 'admin' | 'user';
  created_at: ISO8601DateTime;
}

// ============================================================================
// PRODUCTION API TYPES
// ============================================================================

export interface CreateProductionBatchRequest {
  product_type_id: UUID;
  brand_id: UUID;
  parameters: Parameters;
  batch_no: string;
  quantity: number;
  production_date: ISO8601DateTime;

  // Roll configuration (for HDPE pipes)
  roll_config_type?: 'standard_rolls' | 'quantity_based' | 'length_based';
  number_of_rolls?: number;
  length_per_roll?: number;

  // Bundle configuration (for sprinkler pipes)
  number_of_bundles?: number;
  bundle_size?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;

  // Optional fields
  unit_id?: UUID;
  location_id?: UUID;
  notes?: string;
  attachments?: File[];
}

export interface ProductionBatchResponse {
  success: boolean;
  message: string;
  batch_id: UUID;
  batch_no: string;
  inventory_created: {
    stock_type: StockType;
    quantity: number;
  }[];
}

export interface ProductionHistoryParams {
  start_date?: ISO8601DateTime;
  end_date?: ISO8601DateTime;
  product_type_id?: UUID;
  brand_id?: UUID;
  batch_no?: string;
}

export interface ProductionBatch {
  id: UUID;
  batch_no: string;
  product_type_id: UUID;
  product_type_name: string;
  brand_id: UUID;
  brand_name: string;
  parameters: Parameters;
  initial_quantity: number;
  current_quantity: number;
  production_date: ISO8601DateTime;
  created_at: ISO8601DateTime;
  created_by: UUID;
  created_by_name: string;
  notes?: string;
  attachments?: string[];
}

// ============================================================================
// DISPATCH API TYPES
// ============================================================================

export interface GetAvailableRollsRequest {
  product_type_id: UUID;
  brand_id?: UUID;
  parameters: Parameters;
}

export interface AvailableStock {
  stock_id: UUID;
  stock_type: StockType;
  batch_id: UUID;
  batch_no: string;
  quantity: number;
  length_meters?: number;
  piece_count?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  status: StockStatus;
}

export interface CutRollRequest {
  roll_id: UUID;
  cuts: {
    length: number;
    notes?: string;
  }[];
}

export interface CutBundleRequest {
  roll_id: UUID;  // Actually bundle stock_id
  cuts: {
    pieces: number;
    notes?: string;
  }[];
}

export interface CombineSparesRequest {
  spare_roll_ids: UUID[];  // Actually spare stock_ids
  bundle_size: number;
  number_of_bundles?: number;
}

export interface CreateDispatchRequest {
  customer_id: UUID;
  invoice_number?: string;
  dispatch_date?: ISO8601DateTime;
  notes?: string;
  items: DispatchItem[];

  // Transport details (optional)
  vehicle_id?: UUID;
  transport_id?: UUID;
  bill_to_id?: UUID;
  lr_number?: string;
  lr_date?: ISO8601DateTime;
  freight_amount?: number;
  transport_mode?: string;
}

export interface DispatchItem {
  stock_id: UUID;
  product_variant_id: UUID;
  item_type: StockType;
  quantity: number;

  // For FULL_ROLL
  length_meters?: number;

  // For CUT_ROLL / CUT_PIECE
  piece_ids?: UUID[];
  cut_roll_id?: UUID;

  // For BUNDLE
  bundle_size?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;

  // For SPARE_PIECES
  spare_piece_ids?: UUID[];

  // Pricing
  rate_per_unit?: number;
  amount?: number;
  notes?: string;
}

export interface DispatchResponse {
  success: boolean;
  message: string;
  dispatch_id: UUID;
  dispatch_number: string;
  total_amount?: number;
  items_dispatched: number;
}

export interface DispatchHistoryParams {
  start_date?: ISO8601DateTime;
  end_date?: ISO8601DateTime;
  customer_id?: UUID;
  status?: DispatchStatus;
  invoice_number?: string;
}

export interface Dispatch {
  id: UUID;
  dispatch_number: string;
  customer_id: UUID;
  customer_name: string;
  invoice_number?: string;
  dispatch_date: ISO8601DateTime;
  status: DispatchStatus;
  total_amount?: number;
  notes?: string;
  created_by: UUID;
  created_by_name: string;
  created_at: ISO8601DateTime;

  // Transport details
  vehicle_number?: string;
  transport_name?: string;
  lr_number?: string;
  lr_date?: ISO8601DateTime;
  freight_amount?: number;

  // Aggregated info
  total_items: number;
  item_types: StockType[];
}

export interface DispatchDetails extends Dispatch {
  items: DispatchItemDetail[];
}

export interface DispatchItemDetail {
  id: UUID;
  stock_id: UUID;
  product_variant_id: UUID;
  product_type_name: string;
  brand_name: string;
  parameters: Parameters;
  item_type: StockType;
  quantity: number;
  batch_no: string;
  length_meters?: number;
  piece_count?: number;
  rate_per_unit?: number;
  amount?: number;
  notes?: string;
}

export interface ProductsSummaryParams {
  brand_id?: UUID;
  product_type_id?: UUID;
}

export interface ProductSummary {
  product_variant_id: UUID;
  product_type_id: UUID;
  product_type_name: string;
  brand_id: UUID;
  brand_name: string;
  parameters: Parameters;
  total_quantity: number;
  total_batches: number;
  stock_types: {
    [key in StockType]?: number;
  };
}

// ============================================================================
// RETURN API TYPES
// ============================================================================

export interface CreateReturnRequest {
  customer_id: UUID;
  return_date?: ISO8601DateTime;
  notes?: string;
  items: ReturnItem[];
}

export interface ReturnItem {
  product_type_id: UUID;
  brand_id: UUID;
  parameters: Parameters;
  item_type: StockType;
  quantity: number;

  // For FULL_ROLL returns
  rolls?: {
    length_meters: number;
    notes?: string;
  }[];

  // For BUNDLE returns
  bundles?: {
    bundle_size: number;
    piece_length_meters: number;
    notes?: string;
  }[];

  // For SPARE returns
  spare_pieces?: {
    piece_count: number;
    piece_length_meters: number;
    notes?: string;
  }[];

  notes?: string;
  reason?: string;
}

export interface ReturnResponse {
  success: boolean;
  message: string;
  return_id: UUID;
  return_number: string;
  transaction_id: UUID;
}

export interface ReturnHistoryParams {
  start_date?: ISO8601DateTime;
  end_date?: ISO8601DateTime;
  customer_id?: UUID;
  status?: ReturnStatus;
}

export interface Return {
  id: UUID;
  return_number: string;
  customer_id: UUID;
  customer_name: string;
  return_date: ISO8601DateTime;
  status: ReturnStatus;
  notes?: string;
  created_by: UUID;
  created_by_name: string;
  created_at: ISO8601DateTime;
  total_items: number;
  item_types: StockType[];
}

export interface ReturnDetails extends Return {
  items: ReturnItemDetail[];
}

export interface ReturnItemDetail {
  id: UUID;
  batch_id: UUID;
  batch_no: string;
  product_variant_id: UUID;
  product_type_name: string;
  brand_name: string;
  parameters: Parameters;
  item_type: StockType;
  quantity: number;
  notes?: string;
  reason?: string;
}

// ============================================================================
// SCRAP API TYPES
// ============================================================================

export interface CreateScrapRequest {
  scrap_date?: ISO8601DateTime;
  reason: string;
  notes?: string;
  items: ScrapItem[];
}

export interface ScrapItem {
  stock_id: UUID;
  quantity_to_scrap: number;
  piece_ids?: UUID[];  // For CUT_ROLL or SPARE type
  estimated_value?: number;
  notes?: string;
}

export interface ScrapResponse {
  success: boolean;
  message: string;
  scrap_id: UUID;
  scrap_number: string;
  total_items: number;
}

export interface ScrapHistoryParams {
  start_date?: ISO8601DateTime;
  end_date?: ISO8601DateTime;
  reason?: string;
  status?: ScrapStatus;
}

export interface Scrap {
  id: UUID;
  scrap_number: string;
  scrap_date: ISO8601DateTime;
  reason: string;
  status: ScrapStatus;
  notes?: string;
  total_items: number;
  total_value?: number;
  created_by: UUID;
  created_by_name: string;
  created_at: ISO8601DateTime;
}

export interface ScrapDetails extends Scrap {
  items: ScrapItemDetail[];
}

export interface ScrapItemDetail {
  id: UUID;
  stock_id: UUID;
  batch_id: UUID;
  batch_no: string;
  product_variant_id: UUID;
  product_type_name: string;
  brand_name: string;
  parameters: Parameters;
  stock_type: StockType;
  quantity_scrapped: number;
  estimated_value?: number;
  notes?: string;
}

export interface ScrapReason {
  reason: string;
  count: number;
}

// ============================================================================
// INVENTORY API TYPES
// ============================================================================

export interface InventoryBatch {
  id: UUID;
  batch_no: string;
  product_variant_id: UUID;
  product_type_id: UUID;
  product_type_name: string;
  brand_id: UUID;
  brand_name: string;
  parameters: Parameters;
  initial_quantity: number;
  current_quantity: number;
  production_date?: ISO8601DateTime;
  created_at: ISO8601DateTime;
  created_by_name: string;
  stock: InventoryStock[];
}

export interface InventoryStock {
  id: UUID;
  stock_type: StockType;
  quantity: number;
  status: StockStatus;
  length_meters?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;

  // For CUT_ROLL
  cut_pieces?: {
    id: UUID;
    piece_number: number;
    length_meters: number;
    status: StockStatus;
  }[];

  // For SPARE
  spare_pieces?: {
    id: UUID;
    piece_count: number;
    status: StockStatus;
  }[];
}

export interface UpdateBatchRequest {
  batch_no?: string;
  notes?: string;
}

export interface UpdateStockRequest {
  status?: StockStatus;
  quantity?: number;
  notes?: string;
}

export interface SearchInventoryParams {
  product_type_id?: UUID;
  brand_id?: UUID;
  parameters?: Parameters;
  status?: StockStatus;
  stock_type?: StockType;
  min_quantity?: number;
}

export interface SearchVariantsParams {
  product_type_id?: UUID;
  brand_id?: UUID;
  parameters?: Parameters;
}

export interface ProductVariant {
  id: UUID;
  product_type_id: UUID;
  product_type_name: string;
  brand_id: UUID;
  brand_name: string;
  parameters: Parameters;
  total_stock: number;
  available_stock: number;
}

export interface SplitBundleRequest {
  stock_id: UUID;
  pieces_to_split: number[];  // Array of piece counts for each spare group
}

export interface CombineSparesIntoBundleRequest {
  spare_piece_ids: UUID[];
  bundle_size: number;
  pieces_per_bundle?: number;
}

// ============================================================================
// TRANSACTION API TYPES
// ============================================================================

export interface CreateTransactionRequest {
  transaction_type: TransactionType;
  from_stock_id?: UUID;
  to_stock_id?: UUID;
  quantity?: number;
  notes?: string;
  reference_id?: UUID;
}

export interface TransactionHistoryParams {
  start_date?: ISO8601DateTime;
  end_date?: ISO8601DateTime;
  transaction_type?: TransactionType;
  batch_id?: UUID;
}

export interface Transaction {
  id: UUID;
  transaction_type: TransactionType;
  from_stock_id?: UUID;
  to_stock_id?: UUID;
  from_quantity?: number;
  to_quantity?: number;
  notes?: string;
  created_at: ISO8601DateTime;
  created_by: UUID;
  created_by_name: string;
  batch_info?: string;
}

export interface RevertTransactionRequest {
  transaction_ids: UUID[];
}

export interface RevertTransactionResponse {
  success: boolean;
  message: string;
  reverted_count: number;
}

// ============================================================================
// ADMIN API TYPES
// ============================================================================

export interface Brand {
  id: UUID;
  name: string;
  description?: string;
  created_at: ISO8601DateTime;
}

export interface CreateBrandRequest {
  name: string;
  description?: string;
}

export interface ProductType {
  id: UUID;
  name: string;
  category?: string;
  description?: string;
  created_at: ISO8601DateTime;
}

export interface CreateProductTypeRequest {
  name: string;
  category?: string;
  description?: string;
}

export interface Customer {
  id: UUID;
  name: string;
  contact?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  created_at: ISO8601DateTime;
}

export interface CreateCustomerRequest {
  name: string;
  contact?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
}

export interface Unit {
  id: UUID;
  name: string;
  abbreviation: string;
}

export interface CreateUnitRequest {
  name: string;
  abbreviation: string;
}

export interface AuditLog {
  id: UUID;
  user_id: UUID;
  user_name: string;
  action_type: string;
  entity_type: string;
  entity_id: UUID;
  description: string;
  created_at: ISO8601DateTime;
}

// ============================================================================
// STATS & REPORTS API TYPES
// ============================================================================

export interface DashboardStats {
  total_inventory: number;
  total_batches: number;
  total_dispatches_today: number;
  total_returns_today: number;
  low_stock_items: number;
  recent_transactions: Transaction[];
}

export interface TopSellingProduct {
  product_variant_id: UUID;
  product_type_name: string;
  brand_name: string;
  parameters: Parameters;
  total_quantity: number;
  total_dispatches: number;
  total_revenue?: number;
}

export interface CustomerSales {
  customer_id: UUID;
  customer_name: string;
  total_dispatches: number;
  total_quantity: number;
  total_revenue?: number;
}

// ============================================================================
// VERSION CONTROL API TYPES
// ============================================================================

export interface Snapshot {
  id: UUID;
  snapshot_name: string;
  description?: string;
  tags?: string[];
  storage_path?: string;
  file_size: number;
  created_at: ISO8601DateTime;
  created_by: UUID;
  created_by_name: string;
}

export interface CreateSnapshotRequest {
  snapshot_name?: string;
  description?: string;
  tags?: string[];
  storage_path?: string;
}

export interface RollbackRequest {
  confirm: boolean;
}

export interface CloudConfig {
  provider: 'cloudflare_r2' | 'aws_s3';
  r2_account_id?: string;
  r2_access_key_id?: string;
  r2_secret_access_key?: string;
  r2_bucket_name?: string;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  aws_region?: string;
  s3_bucket_name?: string;
}

// ============================================================================
// API RESPONSE WRAPPERS
// ============================================================================

export interface ApiSuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string;
  code?: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;
