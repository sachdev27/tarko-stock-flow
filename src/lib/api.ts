import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

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
  return config;
});

// Handle 401 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
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
};

// Production endpoints
export const production = {
  createBatch: (data: any) =>
    api.post('/production/batch', data),
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

  // Units
  getUnits: () =>
    api.get('/admin/units'),

  // Audit Logs
  getAuditLogs: () =>
    api.get('/admin/audit-logs'),
};

// Reports endpoints
export const reports = {
  getTopSellingProducts: (days: number = 30) =>
    api.get('/reports/top-selling-products', { params: { days } }),

  getLocationInventory: () =>
    api.get('/reports/location-inventory'),

  getCustomerSales: (days: number = 30) =>
    api.get('/reports/customer-sales', { params: { days } }),

  getProductInventory: () =>
    api.get('/reports/product-inventory'),
};

export default api;
