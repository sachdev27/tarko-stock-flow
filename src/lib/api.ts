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
  console.log('API Request:', config.method?.toUpperCase(), config.url);
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
  getBatches: (locationId?: string) =>
    api.get('/inventory/batches', { params: { location_id: locationId } }),

  getLocations: () =>
    api.get('/inventory/locations'),

  getProductTypes: () =>
    api.get('/inventory/product-types'),

  getBrands: () =>
    api.get('/inventory/brands'),

  getCustomers: () =>
    api.get('/inventory/customers'),

  // Batch management
  updateBatch: (batchId: string, data: any) =>
    api.put(`/inventory/batches/${batchId}`, data),

  updateBatchQC: (batchId: string, data: { qc_status: string; notes?: string }) =>
    api.put(`/inventory/batches/${batchId}/qc`, data),

  // Roll management
  updateRoll: (rollId: string, data: any) =>
    api.put(`/inventory/rolls/${rollId}`, data),
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

  getAll: () =>
    api.get('/transactions/'),
};

// Stats endpoints
export const stats = {
  getDashboard: () =>
    api.get('/stats/dashboard'),
};

// Admin endpoints
export const admin = {
  // Locations
  getLocations: () =>
    api.get('/admin/locations'),
  createLocation: (data: any) =>
    api.post('/admin/locations', data),
  updateLocation: (id: string, data: any) =>
    api.put(`/admin/locations/${id}`, data),
  deleteLocation: (id: string) =>
    api.delete(`/admin/locations/${id}`),

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

  getLocationInventory: (brand?: string, product_type?: string) =>
    api.get('/reports/location-inventory', { params: { brand, product_type } }),

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

export default api;
