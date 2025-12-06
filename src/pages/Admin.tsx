import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Settings, Shield, Database, HardDrive } from 'lucide-react';
import { admin, parameters, versionControl } from '@/lib/api-typed';
import type * as API from '@/types';
import { BrandsTab } from '@/components/admin/BrandsTab';
import { ProductTypesTab } from '@/components/admin/ProductTypesTab';
import { UsersTab } from '@/components/admin/UsersTab';
import { ParametersTab } from '@/components/admin/ParametersTab';
import { VersionControlTab } from '@/components/admin/VersionControlTab';
import AuditLogsTab from '@/components/admin/AuditLogsTab';
import DatabaseTab from '@/components/admin/DatabaseTab';
import { CloudCredentialsTab } from '@/components/admin/CloudCredentialsTab';
import { RetentionPoliciesTab } from '@/components/admin/RetentionPoliciesTab';
import { ArchiveManagementTab, DeletionLogTab } from '@/components/admin/ArchiveManagementTab';
import { SMTPConfigTab } from '@/components/admin/SMTPConfigTab';

const Admin = () => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  // Master data states
  const [brands, setBrands] = useState<any[]>([]);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [parameterOptions, setParameterOptions] = useState<Record<string, any[]>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [rollbackHistory, setRollbackHistory] = useState<any[]>([]);

  useEffect(() => {
    if (isAdmin) {
      fetchAllData();
    }
  }, [isAdmin]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [brandsRes, typesRes, unitsRes, logsRes, paramsRes, usersRes] = await Promise.all([
        admin.getBrands(),
        admin.getProductTypes(),
        admin.getUnits(),
        admin.getAuditLogs(),
        parameters.getOptions(),
        admin.getUsers(),
      ]);

      setBrands(brandsRes || []);
      setProductTypes(typesRes || []);
      setUnits(unitsRes || []);
      setAuditLogs(logsRes || []);
      setParameterOptions(paramsRes || {});
      setUsers(usersRes || []);

      // Fetch version control data
      fetchSnapshots();
      fetchRollbackHistory();
    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      toast.error(`Failed to load admin data: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Version Control functions
  const fetchSnapshots = async () => {
    try {
      const response = await versionControl.getSnapshots();
      setSnapshots(response || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load snapshots');
    }
  };

  const fetchRollbackHistory = async () => {
    try {
      const response = await versionControl.getRollbackHistory();
      setRollbackHistory(response || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load rollback history');
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

        <Tabs defaultValue="brands" className="space-y-6">
          <TabsList className="w-full flex-nowrap sm:inline-flex">
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="parameters">Parameters</TabsTrigger>
            <TabsTrigger value="version-control">Version Control</TabsTrigger>
            <TabsTrigger value="backups">
              <HardDrive className="h-4 w-4 mr-2" />
              Backups
            </TabsTrigger>
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

          {/* Backup Management Tab */}
          <TabsContent value="backups">
            <div className="space-y-6">
              <Tabs defaultValue="credentials" className="space-y-6">
                <TabsList className="w-full flex-wrap sm:inline-flex">
                  <TabsTrigger value="credentials">Cloud Credentials</TabsTrigger>
                  <TabsTrigger value="retention">Retention Policies</TabsTrigger>
                  <TabsTrigger value="archive">Archive Management</TabsTrigger>
                  <TabsTrigger value="deletion-log">Deletion Log</TabsTrigger>
                  <TabsTrigger value="smtp">Email (SMTP)</TabsTrigger>
                </TabsList>

                <TabsContent value="credentials">
                  <CloudCredentialsTab />
                </TabsContent>

                <TabsContent value="retention">
                  <RetentionPoliciesTab />
                </TabsContent>

                <TabsContent value="archive">
                  <ArchiveManagementTab />
                </TabsContent>

                <TabsContent value="deletion-log">
                  <DeletionLogTab />
                </TabsContent>

                <TabsContent value="smtp">
                  <SMTPConfigTab />
                </TabsContent>
              </Tabs>
            </div>
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
      </div>
    </Layout>
  );
};

export default Admin;
