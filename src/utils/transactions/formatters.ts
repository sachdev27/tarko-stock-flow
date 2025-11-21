// Transaction formatting utilities

export const getProductCode = (transaction: { batch_code: string }): string => {
  return transaction.batch_code;
};

export const getProductName = (transaction: {
  brand: string;
  product_type: string;
  parameters?: Record<string, string | undefined>;
}): string => {
  const params = transaction.parameters || {};
  const parts = [transaction.brand, transaction.product_type];

  if (params.OD) parts.push(`OD: ${params.OD}`);
  if (params.PN) parts.push(`PN: ${params.PN}`);
  if (params.PE) parts.push(`PE: ${params.PE}`);
  if (params.Type) parts.push(`Type: ${params.Type}`);

  return parts.join(' - ');
};

export const formatWeight = (grams: number | null | undefined, unitAbbreviation?: string): string => {
  if (!grams) return '0 kg';

  const kg = grams / 1000;
  const tons = kg / 1000;

  return tons >= 1 ? `${tons.toFixed(2)} t` : `${kg.toFixed(2)} kg`;
};

export const formatDate = (date: string): string => {
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return date;
  }
};

export const formatDateTime = (date: string): string => {
  try {
    return new Date(date).toLocaleString();
  } catch {
    return date;
  }
};
