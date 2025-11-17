import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, Code } from 'lucide-react';

export const MigrationNotice = ({ page }: { page: string }) => {
  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              Page Under Migration
            </CardTitle>
            <CardDescription>
              {page} is being migrated from Supabase to Flask API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Code className="h-4 w-4" />
              <AlertTitle>Backend Migration in Progress</AlertTitle>
              <AlertDescription>
                This page is currently being migrated from Supabase cloud to our new Flask backend API.
                The backend is running on <code className="text-sm bg-muted px-1 py-0.5 rounded">http://localhost:5500</code>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Completed
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Flask backend API created and running</li>
                <li>PostgreSQL database setup with seed data</li>
                <li>JWT authentication implemented</li>
                <li>API endpoints defined (auth, inventory, production, transactions)</li>
                <li>Supabase dependencies removed</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                In Progress
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Migrating {page} to use Flask API</li>
                <li>Updating data fetching logic</li>
                <li>Testing all CRUD operations</li>
              </ul>
            </div>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>Admin Credentials:</strong>
              </p>
              <p className="text-sm font-mono mt-1">
                Email: admin@tarko.com<br />
                Password: admin123
              </p>
            </div>

            <div className="mt-4 text-sm text-muted-foreground">
              Backend is running at: <code className="bg-muted px-1 py-0.5 rounded">http://localhost:5500/api</code>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
