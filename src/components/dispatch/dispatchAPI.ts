import { toast } from 'sonner';

const API_BASE = 'http://localhost:5500/api';

interface ApiOptions {
  method?: string;
  body?: any;
  token: string;
}

const apiCall = async (endpoint: string, options: ApiOptions) => {
  const { method = 'GET', body, token } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
};

export class DispatchAPI {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  // Customers
  async fetchCustomers(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiCall(`/customers${query}`, { token: this.token });
  }

  async createCustomer(data: { name: string; city?: string; phone?: string; email?: string }) {
    return apiCall('/customers', {
      method: 'POST',
      body: data,
      token: this.token
    });
  }

  // Bill To
  async fetchBillToList(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiCall(`/bill-to${query}`, { token: this.token });
  }

  async createBillTo(data: { name: string; city?: string; gstin?: string }) {
    return apiCall('/bill-to', {
      method: 'POST',
      body: data,
      token: this.token
    });
  }

  // Transports
  async fetchTransports(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiCall(`/transports${query}`, { token: this.token });
  }

  async createTransport(data: { name: string; contact_person?: string; phone?: string }) {
    return apiCall('/transports', {
      method: 'POST',
      body: data,
      token: this.token
    });
  }

  // Vehicles
  async fetchVehicles(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiCall(`/vehicles${query}`, { token: this.token });
  }

  async createVehicle(data: { vehicle_number: string; vehicle_type?: string; driver_name?: string }) {
    return apiCall('/vehicles', {
      method: 'POST',
      body: data,
      token: this.token
    });
  }

  // Product Types
  async fetchProductTypes() {
    return apiCall('/parameters/product-types', { token: this.token });
  }

  // Product Search
  async searchProducts(params: {
    product_type_id?: string;
    brand_id?: string;
    parameters?: Record<string, any>;
  }) {
    return apiCall('/inventory/search', {
      method: 'POST',
      body: params,
      token: this.token
    });
  }

  // Dispatch
  async dispatchSale(data: {
    customer_id: string;
    bill_to_id?: string;
    transport_id?: string;
    vehicle_id?: string;
    notes?: string;
    rolls: any[];
  }) {
    return apiCall('/dispatch/dispatch-sale', {
      method: 'POST',
      body: data,
      token: this.token
    });
  }
}

// Hook for using the API
export const useDispatchAPI = (token: string) => {
  return new DispatchAPI(token);
};
