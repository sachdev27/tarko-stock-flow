import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Cloud } from 'lucide-react';
import { useState, useEffect } from 'react';

interface CloudConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  onProviderChange: (provider: string) => void;
  onSave: (config: any) => Promise<void>;
  cloudStatus?: any;
}

export const CloudConfigDialog = ({
  open,
  onOpenChange,
  provider,
  onProviderChange,
  onSave,
  cloudStatus,
}: CloudConfigDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    r2_account_id: '',
    r2_access_key_id: '',
    r2_secret_access_key: '',
    r2_bucket_name: 'tarko-inventory-backups',
    aws_access_key_id: '',
    aws_secret_access_key: '',
    aws_region: 'us-east-1',
    s3_bucket_name: 'tarko-inventory-backups',
  });
  const [currentBucket, setCurrentBucket] = useState('');

  // Load existing config when dialog opens
  useEffect(() => {
    if (open && cloudStatus?.enabled) {
      // Get bucket name from cloudStatus (returned by backend)
      // Backend should include bucket_name in the response
      const bucketName = cloudStatus.bucket_name || 'Not configured';
      setCurrentBucket(bucketName);

      // Pre-fill form with existing bucket name if available
      if (cloudStatus.provider === 'r2') {
        setConfig(prev => ({
          ...prev,
          r2_bucket_name: bucketName !== 'Not configured' ? bucketName : prev.r2_bucket_name,
        }));
      } else if (cloudStatus.provider === 's3') {
        setConfig(prev => ({
          ...prev,
          s3_bucket_name: bucketName !== 'Not configured' ? bucketName : prev.s3_bucket_name,
        }));
      }

      if (cloudStatus.provider) {
        onProviderChange(cloudStatus.provider);
      }
    }
  }, [open, cloudStatus]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave({ provider, ...config });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    if (provider === 'r2') {
      return config.r2_account_id && config.r2_access_key_id && config.r2_secret_access_key;
    } else {
      return config.aws_access_key_id && config.aws_secret_access_key;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cloudStatus?.enabled ? 'Edit Cloud Configuration' : 'Configure Cloud Backup'}</DialogTitle>
          <DialogDescription>
            {cloudStatus?.enabled
              ? 'Update your cloud backup credentials'
              : 'Setup Cloudflare R2 or AWS S3 for automatic snapshot backup'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {cloudStatus?.enabled && (
            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-start gap-2">
                <Cloud className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-green-900 dark:text-green-100 mb-1">Currently Connected</p>
                  <p className="text-green-700 dark:text-green-300">
                    {cloudStatus.provider?.toUpperCase()} • Bucket: {currentBucket || 'Not configured'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <Tabs value={provider} onValueChange={onProviderChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="r2">Cloudflare R2</TabsTrigger>
              <TabsTrigger value="s3">AWS S3</TabsTrigger>
            </TabsList>

            <TabsContent value="r2" className="space-y-3 mt-4">
              <div className="space-y-2">
                <Label htmlFor="r2_account_id">Account ID *</Label>
                <Input
                  id="r2_account_id"
                  value={config.r2_account_id}
                  onChange={(e) => setConfig({ ...config, r2_account_id: e.target.value })}
                  placeholder="Enter R2 Account ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r2_access_key">Access Key ID *</Label>
                <Input
                  id="r2_access_key"
                  value={config.r2_access_key_id}
                  onChange={(e) => setConfig({ ...config, r2_access_key_id: e.target.value })}
                  placeholder="Enter R2 Access Key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r2_secret_key">Secret Access Key *</Label>
                <Input
                  id="r2_secret_key"
                  type="password"
                  value={config.r2_secret_access_key}
                  onChange={(e) => setConfig({ ...config, r2_secret_access_key: e.target.value })}
                  placeholder="Enter R2 Secret Key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r2_bucket">Bucket Name</Label>
                <Input
                  id="r2_bucket"
                  value={config.r2_bucket_name}
                  onChange={(e) => setConfig({ ...config, r2_bucket_name: e.target.value })}
                  placeholder="tarko-inventory-backups"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                <p className="mb-1">💡 Get credentials from:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Cloudflare Dashboard → R2</li>
                  <li>Create bucket if needed</li>
                  <li>Manage R2 API Tokens → Create Token</li>
                </ol>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 mt-2"
                  onClick={() => window.open('https://dash.cloudflare.com', '_blank')}
                >
                  Open Cloudflare Dashboard →
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="s3" className="space-y-3 mt-4">
              <div className="space-y-2">
                <Label htmlFor="aws_access_key">Access Key ID *</Label>
                <Input
                  id="aws_access_key"
                  value={config.aws_access_key_id}
                  onChange={(e) => setConfig({ ...config, aws_access_key_id: e.target.value })}
                  placeholder="Enter AWS Access Key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aws_secret_key">Secret Access Key *</Label>
                <Input
                  id="aws_secret_key"
                  type="password"
                  value={config.aws_secret_access_key}
                  onChange={(e) => setConfig({ ...config, aws_secret_access_key: e.target.value })}
                  placeholder="Enter AWS Secret Key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aws_region">AWS Region</Label>
                <Input
                  id="aws_region"
                  value={config.aws_region}
                  onChange={(e) => setConfig({ ...config, aws_region: e.target.value })}
                  placeholder="us-east-1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3_bucket">Bucket Name</Label>
                <Input
                  id="s3_bucket"
                  value={config.s3_bucket_name}
                  onChange={(e) => setConfig({ ...config, s3_bucket_name: e.target.value })}
                  placeholder="tarko-inventory-backups"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                <p className="mb-1">💡 Get credentials from:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>AWS Console → S3</li>
                  <li>Create bucket if needed</li>
                  <li>IAM → Users → Create access key</li>
                </ol>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1"
              disabled={loading || !isFormValid()}
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
