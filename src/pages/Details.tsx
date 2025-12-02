import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Users, Truck, Building2, FileText } from 'lucide-react';
import axios from 'axios';

// Import modular components
import { CustomersTab } from '@/components/details/CustomersTab';
import { VehiclesTab } from '@/components/details/VehiclesTab';
import { TransportsTab } from '@/components/details/TransportsTab';
import { BillToTab } from '@/components/details/BillToTab';
import { CustomerDialog } from '@/components/details/CustomerDialog';
import { VehicleDialog } from '@/components/details/VehicleDialog';
import { TransportDialog } from '@/components/details/TransportDialog';
import { BillToDialog } from '@/components/details/BillToDialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

const Details = () => {
  const { token, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  // State for each entity type
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [transports, setTransports] = useState<any[]>([]);
  const [billToList, setBillToList] = useState<any[]>([]);

  // Dialog states
  const [customerDialog, setCustomerDialog] = useState(false);
  const [vehicleDialog, setVehicleDialog] = useState(false);
  const [transportDialog, setTransportDialog] = useState(false);
  const [billToDialog, setBillToDialog] = useState(false);

  // Edit states
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [editingTransport, setEditingTransport] = useState<any>(null);
  const [editingBillTo, setEditingBillTo] = useState<any>(null);

  // Form data
  const [customerForm, setCustomerForm] = useState({
    name: '',
    city: '',
    contact_person: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
  });

  const [vehicleForm, setVehicleForm] = useState({
    vehicle_number: '',
    vehicle_type: '',
    driver_name: '',
    driver_phone: '',
  });

  const [transportForm, setTransportForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
  });

  const [billToForm, setBillToForm] = useState({
    name: '',
    city: '',
    gstin: '',
    address: '',
    contact_person: '',
    phone: '',
    email: '',
  });

  const apiHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Fetch functions
  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API_URL}/customers`, { headers: apiHeaders });
      setCustomers(response.data);
    } catch (error: any) {
      toast.error('Failed to fetch customers');
    }
  };

  const fetchVehicles = async () => {
    try {
      const response = await axios.get(`${API_URL}/vehicles`, { headers: apiHeaders });
      setVehicles(response.data);
    } catch (error: any) {
      toast.error('Failed to fetch vehicles');
    }
  };

  const fetchTransports = async () => {
    try {
      const response = await axios.get(`${API_URL}/transports`, { headers: apiHeaders });
      setTransports(response.data);
    } catch (error: any) {
      toast.error('Failed to fetch transports');
    }
  };

  const fetchBillTo = async () => {
    try {
      const response = await axios.get(`${API_URL}/bill-to`, { headers: apiHeaders });
      setBillToList(response.data);
    } catch (error: any) {
      toast.error('Failed to fetch bill-to list');
    }
  };

  const fetchAllData = () => {
    if (token) {
      fetchCustomers();
      fetchVehicles();
      fetchTransports();
      fetchBillTo();
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [token]);

  // Customer handlers
  const handleAddCustomer = async () => {
    if (!customerForm.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    setLoading(true);
    try {
      if (editingCustomer) {
        await axios.put(`${API_URL}/customers/${editingCustomer.id}`, customerForm, { headers: apiHeaders });
        toast.success('Customer updated successfully');
      } else {
        await axios.post(`${API_URL}/customers`, customerForm, { headers: apiHeaders });
        toast.success('Customer created successfully');
      }
      setCustomerDialog(false);
      setEditingCustomer(null);
      setCustomerForm({ name: '', city: '', contact_person: '', phone: '', email: '', gstin: '', address: '' });
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save customer');
    } finally {
      setLoading(false);
    }
  };

  const handleEditCustomer = (customer: any) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name || '',
      city: customer.city || '',
      contact_person: customer.contact_person || '',
      phone: customer.phone || '',
      email: customer.email || '',
      gstin: customer.gstin || '',
      address: customer.address || '',
    });
    setCustomerDialog(true);
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;

    setLoading(true);
    try {
      await axios.delete(`${API_URL}/customers/${id}`, { headers: apiHeaders });
      toast.success('Customer deleted successfully');
      fetchCustomers();
    } catch (error: any) {
      toast.error('Failed to delete customer');
    } finally {
      setLoading(false);
    }
  };

  // Vehicle handlers
  const handleAddVehicle = async () => {
    if (!vehicleForm.driver_name.trim()) {
      toast.error('Driver name is required');
      return;
    }

    setLoading(true);
    try {
      if (editingVehicle) {
        await axios.put(`${API_URL}/vehicles/${editingVehicle.id}`, vehicleForm, { headers: apiHeaders });
        toast.success('Vehicle updated successfully');
      } else {
        await axios.post(`${API_URL}/vehicles`, vehicleForm, { headers: apiHeaders });
        toast.success('Vehicle created successfully');
      }
      setVehicleDialog(false);
      setEditingVehicle(null);
      setVehicleForm({ vehicle_number: '', vehicle_type: '', driver_name: '', driver_phone: '' });
      fetchVehicles();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save vehicle');
    } finally {
      setLoading(false);
    }
  };

  const handleEditVehicle = (vehicle: any) => {
    setEditingVehicle(vehicle);
    setVehicleForm({
      vehicle_number: vehicle.vehicle_number || '',
      vehicle_type: vehicle.vehicle_type || '',
      driver_name: vehicle.driver_name || '',
      driver_phone: vehicle.driver_phone || '',
    });
    setVehicleDialog(true);
  };

  const handleDeleteVehicle = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;

    setLoading(true);
    try {
      await axios.delete(`${API_URL}/vehicles/${id}`, { headers: apiHeaders });
      toast.success('Vehicle deleted successfully');
      fetchVehicles();
    } catch (error: any) {
      toast.error('Failed to delete vehicle');
    } finally {
      setLoading(false);
    }
  };

  // Transport handlers
  const handleAddTransport = async () => {
    if (!transportForm.name.trim()) {
      toast.error('Transport name is required');
      return;
    }

    setLoading(true);
    try {
      if (editingTransport) {
        await axios.put(`${API_URL}/transports/${editingTransport.id}`, transportForm, { headers: apiHeaders });
        toast.success('Transport updated successfully');
      } else {
        await axios.post(`${API_URL}/transports`, transportForm, { headers: apiHeaders });
        toast.success('Transport created successfully');
      }
      setTransportDialog(false);
      setEditingTransport(null);
      setTransportForm({ name: '', contact_person: '', phone: '' });
      fetchTransports();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save transport');
    } finally {
      setLoading(false);
    }
  };

  const handleEditTransport = (transport: any) => {
    setEditingTransport(transport);
    setTransportForm({
      name: transport.name || '',
      contact_person: transport.contact_person || '',
      phone: transport.phone || '',
    });
    setTransportDialog(true);
  };

  const handleDeleteTransport = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transport?')) return;

    setLoading(true);
    try {
      await axios.delete(`${API_URL}/transports/${id}`, { headers: apiHeaders });
      toast.success('Transport deleted successfully');
      fetchTransports();
    } catch (error: any) {
      toast.error('Failed to delete transport');
    } finally {
      setLoading(false);
    }
  };

  // Bill To handlers
  const handleAddBillTo = async () => {
    if (!billToForm.name.trim()) {
      toast.error('Bill To name is required');
      return;
    }

    setLoading(true);
    try {
      if (editingBillTo) {
        await axios.put(`${API_URL}/bill-to/${editingBillTo.id}`, billToForm, { headers: apiHeaders });
        toast.success('Bill To updated successfully');
      } else {
        await axios.post(`${API_URL}/bill-to`, billToForm, { headers: apiHeaders });
        toast.success('Bill To created successfully');
      }
      setBillToDialog(false);
      setEditingBillTo(null);
      setBillToForm({ name: '', city: '', gstin: '', address: '', contact_person: '', phone: '', email: '' });
      fetchBillTo();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save bill-to');
    } finally {
      setLoading(false);
    }
  };

  const handleEditBillTo = (billTo: any) => {
    setEditingBillTo(billTo);
    setBillToForm({
      name: billTo.name || '',
      city: billTo.city || '',
      gstin: billTo.gstin || '',
      address: billTo.address || '',
      contact_person: billTo.contact_person || '',
      phone: billTo.phone || '',
      email: billTo.email || '',
    });
    setBillToDialog(true);
  };

  const handleDeleteBillTo = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bill-to?')) return;

    setLoading(true);
    try {
      await axios.delete(`${API_URL}/bill-to/${id}`, { headers: apiHeaders });
      toast.success('Bill To deleted successfully');
      fetchBillTo();
    } catch (error: any) {
      toast.error('Failed to delete bill-to');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Details Management</h1>
          <p className="text-muted-foreground">Manage customers, vehicles, transports, and billing entities</p>
        </div>

        <Tabs defaultValue="customers" className="space-y-4">
          <TabsList className="w-full flex-wrap sm:inline-flex">
            <TabsTrigger value="customers">
              <Users className="h-4 w-4 mr-2" />
              Customers
            </TabsTrigger>
            <TabsTrigger value="vehicles">
              <Truck className="h-4 w-4 mr-2" />
              Vehicles
            </TabsTrigger>
            <TabsTrigger value="transports">
              <Building2 className="h-4 w-4 mr-2" />
              Transports
            </TabsTrigger>
            <TabsTrigger value="billto">
              <FileText className="h-4 w-4 mr-2" />
              Bill To
            </TabsTrigger>
          </TabsList>

          {/* Customers Tab */}
          <TabsContent value="customers">
            <CustomersTab
              customers={customers}
              onEdit={handleEditCustomer}
              onDelete={handleDeleteCustomer}
              onAdd={() => {
                setEditingCustomer(null);
                setCustomerForm({ name: '', city: '', contact_person: '', phone: '', email: '', gstin: '', address: '' });
                setCustomerDialog(true);
              }}
              onRefresh={fetchCustomers}
              isAdmin={isAdmin}
            />
          </TabsContent>

          {/* Vehicles Tab */}
          <TabsContent value="vehicles">
            <VehiclesTab
              vehicles={vehicles}
              onEdit={handleEditVehicle}
              onDelete={handleDeleteVehicle}
              onAdd={() => {
                setEditingVehicle(null);
                setVehicleForm({ vehicle_number: '', vehicle_type: '', driver_name: '', driver_phone: '' });
                setVehicleDialog(true);
              }}
              onRefresh={fetchVehicles}
              isAdmin={isAdmin}
            />
          </TabsContent>

          {/* Transports Tab */}
          <TabsContent value="transports">
            <TransportsTab
              transports={transports}
              onEdit={handleEditTransport}
              onDelete={handleDeleteTransport}
              onAdd={() => {
                setEditingTransport(null);
                setTransportForm({ name: '', contact_person: '', phone: '' });
                setTransportDialog(true);
              }}
              onRefresh={fetchTransports}
              isAdmin={isAdmin}
            />
          </TabsContent>

          {/* Bill To Tab */}
          <TabsContent value="billto">
            <BillToTab
              billToList={billToList}
              onEdit={handleEditBillTo}
              onDelete={handleDeleteBillTo}
              onAdd={() => {
                setEditingBillTo(null);
                setBillToForm({ name: '', city: '', gstin: '', address: '', contact_person: '', phone: '', email: '' });
                setBillToDialog(true);
              }}
              onRefresh={fetchBillTo}
              isAdmin={isAdmin}
            />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <CustomerDialog
          open={customerDialog}
          onOpenChange={setCustomerDialog}
          form={customerForm}
          onFormChange={setCustomerForm}
          onSave={handleAddCustomer}
          loading={loading}
          isEditing={!!editingCustomer}
        />

        <VehicleDialog
          open={vehicleDialog}
          onOpenChange={setVehicleDialog}
          form={vehicleForm}
          onFormChange={setVehicleForm}
          onSave={handleAddVehicle}
          loading={loading}
          isEditing={!!editingVehicle}
        />

        <TransportDialog
          open={transportDialog}
          onOpenChange={setTransportDialog}
          form={transportForm}
          onFormChange={setTransportForm}
          onSave={handleAddTransport}
          loading={loading}
          isEditing={!!editingTransport}
        />

        <BillToDialog
          open={billToDialog}
          onOpenChange={setBillToDialog}
          form={billToForm}
          onFormChange={setBillToForm}
          onSave={handleAddBillTo}
          loading={loading}
          isEditing={!!editingBillTo}
        />
      </div>
    </Layout>
  );
};

export default Details;
