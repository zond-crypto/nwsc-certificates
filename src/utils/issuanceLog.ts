/**
 * Issuance Log — persists a complete record of every issued document to localStorage.
 *
 * Each record captures:
 *   - documentNumber  : the formatted doc number (e.g. QT-202604-0001)
 *   - documentType    : 'Quotation' | 'Certificate'
 *   - customerName    : client field from the document
 *   - issuedAt        : ISO timestamp of the download event
 *   - payload         : serialised snapshot of all field values at time of issuance
 */

export type IssuedDocumentType = 'Quotation' | 'Certificate';

export interface IssuanceRecord {
  id: string;
  documentNumber: string;
  documentType: IssuedDocumentType;
  customerName: string;
  issuedAt: string;
  payload: string; // JSON-serialised document snapshot
}

const ISSUANCE_LOG_KEY = 'nwsc_issuance_log';

function loadLog(): IssuanceRecord[] {
  try {
    const raw = localStorage.getItem(ISSUANCE_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistLog(records: IssuanceRecord[]): void {
  try {
    localStorage.setItem(ISSUANCE_LOG_KEY, JSON.stringify(records));
  } catch (e) {
    throw new Error('Issuance log save failed: ' + String(e));
  }
}

/**
 * Saves a new issuance record. Throws if the save operation fails.
 * The calling code should abort the download if this throws.
 */
export function recordIssuance(
  documentNumber: string,
  documentType: IssuedDocumentType,
  customerName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): IssuanceRecord {
  const record: IssuanceRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    documentNumber,
    documentType,
    customerName,
    issuedAt: new Date().toISOString(),
    payload: JSON.stringify(payload),
  };

  const existing = loadLog();
  persistLog([record, ...existing]); // throws on failure
  return record;
}

/** Returns all issuance records, newest first. */
export function getIssuanceLog(): IssuanceRecord[] {
  return loadLog();
}

/** Clears the entire log. */
export function clearIssuanceLog(): void {
  localStorage.removeItem(ISSUANCE_LOG_KEY);
}
