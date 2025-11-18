import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Settings, Plus, Trash2, Edit, Building, Tag, Package, Users, Shield, Sliders } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { admin, parameters } from '@/lib/api';

const Admin = () => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  // Master data states
  const [locations, setLocations] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [parameterOptions, setParameterOptions] = useState<Record<string, any[]>>({});
  const [users, setUsers] = useState<any[]>([]);

  // Dialog states
  const [locationDialog, setLocationDialog] = useState(false);
  const [brandDialog, setBrandDialog] = useState(false);
  const [productTypeDialog, setProductTypeDialog] = useState(false);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [parameterDialog, setParameterDialog] = useState(false);
  const [userDialog, setUserDialog] = useState(false);

  // Edit mode states
  const [editingProductType, setEditingProductType] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);

  // Form data
  const [locationForm, setLocationForm] = useState({ name: '', address: '' });
  const [brandForm, setBrandForm] = useState({ name: '' });
  const [productTypeForm, setProductTypeForm] = useState({
    name: '',
    unit_id: '',
    description: '',
    parameter_schema: [] as any[],
    roll_configuration: {
      type: 'standard_rolls',
      options: [
        { value: 500, label: '500m' },
        { value: 300, label: '300m' },
        { value: 200, label: '200m' },
        { value: 100, label: '100m' }
      ],
      allow_cut_rolls: true,
      bundle_sizes: [],
      allow_spare: false
    }
  });
  const [newParameter, setNewParameter] = useState({
    name: '',
    type: 'text',
    required: false,
  });
  const [customerForm, setCustomerForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
  });
  const [parameterForm, setParameterForm] = useState({
    parameter_name: 'PE',
    option_value: '',
  });
  const [userForm, setUserForm] = useState({
    email: '',
    username: '',
    full_name: '',
    password: '',
    role: 'user',
    is_active: true,
  });

  useEffect(() => {
    if (isAdmin) {
      fetchAllData();
    }
  }, [isAdmin]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      console.log('Fetching admin data...');
      const [locsRes, brandsRes, typesRes, customersRes, unitsRes, logsRes, paramsRes, usersRes] = await Promise.all([
        admin.getLocations(),
        admin.getBrands(),
        admin.getProductTypes(),
        admin.getCustomers(),
        admin.getUnits(),
        admin.getAuditLogs(),
        parameters.getOptions(),
        admin.getUsers(),
      ]);

      console.log('Admin data fetched:', { locsRes, brandsRes, typesRes, customersRes, unitsRes, logsRes, paramsRes, usersRes });
      setLocations(locsRes.data || []);
      setBrands(brandsRes.data || []);
      setProductTypes(typesRes.data || []);
      setCustomers(customersRes.data || []);
      setUnits(unitsRes.data || []);
      setAuditLogs(logsRes.data || []);
      setParameterOptions(paramsRes.data || {});
      setUsers(usersRes.data || []);
    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      console.error('Error details:', error.response?.data);
      toast.error(`Failed to load admin data: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async () => {
    if (!locationForm.name) {
      toast.error('Location name is required');
      return;
    }

    try {
      await admin.createLocation(locationForm);
      toast.success('Location added successfully');
      setLocationDialog(false);
      setLocationForm({ name: '', address: '' });
      fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add location');
    }
  };

  const handleAddBrand = async () => {
    if (!brandForm.name) {
      toast.error('Brand name is required');
      return;
    }

    try {
      await admin.createBrand(brandForm);
      toast.success('Brand added successfully');
      setBrandDialog(false);
      setBrandForm({ name: '' });
      fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add brand');
    }
  };

  const handleAddCustomer = async () => {
    if (!customerForm.name) {
      toast.error('Customer name is required');
      return;
    }

    try {
      await admin.createCustomer(customerForm);
      toast.success('Customer added successfully');
      setCustomerDialog(false);
      setCustomerForm({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        gstin: '',
        address: '',
      });
      fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add customer');
    }
  };

  const handleAddProductType = async () => {
    if (!productTypeForm.name || !productTypeForm.unit_id) {
      toast.error('Product type name and unit are required');
      return;
    }

    try {
      if (editingProductType) {
        await admin.updateProductType(editingProductType.id, productTypeForm);
        toast.success('Product type updated successfully');
      } else {
        await admin.createProductType(productTypeForm);
        toast.success('Product type added successfully');
      }

      setProductTypeDialog(false);
      setEditingProductType(null);
      setProductTypeForm({
        name: '',
        unit_id: '',
        description: '',
        parameter_schema: [],
        roll_configuration: {
          type: 'standard_rolls',
          options: [
            { value: 500, label: '500m' },
            { value: 300, label: '300m' },
            { value: 200, label: '200m' },
            { value: 100, label: '100m' }
          ],
          allow_cut_rolls: true,
          bundle_sizes: [],
          allow_spare: false,
        },
      });
      setNewParameter({ name: '', type: 'text', required: false });
      fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save product type');
    }
  };

  const handleEditProductType = (productType: any) => {
    setEditingProductType(productType);
    setProductTypeForm({
      name: productType.name,
      unit_id: productType.unit_id,
      description: productType.description || '',
      parameter_schema: productType.parameter_schema || [],
      roll_configuration: productType.roll_configuration || {
        type: 'standard_rolls',
        options: [
          { value: 500, label: '500m' },
          { value: 300, label: '300m' },
          { value: 200, label: '200m' },
          { value: 100, label: '100m' }
        ],
        allow_cut_rolls: true,
        bundle_sizes: [],
        allow_spare: false,
      },
    });
    setProductTypeDialog(true);
  };

  const handleAddParameter = async () => {
    if (!parameterForm.option_value.trim()) {
      toast.error('Please enter a value');
      return;
    }

    try {
      await parameters.addOption({
        parameter_name: parameterForm.parameter_name,
        option_value: parameterForm.option_value.trim(),
      });

      toast.success('Parameter option added successfully');
      setParameterDialog(false);
      setParameterForm({
        parameter_name: 'PE',
        option_value: '',
      });
      fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add parameter option');
    }
  };

  const handleAddUser = async () => {
    if (!userForm.email || !userForm.username || !userForm.full_name || !userForm.password) {
      toast.error('Email, username, full name, and password are required');
      return;
    }

    try {
      if (editingUser) {
        const updateData: any = {
          email: userForm.email,
          username: userForm.username,
          full_name: userForm.full_name,
          role: userForm.role,
          is_active: userForm.is_active,
        };
        if (userForm.password) {
          updateData.password = userForm.password;
        }
        await admin.updateUser(editingUser.id, updateData);
        toast.success('User updated successfully');
      } else {
        await admin.createUser(userForm);
        toast.success('User created successfully');
      }

      setUserDialog(false);
      setEditingUser(null);
      setUserForm({
        email: '',
        username: '',
        full_name: '',
        password: '',
        role: 'user',
        is_active: true,
      });
      fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save user');
    }
  };

  const handleEditUser = (usr: any) => {
    setEditingUser(usr);
    setUserForm({
      email: usr.email,
      username: usr.username || '',
      full_name: usr.full_name || '',
      password: '', // Don't populate password on edit
      role: usr.role,
      is_active: usr.is_active ?? true,
    });
    setUserDialog(true);
  };

  const handleDelete = async (table: string, id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      switch (table) {
        case 'locations':
          await admin.deleteLocation(id);
          break;
        case 'brands':
          await admin.deleteBrand(id);
          break;
        case 'product_types':
          await admin.deleteProductType(id);
          break;
        case 'customers':
          await admin.deleteCustomer(id);
          break;
        case 'parameters':
          await parameters.deleteOption(parseInt(id));
          break;
        case 'users':
          await admin.deleteUser(id);
          break;
      }

      toast.success('Item deleted successfully');
      fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete item');
    }
  };

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2 text-red-500" />
                Access Denied
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                You don't have permission to access the admin panel. Contact your administrator for access.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Settings className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-muted-foreground">Manage master data and system configuration</p>
          </div>
        </div>

        <Tabs defaultValue="locations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="locations">Locations</TabsTrigger>
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="parameters">Parameters</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>

          {/* Locations Tab */}
          <TabsContent value="locations">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Locations / Warehouses</CardTitle>
                  <CardDescription>Manage storage locations and warehouses</CardDescription>
                </div>
                <Dialog open={locationDialog} onOpenChange={setLocationDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Location
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Location</DialogTitle>
                      <DialogDescription>Create a new warehouse or storage location</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="locName">Location Name *</Label>
                        <Input
                          id="locName"
                          value={locationForm.name}
                          onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                          placeholder="e.g., Main Warehouse"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="locAddress">Address</Label>
                        <Textarea
                          id="locAddress"
                          value={locationForm.address}
                          onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                          placeholder="Full address"
                          rows={3}
                        />
                      </div>
                      <Button onClick={handleAddLocation} className="w-full">
                        Add Location
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {locations.map((loc) => (
                    <div
                      key={loc.id}
                      className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <Building className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{loc.name}</div>
                          {loc.address && (
                            <div className="text-sm text-muted-foreground">{loc.address}</div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete('locations', loc.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Brands Tab */}
          <TabsContent value="brands">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Brands</CardTitle>
                  <CardDescription>Manage product brands</CardDescription>
                </div>
                <Dialog open={brandDialog} onOpenChange={setBrandDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Brand
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Brand</DialogTitle>
                      <DialogDescription>Create a new product brand</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="brandName">Brand Name *</Label>
                        <Input
                          id="brandName"
                          value={brandForm.name}
                          onChange={(e) => setBrandForm({ name: e.target.value })}
                          placeholder="e.g., Tarko Premium"
                        />
                      </div>
                      <Button onClick={handleAddBrand} className="w-full">
                        Add Brand
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-3">
                  {brands.map((brand) => (
                    <div
                      key={brand.id}
                      className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                    >
                      <div className="flex items-center space-x-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{brand.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete('brands', brand.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Product Types Tab */}
          <TabsContent value="products">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Product Types</CardTitle>
                    <CardDescription>Product categories with parameter definitions</CardDescription>
                  </div>
                  <Dialog open={productTypeDialog} onOpenChange={(open) => {
                    setProductTypeDialog(open);
                    if (!open) {
                      setEditingProductType(null);
                      setProductTypeForm({
                        name: '',
                        unit_id: '',
                        description: '',
                        parameter_schema: [],
                        roll_configuration: {
                          type: 'standard_rolls',
                          options: [
                            { value: 500, label: '500m' },
                            { value: 300, label: '300m' },
                            { value: 200, label: '200m' },
                            { value: 100, label: '100m' }
                          ],
                          allow_cut_rolls: true,
                          bundle_sizes: [],
                          allow_spare: false,
                        },
                      });
                      setNewParameter({ name: '', type: 'text', required: false });
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Product Type
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{editingProductType ? 'Edit' : 'Add'} Product Type</DialogTitle>
                        <DialogDescription>Define a product type with its parameters</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="ptName">Product Type Name *</Label>
                          <Input
                            id="ptName"
                            value={productTypeForm.name}
                            onChange={(e) => setProductTypeForm({ ...productTypeForm, name: e.target.value })}
                            placeholder="e.g., HDPE Pipe"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="ptUnit">Unit *</Label>
                          <Select
                            value={productTypeForm.unit_id}
                            onValueChange={(value) => setProductTypeForm({ ...productTypeForm, unit_id: value })}
                          >
                            <SelectTrigger id="ptUnit">
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map((unit) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name} ({unit.abbreviation})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="ptDesc">Description</Label>
                          <Textarea
                            id="ptDesc"
                            value={productTypeForm.description}
                            onChange={(e) => setProductTypeForm({ ...productTypeForm, description: e.target.value })}
                            placeholder="Optional description"
                            rows={2}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Parameters</Label>
                          <div className="border rounded-lg p-3 space-y-2">
                            {productTypeForm.parameter_schema.map((param, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                                <span className="text-sm">
                                  {param.name} ({param.type}) {param.required && <Badge variant="outline" className="ml-2">Required</Badge>}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const newSchema = productTypeForm.parameter_schema.filter((_, i) => i !== idx);
                                    setProductTypeForm({ ...productTypeForm, parameter_schema: newSchema });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}

                            <div className="grid grid-cols-4 gap-2 mt-2">
                              <Input
                                placeholder="Parameter name"
                                value={newParameter.name}
                                onChange={(e) => setNewParameter({ ...newParameter, name: e.target.value })}
                              />
                              <Select
                                value={newParameter.type}
                                onValueChange={(value) => setNewParameter({ ...newParameter, type: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                  <SelectItem value="select">Select</SelectItem>
                                </SelectContent>
                              </Select>
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={newParameter.required}
                                  onChange={(e) => setNewParameter({ ...newParameter, required: e.target.checked })}
                                  className="rounded"
                                />
                                <span className="text-sm">Required</span>
                              </label>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  if (newParameter.name) {
                                    setProductTypeForm({
                                      ...productTypeForm,
                                      parameter_schema: [...productTypeForm.parameter_schema, newParameter]
                                    });
                                    setNewParameter({ name: '', type: 'text', required: false });
                                  }
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Roll Configuration */}
                        <div className="space-y-3">
                          <Label className="text-base font-semibold">Roll/Bundle Configuration</Label>

                          <div className="space-y-2">
                            <Label htmlFor="rollType">Roll Type</Label>
                            <Select
                              value={productTypeForm.roll_configuration.type}
                              onValueChange={(value) => {
                                // When changing type, ensure all required fields exist
                                const baseConfig = productTypeForm.roll_configuration;
                                const newConfig = {
                                  ...baseConfig,
                                  type: value,
                                  // Ensure all fields have defaults
                                  options: baseConfig.options || [
                                    { value: 500, label: '500m' },
                                    { value: 300, label: '300m' },
                                    { value: 200, label: '200m' },
                                    { value: 100, label: '100m' }
                                  ],
                                  allow_cut_rolls: baseConfig.allow_cut_rolls ?? true,
                                  bundle_sizes: baseConfig.bundle_sizes || [],
                                  allow_spare: baseConfig.allow_spare ?? false,
                                };
                                setProductTypeForm({
                                  ...productTypeForm,
                                  roll_configuration: newConfig
                                });
                              }}
                            >
                              <SelectTrigger id="rollType">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="standard_rolls">Standard Rolls (HDPE Pipe)</SelectItem>
                                <SelectItem value="bundles">Bundles (Sprinkler Pipe)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {productTypeForm.roll_configuration.type === 'standard_rolls' && (
                            <div className="space-y-2">
                              <Label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={productTypeForm.roll_configuration.allow_cut_rolls ?? true}
                                  onChange={(e) => setProductTypeForm({
                                    ...productTypeForm,
                                    roll_configuration: { ...productTypeForm.roll_configuration, allow_cut_rolls: e.target.checked }
                                  })}
                                  className="rounded"
                                />
                                <span>Allow Cut Rolls</span>
                              </Label>
                            </div>
                          )}

                          {productTypeForm.roll_configuration.type === 'bundles' && (
                            <div className="space-y-2">
                              <Label>Bundle Sizes</Label>
                              <div className="flex gap-2">
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    checked={(productTypeForm.roll_configuration.bundle_sizes || []).includes(10)}
                                    onChange={(e) => {
                                      const sizes = e.target.checked
                                        ? [...(productTypeForm.roll_configuration.bundle_sizes || []), 10]
                                        : (productTypeForm.roll_configuration.bundle_sizes || []).filter(s => s !== 10);
                                      setProductTypeForm({
                                        ...productTypeForm,
                                        roll_configuration: { ...productTypeForm.roll_configuration, bundle_sizes: sizes }
                                      });
                                    }}
                                    className="rounded"
                                  />
                                  <span>10 pipes</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    checked={(productTypeForm.roll_configuration.bundle_sizes || []).includes(20)}
                                    onChange={(e) => {
                                      const sizes = e.target.checked
                                        ? [...(productTypeForm.roll_configuration.bundle_sizes || []), 20]
                                        : (productTypeForm.roll_configuration.bundle_sizes || []).filter(s => s !== 20);
                                      setProductTypeForm({
                                        ...productTypeForm,
                                        roll_configuration: { ...productTypeForm.roll_configuration, bundle_sizes: sizes }
                                      });
                                    }}
                                    className="rounded"
                                  />
                                  <span>20 pipes</span>
                                </label>
                              </div>
                              <Label className="flex items-center space-x-2 mt-2">
                                <input
                                  type="checkbox"
                                  checked={productTypeForm.roll_configuration.allow_spare ?? false}
                                  onChange={(e) => setProductTypeForm({
                                    ...productTypeForm,
                                    roll_configuration: { ...productTypeForm.roll_configuration, allow_spare: e.target.checked }
                                  })}
                                  className="rounded"
                                />
                                <span>Allow Spare Pipes (not bundled)</span>
                              </Label>
                            </div>
                          )}
                        </div>

                        <Button onClick={handleAddProductType} className="w-full">
                          {editingProductType ? 'Update' : 'Add'} Product Type
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {productTypes.map((type) => (
                    <div
                      key={type.id}
                      className="p-4 bg-secondary/30 rounded-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <Package className="h-5 w-5 text-muted-foreground mt-1" />
                          <div>
                            <div className="font-semibold text-lg">{type.name}</div>
                            {type.description && (
                              <div className="text-sm text-muted-foreground">{type.description}</div>
                            )}
                            <div className="mt-2 flex items-center space-x-2">
                              <Badge variant="outline">Unit: {type.unit_name || 'N/A'}</Badge>
                              <Badge variant="outline">
                                {type.parameter_schema?.length || 0} parameters
                              </Badge>
                            </div>
                            <div className="mt-2 text-sm">
                              <strong>Parameters:</strong>
                              {(type.parameter_schema || []).map((param: any, idx: number) => (
                                <span key={idx} className="ml-2 text-muted-foreground">
                                  {param.name}({param.type})
                                  {idx < (type.parameter_schema?.length || 0) - 1 && ','}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditProductType(type)}
                          >
                            <Edit className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete('product_types', type.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Customers</CardTitle>
                  <CardDescription>Manage customer information</CardDescription>
                </div>
                <Dialog open={customerDialog} onOpenChange={setCustomerDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Customer
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add New Customer</DialogTitle>
                      <DialogDescription>Create a new customer record</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="custName">Customer Name *</Label>
                          <Input
                            id="custName"
                            value={customerForm.name}
                            onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                            placeholder="Company or Person Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custContact">Contact Person</Label>
                          <Input
                            id="custContact"
                            value={customerForm.contact_person}
                            onChange={(e) => setCustomerForm({ ...customerForm, contact_person: e.target.value })}
                            placeholder="Contact Person"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="custPhone">Phone</Label>
                          <Input
                            id="custPhone"
                            value={customerForm.phone}
                            onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                            placeholder="Phone Number"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custEmail">Email</Label>
                          <Input
                            id="custEmail"
                            type="email"
                            value={customerForm.email}
                            onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                            placeholder="Email Address"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="custGstin">GSTIN</Label>
                        <Input
                          id="custGstin"
                          value={customerForm.gstin}
                          onChange={(e) => setCustomerForm({ ...customerForm, gstin: e.target.value })}
                          placeholder="GST Identification Number"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="custAddress">Address</Label>
                        <Textarea
                          id="custAddress"
                          value={customerForm.address}
                          onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                          placeholder="Full Address"
                          rows={3}
                        />
                      </div>

                      <Button onClick={handleAddCustomer} className="w-full">
                        Add Customer
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {customers.map((customer) => (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {customer.phone && `${customer.phone} | `}
                            {customer.email}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete('customers', customer.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      <Users className="h-5 w-5 mr-2" />
                      User Management
                    </CardTitle>
                    <CardDescription>Manage system users and their roles</CardDescription>
                  </div>
                  <Dialog open={userDialog} onOpenChange={(open) => {
                    setUserDialog(open);
                    if (!open) {
                      setEditingUser(null);
                      setUserForm({
                        email: '',
                        username: '',
                        full_name: '',
                        password: '',
                        role: 'user',
                        is_active: true,
                      });
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add User
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingUser ? 'Edit' : 'Add'} User</DialogTitle>
                        <DialogDescription>
                          {editingUser ? 'Update user details' : 'Create a new user account'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="user_email">Email</Label>
                          <Input
                            id="user_email"
                            type="email"
                            placeholder="user@example.com"
                            value={userForm.email}
                            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="user_username">Username</Label>
                          <Input
                            id="user_username"
                            placeholder="username"
                            value={userForm.username}
                            onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="user_full_name">Full Name</Label>
                          <Input
                            id="user_full_name"
                            placeholder="John Doe"
                            value={userForm.full_name}
                            onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="user_password">Password {editingUser && '(leave blank to keep current)'}</Label>
                          <Input
                            id="user_password"
                            type="password"
                            placeholder={editingUser ? 'Leave blank to keep current' : 'Password'}
                            value={userForm.password}
                            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="user_role">Role</Label>
                          <Select
                            value={userForm.role}
                            onValueChange={(value) => setUserForm({ ...userForm, role: value })}
                          >
                            <SelectTrigger id="user_role">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="user_is_active"
                            checked={userForm.is_active}
                            onChange={(e) => setUserForm({ ...userForm, is_active: e.target.checked })}
                            className="rounded"
                          />
                          <Label htmlFor="user_is_active">Active</Label>
                        </div>
                        <Button onClick={handleAddUser} className="w-full">
                          {editingUser ? 'Update' : 'Create'} User
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="p-3 text-left font-medium">Email</th>
                        <th className="p-3 text-left font-medium">Username</th>
                        <th className="p-3 text-left font-medium">Full Name</th>
                        <th className="p-3 text-left font-medium">Role</th>
                        <th className="p-3 text-left font-medium">Status</th>
                        <th className="p-3 text-left font-medium">Last Login</th>
                        <th className="p-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((usr) => (
                        <tr key={usr.id} className="border-b hover:bg-muted/50">
                          <td className="p-3">{usr.email}</td>
                          <td className="p-3">{usr.username || '-'}</td>
                          <td className="p-3">{usr.full_name || '-'}</td>
                          <td className="p-3">
                            <Badge variant={usr.role === 'admin' ? 'default' : 'secondary'}>
                              {usr.role}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant={usr.is_active ? 'default' : 'secondary'}>
                              {usr.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {usr.last_login_at ? new Date(usr.last_login_at).toLocaleString() : 'Never'}
                          </td>
                          <td className="p-3 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditUser(usr)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete('users', usr.id)}
                              disabled={usr.id === user?.id}
                            >
                              <Trash2 className="h-4 w-4" />
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

          {/* Parameters Tab */}
          <TabsContent value="parameters">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      <Sliders className="h-5 w-5 mr-2" />
                      Parameter Options
                    </CardTitle>
                    <CardDescription>Manage PE, PN, and OD parameter values</CardDescription>
                  </div>
                  <Dialog open={parameterDialog} onOpenChange={setParameterDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Option
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Parameter Option</DialogTitle>
                        <DialogDescription>Add a new value for a parameter</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="paramName">Parameter *</Label>
                          <Select
                            value={parameterForm.parameter_name}
                            onValueChange={(value) =>
                              setParameterForm({ ...parameterForm, parameter_name: value })
                            }
                          >
                            <SelectTrigger id="paramName">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PE">PE (Polyethylene)</SelectItem>
                              <SelectItem value="PN">PN (Pressure Nominal)</SelectItem>
                              <SelectItem value="OD">OD (Outer Diameter)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="paramValue">Value *</Label>
                          <Input
                            id="paramValue"
                            value={parameterForm.option_value}
                            onChange={(e) =>
                              setParameterForm({ ...parameterForm, option_value: e.target.value })
                            }
                            placeholder="e.g., PE80, PN10, 50mm"
                          />
                        </div>
                        <Button onClick={handleAddParameter} className="w-full">
                          Add Option
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* PE Options */}
                  <div>
                    <h3 className="font-semibold mb-3 text-sm">PE (Polyethylene)</h3>
                    <div className="space-y-2">
                      {(parameterOptions['PE'] || []).map((option) => (
                        <div
                          key={option.id}
                          className="flex items-center justify-between p-2 bg-secondary/20 rounded"
                        >
                          <span className="text-sm">{option.value}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete('parameters', option.id.toString())}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {(!parameterOptions['PE'] || parameterOptions['PE'].length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No options added</p>
                      )}
                    </div>
                  </div>

                  {/* PN Options */}
                  <div>
                    <h3 className="font-semibold mb-3 text-sm">PN (Pressure Nominal)</h3>
                    <div className="space-y-2">
                      {(parameterOptions['PN'] || []).map((option) => (
                        <div
                          key={option.id}
                          className="flex items-center justify-between p-2 bg-secondary/20 rounded"
                        >
                          <span className="text-sm">{option.value}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete('parameters', option.id.toString())}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {(!parameterOptions['PN'] || parameterOptions['PN'].length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No options added</p>
                      )}
                    </div>
                  </div>

                  {/* OD Options */}
                  <div>
                    <h3 className="font-semibold mb-3 text-sm">OD (Outer Diameter)</h3>
                    <div className="space-y-2">
                      {(parameterOptions['OD'] || []).map((option) => (
                        <div
                          key={option.id}
                          className="flex items-center justify-between p-2 bg-secondary/20 rounded"
                        >
                          <span className="text-sm">{option.value}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete('parameters', option.id.toString())}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {(!parameterOptions['OD'] || parameterOptions['OD'].length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No options added</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Audit Logs</CardTitle>
                <CardDescription>System activity and change history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-secondary/20 rounded-lg text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <Badge variant="outline" className="mr-2">
                            {log.action_type}
                          </Badge>
                          <span className="font-medium">{log.entity_type}</span>
                          <span className="text-muted-foreground ml-2">
                            {log.description}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;
