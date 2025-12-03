import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Factory, Shield, Mail, Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import axios from 'axios';

const Setup = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    username: ''
  });

  // Check if setup is required on mount
  useEffect(() => {
    const checkSetupRequired = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';
        const response = await axios.get(`${API_BASE_URL}/setup/check`);

        // If setup is not required (admin already exists), redirect to login
        if (!response.data.setup_required) {
          toast.error('Setup already completed. Please login.');
          navigate('/auth', { replace: true });
        }
      } catch (error: any) {
        console.error('Error checking setup status:', error);

        // Check if it's a server error (500) or connection error
        if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
          toast.error('Cannot connect to server. Please ensure the backend is running.');
        } else if (error.response?.status === 500) {
          // Server error - likely database issue, but allow user to proceed
          // The create admin endpoint will handle the actual validation
          console.warn('Server error checking setup status, proceeding anyway');
        }
        // For other errors, allow user to try anyway
        // The backend will reject if admin exists
      } finally {
        setChecking(false);
      }
    };

    checkSetupRequired();
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.email || !formData.password || !formData.fullName || !formData.username) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Username validation
    const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
    if (!usernameRegex.test(formData.username)) {
      toast.error('Username must be 3-30 characters and contain only letters, numbers, underscores, or hyphens');
      return;
    }

    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

      await axios.post(`${API_BASE_URL}/setup/admin`, {
        email: formData.email,
        password: formData.password,
        full_name: formData.fullName,
        username: formData.username
      });

      toast.success('Admin account created successfully!');
      setTimeout(() => {
        navigate('/auth');
      }, 1500);
    } catch (error: any) {
      console.error('Setup error:', error);
      const errorMessage = error.response?.data?.error ||
                          error.response?.data?.message ||
                          'Failed to create admin account';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking setup status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Animated Icon */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl animate-pulse"></div>
            <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-xl">
              <Factory className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
        </div>

        <Card className="border-2 shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Shield className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl font-bold">Initial Setup</CardTitle>
            </div>
            <CardDescription className="text-base">
              Create the first administrator account for Tarko Inventory System
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-semibold">
                  <User className="h-4 w-4 inline mr-1" />
                  Full Name *
                </Label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-11 border-2 focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-semibold">
                  <User className="h-4 w-4 inline mr-1" />
                  Username *
                </Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="johndoe"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-11 border-2 focus:border-primary transition-colors"
                />
                <p className="text-xs text-muted-foreground">
                  3-30 characters, letters, numbers, underscores, or hyphens only
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">
                  <Mail className="h-4 w-4 inline mr-1" />
                  Email Address *
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-11 border-2 focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">
                  <Lock className="h-4 w-4 inline mr-1" />
                  Password *
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-11 border-2 focus:border-primary transition-colors"
                />
                <p className="text-xs text-muted-foreground">
                  Must be at least 8 characters long
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold">
                  <Lock className="h-4 w-4 inline mr-1" />
                  Confirm Password *
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-11 border-2 focus:border-primary transition-colors"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Creating Administrator...
                  </>
                ) : (
                  <>
                    <Shield className="h-5 w-5 mr-2" />
                    Create Admin Account
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground text-center">
                <span className="font-semibold">Note:</span> This administrator account will have full access to all system features and settings.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6 font-mono">
          Tarko Inventory Management System v2.0
        </p>
      </div>
    </div>
  );
};

export default Setup;
