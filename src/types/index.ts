/**
 * Central export point for all API-related types and functions
 * Use this to import everything you need for type-safe API calls
 */

// Export all API type definitions
export type * from './api';

// Re-export commonly used types for convenience
export type {
  UUID,
  ISO8601DateTime,
  StockType,
  StockStatus,
  DispatchStatus,
  ReturnStatus,
  ScrapStatus,
  TransactionType,
  Parameters,
} from './api';

// Export specific interfaces that are frequently used
export type {
  // Auth
  LoginRequest,
  SignupRequest,
  AuthResponse,
  User,

  // Production
  CreateProductionBatchRequest,
  ProductionBatchResponse,
  ProductionBatch,

  // Dispatch
  CreateDispatchRequest,
  DispatchItem,
  DispatchResponse,
  Dispatch,
  DispatchDetails,

  // Returns
  CreateReturnRequest,
  ReturnItem,
  ReturnResponse,
  Return,
  ReturnDetails,

  // Scraps
  CreateScrapRequest,
  ScrapItem,
  ScrapResponse,
  Scrap,
  ScrapDetails,

  // Inventory
  InventoryBatch,
  InventoryStock,
  ProductVariant,

  // Transactions
  Transaction,
  RevertTransactionRequest,

  // Admin
  Brand,
  ProductType,
  Customer,
  Unit,

  // Common
  ApiResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
} from './api';
