import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useSyncConfigs,
  useCreateSyncConfig,
  useUpdateSyncConfig,
  useDeleteSyncConfig,
  useTestSyncConfig,
  useTriggerSync,
  useSyncHistory,
} from '@/hooks/useSync';
import { SyncConfigResponse, SyncHistoryItem, SyncType, sync } from '@/lib/sync-api';
import { Cloud, HardDrive, Plus, Trash2, RefreshCw, TestTube, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';

export const SyncSettings = () => {
  const { data: configs, isLoading } = useSyncConfigs();
  const { data: history } = useSyncHistory({ limit: 20 });
  const createConfig = useCreateSyncConfig();
  const updateConfig = useUpdateSyncConfig();
  const deleteConfig = useDeleteSyncConfig();
  const testConfig = useTestSyncConfig();
  const triggerSync = useTriggerSync();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedForDelete, setSelectedForDelete] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    sync_type: 'rsync' as SyncType,
    // Rsync fields
    rsync_destination: '',
    rsync_user: '',
    rsync_host: '',
    rsync_port: 22,
    ssh_key_path: '',
    // Network fields
    network_mount_path: '',
    // Cloud fields
    cloud_provider: 'r2',
    cloud_bucket: '',
    cloud_access_key: '',
    cloud_secret_key: '',
    cloud_endpoint: '',
    cloud_region: 'auto',
    // Settings
    is_enabled: true,
    auto_sync_enabled: false,
    sync_interval_seconds: 60,
    backup_method: 'pg_dump',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      sync_type: 'rsync',
      rsync_destination: '',
      rsync_user: '',
      rsync_host: '',
      rsync_port: 22,
      ssh_key_path: '',
      network_mount_path: '',
      cloud_provider: 'r2',
      cloud_bucket: '',
      cloud_access_key: '',
      cloud_secret_key: '',
      cloud_endpoint: '',
      cloud_region: 'auto',
      is_enabled: true,
      auto_sync_enabled: false,
      sync_interval_seconds: 60,
      backup_method: 'pg_dump',
    });
    setEditingId(null);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      // Test with current form data
      const response = await sync.testConfigData(formData);

      if (response.data.success) {
        setTestResult({
          success: true,
          message: response.data.message || 'Connection test successful! Configuration is valid.'
        });
        toast.success('Connection test successful!');
      } else {
        setTestResult({
          success: false,
          message: response.data.message || 'Connection test failed'
        });
        toast.error(response.data.message || 'Connection test failed');
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Connection test failed';
      setTestResult({
        success: false,
        message: errorMsg
      });
      toast.error(errorMsg);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleEdit = (config: SyncConfigResponse) => {
    setEditingId(config.id);
    setFormData({
      name: config.name,
      sync_type: config.sync_type,
      rsync_destination: config.rsync_destination || '',
      rsync_user: config.rsync_user || '',
      rsync_host: config.rsync_host || '',
      rsync_port: config.rsync_port || 22,
      ssh_key_path: config.ssh_key_path || '',
      network_mount_path: config.network_mount_path || '',
      cloud_provider: config.cloud_provider || 'r2',
      cloud_bucket: config.cloud_bucket || '',
      cloud_access_key: config.cloud_access_key || '',
      cloud_secret_key: '********', // Masked
      cloud_endpoint: config.cloud_endpoint || '',
      cloud_region: config.cloud_region || 'auto',
      is_enabled: config.is_enabled ?? true,
      auto_sync_enabled: config.auto_sync_enabled ?? false,
      sync_interval_seconds: config.sync_interval_seconds || 60,
      backup_method: (config as any).backup_method || 'pg_dump',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        await updateConfig.mutateAsync({ id: editingId, data: formData });
      } else {
        await createConfig.mutateAsync(formData);
      }
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      await testConfig.mutateAsync(id);
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async () => {
    if (selectedForDelete) {
      await deleteConfig.mutateAsync(selectedForDelete);
      setDeleteDialogOpen(false);
      setSelectedForDelete(null);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sync Settings</h1>
          <p className="text-muted-foreground">Configure PostgreSQL data mirroring to NAS or cloud storage</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Sync Destination
        </Button>
      </div>

      <Tabs defaultValue="configurations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="configurations">Configurations</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="configurations" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading...
              </CardContent>
            </Card>
          ) : !configs || configs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Sync Configured</h3>
                <p className="text-muted-foreground mb-4">
                  Set up PostgreSQL data mirroring to replicate your database to NAS or cloud storage
                </p>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Configure First Sync
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {configs.map((config: SyncConfigResponse) => (
                <Card key={config.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          {config.sync_type === 'rsync' ? (
                            <HardDrive className="h-5 w-5" />
                          ) : (
                            <Cloud className="h-5 w-5" />
                          )}
                          {config.name}
                          {!config.is_enabled && (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                          {config.auto_sync_enabled && (
                            <Badge variant="default">
                              Auto-sync ({config.sync_interval_seconds}s)
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          Type: {config.sync_type.toUpperCase()}
                          {config.sync_type === 'rsync' && config.rsync_host && (
                            <> • {config.rsync_host}</>
                          )}
                          {(config.sync_type === 'r2' || config.sync_type === 's3') && config.cloud_bucket && (
                            <> • {config.cloud_bucket}</>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {config.last_sync_status === 'success' && (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                        {config.last_sync_status === 'failed' && (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => triggerSync.mutate(config.id)}
                          disabled={triggerSync.isPending}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTest(config.id)}
                          disabled={testingId === config.id}
                        >
                          <TestTube className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(config)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedForDelete(config.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Last Sync:</span>
                        <p className="font-medium">
                          {config.last_sync_at
                            ? formatDistanceToNow(new Date(config.last_sync_at), { addSuffix: true })
                            : 'Never'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Files:</span>
                        <p className="font-medium">{config.last_sync_files_count || 0}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Data Transferred:</span>
                        <p className="font-medium">
                          {config.last_sync_bytes_transferred
                            ? formatBytes(config.last_sync_bytes_transferred)
                            : '0 B'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <p className="font-medium capitalize">{config.last_sync_status || 'Pending'}</p>
                      </div>
                    </div>
                    {config.last_sync_error && (
                      <div className="mt-3 p-2 bg-destructive/10 text-destructive text-sm rounded">
                        Error: {config.last_sync_error}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Sync History</CardTitle>
              <CardDescription>Recent sync operations</CardDescription>
            </CardHeader>
            <CardContent>
              {!history || history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No sync history yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((item: SyncHistoryItem) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.config_name}</span>
                          <Badge variant="secondary">{item.sync_type}</Badge>
                          {item.status === 'success' && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {item.status === 'failed' && (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(item.started_at), { addSuffix: true })}
                          {item.duration_seconds && ` • ${item.duration_seconds.toFixed(1)}s`}
                          {item.files_synced > 0 && ` • ${item.files_synced} files`}
                          {item.bytes_transferred > 0 && ` • ${formatBytes(item.bytes_transferred)}`}
                        </div>
                        {item.error_message && (
                          <div className="text-sm text-destructive mt-1">
                            {item.error_message}
                          </div>
                        )}
                      </div>
                      <Badge variant={item.triggered_by === 'manual' ? 'default' : 'secondary'}>
                        {item.triggered_by}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Add'} Sync Configuration</DialogTitle>
            <DialogDescription>
              Configure PostgreSQL data mirroring to NAS or cloud storage
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Configuration Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Production NAS, Backup R2"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sync_type">Sync Type</Label>
              <Select
                value={formData.sync_type}
                onValueChange={(value) => setFormData({ ...formData, sync_type: value as SyncType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="network">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      Network Storage (SMB/NFS)
                    </div>
                  </SelectItem>
                  <SelectItem value="rsync">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      Rsync (SSH/Remote)
                    </div>
                  </SelectItem>
                  <SelectItem value="r2">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4" />
                      Cloudflare R2
                    </div>
                  </SelectItem>
                  <SelectItem value="s3">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4" />
                      AWS S3
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.sync_type === 'network' && (
              <div className="space-y-2">
                <Label htmlFor="network_mount_path">Network Mount Path</Label>
                <Input
                  id="network_mount_path"
                  value={formData.network_mount_path}
                  onChange={(e) => setFormData({ ...formData, network_mount_path: e.target.value })}
                  placeholder="/Volumes/NAS or /mnt/nas"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Path to your mounted network storage (SMB/CIFS or NFS). Mount it first using Finder → Go → Connect to Server (smb://nas.local)
                </p>
              </div>
            )}

            {formData.sync_type === 'rsync' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="rsync_destination">Destination Path</Label>
                  <Input
                    id="rsync_destination"
                    value={formData.rsync_destination}
                    onChange={(e) => setFormData({ ...formData, rsync_destination: e.target.value })}
                    placeholder="/mnt/nas/backups or /path/to/local/backup"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rsync_host">Host (optional for local)</Label>
                    <Input
                      id="rsync_host"
                      value={formData.rsync_host}
                      onChange={(e) => setFormData({ ...formData, rsync_host: e.target.value })}
                      placeholder="nas.local or 192.168.1.100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rsync_user">User (optional)</Label>
                    <Input
                      id="rsync_user"
                      value={formData.rsync_user}
                      onChange={(e) => setFormData({ ...formData, rsync_user: e.target.value })}
                      placeholder="admin"
                    />
                  </div>
                </div>
              </>
            )}

            {(formData.sync_type === 'r2' || formData.sync_type === 's3') && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cloud_bucket">Bucket Name</Label>
                  <Input
                    id="cloud_bucket"
                    value={formData.cloud_bucket}
                    onChange={(e) => setFormData({ ...formData, cloud_bucket: e.target.value })}
                    placeholder="tarko-backups"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cloud_access_key">Access Key ID</Label>
                    <Input
                      id="cloud_access_key"
                      value={formData.cloud_access_key}
                      onChange={(e) => setFormData({ ...formData, cloud_access_key: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cloud_secret_key">Secret Access Key</Label>
                    <Input
                      id="cloud_secret_key"
                      type="password"
                      value={formData.cloud_secret_key}
                      onChange={(e) => setFormData({ ...formData, cloud_secret_key: e.target.value })}
                      placeholder={editingId ? '(unchanged)' : ''}
                      required={!editingId}
                    />
                  </div>
                </div>
                {formData.sync_type === 'r2' && (
                  <div className="space-y-2">
                    <Label htmlFor="cloud_endpoint">R2 Endpoint</Label>
                    <Input
                      id="cloud_endpoint"
                      value={formData.cloud_endpoint}
                      onChange={(e) => setFormData({ ...formData, cloud_endpoint: e.target.value })}
                      placeholder="https://account-id.r2.cloudflarestorage.com"
                      required
                    />
                  </div>
                )}
              </>
            )}

            {/* Test Connection Button */}
            <div className="space-y-2 border-y py-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testingConnection || !formData.name}
                className="w-full"
              >
                {testingConnection ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    Test Connection
                  </>
                )}
              </Button>

              {testResult && (
                <div className={`text-sm p-3 rounded ${
                  testResult.success
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <div className="flex items-start gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 border-t pt-4">
              <h4 className="font-medium">Sync Settings</h4>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto_sync">Auto-sync Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically sync at regular intervals
                  </p>
                </div>
                <Switch
                  id="auto_sync"
                  checked={formData.auto_sync_enabled}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, auto_sync_enabled: checked })
                  }
                />
              </div>

              {formData.auto_sync_enabled && (
                <div className="space-y-2">
                  <Label htmlFor="sync_interval">Sync Interval (seconds)</Label>
                  <Input
                    id="sync_interval"
                    type="number"
                    min="30"
                    value={formData.sync_interval_seconds}
                    onChange={(e) =>
                      setFormData({ ...formData, sync_interval_seconds: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Recommended: 60 seconds (1 minute) or higher
                  </p>
                </div>
              )}

              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h5 className="font-medium text-sm flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  PostgreSQL Data Mirroring
                </h5>
                <p className="text-sm text-muted-foreground">
                  This sync will create a PostgreSQL backup. Choose the method below:
                  The destination will contain a single <code className="px-1.5 py-0.5 bg-background rounded">postgres-data</code> directory that gets continuously synchronized with <code className="px-1.5 py-0.5 bg-background rounded">--delete</code> flag for exact replication.
                </p>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="backup_method">Backup Method</Label>
                  <Select
                    value={formData.backup_method}
                    onValueChange={(value) => setFormData({ ...formData, backup_method: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pg_dump">pg_dump — SQL dump (fast, small)</SelectItem>
                      <SelectItem value="pg_basebackup">pg_basebackup — Full data directory (replica)</SelectItem>
                      <SelectItem value="both">Both — create pg_basebackup and pg_dump</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Choose 'pg_basebackup' for exact replication (requires replication access). 'pg_dump' is recommended for small databases.</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  ℹ️ This is designed for creating a live replica of your database, not timestamped backups. For version control and selective table restore, use the separate Cloud Backup feature.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createConfig.isPending || updateConfig.isPending}>
                {editingId ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sync Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this sync configuration. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
