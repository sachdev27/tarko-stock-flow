// Utility functions for formatting quantity information from stock entries

interface StockEntry {
  stock_type: string;
  quantity: number;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
}

interface QuantityBreakdown {
  fullRolls: number;
  cutRolls: number;
  bundles: number;
  sparePieces: number;
  totalItems: number;
}

export function calculateQuantityBreakdown(
  stockEntries?: StockEntry[]
): QuantityBreakdown {
  const breakdown: QuantityBreakdown = {
    fullRolls: 0,
    cutRolls: 0,
    bundles: 0,
    sparePieces: 0,
    totalItems: 0,
  };

  if (!stockEntries || !Array.isArray(stockEntries)) {
    return breakdown;
  }

  stockEntries.forEach((entry) => {
    const quantity = Number(entry.quantity) || 0;
    breakdown.totalItems += quantity;

    switch (entry.stock_type) {
      case 'FULL_ROLL':
        breakdown.fullRolls += quantity;
        break;
      case 'CUT_ROLL':
        breakdown.cutRolls += quantity;
        break;
      case 'BUNDLE':
        breakdown.bundles += quantity;
        break;
      case 'SPARE_PIECES':
        breakdown.sparePieces += quantity;
        break;
    }
  });

  return breakdown;
}

export function formatQuantityDisplay(breakdown: QuantityBreakdown): string {
  const parts: string[] = [];

  if (breakdown.fullRolls > 0) {
    parts.push(`${breakdown.fullRolls} Roll${breakdown.fullRolls !== 1 ? 's' : ''}`);
  }
  if (breakdown.cutRolls > 0) {
    parts.push(`${breakdown.cutRolls} Cut Roll${breakdown.cutRolls !== 1 ? 's' : ''}`);
  }
  if (breakdown.bundles > 0) {
    parts.push(`${breakdown.bundles} Bundle${breakdown.bundles !== 1 ? 's' : ''}`);
  }
  if (breakdown.sparePieces > 0) {
    parts.push(`${breakdown.sparePieces} Spare${breakdown.sparePieces !== 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(' + ') : '0';
}

export function formatQuantityShort(breakdown: QuantityBreakdown): string {
  const parts: string[] = [];

  if (breakdown.fullRolls > 0) parts.push(`${breakdown.fullRolls}R`);
  if (breakdown.cutRolls > 0) parts.push(`${breakdown.cutRolls}CR`);
  if (breakdown.bundles > 0) parts.push(`${breakdown.bundles}B`);
  if (breakdown.sparePieces > 0) parts.push(`${breakdown.sparePieces}SP`);

  return parts.length > 0 ? parts.join(' + ') : '0';
}

export function calculateTotalMeters(stockEntries?: StockEntry[]): number {
  if (!stockEntries || !Array.isArray(stockEntries)) {
    return 0;
  }

  let totalMeters = 0;

  stockEntries.forEach((entry) => {
    const quantity = Number(entry.quantity) || 0;

    if (entry.stock_type === 'FULL_ROLL' || entry.stock_type === 'CUT_ROLL') {
      const lengthPerUnit = Number(entry.length_per_unit) || 0;
      totalMeters += quantity * lengthPerUnit;
    } else if (entry.stock_type === 'BUNDLE') {
      const piecesPerBundle = Number(entry.pieces_per_bundle) || 0;
      const pieceLengthMeters = Number(entry.piece_length_meters) || 0;
      totalMeters += quantity * piecesPerBundle * pieceLengthMeters;
    } else if (entry.stock_type === 'SPARE_PIECES') {
      const pieceLengthMeters = Number(entry.piece_length_meters) || 0;
      totalMeters += quantity * pieceLengthMeters;
    }
  });

  return totalMeters;
}
