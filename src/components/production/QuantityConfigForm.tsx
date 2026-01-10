import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';

interface RollGroup {
  numberOfRolls: string;
  lengthPerRoll: string;
}

interface RollConfig {
  rollGroups: RollGroup[];
  cutRolls: { length: string }[];
}

interface BundleConfig {
  numberOfBundles: string;
  bundleSize: string;
  lengthPerPiece: string;
  sparePipes: { length: string }[];
}

interface QuantityConfigFormProps {
  configType: 'standard_rolls' | 'bundles';
  isQuantityBased: boolean;
  rollConfig: RollConfig;
  bundleConfig: BundleConfig;
  onRollGroupAdd: (group: RollGroup) => void;
  onRollGroupRemove: (index: number) => void;
  onBundleChange: (field: keyof BundleConfig, value: string) => void;
  onAddCutRoll: (length: string) => void;
  onRemoveCutRoll: (index: number) => void;
  onAddSparePipe: (length: string) => void;
  onRemoveSparePipe: (index: number) => void;
  submitAttempted: boolean;
}

export const QuantityConfigForm = ({
  configType,
  isQuantityBased,
  rollConfig,
  bundleConfig,
  onRollGroupAdd,
  onRollGroupRemove,
  onBundleChange,
  onAddCutRoll,
  onRemoveCutRoll,
  onAddSparePipe,
  onRemoveSparePipe,
  submitAttempted
}: QuantityConfigFormProps) => {
  const [newCutRollLength, setNewCutRollLength] = useState('');
  const [newSparePipeLength, setNewSparePipeLength] = useState('');
  const [newRollGroup, setNewRollGroup] = useState({ numberOfRolls: '', lengthPerRoll: '' });

  if (configType === 'standard_rolls') {
    return (
      <>
        {/* Roll Groups Section */}
        <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-lg">Roll Groups</h3>
              <p className="text-sm text-muted-foreground">Add multiple roll groups with different lengths</p>
            </div>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {rollConfig.rollGroups.length} group{rollConfig.rollGroups.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Existing Roll Groups */}
          <div className="space-y-3 mb-3">
            {rollConfig.rollGroups.map((group, index) => (
              <div key={index} className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-lg border">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Rolls</Label>
                    <Input
                      type="number"
                      value={group.numberOfRolls}
                      readOnly
                      className="h-9 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Length (m)</Label>
                    <Input
                      type="number"
                      value={group.lengthPerRoll}
                      readOnly
                      className="h-9 font-mono font-bold"
                    />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground pt-5">
                  = {(parseInt(group.numberOfRolls) * parseFloat(group.lengthPerRoll)).toFixed(0)}m
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => onRollGroupRemove(index)}
                  className="mt-5"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Add New Roll Group */}
          <div className="border-t pt-3">
            <Label className="text-sm font-semibold mb-2 block">Add New Roll Group</Label>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">Number of Rolls</Label>
                <Input
                  type="number"
                  placeholder="e.g., 10"
                  value={newRollGroup.numberOfRolls}
                  onChange={(e) => setNewRollGroup({...newRollGroup, numberOfRolls: e.target.value})}
                  className="h-10"
                  min="1"
                  step="1"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Length per Roll (m)</Label>
                <Input
                  type="number"
                  placeholder="e.g., 500"
                  value={newRollGroup.lengthPerRoll}
                  onChange={(e) => setNewRollGroup({...newRollGroup, lengthPerRoll: e.target.value})}
                  className="h-10"
                  min="0.01"
                  step="0.01"
                />
              </div>
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  const rolls = parseInt(newRollGroup.numberOfRolls);
                  const length = parseFloat(newRollGroup.lengthPerRoll);
                  if (rolls > 0 && length > 0) {
                    onRollGroupAdd(newRollGroup);
                    setNewRollGroup({ numberOfRolls: '', lengthPerRoll: '' });
                  }
                }}
                className="h-10"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Group
              </Button>
            </div>
          </div>

          {submitAttempted && rollConfig.rollGroups.length === 0 && (
            <p className="text-xs text-red-500 mt-2">At least one roll group is required</p>
          )}
        </Card>

        {/* Cut Rolls */}
        <Card className="p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Cut Pieces (Optional)</h3>
            <span className="text-sm text-muted-foreground">
              {rollConfig.cutRolls.length} cut piece{rollConfig.cutRolls.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-2">
            {rollConfig.cutRolls.map((roll, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="number"
                  value={roll.length}
                  readOnly
                  className="h-10 font-mono"
                  placeholder="Length (m)"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => onRemoveCutRoll(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Cut piece length (meters)"
                value={newCutRollLength}
                onChange={(e) => setNewCutRollLength(e.target.value)}
                className="h-10"
                min="0"
                step="0.01"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (newCutRollLength && parseFloat(newCutRollLength) > 0) {
                    onAddCutRoll(newCutRollLength);
                    setNewCutRollLength('');
                  }
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  // Bundles configuration
  return (
    <>
      {/* Number of Bundles */}
      <div className="space-y-2">
        <Label htmlFor="numberOfBundles">
          Number of Bundles <span className="text-red-500">*</span>
        </Label>
        <Input
          id="numberOfBundles"
          type="number"
          min="0"
          step="1"
          value={bundleConfig.numberOfBundles}
          onChange={(e) => onBundleChange('numberOfBundles', e.target.value)}
          className="h-12"
        />
        {submitAttempted && (!bundleConfig.numberOfBundles || parseInt(bundleConfig.numberOfBundles) <= 0) && (
          <p className="text-xs text-red-500">Number of bundles must be greater than 0</p>
        )}
      </div>

      {/* Bundle Size */}
      <div className="space-y-2">
        <Label htmlFor="bundleSize">
          {isQuantityBased ? 'Pieces per Bundle' : 'Items per Bundle'} <span className="text-red-500">*</span>
        </Label>
        <Input
          id="bundleSize"
          type="number"
          min="1"
          step="1"
          value={bundleConfig.bundleSize}
          onChange={(e) => onBundleChange('bundleSize', e.target.value)}
          className="h-12"
        />
        {submitAttempted && (!bundleConfig.bundleSize || parseInt(bundleConfig.bundleSize) <= 0) && (
          <p className="text-xs text-red-500">Bundle size must be greater than 0</p>
        )}
      </div>

      {/* Length per Piece (for quantity-based products) */}
      {isQuantityBased && (
        <div className="space-y-2">
          <Label htmlFor="lengthPerPiece">
            Length per Piece (meters) <span className="text-red-500">*</span>
          </Label>
          <Input
            id="lengthPerPiece"
            type="number"
            min="0"
            step="0.01"
            value={bundleConfig.lengthPerPiece}
            onChange={(e) => onBundleChange('lengthPerPiece', e.target.value)}
            className="h-12"
          />
          {submitAttempted && (!bundleConfig.lengthPerPiece || parseFloat(bundleConfig.lengthPerPiece) <= 0) && (
            <p className="text-xs text-red-500">Length per piece must be greater than 0</p>
          )}
        </div>
      )}

      {/* Spare Pipes */}
      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Spare Pieces (Optional)</h3>
          <span className="text-sm text-muted-foreground">
            {bundleConfig.sparePipes.length} spare groups
          </span>
        </div>

        <div className="space-y-2">
          {bundleConfig.sparePipes.map((pipe, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="number"
                value={pipe.length}
                readOnly
                className="h-10"
                placeholder={isQuantityBased ? 'Quantity' : 'Length (m)'}
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onRemoveSparePipe(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder={isQuantityBased ? 'Number of spare pieces' : 'Spare length (meters)'}
              value={newSparePipeLength}
              onChange={(e) => setNewSparePipeLength(e.target.value)}
              className="h-10"
              min="0"
              step={isQuantityBased ? '1' : '0.01'}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (newSparePipeLength && parseFloat(newSparePipeLength) > 0) {
                  onAddSparePipe(newSparePipeLength);
                  setNewSparePipeLength('');
                }
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
};
