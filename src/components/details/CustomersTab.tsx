import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Edit, Trash2, Search, Download, Upload, FileText } from 'lucide-react';
import { admin } from '@/lib/api';
import { toast } from 'sonner';

interface Customer {
  id: string;
  name: string;
  city?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
}

interface CustomersTabProps {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onRefresh: () => void;
  isAdmin: boolean;
}

export const CustomersTab = ({ customers, onEdit, onDelete, onAdd, onRefresh, isAdmin }: CustomersTabProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;

    const search = searchTerm.toLowerCase();
    return customers.filter(customer =>
      customer.name?.toLowerCase().includes(search) ||
      customer.city?.toLowerCase().includes(search) ||
      customer.contact_person?.toLowerCase().includes(search) ||
      customer.phone?.toLowerCase().includes(search) ||
      customer.gstin?.toLowerCase().includes(search)
    );
  }, [customers, searchTerm]);

  const handleDownloadTemplate = async () => {
    try {
      const response = await admin.downloadCustomerTemplate();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'customer_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to download template');
    }
  };

  const handleExport = async () => {
    try {
      const response = await admin.exportCustomers();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `customers_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Customers exported successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to export customers');
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const response = await admin.importCustomers(file);
      toast.success(response.data.message);

      if (response.data.errors && response.data.errors.length > 0) {
        const errorCount = response.data.errors.length - (response.data.skipped || 0);
        if (errorCount > 0) {
          toast.error(`${errorCount} rows had errors. Check console for details.`);
        }
        console.error('Import errors:', response.data.errors);
      }

      onRefresh();
      event.target.value = '';
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to import customers');
      event.target.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Customers</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Admin-only buttons */}
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  title="Download Import Template"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  title="Export Customers"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('customer-import')?.click()}
                  title="Import Customers"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <input
                  id="customer-import"
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  className="hidden"
                />
              </>
            )}

            <Button onClick={onAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {filteredCustomers.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              {searchTerm ? 'No customers found matching your search' : 'No customers available'}
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <Card key={customer.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="font-semibold text-sm">{customer.name}</div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => onEdit(customer)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onDelete(customer.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {customer.city && <div className="text-xs text-muted-foreground">{customer.city}</div>}
                  {customer.contact_person && (
                    <div className="text-xs"><span className="font-medium">Contact:</span> {customer.contact_person}</div>
                  )}
                  {customer.phone && (
                    <div className="text-xs"><span className="font-medium">Phone:</span> {customer.phone}</div>
                  )}
                  {customer.gstin && (
                    <div className="text-xs font-mono"><span className="font-medium">GSTIN:</span> {customer.gstin}</div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">City</th>
                <th className="text-left p-2">Contact</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-left p-2">GSTIN</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-muted-foreground">
                    {searchTerm ? 'No customers found matching your search' : 'No customers available'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="p-2 font-medium">{customer.name}</td>
                    <td className="p-2">{customer.city || '-'}</td>
                    <td className="p-2">{customer.contact_person || '-'}</td>
                    <td className="p-2">{customer.phone || '-'}</td>
                    <td className="p-2 font-mono text-sm">{customer.gstin || '-'}</td>
                    <td className="p-2 text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(customer)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(customer.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredCustomers.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredCustomers.length} of {customers.length} customers
          </div>
        )}
      </CardContent>
    </Card>
  );
};
