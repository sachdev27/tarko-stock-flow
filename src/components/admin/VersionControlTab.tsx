import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Database, History, RotateCcw, Trash2, Save } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { versionControl } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface VersionControlTabProps {
  snapshots: any[];
  rollbackHistory: any[];
  onDataChange: () => void;
}

export const VersionControlTab = ({ snapshots, rollbackHistory, onDataChange }: VersionControlTabProps) => {
  const [snapshotDialog, setSnapshotDialog] = useState(false);
  const [rollbackDialog, setRollbackDialog] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [snapshotForm, setSnapshotForm] = useState({
    snapshot_name: '',
    description: '',
    tags: [] as string[],
  });

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
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create snapshot');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm('Are you sure you want to delete this snapshot?')) return;

    try {
      await versionControl.deleteSnapshot(snapshotId);
      toast.success('Snapshot deleted successfully');
      onDataChange();
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
      onDataChange();
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

  return (
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
            <Dialog open={snapshotDialog} onOpenChange={setSnapshotDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Save className="h-4 w-4 mr-2" />
                  Create Snapshot
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Database Snapshot</DialogTitle>
                  <DialogDescription>
                    Save the current state of the database for version control
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="snapshot_name">Snapshot Name *</Label>
                    <Input
                      id="snapshot_name"
                      value={snapshotForm.snapshot_name}
                      onChange={(e) => setSnapshotForm({ ...snapshotForm, snapshot_name: e.target.value })}
                      placeholder="e.g., before-major-update"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="snapshot_desc">Description</Label>
                    <Textarea
                      id="snapshot_desc"
                      value={snapshotForm.description}
                      onChange={(e) => setSnapshotForm({ ...snapshotForm, description: e.target.value })}
                      placeholder="Optional description"
                      rows={3}
                    />
                  </div>
                  <Button onClick={handleCreateSnapshot} disabled={loading} className="w-full">
                    {loading ? 'Creating...' : 'Create Snapshot'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
                        {Object.keys(snapshot.table_counts).length} tables, {' '}
                        {Object.values(snapshot.table_counts).reduce((sum: number, count: any) => sum + (parseInt(count) || 0), 0)} records
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

      {/* Rollback Confirmation Dialog */}
      <AlertDialog open={rollbackDialog} onOpenChange={setRollbackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Rollback</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to rollback to snapshot "{selectedSnapshot?.snapshot_name}"?
              This will restore the database to its state at {selectedSnapshot?.created_at && formatDate(selectedSnapshot.created_at)}.
              Current data will be backed up automatically before rollback.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setRollbackDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRollback} disabled={loading}>
              {loading ? 'Rolling back...' : 'Confirm Rollback'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
