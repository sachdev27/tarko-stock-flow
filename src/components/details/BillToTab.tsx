import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Edit, Trash2, Search, Download, Upload, FileText } from 'lucide-react';
import { admin } from '@/lib/api';
import { toast } from 'sonner';

interface BillTo {
  id: string;
  name: string;
  city?: string;
  gstin?: string;
  address?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
}

interface BillToTabProps {
  billToList: BillTo[];
  onEdit: (billTo: BillTo) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onRefresh: () => void;
  isAdmin: boolean;
}

export const BillToTab = ({ billToList, onEdit, onDelete, onAdd, onRefresh, isAdmin }: BillToTabProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredBillTo = useMemo(() => {
    if (!searchTerm.trim()) return billToList;

    const search = searchTerm.toLowerCase();
    return billToList.filter(billTo =>
      billTo.name?.toLowerCase().includes(search) ||
      billTo.city?.toLowerCase().includes(search) ||
      billTo.gstin?.toLowerCase().includes(search) ||
      billTo.contact_person?.toLowerCase().includes(search) ||
      billTo.phone?.toLowerCase().includes(search)
    );
  }, [billToList, searchTerm]);

  const handleDownloadTemplate = async () => {
    try {
      const response = await admin.downloadBillToTemplate();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'billto_import_template.csv');
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
      const response = await admin.exportBillTo();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `billto_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Bill-To entities exported successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to export bill-to');
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const response = await admin.importBillTo(file);
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
      toast.error(error.response?.data?.error || 'Failed to import bill-to');
      event.target.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Bill To Entities</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search bill-to..."
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
                  title="Export Bill-To"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('billto-import')?.click()}
                  title="Import Bill-To"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <input
                  id="billto-import"
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  className="hidden"
                />
              </>
            )}

            <Button onClick={onAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Bill To
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">City</th>
                <th className="text-left p-2">GSTIN</th>
                <th className="text-left p-2">Contact</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBillTo.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-muted-foreground">
                    {searchTerm ? 'No bill-to entities found matching your search' : 'No bill-to entities available'}
                  </td>
                </tr>
              ) : (
                filteredBillTo.map((billTo) => (
                  <tr key={billTo.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="p-2 font-medium">{billTo.name}</td>
                    <td className="p-2">{billTo.city || '-'}</td>
                    <td className="p-2 font-mono text-sm">{billTo.gstin || '-'}</td>
                    <td className="p-2">{billTo.contact_person || '-'}</td>
                    <td className="p-2">{billTo.phone || '-'}</td>
                    <td className="p-2 text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(billTo)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(billTo.id)}
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
        {filteredBillTo.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredBillTo.length} of {billToList.length} bill-to entities
          </div>
        )}
      </CardContent>
    </Card>
  );
};
