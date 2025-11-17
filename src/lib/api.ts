import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

export default api;
