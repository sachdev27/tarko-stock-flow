import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Users } from 'lucide-react';
import { admin } from '@/lib/api-typed';
import { formatDate } from '@/lib/utils';
import type * as API from '@/types';

interface UsersTabProps {
  users: any[];
  currentUserId?: string;
  onDataChange: () => void;
}

export const UsersTab = ({ users, currentUserId, onDataChange }: UsersTabProps) => {
  const [userDialog, setUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({
    email: '',
    username: '',
    full_name: '',
    password: '',
    role: 'user',
    is_active: true,
  });

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
      onDataChange();
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

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await admin.deleteUser(id);
      toast.success('User deleted successfully');
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete user');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center text-lg sm:text-xl">
              <Users className="h-5 w-5 mr-2" />
              User Management
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Manage system users and their roles</CardDescription>
          </div>
          <Dialog open={userDialog} onOpenChange={(open) => {
            setUserDialog(open);
            if (!open) {
              setEditingUser(null);
              setUserForm({
                email: '',
                username: '',
                full_name: '',
                password: '',
                role: 'user',
                is_active: true,
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] sm:w-full max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Edit' : 'Add'} User</DialogTitle>
                <DialogDescription>
                  {editingUser ? 'Update user details' : 'Create a new user account'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="user_email">Email</Label>
                  <Input
                    id="user_email"
                    type="email"
                    placeholder="user@example.com"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_username">Username</Label>
                  <Input
                    id="user_username"
                    placeholder="username"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_full_name">Full Name</Label>
                  <Input
                    id="user_full_name"
                    placeholder="John Doe"
                    value={userForm.full_name}
                    onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_password">Password {editingUser && '(leave blank to keep current)'}</Label>
                  <Input
                    id="user_password"
                    type="password"
                    placeholder={editingUser ? 'Leave blank to keep current' : 'Password'}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_role">Role</Label>
                  <Select
                    value={userForm.role}
                    onValueChange={(value) => setUserForm({ ...userForm, role: value })}
                  >
                    <SelectTrigger id="user_role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="user_is_active"
                    checked={userForm.is_active}
                    onChange={(e) => setUserForm({ ...userForm, is_active: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="user_is_active">Active</Label>
                </div>
                <Button onClick={handleAddUser} className="w-full">
                  {editingUser ? 'Update' : 'Create'} User
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {users.map((usr) => (
            <div key={usr.id} className="p-4 bg-secondary/30 rounded-lg space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-semibold text-sm break-words">{usr.email}</div>
                  <div className="text-xs text-muted-foreground">{usr.username || 'No username'}</div>
                </div>
                <div className="flex gap-1 ml-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEditUser(usr)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(usr.id)}
                    disabled={usr.id === currentUserId}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={usr.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                  {usr.role}
                </Badge>
                <Badge variant={usr.is_active ? 'default' : 'secondary'} className="text-xs">
                  {usr.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                <div><strong>Full Name:</strong> {usr.full_name || '-'}</div>
                <div><strong>Last Login:</strong> {usr.last_login_at ? (() => {
                  const date = new Date(usr.last_login_at);
                  return `${formatDate(usr.last_login_at)} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                })() : 'Never'}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="p-3 text-left font-medium">Email</th>
                <th className="p-3 text-left font-medium">Username</th>
                <th className="p-3 text-left font-medium">Full Name</th>
                <th className="p-3 text-left font-medium">Role</th>
                <th className="p-3 text-left font-medium">Status</th>
                <th className="p-3 text-left font-medium">Last Login</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((usr) => (
                <tr key={usr.id} className="border-b hover:bg-muted/50">
                  <td className="p-3">{usr.email}</td>
                  <td className="p-3">{usr.username || '-'}</td>
                  <td className="p-3">{usr.full_name || '-'}</td>
                  <td className="p-3">
                    <Badge variant={usr.role === 'admin' ? 'default' : 'secondary'}>
                      {usr.role}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={usr.is_active ? 'default' : 'secondary'}>
                      {usr.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {usr.last_login_at ? (() => {
                      const date = new Date(usr.last_login_at);
                      return `${formatDate(usr.last_login_at)} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                    })() : 'Never'}
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditUser(usr)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(usr.id)}
                      disabled={usr.id === currentUserId}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
