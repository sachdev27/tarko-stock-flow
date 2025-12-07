import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

console.log('API Base URL:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('API Request:', config.method?.toUpperCase(), config.url, config.params ? 'Params:' : '', config.params);
  return config;
});

// Handle 401 and 403 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.status, error.response?.data || error.message);

    if (error.response?.status === 401) {
      // Token is invalid or expired
      console.warn('401 Unauthorized - Token expired or invalid, clearing and redirecting to login');
      localStorage.removeItem('token');
      // Only redirect if not already on auth page
      if (!window.location.pathname.includes('/auth')) {
        window.location.href = '/auth';
      }
    } else if (error.response?.status === 403) {
      // Forbidden - authenticated but not authorized (role issue or token expired silently)
      console.warn('403 Forbidden - May indicate expired token or insufficient permissions');

      // Check if error message indicates token expiry
      const errorMsg = error.response?.data?.error || error.response?.data?.msg || '';
      if (errorMsg.toLowerCase().includes('token') || errorMsg.toLowerCase().includes('expired')) {
        console.warn('Token-related 403 error, clearing token and redirecting to login');
        localStorage.removeItem('token');
        if (!window.location.pathname.includes('/auth')) {
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const auth = {
  signup: (email: string, password: string) =>
    api.post('/auth/signup', { email, password }),

  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  getCurrentUser: () =>
    api.get('/auth/me'),
};

// Inventory endpoints
export const inventory = {
  getBatches: () =>
    api.get('/inventory/batches'),

  getProductTypes: () =>
    api.get('/inventory/product-types'),

  getBrands: () =>
    api.get('/inventory/brands'),

  getCustomers: () =>
    api.get('/inventory/customers'),

  // Batch management
  updateBatch: (batchId: string, data: any) =>
    api.put(`/inventory/batches/${batchId}`, data),

  // Roll management
  updateRoll: (rollId: string, data: any) =>
    api.put(`/inventory/rolls/${rollId}`, data),

  searchProductVariants: (params: any) =>
    api.get('/inventory/product-variants/search', { params }),
};

// Production endpoints
export const production = {
  createBatch: (data: any) => {
    // If data is FormData, let browser set Content-Type with boundary
    const config = data instanceof FormData
      ? { headers: { 'Content-Type': 'multipart/form-data' } }
      : {};
    return api.post('/production/batch', data, config);
  },

  getHistory: () =>
    api.get('/production/history'),

  getDetails: (batchId: string) =>
    api.get(`/production/history/${batchId}`),
};

// Transaction endpoints
export const transactions = {
  create: (data: any) =>
    api.post('/transactions/', data),

  getAll: (params?: { start_date?: string; end_date?: string }) =>
    api.get('/transactions/', { params }),

  revert: (transactionIds: string[]) =>
    api.post('/transactions/revert', { transaction_ids: transactionIds }),
};

// Stats endpoints
export const stats = {
  getDashboard: () =>
    api.get('/stats/dashboard'),
};

// Dispatch endpoints
export const dispatch = {
  getAvailableRolls: (data: { product_type_id: string; brand_id?: string; parameters: Record<string, string> }) =>
    api.post('/dispatch/available-rolls', data),

  getProductsSummary: (params?: { brand_id?: string; product_type_id?: string }) =>
    api.get('/dispatch/products-summary', { params }),

  getProductRolls: (variantId: string) =>
    api.get(`/dispatch/product-rolls/${variantId}`),

  cutRoll: (data: { roll_id: string; cuts: { length: number }[] }) =>
    api.post('/dispatch/cut-roll', data),

  cutBundle: (data: { roll_id: string; cuts: { pieces: number }[] }) =>
    api.post('/dispatch/cut-bundle', data),

  combineSpares: (data: { spare_roll_ids: string[]; bundle_size: number; number_of_bundles?: number }) =>
    api.post('/dispatch/combine-spares', data),

  createDispatch: (data: {
    customer_id: string;
    invoice_number?: string;
    notes?: string;
    items: { type: string; roll_id: string; quantity: number }[];
  }) =>
    api.post('/dispatch/create', data),
};

// Admin endpoints
export const admin = {
  // Brands
  getBrands: () =>
    api.get('/admin/brands'),
  createBrand: (data: any) =>
    api.post('/admin/brands', data),
  updateBrand: (id: string, data: any) =>
    api.put(`/admin/brands/${id}`, data),
  deleteBrand: (id: string) =>
    api.delete(`/admin/brands/${id}`),

  // Product Types
  getProductTypes: () =>
    api.get('/admin/product-types'),
  createProductType: (data: any) =>
    api.post('/admin/product-types', data),
  updateProductType: (id: string, data: any) =>
    api.put(`/admin/product-types/${id}`, data),
  deleteProductType: (id: string) =>
    api.delete(`/admin/product-types/${id}`),

  // Customers
  getCustomers: () =>
    api.get('/admin/customers'),
  createCustomer: (data: any) =>
    api.post('/admin/customers', data),
  updateCustomer: (id: string, data: any) =>
    api.put(`/admin/customers/${id}`, data),
  deleteCustomer: (id: string) =>
    api.delete(`/admin/customers/${id}`),
  exportCustomers: () =>
    api.get('/admin/customers/export', { responseType: 'blob' }),
  downloadCustomerTemplate: () =>
    api.get('/admin/customers/template', { responseType: 'blob' }),
  importCustomers: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/admin/customers/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Vehicles Export/Import
  exportVehicles: () =>
    api.get('/admin/vehicles/export', { responseType: 'blob' }),
  downloadVehicleTemplate: () =>
    api.get('/admin/vehicles/template', { responseType: 'blob' }),
  importVehicles: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/admin/vehicles/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Transports Export/Import
  exportTransports: () =>
    api.get('/admin/transports/export', { responseType: 'blob' }),
  downloadTransportTemplate: () =>
    api.get('/admin/transports/template', { responseType: 'blob' }),
  importTransports: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/admin/transports/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Bill-To Export/Import
  exportBillTo: () =>
    api.get('/admin/bill-to/export', { responseType: 'blob' }),
  downloadBillToTemplate: () =>
    api.get('/admin/bill-to/template', { responseType: 'blob' }),
  importBillTo: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/admin/bill-to/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Units
  getUnits: () =>
    api.get('/admin/units'),
  createUnit: (data: { name: string; abbreviation: string }) =>
    api.post('/admin/units', data),
  updateUnit: (id: string, data: { name: string; abbreviation: string }) =>
    api.put(`/admin/units/${id}`, data),
  deleteUnit: (id: string) =>
    api.delete(`/admin/units/${id}`),

  // Audit Logs
  getAuditLogs: () =>
    api.get('/admin/audit-logs'),

  // Users
  getUsers: () =>
    api.get('/admin/users'),
  createUser: (data: any) =>
    api.post('/admin/users', data),
  updateUser: (id: string, data: any) =>
    api.put(`/admin/users/${id}`, data),
  deleteUser: (id: string) =>
    api.delete(`/admin/users/${id}`),

  // Database Reset
  getResetOptions: () =>
    api.get('/admin/reset-options'),
  getDatabaseStats: () =>
    api.get('/admin/database-stats'),
  resetDatabase: (resetLevel: string, confirmationToken: string) =>
    api.post('/admin/reset-database', { reset_level: resetLevel, confirmation_token: confirmationToken }),
};

// Reports endpoints
export const reports = {
  getTopSellingProducts: (days: number = 30) =>
    api.get('/reports/top-selling-products', { params: { days } }),

  getCustomerSales: (days: number = 30, brand?: string, product_type?: string) =>
    api.get('/reports/customer-sales', { params: { days, brand, product_type } }),

  getProductInventory: () =>
    api.get('/reports/product-inventory'),

  getAnalyticsOverview: (days: number = 30) =>
    api.get('/reports/analytics/overview', { params: { days } }),

  getCustomerRegions: (days: number = 30) =>
    api.get('/reports/analytics/customer-regions', { params: { days } }),
};

// Parameter endpoints
export const parameters = {
  getOptions: () =>
    api.get('/parameters/options'),

  getOptionsByName: (parameterName: string) =>
    api.get(`/parameters/options/${parameterName}`),

  addOption: (data: { parameter_name: string; option_value: string }) =>
    api.post('/parameters/options', data),

  updateOption: (optionId: string, data: { parameter_name: string; option_value: string }) =>
    api.put(`/parameters/options/${optionId}`, data),

  deleteOption: (optionId: number) =>
    api.delete(`/parameters/options/${optionId}`),
};

// Version Control endpoints
export const versionControl = {
  getSnapshots: () =>
    api.get('/version-control/snapshots'),

  createSnapshot: (data: { snapshot_name?: string; description?: string; tags?: string[]; storage_path?: string }) =>
    api.post('/version-control/snapshots', data),

  deleteSnapshot: (snapshotId: string) =>
    api.delete(`/version-control/snapshots/${snapshotId}`),

  bulkDeleteSnapshots: (snapshotIds: string[]) =>
    api.post('/version-control/snapshots/bulk-delete', { snapshot_ids: snapshotIds }),

  cleanupOldSnapshots: (days: number) =>
    api.post('/version-control/snapshots/cleanup-old', { days }),

  getAutoSnapshotSettings: () =>
    api.get('/version-control/settings/auto-snapshot'),

  updateAutoSnapshotSettings: (data: { enabled: boolean; time: string; interval?: string }) =>
    api.post('/version-control/settings/auto-snapshot', data),

  rollbackToSnapshot: (snapshotId: string, confirm: boolean = false) =>
    api.post(`/version-control/rollback/${snapshotId}`, { confirm }),

  getRollbackHistory: () =>
    api.get('/version-control/rollback-history'),

  getStorageStats: () =>
    api.get('/version-control/storage/local/stats'),

  // Cloud Storage
  getCloudStatus: () =>
    api.get('/version-control/cloud/status'),

  configureCloud: (data: {
    provider: string;
    r2_account_id?: string;
    r2_access_key_id?: string;
    r2_secret_access_key?: string;
    r2_bucket_name?: string;
    aws_access_key_id?: string;
    aws_secret_access_key?: string;
    aws_region?: string;
    s3_bucket_name?: string;
  }) =>
    api.post('/version-control/cloud/configure', data),

  getCloudSnapshots: () =>
    api.get('/version-control/cloud/snapshots'),

  downloadFromCloud: (snapshotId: string) =>
    api.post(`/version-control/cloud/snapshots/${snapshotId}/download`),

  restoreFromCloud: (snapshotId: string) =>
    api.post(`/version-control/cloud/snapshots/${snapshotId}/restore`),

  uploadToCloud: (snapshotId: string) =>
    api.post(`/version-control/cloud/snapshots/${snapshotId}/upload`),

  deleteFromCloud: (snapshotId: string) =>
    api.delete(`/version-control/cloud/snapshots/${snapshotId}`),

  bulkDeleteCloudSnapshots: (snapshotIds: string[]) =>
    api.post('/version-control/cloud/snapshots/bulk-delete', { snapshot_ids: snapshotIds }),

  cleanupOldCloudSnapshots: (days: number) =>
    api.post('/version-control/cloud/snapshots/cleanup-old', { days }),

  // External Storage
  detectExternalDevices: () =>
    api.get('/version-control/external/devices'),

  exportToExternal: (data: { snapshot_id: string; destination_path: string; compress?: boolean }) =>
    api.post('/version-control/external/export', data),

  importFromExternal: (data: { source_path: string }) =>
    api.post('/version-control/external/import', data),

  listExternalSnapshots: (data: { device_path: string }) =>
    api.post('/version-control/external/snapshots', data),

  downloadExternalSnapshot: (data: { snapshot_path: string; format?: string }) =>
    api.post('/version-control/external/snapshots/download', data, { responseType: 'blob' }),

  verifyExternalSnapshot: (data: { snapshot_path: string }) =>
    api.post('/version-control/external/verify', data),

  getSuggestedPaths: () =>
    api.get('/version-control/suggested-paths'),

  // Legacy Google Drive (deprecated)
  testDriveConnection: () =>
    api.get('/version-control/drive/test'),

  syncToDrive: (snapshotId: string) =>
    api.post(`/version-control/drive/sync/${snapshotId}`),

  syncAllToDrive: (data: { days?: number }) =>
    api.post('/version-control/drive/sync-all', data),

  configureDrive: (data: { credentials: string }) =>
    api.post('/version-control/drive/configure', data),
};

// Scrap endpoints
export const scrap = {
  create: (data: {
    scrap_date?: string;
    reason: string;
    notes?: string;
    items: Array<{
      stock_id: string;
      quantity_to_scrap: number;
      piece_ids?: string[];
      estimated_value?: number;
      notes?: string;
    }>;
  }) =>
    api.post('/scraps/create', data),

  getHistory: (params?: { start_date?: string; end_date?: string; reason?: string; status?: string }) =>
    api.get('/scraps/history', { params }),

  getDetails: (scrapId: string) =>
    api.get(`/scraps/history/${scrapId}`),

  getReasons: () =>
    api.get('/scraps/reasons'),

  revert: (scrapId: string) =>
    api.post(`/scraps/${scrapId}/revert`),
};

// Backup Configuration endpoints
export const backupConfig = {
  // Cloud Credentials
  getCloudCredentials: () =>
    api.get('/backup-config/cloud-credentials'),

  addCloudCredential: (data: {
    provider: string;
    account_id: string;
    access_key_id: string;
    secret_access_key: string;
    bucket_name: string;
    region?: string;
    endpoint_url?: string;
  }) =>
    api.post('/backup-config/cloud-credentials', data),

  updateCloudCredential: (id: string, data: any) =>
    api.put(`/backup-config/cloud-credentials/${id}`, data),

  deleteCloudCredential: (id: string) =>
    api.delete(`/backup-config/cloud-credentials/${id}`),

  decryptCredential: (id: string) =>
    api.post(`/backup-config/cloud-credentials/${id}/decrypt`),

  testCloudCredential: (id: string) =>
    api.post(`/backup-config/cloud-credentials/${id}/test`),

  // Retention Policies
  getRetentionPolicies: () =>
    api.get('/backup-config/retention-policies'),

  addRetentionPolicy: (data: {
    policy_name: string;
    backup_type: string;
    retention_days: number;
    auto_delete_enabled: boolean;
    keep_weekly?: boolean;
    keep_monthly?: boolean;
    max_backups?: number;
  }) =>
    api.post('/backup-config/retention-policies', data),

  updateRetentionPolicy: (id: string, data: any) =>
    api.put(`/backup-config/retention-policies/${id}`, data),

  // Archive Buckets
  getArchiveBuckets: () =>
    api.get('/backup-config/archive-buckets'),

  addArchiveBucket: (data: {
    bucket_name: string;
    credentials_id: string;
    description?: string;
  }) =>
    api.post('/backup-config/archive-buckets', data),

  archiveBackup: (bucketId: string, data: {
    backup_id: string;
    backup_type: string;
    tags?: string[];
    notes?: string;
  }) =>
    api.post(`/backup-config/archive-buckets/${bucketId}/archive`, data),

  // Archived Backups
  getArchivedBackups: (backupType?: string) =>
    api.get('/backup-config/archived-backups', { params: { backup_type: backupType } }),

  // Deletion Log
  getDeletionLog: (limit = 100, backupType?: string) =>
    api.get('/backup-config/deletion-log', { params: { limit, backup_type: backupType } }),
};

export default api;
