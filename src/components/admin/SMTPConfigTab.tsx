import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Send, CheckCircle, AlertCircle, Eye, EyeOff, Server } from 'lucide-react';
import { toast } from 'sonner';

interface SMTPConfig {
  id?: string;
  smtp_server: string;
  smtp_port: number;
  smtp_email: string;
  use_tls: boolean;
  use_ssl: boolean;
  from_name: string;
  reply_to_email: string;
  is_active: boolean;
  test_email_sent_at?: string;
  test_email_status?: string;
}

export function SMTPConfigTab() {
  const [config, setConfig] = useState<SMTPConfig>({
    smtp_server: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_email: '',
    use_tls: true,
    use_ssl: false,
    from_name: 'Tarko Inventory System',
    reply_to_email: '',
    is_active: true,
  });

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [showEnvFallback, setShowEnvFallback] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';
      const response = await fetch(`${API_BASE_URL}/admin/smtp-config`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.config) {
        setConfig(data.config);
        setHasConfig(true);
        setShowEnvFallback(false);
      } else {
        setShowEnvFallback(true);
      }
    } catch (error) {
      console.error('Failed to load SMTP config:', error);
      toast.error('Failed to load SMTP configuration');
    }
  };

  const handleSave = async () => {
    if (!config.smtp_email || !password) {
      toast.error('Email and password are required');
      return;
    }

    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';
      const response = await fetch(`${API_BASE_URL}/admin/smtp-config`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...config,
          smtp_password: password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('SMTP configuration saved successfully');
        setConfig(data.config);
        setPassword('');
        setHasConfig(true);
        setShowEnvFallback(false);
      } else {
        toast.error(data.error || 'Failed to save SMTP configuration');
      }
    } catch (error) {
      console.error('Failed to save SMTP config:', error);
      toast.error('Failed to save SMTP configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error('Please enter a test email address');
      return;
    }

    setIsTesting(true);

    try {
      const token = localStorage.getItem('token');
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';
      const response = await fetch(`${API_BASE_URL}/admin/smtp-config/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          test_email: testEmail,
          config_id: config.id,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(`Test email sent successfully to ${testEmail}`);
        loadConfig(); // Refresh to get updated test status
      } else {
        toast.error(data.error || 'Failed to send test email');
      }
    } catch (error) {
      console.error('Failed to send test email:', error);
      toast.error('Failed to send test email');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            SMTP Email Configuration
          </CardTitle>
          <CardDescription>
            Configure email settings for password reset and notifications. Settings stored securely in database with encryption.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {showEnvFallback && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No database configuration found. System will use environment variables (.env) as fallback.
                Configure SMTP here to override environment settings.
              </AlertDescription>
            </Alert>
          )}

          {config.test_email_status && (
            <Alert variant={config.test_email_status === 'success' ? 'default' : 'destructive'}>
              {config.test_email_status === 'success' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                Last test: {config.test_email_status === 'success' ? 'Successful' : 'Failed'}
                {config.test_email_sent_at && ` at ${new Date(config.test_email_sent_at).toLocaleString()}`}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_server">SMTP Server</Label>
              <div className="relative">
                <Server className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="smtp_server"
                  value={config.smtp_server}
                  onChange={(e) => setConfig({ ...config, smtp_server: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp_port">SMTP Port</Label>
              <Input
                id="smtp_port"
                type="number"
                value={config.smtp_port}
                onChange={(e) => setConfig({ ...config, smtp_port: parseInt(e.target.value) })}
                placeholder="587"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="smtp_email"
                type="email"
                value={config.smtp_email}
                onChange={(e) => setConfig({ ...config, smtp_email: e.target.value })}
                placeholder="your-email@gmail.com"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_password">
              Password {hasConfig && '(leave blank to keep current)'}
            </Label>
            <div className="relative">
              <Input
                id="smtp_password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={hasConfig ? '••••••••••••••••' : 'Gmail App Password (16 characters)'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              For Gmail: Use an App Password, not your regular password.
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline ml-1"
              >
                Generate one here
              </a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from_name">From Name</Label>
              <Input
                id="from_name"
                value={config.from_name}
                onChange={(e) => setConfig({ ...config, from_name: e.target.value })}
                placeholder="Tarko Inventory System"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reply_to_email">Reply-To Email</Label>
              <Input
                id="reply_to_email"
                type="email"
                value={config.reply_to_email}
                onChange={(e) => setConfig({ ...config, reply_to_email: e.target.value })}
                placeholder="support@example.com (optional)"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="use_tls"
                checked={config.use_tls}
                onCheckedChange={(checked) => setConfig({ ...config, use_tls: checked })}
              />
              <Label htmlFor="use_tls" className="cursor-pointer">Use TLS (Port 587)</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="use_ssl"
                checked={config.use_ssl}
                onCheckedChange={(checked) => setConfig({ ...config, use_ssl: checked })}
              />
              <Label htmlFor="use_ssl" className="cursor-pointer">Use SSL (Port 465)</Label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isLoading} className="flex-1">
              {isLoading ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Test Email Configuration
          </CardTitle>
          <CardDescription>
            Send a test email to verify your SMTP settings are working correctly
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test_email">Test Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="test_email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="pl-10"
              />
            </div>
          </div>

          <Button
            onClick={handleTestEmail}
            disabled={isTesting || !hasConfig}
            variant="outline"
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {isTesting ? 'Sending Test Email...' : 'Send Test Email'}
          </Button>

          {!hasConfig && (
            <p className="text-xs text-gray-500">
              Save your SMTP configuration first before testing
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Common SMTP Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 font-medium border-b pb-2">
              <div>Provider</div>
              <div>Server</div>
              <div>Port (TLS/SSL)</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>Gmail</div>
              <div>smtp.gmail.com</div>
              <div>587 / 465</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>Outlook</div>
              <div>smtp.office365.com</div>
              <div>587</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>Yahoo</div>
              <div>smtp.mail.yahoo.com</div>
              <div>587 / 465</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>SendGrid</div>
              <div>smtp.sendgrid.net</div>
              <div>587 / 465</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
