import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Tag } from 'lucide-react';
import { admin } from '@/lib/api';

interface BrandsTabProps {
  brands: any[];
  onDataChange: () => void;
}

export const BrandsTab = ({ brands, onDataChange }: BrandsTabProps) => {
  const [brandDialog, setBrandDialog] = useState(false);
  const [brandForm, setBrandForm] = useState({ name: '' });

  const handleAddBrand = async () => {
    if (!brandForm.name) {
      toast.error('Brand name is required');
      return;
    }

    try {
      await admin.createBrand(brandForm);
      toast.success('Brand added successfully');
      setBrandDialog(false);
      setBrandForm({ name: '' });
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add brand');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand?')) return;

    try {
      await admin.deleteBrand(id);
      toast.success('Brand deleted successfully');
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete brand');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Brands</CardTitle>
          <CardDescription>Manage product brands</CardDescription>
        </div>
        <Dialog open={brandDialog} onOpenChange={setBrandDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Brand
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Brand</DialogTitle>
              <DialogDescription>Create a new product brand</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand Name *</Label>
                <Input
                  id="brandName"
                  value={brandForm.name}
                  onChange={(e) => setBrandForm({ name: e.target.value })}
                  placeholder="e.g., Tarko Premium"
                />
              </div>
              <Button onClick={handleAddBrand} className="w-full">
                Add Brand
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-3">
          {brands.map((brand) => (
            <div
              key={brand.id}
              className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
            >
              <div className="flex items-center space-x-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{brand.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(brand.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
