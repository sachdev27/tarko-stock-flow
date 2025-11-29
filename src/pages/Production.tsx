import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Factory, ListIcon } from 'lucide-react';
import ProductionNew from './ProductionNew';
import ProductionHistory from './ProductionHistory';

const Production = () => {
  const [activeTab, setActiveTab] = useState('new');

  return (
    <Layout>
      <div className="p-4 w-full">
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

          <TabsContent value="new" className="mt-4">
            <ProductionNew />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ProductionHistory />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Production;
