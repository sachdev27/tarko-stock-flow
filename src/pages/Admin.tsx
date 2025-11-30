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
import { BrandsTab } from '@/components/admin/BrandsTab';
import { ProductTypesTab } from '@/components/admin/ProductTypesTab';
import { UsersTab } from '@/components/admin/UsersTab';
import { ParametersTab } from '@/components/admin/ParametersTab';
import { VersionControlTab } from '@/components/admin/VersionControlTab';
import AuditLogsTab from '@/components/admin/AuditLogsTab';
import DatabaseTab from '@/components/admin/DatabaseTab';

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
            <BrandsTab brands={brands} onDataChange={fetchAllData} />
          </TabsContent>

          {/* Product Types Tab */}
          <TabsContent value="products">
            <ProductTypesTab productTypes={productTypes} units={units} onDataChange={fetchAllData} />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <UsersTab users={users} currentUserId={user?.id} onDataChange={fetchAllData} />
          </TabsContent>

          {/* Parameters Tab */}
          <TabsContent value="parameters">
            <ParametersTab parameterOptions={parameterOptions} onDataChange={fetchAllData} />
          </TabsContent>

          {/* Version Control Tab */}
          <TabsContent value="version-control">
            <VersionControlTab
              snapshots={snapshots}
              rollbackHistory={rollbackHistory}
              onDataChange={fetchAllData}
            />
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit">
            <AuditLogsTab auditLogs={auditLogs} users={users} />
          </TabsContent>

          {/* Database Reset Tab */}
          <TabsContent value="database">
            <DatabaseTab />
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
