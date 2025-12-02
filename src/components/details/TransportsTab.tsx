import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Edit, Trash2, Search, Download, Upload, FileText } from 'lucide-react';
import { admin } from '@/lib/api';
import { toast } from 'sonner';

interface Transport {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
}

interface TransportsTabProps {
  transports: Transport[];
  onEdit: (transport: Transport) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onRefresh: () => void;
  isAdmin: boolean;
}

export const TransportsTab = ({ transports, onEdit, onDelete, onAdd, onRefresh, isAdmin }: TransportsTabProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTransports = useMemo(() => {
    if (!searchTerm.trim()) return transports;

    const search = searchTerm.toLowerCase();
    return transports.filter(transport =>
      transport.name?.toLowerCase().includes(search) ||
      transport.contact_person?.toLowerCase().includes(search) ||
      transport.phone?.toLowerCase().includes(search)
    );
  }, [transports, searchTerm]);

  const handleDownloadTemplate = async () => {
    try {
      const response = await admin.downloadTransportTemplate();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'transport_import_template.csv');
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
      const response = await admin.exportTransports();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transports_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Transports exported successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to export transports');
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const response = await admin.importTransports(file);
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
      toast.error(error.response?.data?.error || 'Failed to import transports');
      event.target.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Transport Companies</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transports..."
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
                  title="Export Transports"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('transport-import')?.click()}
                  title="Import Transports"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <input
                  id="transport-import"
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  className="hidden"
                />
              </>
            )}

            <Button onClick={onAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Transport
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {filteredTransports.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              {searchTerm ? 'No transports found matching your search' : 'No transports available'}
            </div>
          ) : (
            filteredTransports.map((transport) => (
              <Card key={transport.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="font-semibold text-sm">{transport.name}</div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => onEdit(transport)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onDelete(transport.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {transport.contact_person && (
                    <div className="text-xs"><span className="font-medium">Contact:</span> {transport.contact_person}</div>
                  )}
                  {transport.phone && (
                    <div className="text-xs"><span className="font-medium">Phone:</span> {transport.phone}</div>
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
                <th className="text-left p-2">Contact Person</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransports.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center p-8 text-muted-foreground">
                    {searchTerm ? 'No transports found matching your search' : 'No transports available'}
                  </td>
                </tr>
              ) : (
                filteredTransports.map((transport) => (
                  <tr key={transport.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="p-2 font-medium">{transport.name}</td>
                    <td className="p-2">{transport.contact_person || '-'}</td>
                    <td className="p-2">{transport.phone || '-'}</td>
                    <td className="p-2 text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(transport)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(transport.id)}
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
        {filteredTransports.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredTransports.length} of {transports.length} transports
          </div>
        )}
      </CardContent>
    </Card>
  );
};
