export function formatKwacha(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) amount = 0;
  return `K ${amount.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sanitizeFilename(s: string): string {
  return (s || 'Unknown').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');
}

export function formatDateString(dateStr?: string): string {
  return (dateStr || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
}

export function sanitizeText(text: any): string {
  if (text === null || text === undefined) return '';
  return String(text).trim();
}
