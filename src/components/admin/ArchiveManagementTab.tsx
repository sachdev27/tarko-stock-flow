import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Plus, Archive, Package, Tag, FileText } from 'lucide-react';
import {
  useArchiveBuckets,
  useAddArchiveBucket,
  useArchiveBackup,
  useArchivedBackups,
  useCloudCredentials,
  useDeletionLog,
} from '@/hooks/useBackupConfig';
import { useQuery } from '@tanstack/react-query';
import { versionControl } from '@/lib/api';

interface CloudCredential {
  id: string;
  provider: string;
  bucket_name: string;
}

interface ArchiveBucket {
  id: string;
  bucket_name: string;
  description?: string;
  provider?: string;
}

interface ArchivedBackup {
  id: string;
  original_backup_id: string;
  backup_type: string;
  archive_bucket_name?: string;
  tags?: string[];
  archive_size_bytes?: number;
  created_at: string;
}

interface DeletionLogEntry {
  id: string;
  backup_id: string;
  backup_type: string;
  backup_path: string;
  deletion_reason: string;
  deleted_by_user?: string;
  deleted_at: string;
}

export const ArchiveManagementTab = () => {
  const { data: archiveBuckets } = useArchiveBuckets();
  const { data: archivedBackups } = useArchivedBackups();
  const { data: credentials } = useCloudCredentials();
  const addBucket = useAddArchiveBucket();
  const archiveBackup = useArchiveBackup();

  // Fetch available snapshots
  const { data: snapshotsResponse, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => versionControl.getSnapshots(),
  });
  const snapshots = snapshotsResponse?.data || [];

  const [bucketDialogOpen, setBucketDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [bucketForm, setBucketForm] = useState({
    bucket_name: '',
    credentials_id: '',
    description: '',
  });
  const [archiveForm, setArchiveForm] = useState({
    archive_bucket_id: '',
    backup_id: '',
    backup_type: 'local',
    tags: '',
    notes: '',
  });

  const handleAddBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bucketForm.credentials_id) {
      return; // Form validation will prevent this
    }

    // Get provider from selected credential
    const selectedCred = credentials?.find((c: any) => c.id === bucketForm.credentials_id);
    const payload = {
      ...bucketForm,
      provider: selectedCred?.provider || 'r2',
    };

    await addBucket.mutateAsync(payload);
    setBucketDialogOpen(false);
    setBucketForm({ bucket_name: '', credentials_id: '', description: '' });
  };

  const handleArchiveBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    const tagsArray = archiveForm.tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t);

    await archiveBackup.mutateAsync({
      bucketId: archiveForm.archive_bucket_id,
      data: {
        backup_id: archiveForm.backup_id,
        backup_type: archiveForm.backup_type,
        tags: tagsArray,
        notes: archiveForm.notes,
      },
    });

    setArchiveDialogOpen(false);
    setArchiveForm({ archive_bucket_id: '', backup_id: '', backup_type: 'local', tags: '', notes: '' });
  };

  return (
    <div className="space-y-6">
      {/* Archive Buckets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Archive Buckets
              </CardTitle>
              <CardDescription>Long-term storage destinations for important backups</CardDescription>
            </div>
            <Dialog open={bucketDialogOpen} onOpenChange={setBucketDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Archive Bucket
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleAddBucket}>
                  <DialogHeader>
                    <DialogTitle>Add Archive Bucket</DialogTitle>
                    <DialogDescription>
                      Create a new destination for long-term backup archiving
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="bucket_name">Bucket Name</Label>
                      <Input
                        id="bucket_name"
                        value={bucketForm.bucket_name}
                        onChange={(e) => setBucketForm({ ...bucketForm, bucket_name: e.target.value })}
                        placeholder="tarko-archives"
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="credentials_id">Cloud Credentials *</Label>
                      <Select
                        value={bucketForm.credentials_id}
                        onValueChange={(value) =>
                          setBucketForm({ ...bucketForm, credentials_id: value })
                        }
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select credentials" />
                        </SelectTrigger>
                        <SelectContent>
                          {credentials?.length === 0 && (
                            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                              No cloud credentials available.<br />
                              Add credentials in the Cloud Credentials tab first.
                            </div>
                          )}
                          {credentials?.map((cred: CloudCredential) => (
                            <SelectItem key={cred.id} value={cred.id}>
                              {cred.provider.toUpperCase()} - {cred.bucket_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {credentials?.length === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          ⚠️ Please create cloud credentials first in the Cloud Credentials tab
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={bucketForm.description}
                        onChange={(e) => setBucketForm({ ...bucketForm, description: e.target.value })}
                        placeholder="Long-term archive storage for critical backups"
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setBucketDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!bucketForm.bucket_name || !bucketForm.credentials_id || addBucket.isPending}
                    >
                      {addBucket.isPending ? 'Adding...' : 'Add Bucket'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {archiveBuckets && archiveBuckets.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {archiveBuckets.map((bucket: ArchiveBucket) => (
                <Card key={bucket.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{bucket.bucket_name}</CardTitle>
                    <CardDescription>{bucket.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Provider</span>
                      <Badge>{bucket.provider?.toUpperCase()}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Archive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No archive buckets configured</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cherry-Pick Backup */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Cherry-Pick Backups
              </CardTitle>
              <CardDescription>Archive specific backups for long-term storage</CardDescription>
            </div>
            <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={!archiveBuckets || archiveBuckets.length === 0}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Backup
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleArchiveBackup}>
                  <DialogHeader>
                    <DialogTitle>Archive Backup</DialogTitle>
                    <DialogDescription>
                      Copy a backup to long-term archive storage
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="archive_bucket_id">Archive Bucket</Label>
                      <Select
                        value={archiveForm.archive_bucket_id}
                        onValueChange={(value) =>
                          setArchiveForm({ ...archiveForm, archive_bucket_id: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select archive bucket" />
                        </SelectTrigger>
                        <SelectContent>
                          {archiveBuckets?.map((bucket: ArchiveBucket) => (
                            <SelectItem key={bucket.id} value={bucket.id}>
                              {bucket.bucket_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="backup_id">Backup/Snapshot</Label>
                      <Select
                        value={archiveForm.backup_id}
                        onValueChange={(value) =>
                          setArchiveForm({ ...archiveForm, backup_id: value })
                        }
                        disabled={snapshotsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={snapshotsLoading ? "Loading snapshots..." : "Select a snapshot"} />
                        </SelectTrigger>
                        <SelectContent>
                          {snapshots && snapshots.length > 0 ? (
                            snapshots.map((snapshot: any) => (
                              <SelectItem key={snapshot.id} value={snapshot.snapshot_name}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{snapshot.snapshot_name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(snapshot.created_at).toLocaleString()} • {(snapshot.size / 1024 / 1024).toFixed(2)} MB
                                  </span>
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="_no_snapshots" disabled>
                              No snapshots available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="backup_type">Backup Type</Label>
                      <Select
                        value={archiveForm.backup_type}
                        onValueChange={(value) =>
                          setArchiveForm({ ...archiveForm, backup_type: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local</SelectItem>
                          <SelectItem value="cloud">Cloud</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="tags">Tags (comma-separated)</Label>
                      <Input
                        id="tags"
                        value={archiveForm.tags}
                        onChange={(e) => setArchiveForm({ ...archiveForm, tags: e.target.value })}
                        placeholder="important, before-migration, 2024-q4"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={archiveForm.notes}
                        onChange={(e) => setArchiveForm({ ...archiveForm, notes: e.target.value })}
                        placeholder="Backup before major database schema change..."
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setArchiveDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={archiveBackup.isPending}>
                      Archive Backup
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {archivedBackups && archivedBackups.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Backup ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Archive Bucket</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Archived</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedBackups.map((archived: ArchivedBackup) => (
                  <TableRow key={archived.id}>
                    <TableCell className="font-mono text-sm">
                      {archived.original_backup_id}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{archived.backup_type}</Badge>
                    </TableCell>
                    <TableCell>{archived.archive_bucket_name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {archived.tags?.map((tag: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {archived.archive_size_bytes
                        ? `${(archived.archive_size_bytes / 1024 / 1024).toFixed(2)} MB`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(archived.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No archived backups</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const DeletionLogTab = () => {
  const { data: deletionLog } = useDeletionLog(100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Deletion Audit Log
        </CardTitle>
        <CardDescription>Complete history of backup deletions</CardDescription>
      </CardHeader>

      <CardContent>
        {deletionLog && deletionLog.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Backup ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Deleted By</TableHead>
                <TableHead>Deleted At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deletionLog.map((log: DeletionLogEntry) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">{log.backup_id}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.backup_type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {log.backup_path}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        log.deletion_reason === 'retention_policy'
                          ? 'default'
                          : log.deletion_reason === 'manual'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {log.deletion_reason.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{log.deleted_by_user || 'System'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(log.deleted_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No deletion records</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
