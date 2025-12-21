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

export const formatWeight = (kg: number | null | undefined, unitAbbreviation?: string): string => {
  if (!kg || typeof kg !== 'number' || isNaN(kg)) return '0 kg';

  const tons = kg / 1000;

  return tons >= 1 ? `${tons.toFixed(2)} t` : `${kg.toFixed(2)} kg`;
};

export const formatDate = (date: string): string => {
  try {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  } catch {
    return date;
  }
};

export const formatDateTime = (date: string): string => {
  try {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return date;
  }
};
