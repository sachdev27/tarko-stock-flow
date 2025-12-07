/**
 * Type-safe API client for Tarko Inventory Management System
 * All endpoints are strictly typed to match backend routes
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type * as API from '../types/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

console.log('API Base URL:', API_URL);

// ============================================================================
// AXIOS INSTANCE WITH INTERCEPTORS
// ============================================================================

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('API Request:', config.method?.toUpperCase(), config.url, config.params ? 'Params:' : '', config.params);
  return config;
});

// Response interceptor - Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.status, error.response?.data || error.message);

    if (error.response?.status === 401) {
      console.warn('401 Unauthorized - Token expired or invalid');
      localStorage.removeItem('token');
      if (!window.location.pathname.includes('/auth')) {
        window.location.href = '/auth';
      }
    } else if (error.response?.status === 403) {
      console.warn('403 Forbidden - Insufficient permissions');
      const errorMsg = error.response?.data?.error || '';
      if (errorMsg.toLowerCase().includes('token') || errorMsg.toLowerCase().includes('expired')) {
        localStorage.removeItem('token');
        if (!window.location.pathname.includes('/auth')) {
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function unwrapResponse<T>(response: AxiosResponse<T>): T {
  return response.data;
}

// ============================================================================
// AUTH API
// ============================================================================

export const auth = {
  signup: (data: API.SignupRequest): Promise<API.AuthResponse> =>
    apiClient.post<API.AuthResponse>('/auth/signup', data).then(unwrapResponse),

  login: (data: API.LoginRequest): Promise<API.AuthResponse> =>
    apiClient.post<API.AuthResponse>('/auth/login', data).then(unwrapResponse),

  getCurrentUser: (): Promise<API.User> =>
    apiClient.get<API.User>('/auth/me').then(unwrapResponse),

  forgotPassword: (data: API.ForgotPasswordRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/password-reset/forgot-password', data).then(unwrapResponse),

  verifyResetToken: (data: API.VerifyResetTokenRequest): Promise<{ valid: boolean; email?: string }> =>
    apiClient.post('/password-reset/verify-reset-token', data).then(unwrapResponse),

  resetPassword: (data: API.ResetPasswordRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/password-reset/reset-password', data).then(unwrapResponse),

  changePassword: (data: API.ChangePasswordRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/password-reset/change-password', data).then(unwrapResponse),
};

// ============================================================================
// PRODUCTION API
// ============================================================================

export const production = {
  createBatch: (data: API.CreateProductionBatchRequest | FormData): Promise<API.ProductionBatchResponse> => {
    // If already FormData, send directly
    if (data instanceof FormData) {
      return apiClient.post<API.ProductionBatchResponse>('/production/batch', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }).then(unwrapResponse);
    }

    // Handle typed request with file uploads
    if (data.attachments && data.attachments.length > 0) {
      const formData = new FormData();

      // Add all fields except attachments
      Object.entries(data).forEach(([key, value]) => {
        if (key !== 'attachments') {
          if (typeof value === 'object' && value !== null) {
            formData.append(key, JSON.stringify(value));
          } else if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        }
      });

      // Add attachments
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });

      return apiClient.post<API.ProductionBatchResponse>('/production/batch', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }).then(unwrapResponse);
    }

    return apiClient.post<API.ProductionBatchResponse>('/production/batch', data).then(unwrapResponse);
  },

  getHistory: (params?: API.ProductionHistoryParams): Promise<API.ProductionBatch[]> =>
    apiClient.get<API.ProductionBatch[]>('/production/history', { params }).then(unwrapResponse),

  getDetails: (batchId: API.UUID): Promise<API.ProductionBatch> =>
    apiClient.get<API.ProductionBatch>(`/production/history/${batchId}`).then(unwrapResponse),

  getAttachment: (filename: string): string =>
    `${API_URL}/production/attachments/${filename}`,
};

// ============================================================================
// DISPATCH API
// ============================================================================

export const dispatch = {
  getAvailableRolls: (data: API.GetAvailableRollsRequest): Promise<API.AvailableStock[]> =>
    apiClient.post<API.AvailableStock[]>('/dispatch/available-rolls', data).then(unwrapResponse),

  cutRoll: (data: API.CutRollRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/dispatch/cut-roll', data).then(unwrapResponse),

  cutBundle: (data: API.CutBundleRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/dispatch/cut-bundle', data).then(unwrapResponse),

  combineSpares: (data: API.CombineSparesRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/dispatch/combine-spares', data).then(unwrapResponse),

  createDispatch: (data: API.CreateDispatchRequest): Promise<API.DispatchResponse> =>
    apiClient.post<API.DispatchResponse>('/dispatch/create-dispatch', data).then(unwrapResponse),

  getProductsSummary: (params?: API.ProductsSummaryParams): Promise<API.ProductSummary[]> =>
    apiClient.get<API.ProductSummary[]>('/dispatch/products-summary', { params }).then(unwrapResponse),

  getProductRolls: (variantId: API.UUID): Promise<API.AvailableStock[]> =>
    apiClient.get<API.AvailableStock[]>(`/dispatch/product-rolls/${variantId}`).then(unwrapResponse),

  getDispatches: (params?: API.DispatchHistoryParams): Promise<API.Dispatch[]> =>
    apiClient.get<API.Dispatch[]>('/dispatch/dispatches', { params }).then(unwrapResponse),

  getDispatchDetails: (dispatchId: API.UUID): Promise<API.DispatchDetails> =>
    apiClient.get<API.DispatchDetails>(`/dispatch/dispatches/${dispatchId}`).then(unwrapResponse),

  // Legacy endpoint (for backward compatibility)
  create: (data: any): Promise<any> =>
    apiClient.post('/dispatch/create', data).then(unwrapResponse),
};

// ============================================================================
// RETURN API
// ============================================================================

export const returns = {
  create: (data: API.CreateReturnRequest): Promise<API.ReturnResponse> =>
    apiClient.post<API.ReturnResponse>('/returns/create', data).then(unwrapResponse),

  getHistory: (params?: API.ReturnHistoryParams): Promise<API.Return[]> =>
    apiClient.get<API.Return[]>('/returns/history', { params }).then(unwrapResponse),

  getDetails: (returnId: API.UUID): Promise<API.ReturnDetails> =>
    apiClient.get<API.ReturnDetails>(`/returns/${returnId}`).then(unwrapResponse),

  revert: (returnId: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.post(`/returns/${returnId}/revert`).then(unwrapResponse),

  getStats: (): Promise<any> =>
    apiClient.get('/returns/stats').then(unwrapResponse),
};

// ============================================================================
// DISPATCH ENTITIES API
// ============================================================================

export const dispatchEntities = {
  // Customers
  getCustomers: (search?: string): Promise<API.Customer[]> =>
    apiClient.get<API.Customer[]>('/customers', { params: { search } }).then(unwrapResponse),

  createCustomer: (data: API.CreateCustomerRequest): Promise<API.Customer> =>
    apiClient.post<API.Customer>('/customers', data).then(unwrapResponse),

  updateCustomer: (id: API.UUID, data: Partial<API.CreateCustomerRequest>): Promise<API.Customer> =>
    apiClient.put<API.Customer>(`/customers/${id}`, data).then(unwrapResponse),

  deleteCustomer: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/customers/${id}`).then(unwrapResponse),

  // Vehicles
  getVehicles: (): Promise<API.Vehicle[]> =>
    apiClient.get<API.Vehicle[]>('/vehicles').then(unwrapResponse),

  createVehicle: (data: API.CreateVehicleRequest): Promise<API.Vehicle> =>
    apiClient.post<API.Vehicle>('/vehicles', data).then(unwrapResponse),

  updateVehicle: (id: API.UUID, data: Partial<API.CreateVehicleRequest>): Promise<API.Vehicle> =>
    apiClient.put<API.Vehicle>(`/vehicles/${id}`, data).then(unwrapResponse),

  deleteVehicle: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/vehicles/${id}`).then(unwrapResponse),

  // Transports
  getTransports: (): Promise<API.Transport[]> =>
    apiClient.get<API.Transport[]>('/transports').then(unwrapResponse),

  createTransport: (data: API.CreateTransportRequest): Promise<API.Transport> =>
    apiClient.post<API.Transport>('/transports', data).then(unwrapResponse),

  updateTransport: (id: API.UUID, data: Partial<API.CreateTransportRequest>): Promise<API.Transport> =>
    apiClient.put<API.Transport>(`/transports/${id}`, data).then(unwrapResponse),

  deleteTransport: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/transports/${id}`).then(unwrapResponse),

  // Bill To
  getBillTo: (): Promise<API.BillTo[]> =>
    apiClient.get<API.BillTo[]>('/bill-to').then(unwrapResponse),

  createBillTo: (data: API.CreateBillToRequest): Promise<API.BillTo> =>
    apiClient.post<API.BillTo>('/bill-to', data).then(unwrapResponse),

  updateBillTo: (id: API.UUID, data: Partial<API.CreateBillToRequest>): Promise<API.BillTo> =>
    apiClient.put<API.BillTo>(`/bill-to/${id}`, data).then(unwrapResponse),

  deleteBillTo: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/bill-to/${id}`).then(unwrapResponse),

  // Product Aliases
  getProductAliases: (): Promise<API.ProductAlias[]> =>
    apiClient.get<API.ProductAlias[]>('/product-aliases').then(unwrapResponse),

  createProductAlias: (data: API.CreateProductAliasRequest): Promise<API.ProductAlias> =>
    apiClient.post<API.ProductAlias>('/product-aliases', data).then(unwrapResponse),
};

// ============================================================================
// SMTP CONFIG API
// ============================================================================

export const smtpConfig = {
  getConfig: (): Promise<API.SMTPConfig> =>
    apiClient.get<API.SMTPConfig>('/smtp-config').then(unwrapResponse),

  getAllConfigs: (): Promise<API.SMTPConfig[]> =>
    apiClient.get<API.SMTPConfig[]>('/smtp-config/all').then(unwrapResponse),

  createConfig: (data: API.CreateSMTPConfigRequest): Promise<API.SMTPConfig> =>
    apiClient.post<API.SMTPConfig>('/smtp-config', data).then(unwrapResponse),

  updateConfig: (id: API.UUID, data: Partial<API.CreateSMTPConfigRequest>): Promise<API.SMTPConfig> =>
    apiClient.put<API.SMTPConfig>(`/smtp-config/${id}`, data).then(unwrapResponse),

  deleteConfig: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/smtp-config/${id}`).then(unwrapResponse),

  testConfig: (data: API.TestSMTPRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/smtp-config/test', data).then(unwrapResponse),
};

// ============================================================================
// SETUP API
// ============================================================================

export const setup = {
  checkSetup: (): Promise<API.SetupCheck> =>
    apiClient.get<API.SetupCheck>('/setup/check').then(unwrapResponse),

  createAdmin: (data: API.CreateAdminRequest): Promise<{ success: boolean; message: string; user?: API.User }> =>
    apiClient.post('/setup/admin', data).then(unwrapResponse),
};

// ============================================================================
// SCRAP API
// ============================================================================

export const scrap = {
  create: (data: API.CreateScrapRequest): Promise<API.ScrapResponse> =>
    apiClient.post<API.ScrapResponse>('/scraps/create', data).then(unwrapResponse),

  getHistory: (params?: API.ScrapHistoryParams): Promise<API.Scrap[]> =>
    apiClient.get<API.Scrap[]>('/scraps/history', { params }).then(unwrapResponse),

  getDetails: (scrapId: API.UUID): Promise<API.ScrapDetails> =>
    apiClient.get<API.ScrapDetails>(`/scraps/history/${scrapId}`).then(unwrapResponse),

  getReasons: (): Promise<API.ScrapReason[]> =>
    apiClient.get<API.ScrapReason[]>('/scraps/reasons').then(unwrapResponse),

  revert: (scrapId: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.post(`/scraps/${scrapId}/revert`).then(unwrapResponse),
};

// ============================================================================
// INVENTORY API
// ============================================================================

export const inventory = {
  getBatches: (): Promise<API.InventoryBatch[]> =>
    apiClient.get<API.InventoryBatch[]>('/inventory/batches').then(unwrapResponse),

  getProductTypes: (): Promise<API.ProductType[]> =>
    apiClient.get<API.ProductType[]>('/inventory/product-types').then(unwrapResponse),

  getBrands: (): Promise<API.Brand[]> =>
    apiClient.get<API.Brand[]>('/inventory/brands').then(unwrapResponse),

  getCustomers: (): Promise<API.Customer[]> =>
    apiClient.get<API.Customer[]>('/inventory/customers').then(unwrapResponse),

  updateBatch: (batchId: API.UUID, data: API.UpdateBatchRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.put(`/inventory/batches/${batchId}`, data).then(unwrapResponse),

  updateStock: (stockId: API.UUID, data: API.UpdateStockRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.put(`/inventory/rolls/${stockId}`, data).then(unwrapResponse),

  cutRoll: (data: API.CutRollRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/inventory/cut-roll', data).then(unwrapResponse),

  searchInventory: (params: API.SearchInventoryParams): Promise<API.InventoryStock[]> =>
    apiClient.get<API.InventoryStock[]>('/inventory/search', { params }).then(unwrapResponse),

  searchProductVariants: (params: API.SearchVariantsParams): Promise<API.ProductVariant[]> =>
    apiClient.get<API.ProductVariant[]>('/inventory/product-variants/search', { params }).then(unwrapResponse),

  splitBundle: (data: API.SplitBundleRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/inventory/split-bundle', data).then(unwrapResponse),

  combineSpares: (data: API.CombineSparesIntoBundleRequest): Promise<{ success: boolean; message: string }> =>
    apiClient.post('/inventory/combine-spares', data).then(unwrapResponse),
};

// ============================================================================
// TRANSACTION API
// ============================================================================

export const transactions = {
  create: (data: API.CreateTransactionRequest): Promise<{ success: boolean; transaction_id: API.UUID }> =>
    apiClient.post('/transactions/', data).then(unwrapResponse),

  getAll: (params?: API.TransactionHistoryParams): Promise<API.Transaction[]> =>
    apiClient.get<API.Transaction[]>('/transactions/', { params }).then(unwrapResponse),

  revert: async (data: API.RevertTransactionRequest): Promise<API.RevertTransactionResponse> => {
    const { transaction_ids } = data;

    // Separate scrap transactions from other transactions
    const scrapIds: string[] = [];
    const otherIds: string[] = [];

    transaction_ids.forEach(id => {
      if (id.startsWith('scrap_')) {
        // Extract actual scrap ID (remove 'scrap_' prefix)
        scrapIds.push(id.substring(6));
      } else {
        otherIds.push(id);
      }
    });

    let scrapResult = { reverted_count: 0, total_requested: 0, failed_transactions: [] as any[] };
    let otherResult = { reverted_count: 0, total_requested: 0, failed_transactions: [] as any[] };

    // Revert scrap transactions using the specialized endpoint
    if (scrapIds.length > 0) {
      const scrapPromises = scrapIds.map(scrapId =>
        apiClient.post(`/scraps/${scrapId}/revert`)
          .then(() => ({ success: true, scrapId }))
          .catch((error) => ({
            success: false,
            scrapId,
            error: error.response?.data?.error || error.message
          }))
      );

      const scrapResults = await Promise.all(scrapPromises);
      scrapResult.total_requested = scrapIds.length;
      scrapResult.reverted_count = scrapResults.filter(r => r.success).length;
      scrapResult.failed_transactions = scrapResults
        .filter(r => !r.success)
        .map(r => ({ id: `scrap_${r.scrapId}`, error: r.error }));
    }

    // Revert other transactions using the generic endpoint
    if (otherIds.length > 0) {
      try {
        otherResult = await apiClient
          .post<API.RevertTransactionResponse>('/transactions/revert', { transaction_ids: otherIds })
          .then(unwrapResponse);
      } catch (error: any) {
        // If the entire request fails, mark all as failed
        otherResult = {
          reverted_count: 0,
          total_requested: otherIds.length,
          failed_transactions: otherIds.map(id => ({
            id,
            error: error.response?.data?.error || error.message || 'Unknown error'
          }))
        };
      }
    }

    // Combine results
    return {
      reverted_count: scrapResult.reverted_count + otherResult.reverted_count,
      total_requested: scrapResult.total_requested + otherResult.total_requested,
      failed_transactions: [...scrapResult.failed_transactions, ...otherResult.failed_transactions]
    };
  },
};

// ============================================================================
// ADMIN API
// ============================================================================

export const admin = {
  // Brands
  getBrands: (): Promise<API.Brand[]> =>
    apiClient.get<API.Brand[]>('/admin/brands').then(unwrapResponse),

  createBrand: (data: API.CreateBrandRequest): Promise<API.Brand> =>
    apiClient.post<API.Brand>('/admin/brands', data).then(unwrapResponse),

  updateBrand: (id: API.UUID, data: Partial<API.CreateBrandRequest>): Promise<API.Brand> =>
    apiClient.put<API.Brand>(`/admin/brands/${id}`, data).then(unwrapResponse),

  deleteBrand: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/admin/brands/${id}`).then(unwrapResponse),

  // Product Types
  getProductTypes: (): Promise<API.ProductType[]> =>
    apiClient.get<API.ProductType[]>('/admin/product-types').then(unwrapResponse),

  createProductType: (data: API.CreateProductTypeRequest): Promise<API.ProductType> =>
    apiClient.post<API.ProductType>('/admin/product-types', data).then(unwrapResponse),

  updateProductType: (id: API.UUID, data: Partial<API.CreateProductTypeRequest>): Promise<API.ProductType> =>
    apiClient.put<API.ProductType>(`/admin/product-types/${id}`, data).then(unwrapResponse),

  deleteProductType: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/admin/product-types/${id}`).then(unwrapResponse),

  // Customers
  getCustomers: (): Promise<API.Customer[]> =>
    apiClient.get<API.Customer[]>('/admin/customers').then(unwrapResponse),

  createCustomer: (data: API.CreateCustomerRequest): Promise<API.Customer> =>
    apiClient.post<API.Customer>('/admin/customers', data).then(unwrapResponse),

  updateCustomer: (id: API.UUID, data: Partial<API.CreateCustomerRequest>): Promise<API.Customer> =>
    apiClient.put<API.Customer>(`/admin/customers/${id}`, data).then(unwrapResponse),

  deleteCustomer: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/admin/customers/${id}`).then(unwrapResponse),

  exportCustomers: (): Promise<Blob> =>
    apiClient.get('/admin/customers/export', { responseType: 'blob' }).then(unwrapResponse),

  downloadCustomerTemplate: (): Promise<Blob> =>
    apiClient.get('/admin/customers/template', { responseType: 'blob' }).then(unwrapResponse),

  importCustomers: (file: File): Promise<{ success: boolean; imported: number; errors?: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/admin/customers/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(unwrapResponse);
  },

  // Units
  getUnits: (): Promise<API.Unit[]> =>
    apiClient.get<API.Unit[]>('/admin/units').then(unwrapResponse),

  createUnit: (data: API.CreateUnitRequest): Promise<API.Unit> =>
    apiClient.post<API.Unit>('/admin/units', data).then(unwrapResponse),

  updateUnit: (id: API.UUID, data: API.CreateUnitRequest): Promise<API.Unit> =>
    apiClient.put<API.Unit>(`/admin/units/${id}`, data).then(unwrapResponse),

  deleteUnit: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/admin/units/${id}`).then(unwrapResponse),

  // Audit Logs
  getAuditLogs: (): Promise<API.AuditLog[]> =>
    apiClient.get<API.AuditLog[]>('/admin/audit-logs').then(unwrapResponse),

  // Users
  getUsers: (): Promise<API.User[]> =>
    apiClient.get<API.User[]>('/admin/users').then(unwrapResponse),

  createUser: (data: any): Promise<API.User> =>
    apiClient.post<API.User>('/admin/users', data).then(unwrapResponse),

  updateUser: (id: API.UUID, data: any): Promise<API.User> =>
    apiClient.put<API.User>(`/admin/users/${id}`, data).then(unwrapResponse),

  deleteUser: (id: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/admin/users/${id}`).then(unwrapResponse),

  // Database Reset
  getResetOptions: (): Promise<any> =>
    apiClient.get('/admin/reset-options').then(unwrapResponse),

  getDatabaseStats: (): Promise<any> =>
    apiClient.get('/admin/database-stats').then(unwrapResponse),

  resetDatabase: (resetLevel: string, confirmationToken: string): Promise<any> =>
    apiClient.post('/admin/reset-database', { reset_level: resetLevel, confirmation_token: confirmationToken }).then(unwrapResponse),

  // Vehicle/Transport/BillTo Import/Export
  exportVehicles: (): Promise<Blob> =>
    apiClient.get('/admin/vehicles/export', { responseType: 'blob' }).then(unwrapResponse),

  downloadVehicleTemplate: (): Promise<Blob> =>
    apiClient.get('/admin/vehicles/template', { responseType: 'blob' }).then(unwrapResponse),

  importVehicles: (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/admin/vehicles/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(unwrapResponse);
  },

  exportTransports: (): Promise<Blob> =>
    apiClient.get('/admin/transports/export', { responseType: 'blob' }).then(unwrapResponse),

  downloadTransportTemplate: (): Promise<Blob> =>
    apiClient.get('/admin/transports/template', { responseType: 'blob' }).then(unwrapResponse),

  importTransports: (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/admin/transports/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(unwrapResponse);
  },

  exportBillTo: (): Promise<Blob> =>
    apiClient.get('/admin/bill-to/export', { responseType: 'blob' }).then(unwrapResponse),

  downloadBillToTemplate: (): Promise<Blob> =>
    apiClient.get('/admin/bill-to/template', { responseType: 'blob' }).then(unwrapResponse),

  importBillTo: (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/admin/bill-to/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(unwrapResponse);
  },
};

// ============================================================================
// STATS & REPORTS API
// ============================================================================

export const stats = {
  getDashboard: (): Promise<API.DashboardStats> =>
    apiClient.get<API.DashboardStats>('/stats/dashboard').then(unwrapResponse),
};

export const reports = {
  getTopSellingProducts: (days: number = 30): Promise<API.TopSellingProduct[]> =>
    apiClient.get<API.TopSellingProduct[]>('/reports/top-selling-products', { params: { days } }).then(unwrapResponse),

  getCustomerSales: (days: number = 30, brand?: string, product_type?: string): Promise<API.CustomerSales[]> =>
    apiClient.get<API.CustomerSales[]>('/reports/customer-sales', { params: { days, brand, product_type } }).then(unwrapResponse),

  getProductInventory: (): Promise<any> =>
    apiClient.get('/reports/product-inventory').then(unwrapResponse),

  getAnalyticsOverview: (days: number = 30): Promise<any> =>
    apiClient.get('/reports/analytics/overview', { params: { days } }).then(unwrapResponse),

  getCustomerRegions: (days: number = 30): Promise<any> =>
    apiClient.get('/reports/analytics/customer-regions', { params: { days } }).then(unwrapResponse),
};

// ============================================================================
// PARAMETER API
// ============================================================================

export const parameters = {
  getOptions: (): Promise<any> =>
    apiClient.get('/parameters/options').then(unwrapResponse),

  getOptionsByName: (parameterName: string): Promise<any> =>
    apiClient.get(`/parameters/options/${parameterName}`).then(unwrapResponse),

  addOption: (data: { parameter_name: string; option_value: string }): Promise<any> =>
    apiClient.post('/parameters/options', data).then(unwrapResponse),

  updateOption: (optionId: string, data: { parameter_name: string; option_value: string }): Promise<any> =>
    apiClient.put(`/parameters/options/${optionId}`, data).then(unwrapResponse),

  deleteOption: (optionId: number): Promise<any> =>
    apiClient.delete(`/parameters/options/${optionId}`).then(unwrapResponse),
};

// ============================================================================
// VERSION CONTROL API
// ============================================================================

export const versionControl = {
  getSnapshots: (): Promise<API.Snapshot[]> =>
    apiClient.get<API.Snapshot[]>('/version-control/snapshots').then(unwrapResponse),

  createSnapshot: (data: API.CreateSnapshotRequest): Promise<API.Snapshot> =>
    apiClient.post<API.Snapshot>('/version-control/snapshots', data).then(unwrapResponse),

  deleteSnapshot: (snapshotId: API.UUID): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/version-control/snapshots/${snapshotId}`).then(unwrapResponse),

  bulkDeleteSnapshots: (snapshotIds: API.UUID[]): Promise<{ success: boolean; deleted_count: number }> =>
    apiClient.post('/version-control/snapshots/bulk-delete', { snapshot_ids: snapshotIds }).then(unwrapResponse),

  cleanupOldSnapshots: (days: number): Promise<{ success: boolean; deleted_count: number }> =>
    apiClient.post('/version-control/snapshots/cleanup-old', { days }).then(unwrapResponse),

  getAutoSnapshotSettings: (): Promise<any> =>
    apiClient.get('/version-control/settings/auto-snapshot').then(unwrapResponse),

  updateAutoSnapshotSettings: (data: { enabled: boolean; time: string }): Promise<any> =>
    apiClient.post('/version-control/settings/auto-snapshot', data).then(unwrapResponse),

  rollbackToSnapshot: (snapshotId: API.UUID, data: API.RollbackRequest): Promise<any> =>
    apiClient.post(`/version-control/rollback/${snapshotId}`, data).then(unwrapResponse),

  getRollbackHistory: (): Promise<any> =>
    apiClient.get('/version-control/rollback-history').then(unwrapResponse),

  getStorageStats: (): Promise<any> =>
    apiClient.get('/version-control/storage/local/stats').then(unwrapResponse),

  // Cloud Storage
  getCloudStatus: (): Promise<any> =>
    apiClient.get('/version-control/cloud/status').then(unwrapResponse),

  configureCloud: (data: API.CloudConfig): Promise<any> =>
    apiClient.post('/version-control/cloud/configure', data).then(unwrapResponse),

  getCloudSnapshots: (): Promise<API.Snapshot[]> =>
    apiClient.get<API.Snapshot[]>('/version-control/cloud/snapshots').then(unwrapResponse),

  downloadFromCloud: (snapshotId: API.UUID): Promise<any> =>
    apiClient.post(`/version-control/cloud/snapshots/${snapshotId}/download`).then(unwrapResponse),

  restoreFromCloud: (snapshotId: API.UUID): Promise<any> =>
    apiClient.post(`/version-control/cloud/snapshots/${snapshotId}/restore`).then(unwrapResponse),

  uploadToCloud: (snapshotId: API.UUID): Promise<any> =>
    apiClient.post(`/version-control/cloud/snapshots/${snapshotId}/upload`).then(unwrapResponse),

  deleteFromCloud: (snapshotId: API.UUID): Promise<any> =>
    apiClient.delete(`/version-control/cloud/snapshots/${snapshotId}`).then(unwrapResponse),

  bulkDeleteCloudSnapshots: (snapshotIds: API.UUID[]): Promise<any> =>
    apiClient.post('/version-control/cloud/snapshots/bulk-delete', { snapshot_ids: snapshotIds }).then(unwrapResponse),

  cleanupOldCloudSnapshots: (days: number): Promise<any> =>
    apiClient.post('/version-control/cloud/snapshots/cleanup-old', { days }).then(unwrapResponse),

  // External Storage
  detectExternalDevices: (): Promise<any> =>
    apiClient.get('/version-control/external/devices').then(unwrapResponse),

  exportToExternal: (data: { snapshot_id: string; destination_path: string; compress?: boolean }): Promise<any> =>
    apiClient.post('/version-control/external/export', data).then(unwrapResponse),

  importFromExternal: (data: { source_path: string }): Promise<any> =>
    apiClient.post('/version-control/external/import', data).then(unwrapResponse),

  listExternalSnapshots: (data: { device_path: string }): Promise<any> =>
    apiClient.post('/version-control/external/snapshots', data).then(unwrapResponse),

  downloadExternalSnapshot: (data: { snapshot_path: string; format?: string }): Promise<Blob> =>
    apiClient.post('/version-control/external/snapshots/download', data, { responseType: 'blob' }).then(unwrapResponse),

  verifyExternalSnapshot: (data: { snapshot_path: string }): Promise<any> =>
    apiClient.post('/version-control/external/verify', data).then(unwrapResponse),

  getSuggestedPaths: (): Promise<any> =>
    apiClient.get('/version-control/suggested-paths').then(unwrapResponse),
};

// ============================================================================
// BACKUP CONFIG API
// ============================================================================

export const backupConfig = {
  getCloudCredentials: (): Promise<any> =>
    apiClient.get('/backup-config/cloud-credentials').then(unwrapResponse),

  addCloudCredential: (data: any): Promise<any> =>
    apiClient.post('/backup-config/cloud-credentials', data).then(unwrapResponse),

  updateCloudCredential: (id: API.UUID, data: any): Promise<any> =>
    apiClient.put(`/backup-config/cloud-credentials/${id}`, data).then(unwrapResponse),

  deleteCloudCredential: (id: API.UUID): Promise<any> =>
    apiClient.delete(`/backup-config/cloud-credentials/${id}`).then(unwrapResponse),

  decryptCredential: (id: API.UUID): Promise<any> =>
    apiClient.post(`/backup-config/cloud-credentials/${id}/decrypt`).then(unwrapResponse),

  testCloudCredential: (id: API.UUID): Promise<any> =>
    apiClient.post(`/backup-config/cloud-credentials/${id}/test`).then(unwrapResponse),

  getRetentionPolicies: (): Promise<any> =>
    apiClient.get('/backup-config/retention-policies').then(unwrapResponse),

  addRetentionPolicy: (data: any): Promise<any> =>
    apiClient.post('/backup-config/retention-policies', data).then(unwrapResponse),

  updateRetentionPolicy: (id: API.UUID, data: any): Promise<any> =>
    apiClient.put(`/backup-config/retention-policies/${id}`, data).then(unwrapResponse),

  getArchiveBuckets: (): Promise<any> =>
    apiClient.get('/backup-config/archive-buckets').then(unwrapResponse),

  addArchiveBucket: (data: any): Promise<any> =>
    apiClient.post('/backup-config/archive-buckets', data).then(unwrapResponse),

  archiveBackup: (bucketId: API.UUID, data: any): Promise<any> =>
    apiClient.post(`/backup-config/archive-buckets/${bucketId}/archive`, data).then(unwrapResponse),

  getArchivedBackups: (backupType?: string): Promise<any> =>
    apiClient.get('/backup-config/archived-backups', { params: { backup_type: backupType } }).then(unwrapResponse),

  getDeletionLog: (limit?: number, backupType?: string): Promise<any> =>
    apiClient.get('/backup-config/deletion-log', { params: { limit, backup_type: backupType } }).then(unwrapResponse),
};

// ============================================================================
// EXPORT DEFAULT API CLIENT
// ============================================================================

export default apiClient;
