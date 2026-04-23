/**
 * Auto-incrementing document number generator with monthly reset.
 * Counters are persisted in localStorage and survive restarts/offline.
 *
 * Formats:
 *   Quotation:    QT-YYYYMM-XXXX  (e.g. QT-202604-0001)
 *   Certificate:  COA-YYYYMM-XXXX (e.g. COA-202604-0001)
 */

const COUNTER_KEY = 'nwsc_doc_counters';

interface CounterState {
  qt: { yearMonth: string; seq: number };
  coa: { yearMonth: string; seq: number };
}

function getYearMonth(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

function loadCounters(): CounterState {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const ym = getYearMonth();
  return {
    qt:  { yearMonth: ym, seq: 0 },
    coa: { yearMonth: ym, seq: 0 },
  };
}

function saveCounters(state: CounterState): void {
  localStorage.setItem(COUNTER_KEY, JSON.stringify(state));
}

/**
 * Generates the next Quotation number, e.g. QT-202604-0001.
 * Resets counter at the start of each calendar month.
 */
export function nextQuotationNumber(date?: Date): string {
  const ym = getYearMonth(date);
  const state = loadCounters();

  if (state.qt.yearMonth !== ym) {
    state.qt = { yearMonth: ym, seq: 0 };
  }
  state.qt.seq += 1;
  saveCounters(state);

  return `QT-${ym}-${String(state.qt.seq).padStart(4, '0')}`;
}

/**
 * Generates the next Certificate of Analysis number, e.g. COA-202604-0001.
 * Resets counter at the start of each calendar month.
 */
export function nextCOANumber(date?: Date): string {
  const ym = getYearMonth(date);
  const state = loadCounters();

  if (state.coa.yearMonth !== ym) {
    state.coa = { yearMonth: ym, seq: 0 };
  }
  state.coa.seq += 1;
  saveCounters(state);

  return `COA-${ym}-${String(state.coa.seq).padStart(4, '0')}`;
}

/**
 * Peeks at what the next number *would* be without incrementing the counter.
 */
export function peekNextQuotationNumber(date?: Date): string {
  const ym = getYearMonth(date);
  const state = loadCounters();
  const seq = state.qt.yearMonth === ym ? state.qt.seq + 1 : 1;
  return `QT-${ym}-${String(seq).padStart(4, '0')}`;
}

export function peekNextCOANumber(date?: Date): string {
  const ym = getYearMonth(date);
  const state = loadCounters();
  const seq = state.coa.yearMonth === ym ? state.coa.seq + 1 : 1;
  return `COA-${ym}-${String(seq).padStart(4, '0')}`;
}
