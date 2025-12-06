import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';
import { admin } from '@/lib/api-typed';
import { toast } from 'sonner';
import type * as API from '@/types';

const DatabaseTab: React.FC = () => {
  const [resetOptions, setResetOptions] = useState<any[]>([]);
  const [databaseStats, setDatabaseStats] = useState<Record<string, number>>({});
  const [selectedResetLevel, setSelectedResetLevel] = useState<string>('');
  const [confirmationText, setConfirmationText] = useState<string>('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchResetOptions();
    fetchDatabaseStats();
  }, []);

  const fetchResetOptions = async () => {
    try {
      const data = await admin.getResetOptions();
      // api-typed already unwraps the response
      setResetOptions(Array.isArray(data) ? data : (data?.options || []));
    } catch (error) {
      console.error('Error fetching reset options:', error);
      toast.error('Failed to load reset options');
    }
  };

  const fetchDatabaseStats = async () => {
    try {
      const data = await admin.getDatabaseStats();
      // api-typed already unwraps the response
      setDatabaseStats(data?.stats || {});
    } catch (error) {
      console.error('Error fetching database stats:', error);
      toast.error('Failed to load database statistics');
    }
  };

  const handleResetClick = (resetLevel: string) => {
    setSelectedResetLevel(resetLevel);
    setConfirmationText('');
    setShowConfirmDialog(true);
  };

  const confirmReset = async () => {
    if (confirmationText !== 'CONFIRM RESET') {
      toast.error('Please type "CONFIRM RESET" to proceed');
      return;
    }

    setLoading(true);
    try {
      const data = await admin.resetDatabase(selectedResetLevel, 'CONFIRM_RESET');
      // api-typed already unwraps the response
      toast.success(data?.message || 'Database reset successful');
      setShowConfirmDialog(false);
      setConfirmationText('');
      setSelectedResetLevel('');
      // Refresh stats
      fetchDatabaseStats();
    } catch (error: any) {
      console.error('Error resetting database:', error);
      toast.error(error.response?.data?.error || 'Failed to reset database');
    } finally {
      setLoading(false);
    }
  };

  const selectedOption = resetOptions.find(opt => opt.value === selectedResetLevel);

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <Card className="border-destructive bg-destructive/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </div>
          <CardDescription>
            Database reset operations are irreversible. Please be extremely careful.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Current Database Statistics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Database Statistics</CardTitle>
              <CardDescription>Overview of records in each table</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDatabaseStats}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh Stats'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Core Configuration */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Core Configuration</Badge>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['users', 'product_types', 'brands', 'customers'].map((table) => (
                  databaseStats[table] !== undefined && (
                    <div key={table} className="p-3 border rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors">
                      <p className="text-xs text-muted-foreground capitalize font-medium">{table.replace(/_/g, ' ')}</p>
                      <p className="text-2xl font-bold text-primary">{typeof databaseStats[table] === 'number' ? databaseStats[table].toLocaleString() : databaseStats[table]}</p>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Production & Inventory */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Production & Inventory</Badge>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['product_variants', 'batches', 'inventory_stock', 'rolls'].map((table) => (
                  databaseStats[table] !== undefined && (
                    <div key={table} className="p-3 border rounded-lg bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
                      <p className="text-xs text-muted-foreground capitalize font-medium">{table.replace(/_/g, ' ')}</p>
                      <p className="text-2xl font-bold text-blue-600">{typeof databaseStats[table] === 'number' ? databaseStats[table].toLocaleString() : databaseStats[table]}</p>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Cut Pieces & Spares */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Cut Pieces & Spares</Badge>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['hdpe_cut_pieces', 'sprinkler_spare_pieces'].map((table) => (
                  databaseStats[table] !== undefined && (
                    <div key={table} className="p-3 border rounded-lg bg-purple-500/5 hover:bg-purple-500/10 transition-colors">
                      <p className="text-xs text-muted-foreground capitalize font-medium">{table.replace(/_/g, ' ')}</p>
                      <p className="text-2xl font-bold text-purple-600">{typeof databaseStats[table] === 'number' ? databaseStats[table].toLocaleString() : databaseStats[table]}</p>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Transactions & Operations */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Transactions & Operations</Badge>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['transactions', 'inventory_transactions', 'dispatches', 'dispatch_items', 'returns', 'return_items'].map((table) => (
                  databaseStats[table] !== undefined && (
                    <div key={table} className="p-3 border rounded-lg bg-orange-500/5 hover:bg-orange-500/10 transition-colors">
                      <p className="text-xs text-muted-foreground capitalize font-medium">{table.replace(/_/g, ' ')}</p>
                      <p className="text-2xl font-bold text-orange-600">{typeof databaseStats[table] === 'number' ? databaseStats[table].toLocaleString() : databaseStats[table]}</p>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* System & Audit */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">System & Audit</Badge>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['audit_logs', 'attached_documents', 'locations', 'units'].map((table) => (
                  databaseStats[table] !== undefined && (
                    <div key={table} className="p-3 border rounded-lg bg-slate-500/5 hover:bg-slate-500/10 transition-colors">
                      <p className="text-xs text-muted-foreground capitalize font-medium">{table.replace(/_/g, ' ')}</p>
                      <p className="text-2xl font-bold text-slate-600">{typeof databaseStats[table] === 'number' ? databaseStats[table].toLocaleString() : databaseStats[table]}</p>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Additional tables not in main categories */}
            {Object.keys(databaseStats).some(key =>
              !['users', 'product_types', 'brands', 'customers', 'product_variants', 'batches',
                'inventory_stock', 'rolls', 'hdpe_cut_pieces', 'sprinkler_spare_pieces',
                'transactions', 'inventory_transactions', 'dispatches', 'dispatch_items',
                'returns', 'return_items', 'audit_logs', 'attached_documents', 'locations', 'units'].includes(key)
            ) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Other Tables</Badge>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(databaseStats).map(([table, count]) => {
                    const isKnownTable = ['users', 'product_types', 'brands', 'customers', 'product_variants',
                      'batches', 'inventory_stock', 'rolls', 'hdpe_cut_pieces', 'sprinkler_spare_pieces',
                      'transactions', 'inventory_transactions', 'dispatches', 'dispatch_items',
                      'returns', 'return_items', 'audit_logs', 'attached_documents', 'locations', 'units'].includes(table);

                    if (isKnownTable) return null;

                    return (
                      <div key={table} className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <p className="text-xs text-muted-foreground capitalize font-medium">{table.replace(/_/g, ' ')}</p>
                        <p className="text-2xl font-bold">{typeof count === 'number' ? count.toLocaleString() : count}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reset Options */}
      <Card>
        <CardHeader>
          <CardTitle>Database Reset Options</CardTitle>
          <CardDescription>Choose the level of reset you want to perform - operations are irreversible</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {resetOptions.map((option) => (
              <Card key={option.value} className={`border-2 transition-all hover:shadow-md ${
                option.value === 'complete_wipe' ? 'border-destructive bg-destructive/5' : 'border-border'
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base">{option.label}</h3>
                        <Badge variant={
                          option.impact === 'Low' || option.impact === 'Low - Only historical records removed' ? 'outline' :
                          option.impact === 'Medium' || option.impact === 'Medium - Current stock removed' ? 'secondary' :
                          option.impact === 'High' || option.impact === 'High - All production data removed' ? 'default' :
                          option.impact === 'Very High' || option.impact === 'Very High - Fresh start for operations' ? 'default' :
                          'destructive'
                        } className="text-xs">
                          {option.impact}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{option.description}</p>
                      <div className="flex items-start gap-2 text-xs bg-muted/50 p-2 rounded">
                        <span className="text-muted-foreground font-medium min-w-fit">Will Keep:</span>
                        <span className="font-medium">{option.keeps}</span>
                      </div>
                    </div>
                    <Button
                      variant={option.value === 'complete_wipe' ? 'destructive' : 'outline'}
                      onClick={() => handleResetClick(option.value)}
                      className="shrink-0 min-w-[100px]"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {selectedOption && (
                <>
                  <div className="p-3 bg-destructive/10 border border-destructive rounded-lg space-y-2">
                    <p className="font-semibold">You are about to: {selectedOption.label}</p>
                    <p className="text-sm">{selectedOption.description}</p>
                    <p className="text-sm">
                      <span className="font-medium">Impact:</span> {selectedOption.impact}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Will keep:</span> {selectedOption.keeps}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmation">Type "CONFIRM RESET" to proceed:</Label>
                    <Input
                      id="confirmation"
                      value={confirmationText}
                      onChange={(e) => setConfirmationText(e.target.value)}
                      placeholder="CONFIRM RESET"
                      className="font-mono"
                    />
                  </div>

                  <p className="text-sm text-destructive font-semibold">
                    ⚠️ This action cannot be undone!
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowConfirmDialog(false);
              setConfirmationText('');
              setSelectedResetLevel('');
            }}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmReset}
              disabled={loading || confirmationText !== 'CONFIRM RESET'}
            >
              {loading ? 'Resetting...' : 'Confirm Reset'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DatabaseTab;
