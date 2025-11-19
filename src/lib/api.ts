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

// Handle 401 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.status, error.response?.data || error.message);
    if (error.response?.status === 401) {
      // Token is invalid or expired
      localStorage.removeItem('token');
      // Only redirect if not already on auth page
      if (!window.location.pathname.includes('/auth')) {
        window.location.href = '/auth';
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
};

// Transaction endpoints
export const transactions = {
  create: (data: any) =>
    api.post('/transactions/', data),

  getAll: (params?: { start_date?: string; end_date?: string }) =>
    api.get('/transactions/', { params }),
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

  // Units
  getUnits: () =>
    api.get('/admin/units'),

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
};

// Reports endpoints
export const reports = {
  getTopSellingProducts: (days: number = 30) =>
    api.get('/reports/top-selling-products', { params: { days } }),

  getCustomerSales: (days: number = 30, brand?: string, product_type?: string) =>
    api.get('/reports/customer-sales', { params: { days, brand, product_type } }),

  getProductInventory: () =>
    api.get('/reports/product-inventory'),
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

  createSnapshot: (data: { snapshot_name?: string; description?: string; tags?: string[] }) =>
    api.post('/version-control/snapshots', data),

  deleteSnapshot: (snapshotId: string) =>
    api.delete(`/version-control/snapshots/${snapshotId}`),

  rollbackToSnapshot: (snapshotId: string, confirm: boolean = false) =>
    api.post(`/version-control/rollback/${snapshotId}`, { confirm }),

  getRollbackHistory: () =>
    api.get('/version-control/rollback-history'),

  testDriveConnection: () =>
    api.get('/version-control/drive/test'),

  syncToDrive: (snapshotId: string) =>
    api.post(`/version-control/drive/sync/${snapshotId}`),

  syncAllToDrive: (data: { days?: number }) =>
    api.post('/version-control/drive/sync-all', data),

  configureDrive: (data: { credentials: string }) =>
    api.post('/version-control/drive/configure', data),
};

export default api;
