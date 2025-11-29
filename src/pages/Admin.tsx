import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Settings, Plus, Trash2, Edit, Building, Tag, Package, Users, Shield, Sliders, Upload, Download, FileText, Database, History, RotateCcw, Save, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { admin, parameters, versionControl } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// Database Reset Component
const DatabaseResetSection = () => {
  const [resetOptions, setResetOptions] = useState<any[]>([]);
  const [databaseStats, setDatabaseStats] = useState<Record<string, number>>({});
  const [selectedResetLevel, setSelectedResetLevel] = useState<string>('');
  const [confirmationText, setConfirmationText] = useState<string>('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchResetOptions();
    fetchDatabaseStats();
  }, []);

  const fetchResetOptions = async () => {
    try {
      const { data } = await admin.getResetOptions();
      setResetOptions(data.options);
    } catch (error) {
      console.error('Error fetching reset options:', error);
      toast.error('Failed to load reset options');
    }
  };

  const fetchDatabaseStats = async () => {
    try {
      const { data } = await admin.getDatabaseStats();
      setDatabaseStats(data.stats);
    } catch (error) {
      console.error('Error fetching database stats:', error);
      toast.error('Failed to load database statistics');
    }
  };

  const handleResetClick = (resetLevel: string) => {
    setSelectedResetLevel(resetLevel);
    setConfirmationText('');
    setShowConfirmDialog(true);
  };

  const confirmReset = async () => {
    if (confirmationText !== 'CONFIRM RESET') {
      toast.error('Please type "CONFIRM RESET" to proceed');
      return;
    }

    setLoading(true);
    try {
      const { data } = await admin.resetDatabase(selectedResetLevel, 'CONFIRM_RESET');
      toast.success(data.message);
      setShowConfirmDialog(false);
      setConfirmationText('');
      setSelectedResetLevel('');
      // Refresh stats
      fetchDatabaseStats();
    } catch (error: any) {
      console.error('Error resetting database:', error);
      toast.error(error.response?.data?.error || 'Failed to reset database');
    } finally {
      setLoading(false);
    }
  };

  const selectedOption = resetOptions.find(opt => opt.value === selectedResetLevel);

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <Card className="border-destructive bg-destructive/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </div>
          <CardDescription>
            Database reset operations are irreversible. Please be extremely careful.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Current Database Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Current Database Statistics</CardTitle>
          <CardDescription>Overview of records in each table</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(databaseStats).map(([table, count]) => (
              <div key={table} className="p-3 border rounded-lg">
                <p className="text-xs text-muted-foreground capitalize">{table.replace(/_/g, ' ')}</p>
                <p className="text-2xl font-bold">{typeof count === 'number' ? count.toLocaleString() : count}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reset Options */}
      <Card>
        <CardHeader>
          <CardTitle>Database Reset Options</CardTitle>
          <CardDescription>Choose the level of reset you want to perform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {resetOptions.map((option) => (
              <Card key={option.value} className={`border-2 ${
                option.value === 'complete_wipe' ? 'border-destructive' : 'border-border'
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{option.label}</h3>
                        <Badge variant={
                          option.impact === 'Low' ? 'outline' :
                          option.impact === 'Medium' ? 'secondary' :
                          option.impact === 'High' ? 'default' :
                          'destructive'
                        }>
                          {option.impact}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Keeps:</span>
                        <span className="font-medium">{option.keeps}</span>
                      </div>
                    </div>
                    <Button
                      variant={option.value === 'complete_wipe' ? 'destructive' : 'outline'}
                      onClick={() => handleResetClick(option.value)}
                      className="shrink-0"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {selectedOption && (
                <>
                  <div className="p-3 bg-destructive/10 border border-destructive rounded-lg space-y-2">
                    <p className="font-semibold">You are about to: {selectedOption.label}</p>
                    <p className="text-sm">{selectedOption.description}</p>
                    <p className="text-sm">
                      <span className="font-medium">Impact:</span> {selectedOption.impact}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Will keep:</span> {selectedOption.keeps}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmation">Type "CONFIRM RESET" to proceed:</Label>
                    <Input
                      id="confirmation"
                      value={confirmationText}
                      onChange={(e) => setConfirmationText(e.target.value)}
                      placeholder="CONFIRM RESET"
                      className="font-mono"
                    />
                  </div>

                  <p className="text-sm text-destructive font-semibold">
                    ⚠️ This action cannot be undone!
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowConfirmDialog(false);
              setConfirmationText('');
              setSelectedResetLevel('');
            }}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmReset}
              disabled={loading || confirmationText !== 'CONFIRM RESET'}
            >
              {loading ? 'Resetting...' : 'Confirm Reset'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const Admin = () => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  // Master data states
  const [brands, setBrands] = useState<any[]>([]);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [parameterOptions, setParameterOptions] = useState<Record<string, any[]>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [rollbackHistory, setRollbackHistory] = useState<any[]>([]);

  // Audit log filters
  const [auditUserFilter, setAuditUserFilter] = useState<string>('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');
  const [auditSearchTerm, setAuditSearchTerm] = useState<string>('');
  const [auditTimePreset, setAuditTimePreset] = useState<string>('all');
  const [auditStartDate, setAuditStartDate] = useState<string>('');
  const [auditEndDate, setAuditEndDate] = useState<string>('');

  // Dialog states
  const [brandDialog, setBrandDialog] = useState(false);
  const [productTypeDialog, setProductTypeDialog] = useState(false);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [parameterDialog, setParameterDialog] = useState(false);
  const [userDialog, setUserDialog] = useState(false);
  const [snapshotDialog, setSnapshotDialog] = useState(false);
  const [rollbackDialog, setRollbackDialog] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);

  // Edit mode states
  const [editingProductType, setEditingProductType] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editingParameter, setEditingParameter] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);

  // Search states
  const [customerSearchTerm, setCustomerSearchTerm] = useState<string>('');

  // Form data
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
    city: '',
    state: '',
    pincode: '',
  });
  const [parameterForm, setParameterForm] = useState({
    id: '',
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
  const [snapshotForm, setSnapshotForm] = useState({
    snapshot_name: '',
    description: '',
    tags: [] as string[],
  });

  useEffect(() => {
    if (isAdmin) {
      fetchAllData();
    }
  }, [isAdmin]);

  const fetchAllData = async () => {
    setLoading(true);
    try {const [brandsRes, typesRes, customersRes, unitsRes, logsRes, paramsRes, usersRes] = await Promise.all([
        admin.getBrands(),
        admin.getProductTypes(),
        admin.getCustomers(),
        admin.getUnits(),
        admin.getAuditLogs(),
        parameters.getOptions(),
        admin.getUsers(),
      ]);setBrands(brandsRes.data || []);
      setProductTypes(typesRes.data || []);
      setCustomers(customersRes.data || []);
      setUnits(unitsRes.data || []);
      setAuditLogs(logsRes.data || []);
      setParameterOptions(paramsRes.data || {});
      setUsers(usersRes.data || []);

      // Fetch version control data
      fetchSnapshots();
      fetchRollbackHistory();
    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      console.error('Error details:', error.response?.data);
      toast.error(`Failed to load admin data: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
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
      if (editingCustomer) {
        await admin.updateCustomer(editingCustomer.id, customerForm);
        toast.success('Customer updated successfully');
      } else {
        await admin.createCustomer(customerForm);
        toast.success('Customer added successfully');
      }
      setCustomerDialog(false);
      setEditingCustomer(null);
      setCustomerForm({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        gstin: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
      });
      fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || `Failed to ${editingCustomer ? 'update' : 'add'} customer`);
    }
  };

  const handleEditCustomer = (customer: any) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name || '',
      contact_person: customer.contact_person || '',
      phone: customer.phone || '',
      email: customer.email || '',
      gstin: customer.gstin || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
    });
    setCustomerDialog(true);
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
      if (editingParameter) {
        // Update existing parameter
        await parameters.updateOption(parameterForm.id, {
          parameter_name: parameterForm.parameter_name,
          option_value: parameterForm.option_value.trim(),
        });
        toast.success('Parameter option updated successfully');
      } else {
        // Add new parameter
        await parameters.addOption({
          parameter_name: parameterForm.parameter_name,
          option_value: parameterForm.option_value.trim(),
        });
        toast.success('Parameter option added successfully');
      }

      setParameterDialog(false);
      setEditingParameter(null);
      setParameterForm({
        id: '',
        parameter_name: 'PE',
        option_value: '',
      });
      fetchAllData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || `Failed to ${editingParameter ? 'update' : 'add'} parameter option`);
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

  const handleDownloadTemplate = async () => {
    try {
      const response = await admin.downloadCustomerTemplate();

      // Create a blob from the response
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'customer_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Template downloaded successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to download template');
    }
  };

  const handleExportCustomers = async () => {
    try {
      const response = await admin.exportCustomers();

      // Create a blob from the response
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'customers.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Customers exported successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to export customers');
    }
  };

  const handleImportCustomers = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const response = await admin.importCustomers(file);
      toast.success(response.data.message);

      if (response.data.errors && response.data.errors.length > 0) {
        const errorCount = response.data.errors.length - (response.data.skipped || 0);
        if (errorCount > 0) {
          toast.error(`${errorCount} rows had errors. Check console for details.`);
        }
        console.error('Import errors:', response.data.errors);
      }

      fetchAllData();
      event.target.value = ''; // Reset input
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to import customers');
      event.target.value = ''; // Reset input
    }
  };

  // Version Control functions
  const fetchSnapshots = async () => {
    try {
      const response = await versionControl.getSnapshots();
      setSnapshots(response.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load snapshots');
    }
  };

  const fetchRollbackHistory = async () => {
    try {
      const response = await versionControl.getRollbackHistory();
      setRollbackHistory(response.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load rollback history');
    }
  };

  const handleCreateSnapshot = async () => {
    if (!snapshotForm.snapshot_name) {
      toast.error('Snapshot name is required');
      return;
    }

    setLoading(true);
    try {
      await versionControl.createSnapshot(snapshotForm);
      toast.success('Snapshot created successfully');
      setSnapshotDialog(false);
      setSnapshotForm({ snapshot_name: '', description: '', tags: [] });
      fetchSnapshots();
      fetchAllData(); // Refresh audit logs
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create snapshot');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm('Are you sure you want to delete this snapshot? This action cannot be undone.')) {
      return;
    }

    try {
      await versionControl.deleteSnapshot(snapshotId);
      toast.success('Snapshot deleted successfully');
      fetchSnapshots();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete snapshot');
    }
  };

  const handleRollback = async () => {
    if (!selectedSnapshot) return;

    setLoading(true);
    try {
      const response = await versionControl.rollbackToSnapshot(selectedSnapshot.id, true);
      toast.success(`Rollback completed! ${response.data.affected_tables.length} tables restored.`);
      setRollbackDialog(false);
      setSelectedSnapshot(null);
      fetchSnapshots();
      fetchRollbackHistory();
      fetchAllData(); // Refresh all data after rollback
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Rollback failed');
    } finally {
      setLoading(false);
    }
  };

  const openRollbackDialog = (snapshot: any) => {
    setSelectedSnapshot(snapshot);
    setRollbackDialog(true);
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

        <Tabs defaultValue="brands" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="parameters">Parameters</TabsTrigger>
            <TabsTrigger value="version-control">Version Control</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
            <TabsTrigger value="database" className="text-destructive">
              <Database className="h-4 w-4 mr-2" />
              Database
            </TabsTrigger>
          </TabsList>

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
                        {!['HDPE Pipe', 'Sprinkler Pipe'].includes(type.name) && (
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
                        )}
                      </div>
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
                            {usr.last_login_at ? (() => {
                              const date = new Date(usr.last_login_at);
                              return `${formatDate(usr.last_login_at)} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                            })() : 'Never'}
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
                    <CardDescription>Manage PE, PN, OD, and Type parameter values</CardDescription>
                  </div>
                  <Dialog open={parameterDialog} onOpenChange={(open) => {
                    setParameterDialog(open);
                    if (!open) {
                      setEditingParameter(null);
                      setParameterForm({
                        id: '',
                        parameter_name: 'PE',
                        option_value: '',
                      });
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Option
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingParameter ? 'Edit' : 'Add'} Parameter Option</DialogTitle>
                        <DialogDescription>{editingParameter ? 'Update' : 'Add a new'} value for a parameter</DialogDescription>
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
                              <SelectItem value="Type">Type (Sprinkler Type)</SelectItem>
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
                          {editingParameter ? 'Update' : 'Add'} Option
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingParameter(option);
                                setParameterForm({
                                  id: option.id,
                                  parameter_name: 'PE',
                                  option_value: option.value,
                                });
                                setParameterDialog(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete('parameters', option.id.toString())}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
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
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingParameter(option);
                                setParameterForm({
                                  id: option.id,
                                  parameter_name: 'PN',
                                  option_value: option.value,
                                });
                                setParameterDialog(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete('parameters', option.id.toString())}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
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
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingParameter(option);
                                setParameterForm({
                                  id: option.id,
                                  parameter_name: 'OD',
                                  option_value: option.value,
                                });
                                setParameterDialog(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete('parameters', option.id.toString())}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(!parameterOptions['OD'] || parameterOptions['OD'].length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No options added</p>
                      )}
                    </div>
                  </div>

                  {/* Type Options */}
                  <div>
                    <h3 className="font-semibold mb-3 text-sm">Type (Sprinkler Type)</h3>
                    <div className="space-y-2">
                      {(parameterOptions['Type'] || []).map((option) => (
                        <div
                          key={option.id}
                          className="flex items-center justify-between p-2 bg-secondary/20 rounded"
                        >
                          <span className="text-sm">{option.value}</span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingParameter(option);
                                setParameterForm({
                                  id: option.id,
                                  parameter_name: 'Type',
                                  option_value: option.value,
                                });
                                setParameterDialog(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete('parameters', option.id.toString())}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(!parameterOptions['Type'] || parameterOptions['Type'].length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No options added</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Version Control Tab */}
          <TabsContent value="version-control">
            <div className="space-y-6">

              {/* Snapshots Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Database Snapshots
                      </CardTitle>
                      <CardDescription>
                        Create and manage database snapshots for version control and rollback
                      </CardDescription>
                    </div>
                    <Button onClick={() => setSnapshotDialog(true)}>
                      <Save className="h-4 w-4 mr-2" />
                      Create Snapshot
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {snapshots.map((snapshot) => (
                      <div
                        key={snapshot.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{snapshot.snapshot_name}</h3>
                            {snapshot.is_automatic && (
                              <Badge variant="secondary" className="text-xs">Auto</Badge>
                            )}
                          </div>
                          {snapshot.description && (
                            <p className="text-sm text-muted-foreground mt-1">{snapshot.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>Created: {formatDate(snapshot.created_at)}</span>
                            <span>By: {snapshot.created_by_name || snapshot.created_by_username}</span>
                            <span>Size: {parseFloat(snapshot.file_size_mb || 0).toFixed(2)} MB</span>
                            {snapshot.table_counts && (
                              <span>
                                Tables: {String(Object.values(snapshot.table_counts).reduce((sum: number, count: any) => sum + (count || 0), 0))} records
                              </span>
                            )}
                          </div>
                          {snapshot.tags && snapshot.tags.length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {snapshot.tags.map((tag: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => openRollbackDialog(snapshot)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Rollback
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteSnapshot(snapshot.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {snapshots.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No snapshots created yet. Create your first snapshot to enable version control.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Rollback History Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Rollback History
                  </CardTitle>
                  <CardDescription>
                    View history of all rollback operations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {rollbackHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className={`p-4 border rounded-lg ${entry.success ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{entry.snapshot_name}</h4>
                              <Badge variant={entry.success ? 'default' : 'destructive'}>
                                {entry.success ? 'Success' : 'Failed'}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              Rolled back by {entry.rolled_back_by_name || entry.rolled_back_by_username} on {formatDate(entry.rolled_back_at)}
                            </div>
                            {entry.affected_tables && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Affected tables: {entry.affected_tables.join(', ')}
                              </div>
                            )}
                            {entry.error_message && (
                              <div className="text-xs text-red-600 mt-1">
                                Error: {entry.error_message}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {rollbackHistory.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No rollback operations performed yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Audit Logs</CardTitle>
                    <CardDescription>System activity and change history</CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-sm">
                    {(() => {
                      const filteredCount = auditLogs.filter(log => {
                        if (auditUserFilter && auditUserFilter !== 'all' && log.user_id !== auditUserFilter) return false;
                        if (auditActionFilter && auditActionFilter !== 'all' && log.action_type !== auditActionFilter) return false;

                        const logDate = new Date(log.created_at);
                        const now = new Date();

                        if (auditTimePreset === 'today') {
                          const todayStart = new Date(now.setHours(0, 0, 0, 0));
                          if (logDate < todayStart) return false;
                        } else if (auditTimePreset === 'yesterday') {
                          const yesterdayStart = new Date(now.setHours(0, 0, 0, 0));
                          yesterdayStart.setDate(yesterdayStart.getDate() - 1);
                          const yesterdayEnd = new Date(yesterdayStart);
                          yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
                          if (logDate < yesterdayStart || logDate >= yesterdayEnd) return false;
                        } else if (auditTimePreset === 'last7days') {
                          const sevenDaysAgo = new Date(now);
                          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                          if (logDate < sevenDaysAgo) return false;
                        } else if (auditTimePreset === 'last30days') {
                          const thirtyDaysAgo = new Date(now);
                          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                          if (logDate < thirtyDaysAgo) return false;
                        } else if (auditTimePreset === 'thisMonth') {
                          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                          if (logDate < monthStart) return false;
                        } else if (auditTimePreset === 'lastMonth') {
                          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
                          if (logDate < lastMonthStart || logDate >= lastMonthEnd) return false;
                        } else if (auditTimePreset === 'custom') {
                          if (auditStartDate && logDate < new Date(auditStartDate)) return false;
                          if (auditEndDate && logDate > new Date(auditEndDate)) return false;
                        }

                        if (auditSearchTerm) {
                          const searchLower = auditSearchTerm.toLowerCase();
                          const searchableText = [log.description, log.user_name, log.customer_name, log.batch_code, log.invoice_no].filter(Boolean).join(' ').toLowerCase();
                          if (!searchableText.includes(searchLower)) return false;
                        }

                        return true;
                      }).length;

                      return `${filteredCount} ${filteredCount === 1 ? 'log' : 'logs'}`;
                    })()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="mb-6 space-y-4">
                  {/* Row 1: User, Action, Search */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Filter by User</Label>
                      <Select value={auditUserFilter} onValueChange={setAuditUserFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Users" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Users</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Filter by Action</Label>
                      <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Actions" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Actions</SelectItem>
                          <SelectItem value="CREATE_BATCH">Create Batch</SelectItem>
                          <SelectItem value="DISPATCH">Dispatch</SelectItem>
                          <SelectItem value="CUT_ROLL">Cut Roll</SelectItem>
                          <SelectItem value="EDIT_ROLL">Edit Roll</SelectItem>
                          <SelectItem value="DELETE_BATCH">Delete Batch</SelectItem>
                          <SelectItem value="USER_LOGIN">User Login</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Search</Label>
                      <Input
                        placeholder="Search logs..."
                        value={auditSearchTerm}
                        onChange={(e) => setAuditSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Row 2: Time Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Time Period</Label>
                      <Select
                        value={auditTimePreset}
                        onValueChange={(value) => {
                          setAuditTimePreset(value);
                          if (value !== 'custom') {
                            setAuditStartDate('');
                            setAuditEndDate('');
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All Time" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Time</SelectItem>
                          <SelectItem value="today">Today</SelectItem>
                          <SelectItem value="yesterday">Yesterday</SelectItem>
                          <SelectItem value="last7days">Last 7 Days</SelectItem>
                          <SelectItem value="last30days">Last 30 Days</SelectItem>
                          <SelectItem value="thisMonth">This Month</SelectItem>
                          <SelectItem value="lastMonth">Last Month</SelectItem>
                          <SelectItem value="custom">Custom Range</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {auditTimePreset === 'custom' && (
                      <>
                        <div>
                          <Label>Start Date</Label>
                          <Input
                            type="datetime-local"
                            value={auditStartDate}
                            onChange={(e) => setAuditStartDate(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>End Date</Label>
                          <Input
                            type="datetime-local"
                            value={auditEndDate}
                            onChange={(e) => setAuditEndDate(e.target.value)}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Audit Logs List */}
                <div className="space-y-3">
                  {auditLogs
                    .filter(log => {
                      // User filter
                      if (auditUserFilter && auditUserFilter !== 'all' && log.user_id !== auditUserFilter) {
                        return false;
                      }

                      // Action filter
                      if (auditActionFilter && auditActionFilter !== 'all' && log.action_type !== auditActionFilter) {
                        return false;
                      }

                      // Time filter
                      const logDate = new Date(log.created_at);
                      const now = new Date();

                      if (auditTimePreset === 'today') {
                        const todayStart = new Date(now.setHours(0, 0, 0, 0));
                        if (logDate < todayStart) return false;
                      } else if (auditTimePreset === 'yesterday') {
                        const yesterdayStart = new Date(now.setHours(0, 0, 0, 0));
                        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
                        const yesterdayEnd = new Date(yesterdayStart);
                        yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
                        if (logDate < yesterdayStart || logDate >= yesterdayEnd) return false;
                      } else if (auditTimePreset === 'last7days') {
                        const sevenDaysAgo = new Date(now);
                        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                        if (logDate < sevenDaysAgo) return false;
                      } else if (auditTimePreset === 'last30days') {
                        const thirtyDaysAgo = new Date(now);
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        if (logDate < thirtyDaysAgo) return false;
                      } else if (auditTimePreset === 'thisMonth') {
                        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                        if (logDate < monthStart) return false;
                      } else if (auditTimePreset === 'lastMonth') {
                        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
                        if (logDate < lastMonthStart || logDate >= lastMonthEnd) return false;
                      } else if (auditTimePreset === 'custom') {
                        if (auditStartDate && logDate < new Date(auditStartDate)) return false;
                        if (auditEndDate && logDate > new Date(auditEndDate)) return false;
                      }

                      // Search filter
                      if (auditSearchTerm) {
                        const searchLower = auditSearchTerm.toLowerCase();
                        const searchableText = [
                          log.description,
                          log.user_name,
                          log.customer_name,
                          log.batch_code,
                          log.invoice_no,
                        ].filter(Boolean).join(' ').toLowerCase();

                        if (!searchableText.includes(searchLower)) {
                          return false;
                        }
                      }

                      return true;
                    })
                    .map((log) => {
                      // Parse roll snapshot for weight info
                      let rollSnapshot: any = null;
                      if (log.roll_snapshot) {
                        try {
                          rollSnapshot = typeof log.roll_snapshot === 'string'
                            ? JSON.parse(log.roll_snapshot)
                            : log.roll_snapshot;
                        } catch (e) {
                          // Ignore parse errors
                        }
                      }

                      return (
                        <div
                          key={log.id}
                          className="p-4 bg-secondary/20 rounded-lg border hover:border-primary/50 transition-colors"
                        >
                          {/* Header Row */}
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant={
                                  log.action_type === 'DISPATCH' ? 'destructive' :
                                  log.action_type === 'CREATE_BATCH' ? 'default' :
                                  log.action_type === 'CUT_ROLL' ? 'secondary' :
                                  'outline'
                                }
                                className="text-xs"
                              >
                                {log.action_type}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {log.entity_type}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {(() => {
                                const date = new Date(log.created_at);
                                return `${date.toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })} ${date.toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true
                                })}`;
                              })()}
                            </span>
                          </div>

                          {/* User Info */}
                          <div className="mb-2">
                            <span className="text-sm font-semibold text-primary">
                              {log.user_name || log.user_username || 'Unknown User'}
                            </span>
                            {log.user_email && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({log.user_email})
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          <div className="text-sm mb-2">
                            {log.description}
                          </div>

                          {/* Detailed Information Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                            {/* Customer Name */}
                            {log.customer_name && (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground">Customer</div>
                                <div className="font-medium">{log.customer_name}</div>
                              </div>
                            )}

                            {/* Invoice Number */}
                            {log.invoice_no && (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground">Invoice</div>
                                <div className="font-medium">{log.invoice_no}</div>
                              </div>
                            )}

                            {/* Batch Code */}
                            {log.batch_code && (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground">Batch</div>
                                <div className="font-medium">{log.batch_code}</div>
                              </div>
                            )}

                            {/* Quantity */}
                            {log.quantity_change && (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground">Quantity</div>
                                <div className="font-medium">
                                  {log.quantity_change > 0 ? '+' : ''}
                                  {parseFloat(log.quantity_change).toFixed(2)} m
                                </div>
                              </div>
                            )}

                            {/* Weight (from roll snapshot) */}
                            {rollSnapshot?.weight_kg && (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground">Weight</div>
                                <div className="font-medium">
                                  {parseFloat(rollSnapshot.weight_kg).toFixed(2)} kg
                                </div>
                              </div>
                            )}

                            {/* Roll Length */}
                            {(log.action_type === 'CUT_ROLL' && log.quantity_change) ? (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground">Cut Length</div>
                                <div className="font-medium">
                                  {Math.abs(parseFloat(log.quantity_change)).toFixed(2)} m
                                </div>
                              </div>
                            ) : (log.roll_length || log.roll_initial_length) ? (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground">Roll Length</div>
                                <div className="font-medium">
                                  {parseFloat(log.roll_length || log.roll_initial_length).toFixed(2)} m
                                </div>
                              </div>
                            ) : null}

                            {/* Product Info from snapshot */}
                            {rollSnapshot?.product_type && (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground">Product</div>
                                <div className="font-medium">{rollSnapshot.product_type}</div>
                              </div>
                            )}

                            {/* Brand from snapshot */}
                            {rollSnapshot?.brand && (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground">Brand</div>
                                <div className="font-medium">{rollSnapshot.brand}</div>
                              </div>
                            )}

                            {/* Parameters from snapshot */}
                            {rollSnapshot?.parameters && Object.keys(rollSnapshot.parameters).length > 0 && (
                              <div className="p-2 bg-background rounded border col-span-2">
                                <div className="text-muted-foreground mb-1">Parameters</div>
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(rollSnapshot.parameters).map(([key, value]) => (
                                    <Badge key={key} variant="secondary" className="text-xs">
                                      {key}: {String(value)}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {auditLogs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No audit logs found
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Database Reset Tab */}
          <TabsContent value="database">
            <DatabaseResetSection />
          </TabsContent>
        </Tabs>

        {/* Create Snapshot Dialog */}
        <Dialog open={snapshotDialog} onOpenChange={setSnapshotDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Database Snapshot</DialogTitle>
              <DialogDescription>
                Create a snapshot of the current database state for version control
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Snapshot Name *</Label>
                <Input
                  value={snapshotForm.snapshot_name}
                  onChange={(e) => setSnapshotForm({ ...snapshotForm, snapshot_name: e.target.value })}
                  placeholder="e.g., Before Bulk Import 2025-11-20"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={snapshotForm.description}
                  onChange={(e) => setSnapshotForm({ ...snapshotForm, description: e.target.value })}
                  placeholder="Optional description of this snapshot"
                  rows={3}
                />
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <p className="font-medium mb-1">Important:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Snapshots capture the current state of all inventory data</li>
                      <li>Large databases may take time to snapshot</li>
                      <li>Regular snapshots are recommended before major changes</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSnapshotDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSnapshot} disabled={loading || !snapshotForm.snapshot_name}>
                {loading ? 'Creating...' : 'Create Snapshot'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rollback Confirmation Dialog */}
        <Dialog open={rollbackDialog} onOpenChange={setRollbackDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Confirm Rollback
              </DialogTitle>
              <DialogDescription>
                This action will restore the database to a previous state
              </DialogDescription>
            </DialogHeader>
            {selectedSnapshot && (
              <div className="space-y-4 py-4">
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <h4 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                    ⚠️ Warning: Destructive Action
                  </h4>
                  <ul className="text-sm text-red-800 dark:text-red-200 space-y-1">
                    <li>• All current data will be replaced with snapshot data</li>
                    <li>• Changes made after snapshot creation will be lost</li>
                    <li>• This operation cannot be undone</li>
                    <li>• Consider creating a snapshot of current state first</li>
                  </ul>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Rolling back to:</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{selectedSnapshot.snapshot_name}</span></div>
                    <div><span className="text-muted-foreground">Created:</span> {formatDate(selectedSnapshot.created_at)}</div>
                    <div><span className="text-muted-foreground">Size:</span> {parseFloat(selectedSnapshot.file_size_mb || 0).toFixed(2)} MB</div>
                    {selectedSnapshot.description && (
                      <div className="mt-2">
                        <span className="text-muted-foreground">Description:</span>
                        <p className="text-sm mt-1">{selectedSnapshot.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRollbackDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRollback} disabled={loading}>
                {loading ? 'Rolling back...' : 'Confirm Rollback'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Admin;
