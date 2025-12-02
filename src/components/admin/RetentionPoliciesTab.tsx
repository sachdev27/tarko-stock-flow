import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Clock, Edit, Trash2, Calendar, ToggleLeft } from 'lucide-react';
import { useRetentionPolicies, useUpdateRetentionPolicy } from '@/hooks/useBackupConfig';

interface RetentionPolicy {
  id: string;
  policy_name: string;
  backup_type: string;
  retention_days: number;
  auto_delete_enabled: boolean;
  keep_weekly: boolean;
  keep_monthly: boolean;
  max_backups: number | null;
  is_active: boolean;
  created_at: string;
}

export const RetentionPoliciesTab = () => {
  const { data: policies, isLoading } = useRetentionPolicies();
  const updatePolicy = useUpdateRetentionPolicy();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);
  const [formData, setFormData] = useState({
    retention_days: 7,
    auto_delete_enabled: true,
    keep_weekly: false,
    keep_monthly: false,
    max_backups: null as number | null,
  });

  const handleEdit = (policy: RetentionPolicy) => {
    setEditingPolicy(policy);
    setFormData({
      retention_days: policy.retention_days,
      auto_delete_enabled: policy.auto_delete_enabled,
      keep_weekly: policy.keep_weekly,
      keep_monthly: policy.keep_monthly,
      max_backups: policy.max_backups,
    });
    setEditDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPolicy) return;

    await updatePolicy.mutateAsync({
      id: editingPolicy.id,
      data: formData,
    });

    setEditDialogOpen(false);
    setEditingPolicy(null);
  };

  const handleToggleActive = async (policy: RetentionPolicy) => {
    await updatePolicy.mutateAsync({
      id: policy.id,
      data: { is_active: !policy.is_active },
    });
  };

  const handleQuickToggle = async (policy: RetentionPolicy, field: string, value: boolean) => {
    await updatePolicy.mutateAsync({
      id: policy.id,
      data: { [field]: value },
    });
  };

  if (isLoading) {
    return <div>Loading retention policies...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Retention Policies
        </CardTitle>
        <CardDescription>
          Configure automatic backup deletion with dynamic retention periods
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {policies?.map((policy: RetentionPolicy) => (
          <Card key={policy.id} className={!policy.is_active ? 'opacity-60' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <CardTitle className="text-lg">{policy.policy_name}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Badge variant={policy.backup_type === 'cloud' ? 'default' : 'secondary'}>
                        {policy.backup_type.toUpperCase()}
                      </Badge>
                      <span>•</span>
                      <span>{policy.retention_days} days retention</span>
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={policy.is_active}
                      onCheckedChange={() => handleToggleActive(policy)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {policy.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleEdit(policy)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Auto Delete Toggle */}
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="text-sm font-medium">Auto Delete</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {policy.auto_delete_enabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <Switch
                    checked={policy.auto_delete_enabled}
                    onCheckedChange={(checked) =>
                      handleQuickToggle(policy, 'auto_delete_enabled', checked)
                    }
                  />
                </div>

                {/* Keep Weekly Toggle */}
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="text-sm font-medium">Keep Weekly</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {policy.keep_weekly ? 'One per week' : 'Not keeping'}
                    </p>
                  </div>
                  <Switch
                    checked={policy.keep_weekly}
                    onCheckedChange={(checked) => handleQuickToggle(policy, 'keep_weekly', checked)}
                  />
                </div>

                {/* Keep Monthly Toggle */}
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="text-sm font-medium">Keep Monthly</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {policy.keep_monthly ? 'One per month' : 'Not keeping'}
                    </p>
                  </div>
                  <Switch
                    checked={policy.keep_monthly}
                    onCheckedChange={(checked) =>
                      handleQuickToggle(policy, 'keep_monthly', checked)
                    }
                  />
                </div>

                {/* Max Backups */}
                <div className="p-3 border rounded-lg">
                  <Label className="text-sm font-medium">Max Backups</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {policy.max_backups ? `${policy.max_backups} backups` : 'Unlimited'}
                  </p>
                </div>
              </div>

              {/* Visual Timeline */}
              <div className="mt-4 p-4 bg-secondary/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Retention Summary</span>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    • Backups older than <strong>{policy.retention_days} days</strong> will be{' '}
                    {policy.auto_delete_enabled ? (
                      <strong className="text-destructive">automatically deleted</strong>
                    ) : (
                      <strong>kept (auto-delete disabled)</strong>
                    )}
                  </p>
                  {policy.keep_weekly && (
                    <p>
                      • <strong>One backup per week</strong> will be preserved regardless of age
                    </p>
                  )}
                  {policy.keep_monthly && (
                    <p>
                      • <strong>One backup per month</strong> will be preserved regardless of age
                    </p>
                  )}
                  {policy.max_backups && (
                    <p>
                      • Maximum of <strong>{policy.max_backups} backups</strong> will be kept
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Edit Retention Policy</DialogTitle>
                <DialogDescription>
                  Configure retention settings for {editingPolicy?.policy_name}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 py-4">
                {/* Retention Days Slider */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Retention Days</Label>
                    <Badge variant="outline">{formData.retention_days} days</Badge>
                  </div>
                  <Slider
                    value={[formData.retention_days]}
                    onValueChange={([value]) => setFormData({ ...formData, retention_days: value })}
                    min={1}
                    max={365}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1 day</span>
                    <span>30 days</span>
                    <span>90 days</span>
                    <span>365 days</span>
                  </div>
                </div>

                {/* Auto Delete Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <Label htmlFor="auto-delete">Auto Delete</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically delete backups older than retention period
                    </p>
                  </div>
                  <Switch
                    id="auto-delete"
                    checked={formData.auto_delete_enabled}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, auto_delete_enabled: checked })
                    }
                  />
                </div>

                {/* Keep Weekly Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <Label htmlFor="keep-weekly">Keep Weekly Backups</Label>
                    <p className="text-sm text-muted-foreground">
                      Preserve one backup per week even if older than retention period
                    </p>
                  </div>
                  <Switch
                    id="keep-weekly"
                    checked={formData.keep_weekly}
                    onCheckedChange={(checked) => setFormData({ ...formData, keep_weekly: checked })}
                  />
                </div>

                {/* Keep Monthly Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <Label htmlFor="keep-monthly">Keep Monthly Backups</Label>
                    <p className="text-sm text-muted-foreground">
                      Preserve one backup per month even if older than retention period
                    </p>
                  </div>
                  <Switch
                    id="keep-monthly"
                    checked={formData.keep_monthly}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, keep_monthly: checked })
                    }
                  />
                </div>

                {/* Max Backups */}
                <div className="space-y-2">
                  <Label htmlFor="max-backups">Maximum Backups (Optional)</Label>
                  <Input
                    id="max-backups"
                    type="number"
                    value={formData.max_backups || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        max_backups: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    placeholder="Leave blank for unlimited"
                    min={1}
                  />
                  <p className="text-sm text-muted-foreground">
                    Oldest backups will be deleted when this limit is reached
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updatePolicy.isPending}>
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
