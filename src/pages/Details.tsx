import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Users, Truck, Building2, FileText } from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://localhost:5500/api';

const Details = () => {
  const { token } = useAuth();
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

  useEffect(() => {
    if (token) {
      fetchCustomers();
      fetchVehicles();
      fetchTransports();
      fetchBillTo();
    }
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
    if (!vehicleForm.vehicle_number.trim()) {
      toast.error('Vehicle number is required');
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
          <TabsList>
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
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Customers</CardTitle>
                <Button onClick={() => {
                  setEditingCustomer(null);
                  setCustomerForm({ name: '', city: '', contact_person: '', phone: '', email: '', gstin: '', address: '' });
                  setCustomerDialog(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Customer
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">City</th>
                        <th className="text-left p-2">Contact</th>
                        <th className="text-left p-2">Phone</th>
                        <th className="text-left p-2">GSTIN</th>
                        <th className="text-right p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((customer) => (
                        <tr key={customer.id} className="border-b hover:bg-gray-50">
                          <td className="p-2">{customer.name}</td>
                          <td className="p-2">{customer.city || '-'}</td>
                          <td className="p-2">{customer.contact_person || '-'}</td>
                          <td className="p-2">{customer.phone || '-'}</td>
                          <td className="p-2">{customer.gstin || '-'}</td>
                          <td className="p-2 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditCustomer(customer)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteCustomer(customer.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Vehicles Tab */}
          <TabsContent value="vehicles">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Vehicles</CardTitle>
                <Button onClick={() => {
                  setEditingVehicle(null);
                  setVehicleForm({ vehicle_number: '', vehicle_type: '', driver_name: '', driver_phone: '' });
                  setVehicleDialog(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Vehicle
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Vehicle Number</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Driver Name</th>
                        <th className="text-left p-2">Driver Phone</th>
                        <th className="text-right p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((vehicle) => (
                        <tr key={vehicle.id} className="border-b hover:bg-gray-50">
                          <td className="p-2">{vehicle.vehicle_number}</td>
                          <td className="p-2">{vehicle.vehicle_type || '-'}</td>
                          <td className="p-2">{vehicle.driver_name || '-'}</td>
                          <td className="p-2">{vehicle.driver_phone || '-'}</td>
                          <td className="p-2 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditVehicle(vehicle)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteVehicle(vehicle.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transports Tab */}
          <TabsContent value="transports">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Transport Companies</CardTitle>
                <Button onClick={() => {
                  setEditingTransport(null);
                  setTransportForm({ name: '', contact_person: '', phone: '' });
                  setTransportDialog(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Transport
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Contact Person</th>
                        <th className="text-left p-2">Phone</th>
                        <th className="text-right p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transports.map((transport) => (
                        <tr key={transport.id} className="border-b hover:bg-gray-50">
                          <td className="p-2">{transport.name}</td>
                          <td className="p-2">{transport.contact_person || '-'}</td>
                          <td className="p-2">{transport.phone || '-'}</td>
                          <td className="p-2 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditTransport(transport)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteTransport(transport.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bill To Tab */}
          <TabsContent value="billto">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Bill To Entities</CardTitle>
                <Button onClick={() => {
                  setEditingBillTo(null);
                  setBillToForm({ name: '', city: '', gstin: '', address: '', contact_person: '', phone: '', email: '' });
                  setBillToDialog(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Bill To
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">City</th>
                        <th className="text-left p-2">GSTIN</th>
                        <th className="text-left p-2">Contact</th>
                        <th className="text-left p-2">Phone</th>
                        <th className="text-right p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billToList.map((billTo) => (
                        <tr key={billTo.id} className="border-b hover:bg-gray-50">
                          <td className="p-2">{billTo.name}</td>
                          <td className="p-2">{billTo.city || '-'}</td>
                          <td className="p-2">{billTo.gstin || '-'}</td>
                          <td className="p-2">{billTo.contact_person || '-'}</td>
                          <td className="p-2">{billTo.phone || '-'}</td>
                          <td className="p-2 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditBillTo(billTo)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteBillTo(billTo.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Customer Dialog */}
        <Dialog open={customerDialog} onOpenChange={setCustomerDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                  placeholder="Customer name"
                />
              </div>
              <div>
                <Label>City</Label>
                <Input
                  value={customerForm.city}
                  onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={customerForm.contact_person}
                  onChange={(e) => setCustomerForm({ ...customerForm, contact_person: e.target.value })}
                  placeholder="Contact person"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  placeholder="Email"
                />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input
                  value={customerForm.gstin}
                  onChange={(e) => setCustomerForm({ ...customerForm, gstin: e.target.value })}
                  placeholder="GSTIN"
                />
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  placeholder="Address"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCustomerDialog(false)}>Cancel</Button>
              <Button onClick={handleAddCustomer} disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Vehicle Dialog */}
        <Dialog open={vehicleDialog} onOpenChange={setVehicleDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Vehicle Number *</Label>
                <Input
                  value={vehicleForm.vehicle_number}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_number: e.target.value })}
                  placeholder="Vehicle number"
                />
              </div>
              <div>
                <Label>Vehicle Type</Label>
                <Input
                  value={vehicleForm.vehicle_type}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}
                  placeholder="Vehicle type"
                />
              </div>
              <div>
                <Label>Driver Name</Label>
                <Input
                  value={vehicleForm.driver_name}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, driver_name: e.target.value })}
                  placeholder="Driver name"
                />
              </div>
              <div>
                <Label>Driver Phone</Label>
                <Input
                  value={vehicleForm.driver_phone}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, driver_phone: e.target.value })}
                  placeholder="Driver phone"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVehicleDialog(false)}>Cancel</Button>
              <Button onClick={handleAddVehicle} disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transport Dialog */}
        <Dialog open={transportDialog} onOpenChange={setTransportDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingTransport ? 'Edit Transport' : 'Add Transport'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={transportForm.name}
                  onChange={(e) => setTransportForm({ ...transportForm, name: e.target.value })}
                  placeholder="Transport company name"
                />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={transportForm.contact_person}
                  onChange={(e) => setTransportForm({ ...transportForm, contact_person: e.target.value })}
                  placeholder="Contact person"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={transportForm.phone}
                  onChange={(e) => setTransportForm({ ...transportForm, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTransportDialog(false)}>Cancel</Button>
              <Button onClick={handleAddTransport} disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bill To Dialog */}
        <Dialog open={billToDialog} onOpenChange={setBillToDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingBillTo ? 'Edit Bill To' : 'Add Bill To'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={billToForm.name}
                  onChange={(e) => setBillToForm({ ...billToForm, name: e.target.value })}
                  placeholder="Bill to name"
                />
              </div>
              <div>
                <Label>City</Label>
                <Input
                  value={billToForm.city}
                  onChange={(e) => setBillToForm({ ...billToForm, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input
                  value={billToForm.gstin}
                  onChange={(e) => setBillToForm({ ...billToForm, gstin: e.target.value })}
                  placeholder="GSTIN"
                />
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={billToForm.address}
                  onChange={(e) => setBillToForm({ ...billToForm, address: e.target.value })}
                  placeholder="Address"
                />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={billToForm.contact_person}
                  onChange={(e) => setBillToForm({ ...billToForm, contact_person: e.target.value })}
                  placeholder="Contact person"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={billToForm.phone}
                  onChange={(e) => setBillToForm({ ...billToForm, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={billToForm.email}
                  onChange={(e) => setBillToForm({ ...billToForm, email: e.target.value })}
                  placeholder="Email"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBillToDialog(false)}>Cancel</Button>
              <Button onClick={handleAddBillTo} disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Details;
