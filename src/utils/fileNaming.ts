export type DocumentType = 'COA' | 'Quotation';

interface FileCounterStore {
  lastDate: string; // YYYY-MM-DD
  counters: {
    COA: Record<string, number>;
    Quotation: Record<string, number>;
  };
}

const STORAGE_KEY = 'nwsc.exportCounters';

function sriDateNow(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function yearMonthFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function loadStore(): FileCounterStore {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { lastDate: sriDateNow(), counters: { COA: {}, Quotation: {} } };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { lastDate: sriDateNow(), counters: { COA: {}, Quotation: {} } };
  }

  try {
    const parsed = JSON.parse(raw) as FileCounterStore;
    if (!parsed || !parsed.lastDate || !parsed.counters) throw new Error('invalid');
    parsed.counters = parsed.counters || { COA: {}, Quotation: {} };
    parsed.counters.COA = parsed.counters.COA || {};
    parsed.counters.Quotation = parsed.counters.Quotation || {};
    return parsed;
  } catch {
    return { lastDate: sriDateNow(), counters: { COA: {}, Quotation: {} } };
  }
}

function saveStore(store: FileCounterStore) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function normalizeClientName(rawClient?: string): string {
  if (!rawClient || !rawClient.trim()) {
    return 'Unknown_Client';
  }
  return rawClient
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '') || 'Unknown_Client';
}

function getNextSequence(documentType: DocumentType): number {
  const today = sriDateNow();
  const currentYM = yearMonthFromDate(today);
  const store = loadStore();

  const lastYM = yearMonthFromDate(store.lastDate || today);

  // if system date rolled back, do not decrement or reset wrongly
  if (today < store.lastDate) {
    // If rollback within same month/year use existing counter value
    const existing = store.counters[documentType][lastYM] || 0;
    const next = existing + 1;
    store.counters[documentType][lastYM] = next;
    store.lastDate = today;
    saveStore(store);
    return next;
  }

  let counter = store.counters[documentType][currentYM] || 0;

  if (currentYM !== lastYM) {
    counter = 0;
  }

  counter += 1;
  store.counters[documentType][currentYM] = counter;
  store.lastDate = today;
  saveStore(store);

  return counter;
}

function pad3(value: number): string {
  return String(value).padStart(3, '0');
}

export function buildDocumentFilename(documentType: DocumentType, clientName?: string, extension = 'pdf'): string {
  const cleanedClient = normalizeClientName(clientName);
  const date = sriDateNow();
  const seq = pad3(getNextSequence(documentType));

  return `${documentType}_${cleanedClient}_${date}_${seq}.${extension}`;
}
