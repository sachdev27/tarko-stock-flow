import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PackageX, ListIcon } from 'lucide-react';
import ReturnNewModular from '@/components/returns/ReturnNewModular';
import ReturnHistory from '@/components/returns/ReturnHistory';

const Return = () => {
  const [activeTab, setActiveTab] = useState('new');

  return (
    <Layout>
      <div className="space-y-4 md:space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <PackageX className="h-8 w-8" />
            Returns
          </h1>
          <p className="text-muted-foreground mt-1">
            Process product returns and view return history
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="new" className="flex items-center gap-2">
              <PackageX className="h-4 w-4" />
              <span>New Return</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <ListIcon className="h-4 w-4" />
              <span>History</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-6">
            <ReturnNewModular />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <ReturnHistory />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Return;
