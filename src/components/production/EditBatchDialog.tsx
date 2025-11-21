import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { inventory } from '@/lib/api';
import { Save, X, Trash2, Plus } from 'lucide-react';

interface StockEntry {
  stock_id: string;
  stock_type: string;
  quantity: number;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  spare_piece_count?: number;
  cut_piece_lengths?: number[];
  total_cut_length?: number;
}

interface ProductionSnapshot {
  stock_entries?: StockEntry[];
  total_stock_entries?: number;
  total_items?: number;
}

interface Batch {
  id: string;
  batch_code: string;
  batch_no: string;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, string>;
  initial_quantity: number;
  current_quantity: number;
  weight_per_meter?: number;
  total_weight?: number;
  piece_length?: number;
  notes?: string;
  created_at: string;
  attachment_url?: string;
  production_snapshot?: ProductionSnapshot;
}

interface CutRollInput {
  length: number;
}

interface SparePipeInput {
  length: number; // actually piece count for spares
}

interface EditBatchDialogProps {
  batch: Batch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditBatchDialog({ batch, open, onOpenChange, onSuccess }: EditBatchDialogProps) {
  const [loading, setLoading] = useState(false);

  // Basic fields
  const [batchNo, setBatchNo] = useState('');
  const [weightPerMeter, setWeightPerMeter] = useState('');
  const [totalWeight, setTotalWeight] = useState('');
  const [pieceLength, setPieceLength] = useState('');
  const [notes, setNotes] = useState('');

  // Roll configuration for HDPE
  const [numberOfRolls, setNumberOfRolls] = useState(0);
  const [lengthPerRoll, setLengthPerRoll] = useState(0);
  const [cutRolls, setCutRolls] = useState<CutRollInput[]>([]);

  // Bundle configuration for Sprinkler
  const [numberOfBundles, setNumberOfBundles] = useState(0);
  const [bundleSize, setBundleSize] = useState(0);
  const [sparePipes, setSparePipes] = useState<SparePipeInput[]>([]);

  // Determine product category from production snapshot
  const isHDPE = batch?.production_snapshot?.stock_entries?.some(
    entry => entry.stock_type === 'FULL_ROLL' || entry.stock_type === 'CUT_ROLL'
  ) ?? false;

  const isSprinkler = batch?.production_snapshot?.stock_entries?.some(
    entry => entry.stock_type === 'BUNDLE' || entry.stock_type === 'SPARE'
  ) ?? false;

  useEffect(() => {
    if (batch) {
      // Basic fields
      setBatchNo(batch.batch_no || '');
      setWeightPerMeter(batch.weight_per_meter?.toString() || '');
      setTotalWeight(batch.total_weight?.toString() || '');
      setPieceLength(batch.piece_length?.toString() || '');
      setNotes(batch.notes || '');

      // Parse production snapshot
      const snapshot = batch.production_snapshot;
      if (snapshot?.stock_entries) {
        // HDPE configuration
        const fullRolls = snapshot.stock_entries.filter(e => e.stock_type === 'FULL_ROLL');
        if (fullRolls.length > 0) {
          const fullRoll = fullRolls[0];
          setNumberOfRolls(fullRoll.quantity);
          setLengthPerRoll(fullRoll.length_per_unit || 0);
        }

        const cutRollEntries = snapshot.stock_entries.filter(e => e.stock_type === 'CUT_ROLL');
        const cutRollsData: CutRollInput[] = [];
        for (const entry of cutRollEntries) {
          if (entry.cut_piece_lengths) {
            entry.cut_piece_lengths.forEach(length => {
              cutRollsData.push({ length });
            });
          }
        }
        setCutRolls(cutRollsData);

        // Sprinkler configuration
        const bundleEntries = snapshot.stock_entries.filter(e => e.stock_type === 'BUNDLE');
        if (bundleEntries.length > 0) {
          const bundleEntry = bundleEntries[0];
          setNumberOfBundles(bundleEntry.quantity);
          setBundleSize(bundleEntry.pieces_per_bundle || 0);
        }

        const spareEntries = snapshot.stock_entries.filter(e => e.stock_type === 'SPARE');
        const sparePipesData: SparePipeInput[] = [];
        for (const entry of spareEntries) {
          if (entry.spare_piece_count) {
            sparePipesData.push({ length: entry.spare_piece_count });
          }
        }
        setSparePipes(sparePipesData);
      }
    }
  }, [batch]);

  const handleSubmit = async () => {
    if (!batch) return;

    try {
      setLoading(true);

      const updateData: Record<string, unknown> = {
        batch_no: batchNo,
        notes: notes,
      };

      if (weightPerMeter) updateData.weight_per_meter = parseFloat(weightPerMeter);
      if (totalWeight) updateData.total_weight = parseFloat(totalWeight);
      if (pieceLength) updateData.piece_length = parseFloat(pieceLength);

      // Add roll/bundle configuration
      if (isHDPE) {
        updateData.number_of_rolls = numberOfRolls;
        updateData.length_per_roll = lengthPerRoll;
        updateData.cut_rolls = cutRolls;
      } else if (isSprinkler) {
        updateData.number_of_bundles = numberOfBundles;
        updateData.bundle_size = bundleSize;
        updateData.spare_pipes = sparePipes;
      }

      await inventory.updateBatch(batch.id, updateData);

      toast.success('Batch updated successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('Failed to update batch:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update batch');
    } finally {
      setLoading(false);
    }
  };

  const addCutRoll = () => {
    setCutRolls([...cutRolls, { length: 0 }]);
  };

  const removeCutRoll = (index: number) => {
    setCutRolls(cutRolls.filter((_, i) => i !== index));
  };

  const updateCutRoll = (index: number, length: number) => {
    const updated = [...cutRolls];
    updated[index] = { length };
    setCutRolls(updated);
  };

  const addSparePipe = () => {
    setSparePipes([...sparePipes, { length: 0 }]);
  };

  const removeSparePipe = (index: number) => {
    setSparePipes(sparePipes.filter((_, i) => i !== index));
  };

  const updateSparePipe = (index: number, length: number) => {
    const updated = [...sparePipes];
    updated[index] = { length };
    setSparePipes(updated);
  };

  if (!batch) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Production Batch</DialogTitle>
          <DialogDescription>
            Batch Code: {batch.batch_code} • {batch.product_type_name} • {batch.brand_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Read-only Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <Label className="text-xs text-muted-foreground">Product Type</Label>
              <p className="font-medium">{batch.product_type_name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Brand</Label>
              <p className="font-medium">{batch.brand_name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Batch Code</Label>
              <p className="font-mono text-sm">{batch.batch_code}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Production Date</Label>
              <p className="text-sm">{new Date(batch.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Parameters */}
          {batch.parameters && Object.keys(batch.parameters).length > 0 && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Parameters</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(batch.parameters).map(([key, value]) => (
                  <Badge key={key} variant="outline">
                    {key}: {value}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Basic Editable Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="batch_no">Batch Number</Label>
              <Input
                id="batch_no"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="weight_per_meter">Weight per Meter (kg/m)</Label>
              <Input
                id="weight_per_meter"
                type="number"
                step="0.001"
                value={weightPerMeter}
                onChange={(e) => setWeightPerMeter(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="total_weight">Total Weight (kg)</Label>
              <Input
                id="total_weight"
                type="number"
                step="0.01"
                value={totalWeight}
                onChange={(e) => setTotalWeight(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="piece_length">Piece Length (m)</Label>
              <Input
                id="piece_length"
                type="number"
                step="0.1"
                value={pieceLength}
                onChange={(e) => setPieceLength(e.target.value)}
              />
            </div>
          </div>

          {/* HDPE Roll Configuration */}
          {isHDPE && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Roll Configuration</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="number_of_rolls">Number of Full Rolls</Label>
                    <Input
                      id="number_of_rolls"
                      type="number"
                      value={numberOfRolls}
                      onChange={(e) => setNumberOfRolls(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="length_per_roll">Length per Roll (m)</Label>
                    <Input
                      id="length_per_roll"
                      type="number"
                      step="0.1"
                      value={lengthPerRoll}
                      onChange={(e) => setLengthPerRoll(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Cut Rolls</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addCutRoll}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Cut Roll
                    </Button>
                  </div>
                  {cutRolls.length > 0 && (
                    <div className="space-y-2">
                      {cutRolls.map((roll, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="Length (m)"
                            value={roll.length}
                            onChange={(e) => updateCutRoll(index, parseFloat(e.target.value) || 0)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCutRoll(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Sprinkler Bundle Configuration */}
          {isSprinkler && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Bundle Configuration</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="number_of_bundles">Number of Bundles</Label>
                    <Input
                      id="number_of_bundles"
                      type="number"
                      value={numberOfBundles}
                      onChange={(e) => setNumberOfBundles(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bundle_size">Pieces per Bundle</Label>
                    <Input
                      id="bundle_size"
                      type="number"
                      value={bundleSize}
                      onChange={(e) => setBundleSize(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Spare Pieces</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addSparePipe}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Spare Group
                    </Button>
                  </div>
                  {sparePipes.length > 0 && (
                    <div className="space-y-2">
                      {sparePipes.map((spare, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            type="number"
                            placeholder="Number of pieces"
                            value={spare.length}
                            onChange={(e) => updateSparePipe(index, parseInt(e.target.value) || 0)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSparePipe(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Current Stock Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Initial Quantity</Label>
                  <p className="font-medium">{batch.initial_quantity}m</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Current Stock</Label>
                  <p className="font-medium">{batch.current_quantity}m</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Used</Label>
                  <p className="font-medium">{batch.initial_quantity - batch.current_quantity}m</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Remaining %</Label>
                  <p className="font-medium">
                    {((batch.current_quantity / batch.initial_quantity) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
