/**
 * Auto-incrementing document number generator with monthly reset.
 * Counters are persisted in localStorage and survive restarts/offline.
 *
 * Formats:
 *   Quotation:    QT-YYYYMMDD-XXXX  (e.g. QT-20260511-0001)
 *   Certificate:  COA-YYYYMMDD-XXXX (Mirror of linked Quotation)
 */

const COUNTER_KEY = 'nwsc_doc_counters';

interface CounterState {
  qt: { year: string; seq: number };
  coa: { year: string; seq: number };
}

function getYear(date?: Date): string {
  const d = date ?? new Date();
  return String(d.getFullYear());
}

function getYearMonthDay(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function loadCounters(): CounterState {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const year = getYear();
  return {
    qt:  { year: year, seq: 0 },
    coa: { year: year, seq: 0 },
  };
}

function saveCounters(state: CounterState): void {
  localStorage.setItem(COUNTER_KEY, JSON.stringify(state));
}

/**
 * Generates the next Quotation number, e.g. QT-20260511-0001.
 * Resets counter at the start of each year.
 */
export function nextQuotationNumber(date?: Date): string {
  const year = getYear(date);
  const ymd = getYearMonthDay(date);
  const state = loadCounters();

  if (state.qt.year !== year) {
    state.qt = { year: year, seq: 0 };
  }
  state.qt.seq += 1;
  saveCounters(state);

  return `QT-${ymd}-${String(state.qt.seq).padStart(4, '0')}`;
}

/**
 * Generates the next Certificate of Analysis number.
 * Usually mirrors a Quotation number but with COA prefix.
 */
export function nextCOANumber(date?: Date): string {
  const year = getYear(date);
  const ymd = getYearMonthDay(date);
  const state = loadCounters();

  if (state.coa.year !== year) {
    state.coa = { year: year, seq: 0 };
  }
  state.coa.seq += 1;
  saveCounters(state);

  return `COA-${ymd}-${String(state.coa.seq).padStart(4, '0')}`;
}

/**
 * Peeks at what the next number *would* be without incrementing the counter.
 */
export function peekNextQuotationNumber(date?: Date): string {
  const year = getYear(date);
  const ymd = getYearMonthDay(date);
  const state = loadCounters();
  const seq = state.qt.year === year ? state.qt.seq + 1 : 1;
  return `QT-${ymd}-${String(seq).padStart(4, '0')}`;
}

export function peekNextCOANumber(date?: Date): string {
  const year = getYear(date);
  const ymd = getYearMonthDay(date);
  const state = loadCounters();
  const seq = state.coa.year === year ? state.coa.seq + 1 : 1;
  return `COA-${ymd}-${String(seq).padStart(4, '0')}`;
}
