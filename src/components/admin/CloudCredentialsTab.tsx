import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Cloud, Trash2, Edit, Key, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
  useCloudCredentials,
  useAddCloudCredential,
  useUpdateCloudCredential,
  useDeleteCloudCredential,
} from '@/hooks/useBackupConfig';
import { backupConfig } from '@/lib/api-typed';
import { toast } from 'sonner';
import type * as API from '@/types';

interface CloudCredential {
  id: string;
  provider: string;
  account_id: string;
  access_key_id: string;
  secret_access_key: string;
  bucket_name: string;
  region?: string;
  endpoint_url?: string;
  is_active: boolean;
  created_at: string;
}

export const CloudCredentialsTab = () => {
  const { data: credentials, isLoading } = useCloudCredentials();
  const addCredential = useAddCloudCredential();
  const updateCredential = useUpdateCloudCredential();
  const deleteCredential = useDeleteCloudCredential();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    provider: 'r2',
    account_id: '',
    access_key_id: '',
    secret_access_key: '',
    bucket_name: '',
    region: '',
    endpoint_url: '',
  });
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'checking' | 'valid' | 'invalid'>>({});

  // Check connection status for all credentials
  useEffect(() => {
    if (credentials) {
      checkAllConnections();
    }
  }, [credentials]);

  const checkAllConnections = async () => {
    if (!credentials) return;

    for (const cred of credentials) {
      if (cred.is_active) {
        await checkConnection(cred.id);
      }
    }
  };

  const checkConnection = async (credId: string) => {
    setConnectionStatus((prev) => ({ ...prev, [credId]: 'checking' }));

    try {
      const response = await backupConfig.testCloudCredential(credId);
      if (response.data.success) {
        setConnectionStatus((prev) => ({ ...prev, [credId]: 'valid' }));
        toast.success(response.data.message);
      } else {
        setConnectionStatus((prev) => ({ ...prev, [credId]: 'invalid' }));
        toast.error(response.data.error);
      }
    } catch (error: any) {
      setConnectionStatus((prev) => ({ ...prev, [credId]: 'invalid' }));
      toast.error(error.response?.data?.error || 'Connection test failed');
    }
  };  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      await updateCredential.mutateAsync({ id: editingId, data: formData });
    } else {
      await addCredential.mutateAsync(formData);
    }

    setDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      provider: 'r2',
      account_id: '',
      access_key_id: '',
      secret_access_key: '',
      bucket_name: '',
      region: '',
      endpoint_url: '',
    });
    setEditingId(null);
  };

  const handleEdit = (cred: CloudCredential) => {
    setFormData({
      provider: cred.provider,
      account_id: cred.account_id,
      access_key_id: cred.access_key_id,
      secret_access_key: '', // Don't populate secret
      bucket_name: cred.bucket_name,
      region: cred.region || '',
      endpoint_url: cred.endpoint_url || '',
    });
    setEditingId(cred.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete these credentials?')) {
      await deleteCredential.mutateAsync(id);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    await updateCredential.mutateAsync({
      id,
      data: { is_active: !currentStatus },
    });
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'r2':
        return '☁️';
      case 's3':
        return '📦';
      case 'azure':
        return '🔷';
      case 'gcs':
        return '☁️';
      default:
        return '💾';
    }
  };

  if (isLoading) {
    return <div>Loading credentials...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Cloud Credentials
            </CardTitle>
            <CardDescription>Manage cloud storage credentials for backups</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Add Credentials
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingId ? 'Edit Credentials' : 'Add Cloud Credentials'}
                  </DialogTitle>
                  <DialogDescription>
                    Configure cloud storage provider credentials for automated backups
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select
                      value={formData.provider}
                      onValueChange={(value) => setFormData({ ...formData, provider: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="r2">Cloudflare R2</SelectItem>
                        <SelectItem value="s3">AWS S3</SelectItem>
                        <SelectItem value="azure">Azure Blob Storage</SelectItem>
                        <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="account_id">Account ID</Label>
                    <Input
                      id="account_id"
                      value={formData.account_id}
                      onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                      placeholder="Your account ID"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="access_key_id">Access Key ID</Label>
                    <Input
                      id="access_key_id"
                      value={formData.access_key_id}
                      onChange={(e) => setFormData({ ...formData, access_key_id: e.target.value })}
                      placeholder="Access key ID"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="secret_access_key">Secret Access Key</Label>
                    <Input
                      id="secret_access_key"
                      type="password"
                      value={formData.secret_access_key}
                      onChange={(e) =>
                        setFormData({ ...formData, secret_access_key: e.target.value })
                      }
                      placeholder={editingId ? 'Leave blank to keep current' : 'Secret access key'}
                      required={!editingId}
                    />
                    {editingId && (
                      <p className="text-xs text-muted-foreground">
                        Leave blank to keep the existing secret key
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="bucket_name">Bucket Name</Label>
                    <Input
                      id="bucket_name"
                      value={formData.bucket_name}
                      onChange={(e) => setFormData({ ...formData, bucket_name: e.target.value })}
                      placeholder="backup-bucket"
                      required
                    />
                  </div>

                  {formData.provider === 's3' && (
                    <div className="grid gap-2">
                      <Label htmlFor="region">Region</Label>
                      <Input
                        id="region"
                        value={formData.region}
                        onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                        placeholder="us-east-1"
                      />
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Label htmlFor="endpoint_url">Endpoint URL (Optional)</Label>
                    <Input
                      id="endpoint_url"
                      value={formData.endpoint_url}
                      onChange={(e) => setFormData({ ...formData, endpoint_url: e.target.value })}
                      placeholder="https://account.r2.cloudflarestorage.com"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addCredential.isPending || updateCredential.isPending}>
                    {editingId ? 'Update' : 'Add'} Credentials
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {credentials && credentials.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Bucket Name</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>Access Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((cred: CloudCredential) => (
                <TableRow key={cred.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getProviderIcon(cred.provider)}</span>
                      <span className="font-medium uppercase">{cred.provider}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{cred.bucket_name}</TableCell>
                  <TableCell className="text-muted-foreground">{cred.account_id}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {cred.access_key_id}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={cred.is_active}
                        onCheckedChange={() => handleToggleActive(cred.id, cred.is_active)}
                      />
                      <div className="flex items-center gap-2">
                        {cred.is_active && connectionStatus[cred.id] === 'checking' && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                        {cred.is_active && connectionStatus[cred.id] === 'valid' && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {cred.is_active && connectionStatus[cred.id] === 'invalid' && (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <Badge variant={cred.is_active ? 'default' : 'secondary'}>
                          {cred.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(cred.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {cred.is_active && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkConnection(cred.id)}
                          disabled={connectionStatus[cred.id] === 'checking'}
                        >
                          {connectionStatus[cred.id] === 'checking' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Test'
                          )}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(cred)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDelete(cred.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12">
            <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Cloud Credentials</h3>
            <p className="text-muted-foreground mb-4">
              Add your first cloud storage credentials to enable automated backups
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Credentials
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
