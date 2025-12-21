import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Factory, ListIcon } from 'lucide-react';
import { ProductionNewTab } from '@/components/production/ProductionNewTab';
import { ProductionHistoryTab } from '@/components/production/ProductionHistoryTab';

const Production = () => {
  const [activeTab, setActiveTab] = useState('new');

  return (
    <Layout>
      <div className="space-y-4 md:space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Factory className="h-8 w-8" />
            Production
          </h1>
          <p className="text-muted-foreground mt-1">
            Create new production batches and view production history
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="new" className="flex items-center gap-2">
              <Factory className="h-4 w-4" />
              New Production
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <ListIcon className="h-4 w-4" />
              Production History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-6">
            <div className="max-w-4xl mx-auto">
              <ProductionNewTab />
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <ProductionHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Production;
