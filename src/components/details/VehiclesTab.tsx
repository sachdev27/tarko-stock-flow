import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Edit, Trash2, Search, Download, Upload, FileText } from 'lucide-react';
import { admin } from '@/lib/api';
import { toast } from 'sonner';

interface Vehicle {
  id: string;
  vehicle_number?: string;
  vehicle_type?: string;
  driver_name?: string;
  driver_phone?: string;
}

interface VehiclesTabProps {
  vehicles: Vehicle[];
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onRefresh: () => void;
  isAdmin: boolean;
}

export const VehiclesTab = ({ vehicles, onEdit, onDelete, onAdd, onRefresh, isAdmin }: VehiclesTabProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredVehicles = useMemo(() => {
    if (!searchTerm.trim()) return vehicles;

    const search = searchTerm.toLowerCase();
    return vehicles.filter(vehicle =>
      vehicle.vehicle_number?.toLowerCase().includes(search) ||
      vehicle.vehicle_type?.toLowerCase().includes(search) ||
      vehicle.driver_name?.toLowerCase().includes(search) ||
      vehicle.driver_phone?.toLowerCase().includes(search)
    );
  }, [vehicles, searchTerm]);

  const handleDownloadTemplate = async () => {
    try {
      const response = await admin.downloadVehicleTemplate();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'vehicle_import_template.csv');
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
      const response = await admin.exportVehicles();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `vehicles_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Vehicles exported successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to export vehicles');
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const response = await admin.importVehicles(file);
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
      toast.error(error.response?.data?.error || 'Failed to import vehicles');
      event.target.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Vehicles</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vehicles..."
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
                  title="Export Vehicles"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('vehicle-import')?.click()}
                  title="Import Vehicles"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <input
                  id="vehicle-import"
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  className="hidden"
                />
              </>
            )}

            <Button onClick={onAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Vehicle
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {filteredVehicles.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              {searchTerm ? 'No vehicles found matching your search' : 'No vehicles available'}
            </div>
          ) : (
            filteredVehicles.map((vehicle) => (
              <Card key={vehicle.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-sm">{vehicle.vehicle_number || '-'}</div>
                      <div className="text-xs text-muted-foreground">{vehicle.vehicle_type || '-'}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => onEdit(vehicle)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onDelete(vehicle.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {vehicle.driver_name && (
                    <div className="text-xs"><span className="font-medium">Driver:</span> {vehicle.driver_name}</div>
                  )}
                  {vehicle.driver_phone && (
                    <div className="text-xs"><span className="font-medium">Phone:</span> {vehicle.driver_phone}</div>
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
                <th className="text-left p-2">Vehicle Number</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Driver Name</th>
                <th className="text-left p-2">Driver Phone</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-muted-foreground">
                    {searchTerm ? 'No vehicles found matching your search' : 'No vehicles available'}
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="p-2 font-medium">{vehicle.vehicle_number || '-'}</td>
                    <td className="p-2">{vehicle.vehicle_type || '-'}</td>
                    <td className="p-2">{vehicle.driver_name || '-'}</td>
                    <td className="p-2">{vehicle.driver_phone || '-'}</td>
                    <td className="p-2 text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(vehicle)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(vehicle.id)}
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
        {filteredVehicles.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredVehicles.length} of {vehicles.length} vehicles
          </div>
        )}
      </CardContent>
    </Card>
  );
};
