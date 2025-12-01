import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';

interface RollConfig {
  numberOfRolls: string;
  lengthPerRoll: string;
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
  onRollChange: (field: keyof RollConfig, value: string) => void;
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
  onRollChange,
  onBundleChange,
  onAddCutRoll,
  onRemoveCutRoll,
  onAddSparePipe,
  onRemoveSparePipe,
  submitAttempted
}: QuantityConfigFormProps) => {
  const [newCutRollLength, setNewCutRollLength] = useState('');
  const [newSparePipeLength, setNewSparePipeLength] = useState('');

  if (configType === 'standard_rolls') {
    return (
      <>
        {/* Number of Rolls */}
        <div className="space-y-2">
          <Label htmlFor="numberOfRolls">
            Number of Rolls <span className="text-red-500">*</span>
          </Label>
          <Input
            id="numberOfRolls"
            type="number"
            min="0"
            step="1"
            value={rollConfig.numberOfRolls}
            onChange={(e) => onRollChange('numberOfRolls', e.target.value)}
            className="h-12"
          />
          {submitAttempted && (!rollConfig.numberOfRolls || parseInt(rollConfig.numberOfRolls) <= 0) && (
            <p className="text-xs text-red-500">Number of rolls must be greater than 0</p>
          )}
        </div>

        {/* Length per Roll */}
        <div className="space-y-2">
          <Label htmlFor="lengthPerRoll">
            Length per Roll (meters) <span className="text-red-500">*</span>
          </Label>
          <Input
            id="lengthPerRoll"
            type="number"
            min="0"
            step="0.01"
            value={rollConfig.lengthPerRoll}
            onChange={(e) => onRollChange('lengthPerRoll', e.target.value)}
            className="h-12"
          />
          {submitAttempted && (!rollConfig.lengthPerRoll || parseFloat(rollConfig.lengthPerRoll) <= 0) && (
            <p className="text-xs text-red-500">Length per roll must be greater than 0</p>
          )}
        </div>

        {/* Cut Rolls */}
        <Card className="p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Cut Rolls (Optional)</h3>
            <span className="text-sm text-muted-foreground">
              {rollConfig.cutRolls.length} cut rolls
            </span>
          </div>

          <div className="space-y-2">
            {rollConfig.cutRolls.map((roll, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="number"
                  value={roll.length}
                  readOnly
                  className="h-10"
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
                placeholder="Cut roll length (meters)"
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

// Add missing import
import { useState } from 'react';
