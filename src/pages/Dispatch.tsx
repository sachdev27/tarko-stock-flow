import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TruckIcon, ListIcon } from 'lucide-react';
import { DispatchNewTab } from '@/components/dispatch/DispatchNewTab';
import { DispatchHistoryTab } from '@/components/dispatch/DispatchHistoryTab';

const Dispatch = () => {
  const [activeTab, setActiveTab] = useState('new');

  return (
    <Layout>
      <div className="space-y-4 md:space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TruckIcon className="h-8 w-8" />
            Dispatch
          </h1>
          <p className="text-muted-foreground mt-1">
            Create new dispatches and view dispatch history
          </p>
        </div>

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

          <TabsContent value="new" className="mt-6">
            <DispatchNewTab />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <DispatchHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Dispatch;
