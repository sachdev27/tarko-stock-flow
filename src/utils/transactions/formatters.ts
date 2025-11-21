// Transaction formatting utilities

export const getProductCode = (transaction: { batch_code: string }): string => {
  return transaction.batch_code;
};

export const getProductName = (transaction: {
  brand: string;
  product_type: string;
  parameters?: Record<string, string | undefined>;
}): string => {
  return `${transaction.product_type} - ${transaction.brand}`;
};

export const formatWeight = (grams: number | null | undefined, unitAbbreviation?: string): string => {
  if (!grams) return '0 kg';

  const kg = grams / 1000;
  const tons = kg / 1000;

  return tons >= 1 ? `${tons.toFixed(2)} t` : `${kg.toFixed(2)} kg`;
};

export const formatDate = (date: string): string => {
  try {
    const d = new Date(date);
    // Convert to IST (UTC+5:30)
    const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const year = String(istDate.getUTCFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  } catch {
    return date;
  }
};

export const formatDateTime = (date: string): string => {
  try {
    const d = new Date(date);
    // Convert to IST (UTC+5:30)
    const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const year = String(istDate.getUTCFullYear()).slice(-2);
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return date;
  }
};
