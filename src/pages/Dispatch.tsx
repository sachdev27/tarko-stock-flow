import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TruckIcon, ListIcon } from 'lucide-react';
import DispatchNewModular from './DispatchNewModular';
import DispatchHistory from './DispatchHistory';

const Dispatch = () => {
  const [activeTab, setActiveTab] = useState('new');

  return (
    <Layout>
      <div className="p-4 w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="new" className="flex items-center gap-2">
              <TruckIcon className="h-4 w-4" />
              New Dispatch
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <ListIcon className="h-4 w-4" />
              Dispatch History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-4">
            <DispatchNewModular />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <DispatchHistory />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Dispatch;
