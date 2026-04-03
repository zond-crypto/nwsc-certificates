// ============================================================
//  QUOTATION CODE GENERATOR + EXPIRY DATE CALCULATOR
//  File: quotation-utils.js
//
//  DROP-IN INTEGRATION — call these functions from your
//  existing save/create quotation logic. Do NOT modify
//  any existing UI or layout code.
// ============================================================

// ------------------------------------------------------------
//  CONFIGURATION — edit these to match your app's setup
// ------------------------------------------------------------
const CONFIG = {
    CODE_PREFIX:         'QT',       // Prefix for all quotation codes
    VALIDITY_DAYS:       30,         // Quotation valid for 30 days
    EXPIRY_WARNING_DAYS: 5,          // Warn when expiry is within this many days
    SEQUENCE_PAD:        4,          // Zero-pad length for sequence number (e.g. 4 = "0001")
};

/**
 * Generates a unique quotation code in the format: QT-YYYYMM-XXXX
 *
 * @param {Function} getLastSequenceForMonth - Async function that queries your DB
 *        and returns the highest sequence number used in the given yearMonth string.
 *        Signature: async (yearMonth: string) => number
 *        Example return: 5  (meaning QT-202504-0005 was the last code this month)
 *        Return 0 if no quotations exist yet for that month.
 *
 * @param {Date|null} issueDate - The quotation's issue date. Defaults to today.
 * @returns {Promise<string>} The new unique code, e.g. "QT-202504-0006"
 */
export async function generateQuotationCode(getLastSequenceForMonth, issueDate = null) {
    const date = issueDate instanceof Date ? issueDate : new Date();

    const year  = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}${month}`;  // e.g. "202504"

    // Get the last used sequence number for this month from your database
    const lastSequence = await getLastSequenceForMonth(yearMonth);

    // Increment and zero-pad
    const nextSequence = lastSequence + 1;
    const paddedSequence = String(nextSequence).padStart(CONFIG.SEQUENCE_PAD, '0');

    return `${CONFIG.CODE_PREFIX}-${yearMonth}-${paddedSequence}`;
    // Example output: "QT-202504-0007"
}

/**
 * Calculates the expiry date of a quotation.
 *
 * @param {Date|string} issueDate - The date the quotation was created/issued.
 * @returns {Date} The expiry date (issueDate + 30 days)
 */
export function calculateExpiryDate(issueDate) {
    const date = issueDate instanceof Date ? new Date(issueDate) : new Date(issueDate);
    date.setDate(date.getDate() + CONFIG.VALIDITY_DAYS);
    return date;
}

/**
 * Formats a date as a readable string for display on the document.
 * Change the locale/options to match your preferred format.
 *
 * @param {Date} date
 * @returns {string} e.g. "02 May 2025"
 */
export function formatDisplayDate(date) {
    return date.toLocaleDateString('en-GB', {
        day:   '2-digit',
        month: 'long',
        year:  'numeric',
    });
    // Output: "02 May 2025"
}

/**
 * Checks the status of a quotation based on its expiry date.
 *
 * @param {Date|string} expiryDate
 * @returns {{ status: string, daysRemaining: number, warningActive: boolean }}
 *
 *   status values:
 *     "active"   — quotation is still valid
 *     "expiring" — valid but expiring within WARNING_DAYS
 *     "expired"  — past expiry date
 */
export function getQuotationStatus(expiryDate) {
    const today  = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = expiryDate instanceof Date ? new Date(expiryDate) : new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    const msPerDay     = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.ceil((expiry.getTime() - today.getTime()) / msPerDay);

    if (daysRemaining < 0) {
        return { status: 'expired',   daysRemaining, warningActive: false };
    }
    if (daysRemaining <= CONFIG.EXPIRY_WARNING_DAYS) {
        return { status: 'expiring',  daysRemaining, warningActive: true  };
    }
    return     { status: 'active',    daysRemaining, warningActive: false };
}

/**
 * Returns the warning message to display in the editor banner.
 * Returns null if no warning is needed.
 *
 * @param {Date|string} expiryDate
 * @returns {string|null}
 */
export function getExpiryWarningMessage(expiryDate) {
    const { status, daysRemaining } = getQuotationStatus(expiryDate);
    if (status === 'expired')  return `This quotation expired ${Math.abs(daysRemaining)} day(s) ago.`;
    if (status === 'expiring') return `This quotation expires in ${daysRemaining} day(s) — ${formatDisplayDate(new Date(expiryDate))}.`;
    return null;
}

/**
 * Prepares all auto-generated fields for a new quotation before saving.
 *
 * @param {Object} quotationData - Your existing quotation object
 * @param {Function} getLastSequenceForMonth - DB query function (see generateQuotationCode)
 * @returns {Promise<Object>} The same object enriched with generated fields
 *
 * USAGE in your save handler:
 *   const enriched = await prepareNewQuotation(formData, dbQueryFn);
 *   await db.saveQuotation(enriched);
 */
export async function prepareNewQuotation(quotationData, getLastSequenceForMonth) {
    const issueDate  = quotationData.date
        ? new Date(quotationData.date)
        : new Date();

    const expiryDate = calculateExpiryDate(issueDate);
    const code       = await generateQuotationCode(getLastSequenceForMonth, issueDate);

    return {
        ...quotationData,                                   // Keep all existing fields untouched
        quotationCode:    code,                             // e.g. "QT-202504-0007"
        expiryDate:       expiryDate.toISOString(),
        validUntil:       expiryDate.toISOString().split('T')[0], // For backward compatibility
        status:           quotationData.status || 'draft',  // Initial status
    };
}