import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { DispatchAPI } from './dispatchAPI';

export const useDispatchData = (token: string) => {
  const api = new DispatchAPI(token);

  // State
  const [customers, setCustomers] = useState<any[]>([]);
  const [billToList, setBillToList] = useState<any[]>([]);
  const [transports, setTransports] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [productTypes, setProductTypes] = useState<any[]>([]);

  // Fetch functions
  const fetchCustomers = useCallback(async (search?: string) => {
    try {
      const data = await api.fetchCustomers(search);
      setCustomers(data);
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch customers');
      return [];
    }
  }, [api]);

  const fetchBillToList = useCallback(async (search?: string) => {
    try {
      const data = await api.fetchBillToList(search);
      setBillToList(data);
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch bill-to list');
      return [];
    }
  }, [api]);

  const fetchTransports = useCallback(async (search?: string) => {
    try {
      const data = await api.fetchTransports(search);
      setTransports(data);
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch transports');
      return [];
    }
  }, [api]);

  const fetchVehicles = useCallback(async (search?: string) => {
    try {
      const data = await api.fetchVehicles(search);
      setVehicles(data);
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch vehicles');
      return [];
    }
  }, [api]);

  const fetchProductTypes = useCallback(async () => {
    try {
      const data = await api.fetchProductTypes();
      setProductTypes(data);
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch product types');
      return [];
    }
  }, [api]);

  // Create functions
  const createCustomer = useCallback(async (name: string) => {
    try {
      const nameParts = name.split('-').map(p => p.trim());
      const customerName = nameParts[0];
      const city = nameParts[1] || '';

      const newCustomer = await api.createCustomer({ name: customerName, city });
      setCustomers(prev => [...prev, newCustomer]);
      toast.success(`Customer "${customerName}" created`);
      return newCustomer;
    } catch (error: any) {
      toast.error(error.message || 'Failed to create customer');
      throw error;
    }
  }, [api]);

  const createBillTo = useCallback(async (name: string) => {
    try {
      const newBillTo = await api.createBillTo({ name });
      setBillToList(prev => [...prev, newBillTo]);
      toast.success(`Bill To "${name}" created`);
      return newBillTo;
    } catch (error: any) {
      toast.error(error.message || 'Failed to create bill-to');
      throw error;
    }
  }, [api]);

  const createTransport = useCallback(async (name: string) => {
    try {
      const newTransport = await api.createTransport({ name });
      setTransports(prev => [...prev, newTransport]);
      toast.success(`Transport "${name}" created`);
      return newTransport;
    } catch (error: any) {
      toast.error(error.message || 'Failed to create transport');
      throw error;
    }
  }, [api]);

  const createVehicle = useCallback(async (vehicleNumber: string) => {
    try {
      const newVehicle = await api.createVehicle({ vehicle_number: vehicleNumber });
      setVehicles(prev => [...prev, newVehicle]);
      toast.success(`Vehicle "${vehicleNumber}" created`);
      return newVehicle;
    } catch (error: any) {
      toast.error(error.message || 'Failed to create vehicle');
      throw error;
    }
  }, [api]);

  return {
    // State
    customers,
    billToList,
    transports,
    vehicles,
    productTypes,
    // Fetch functions
    fetchCustomers,
    fetchBillToList,
    fetchTransports,
    fetchVehicles,
    fetchProductTypes,
    // Create functions
    createCustomer,
    createBillTo,
    createTransport,
    createVehicle,
    // API instance
    api
  };
};
