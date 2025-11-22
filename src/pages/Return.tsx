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
      <div className="p-4 w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="new" className="flex items-center gap-2">
              <PackageX className="h-4 w-4" />
              New Return
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <ListIcon className="h-4 w-4" />
              Return History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-4">
            <ReturnNewModular />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ReturnHistory />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Return;
