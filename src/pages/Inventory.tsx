import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Package, Search, Filter, QrCode, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { inventory as inventoryAPI } from '@/lib/api';

interface ProductInventory {
  product_type: string;
  brand: string;
  parameters: any;
  total_quantity: number;
  batches: BatchInventory[];
}

interface BatchInventory {
  id: string;
  batch_code: string;
  batch_no: string;
  location: string;
  current_quantity: number;
  qc_status: string;
  production_date: string;
  rolls: RollInventory[];
}

interface RollInventory {
  id: string;
  length_meters: number;
  initial_length_meters: number;
  status: string;
}

const Inventory = () => {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<ProductInventory[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'product' | 'batch' | 'roll'>('product');

  useEffect(() => {
    fetchLocations();
    fetchInventory();
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const { data } = await inventoryAPI.getLocations();
      setLocations(data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryAPI.getBatches(selectedLocation === 'all' ? undefined : selectedLocation);

      // Transform backend flat batch data to grouped ProductInventory structure
      const productMap = new Map<string, ProductInventory>();

      (data || []).forEach((batch: any) => {
        const key = `${batch.product_type_name}-${batch.brand_name}-${JSON.stringify(batch.parameters)}`;

        if (!productMap.has(key)) {
          productMap.set(key, {
            product_type: batch.product_type_name,
            brand: batch.brand_name,
            parameters: batch.parameters,
            total_quantity: 0,
            batches: [],
          });
        }

        const product = productMap.get(key)!;
        product.total_quantity += parseFloat(batch.current_quantity || 0);
        product.batches.push({
          id: batch.id,
          batch_code: batch.batch_code,
          batch_no: batch.batch_no,
          location: batch.location_name,
          current_quantity: parseFloat(batch.current_quantity || 0),
          qc_status: batch.qc_status,
          production_date: batch.production_date,
          rolls: (batch.rolls || []).map((roll: any) => ({
            ...roll,
            length_meters: parseFloat(roll.length_meters || 0),
            initial_length_meters: parseFloat(roll.initial_length_meters || 0),
          })),
        });
      });

      setInventory(Array.from(productMap.values()));
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventory.filter((item) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      item.product_type.toLowerCase().includes(searchLower) ||
      item.brand.toLowerCase().includes(searchLower) ||
      JSON.stringify(item.parameters).toLowerCase().includes(searchLower) ||
      item.batches.some(b =>
        b.batch_code.toLowerCase().includes(searchLower) ||
        b.batch_no.toLowerCase().includes(searchLower)
      )
    );
  });

  const getQCStatusColor = (status: string) => {
    switch (status) {
      case 'PASSED': return 'bg-green-500';
      case 'FAILED': return 'bg-red-500';
      case 'PENDING': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getRollStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-green-500';
      case 'PARTIAL': return 'bg-orange-500';
      case 'SOLD_OUT': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Package className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
              <p className="text-muted-foreground">Track stock across products, batches, and rolls</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products, batches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>

              {/* Location Filter */}
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="h-12">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All Locations" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* View Mode */}
              <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="View Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Product View</SelectItem>
                  <SelectItem value="batch">Batch View</SelectItem>
                  <SelectItem value="roll">Roll View</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{filteredInventory.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {filteredInventory.reduce((acc, p) => acc + p.batches.length, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Rolls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {filteredInventory.reduce((acc, p) =>
                  acc + p.batches.reduce((bAcc, b) => bAcc + b.rolls.length, 0), 0
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {filteredInventory.reduce((acc, p) => acc + p.total_quantity, 0).toFixed(2)} m
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Inventory List */}
        {loading ? (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted animate-pulse rounded"></div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : filteredInventory.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">No inventory found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredInventory.map((product, idx) => (
              <Card key={idx}>
                <Collapsible>
                  <CardHeader className="cursor-pointer">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <CardTitle className="text-xl">
                              {product.brand} - {product.product_type}
                            </CardTitle>
                            <Badge variant="secondary">
                              {product.total_quantity.toFixed(2)} m
                            </Badge>
                          </div>
                          <CardDescription className="mt-2">
                            {Object.entries(product.parameters).map(([key, value]) => (
                              <span key={key} className="mr-4">
                                <strong>{key}:</strong> {value}
                              </span>
                            ))}
                          </CardDescription>
                        </div>
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CollapsibleTrigger>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="text-sm font-semibold text-muted-foreground mb-2">
                          Batches ({product.batches.length})
                        </div>
                        {product.batches.map((batch) => (
                          <Collapsible key={batch.id}>
                            <Card className="border-l-4 border-l-primary">
                              <CardHeader className="py-3">
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between cursor-pointer">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-3">
                                        <code className="text-sm font-mono bg-secondary px-2 py-1 rounded">
                                          {batch.batch_code}
                                        </code>
                                        <Badge className={getQCStatusColor(batch.qc_status)}>
                                          {batch.qc_status}
                                        </Badge>
                                        <span className="text-sm text-muted-foreground flex items-center">
                                          <MapPin className="h-3 w-3 mr-1" />
                                          {batch.location}
                                        </span>
                                      </div>
                                      <div className="mt-2 text-sm text-muted-foreground">
                                        Batch No: {batch.batch_no} |
                                        Stock: {batch.current_quantity.toFixed(2)} m |
                                        Rolls: {batch.rolls.length} |
                                        Produced: {new Date(batch.production_date).toLocaleDateString()}
                                      </div>
                                    </div>
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                </CollapsibleTrigger>
                              </CardHeader>

                              <CollapsibleContent>
                                <CardContent className="pt-0">
                                  <div className="pl-4 border-l-2 border-secondary">
                                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                                      Rolls ({batch.rolls.length})
                                    </div>
                                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                      {batch.rolls.map((roll, rollIdx) => (
                                        <div
                                          key={roll.id}
                                          className="p-3 bg-secondary/50 rounded-lg flex items-center justify-between"
                                        >
                                          <div>
                                            <div className="text-sm font-medium">Roll #{rollIdx + 1}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {roll.length_meters.toFixed(2)} m
                                              {roll.length_meters !== roll.initial_length_meters && (
                                                <span className="ml-1">
                                                  (was {roll.initial_length_meters.toFixed(2)} m)
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <Badge
                                            variant="secondary"
                                            className={getRollStatusColor(roll.status)}
                                          >
                                            {roll.status}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Card>
                          </Collapsible>
                        ))}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Inventory;
