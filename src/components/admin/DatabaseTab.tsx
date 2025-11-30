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
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { admin } from '@/lib/api';
import { toast } from 'sonner';

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
      const { data } = await admin.getResetOptions();
      setResetOptions(data.options);
    } catch (error) {
      console.error('Error fetching reset options:', error);
      toast.error('Failed to load reset options');
    }
  };

  const fetchDatabaseStats = async () => {
    try {
      const { data } = await admin.getDatabaseStats();
      setDatabaseStats(data.stats);
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
      const { data } = await admin.resetDatabase(selectedResetLevel, 'CONFIRM_RESET');
      toast.success(data.message);
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
          <CardTitle>Current Database Statistics</CardTitle>
          <CardDescription>Overview of records in each table</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(databaseStats).map(([table, count]) => (
              <div key={table} className="p-3 border rounded-lg">
                <p className="text-xs text-muted-foreground capitalize">{table.replace(/_/g, ' ')}</p>
                <p className="text-2xl font-bold">{typeof count === 'number' ? count.toLocaleString() : count}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reset Options */}
      <Card>
        <CardHeader>
          <CardTitle>Database Reset Options</CardTitle>
          <CardDescription>Choose the level of reset you want to perform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {resetOptions.map((option) => (
              <Card key={option.value} className={`border-2 ${
                option.value === 'complete_wipe' ? 'border-destructive' : 'border-border'
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{option.label}</h3>
                        <Badge variant={
                          option.impact === 'Low' ? 'outline' :
                          option.impact === 'Medium' ? 'secondary' :
                          option.impact === 'High' ? 'default' :
                          'destructive'
                        }>
                          {option.impact}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Keeps:</span>
                        <span className="font-medium">{option.keeps}</span>
                      </div>
                    </div>
                    <Button
                      variant={option.value === 'complete_wipe' ? 'destructive' : 'outline'}
                      onClick={() => handleResetClick(option.value)}
                      className="shrink-0"
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
