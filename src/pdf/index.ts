import { generateCOAPdf as generateCOAPdfTemplate } from './templates/coaTemplate';
import { generateQuotationPdf as generateQuotationPdfTemplate } from './templates/quotationTemplate';
import { exportCOA, exportQuotation } from './exports/csvExporter';
import { Certificate, Quotation } from '../types';
import { recordIssuance } from '../utils/issuanceLog';

/**
 * Saves an issuance record then triggers the PDF download.
 * Throws (aborting the download) if the issuance record cannot be persisted.
 */
export async function generateCOAPdf(certificate: Certificate): Promise<void> {
  // Step 1: Persist issuance record — throws on failure, aborting the download.
  recordIssuance(
    certificate.certNumber || 'COA-???',
    'Certificate',
    certificate.client || '(no client)',
    certificate as unknown as Record<string, unknown>
  );

  // Step 2: Generate & download the PDF.
  return generateCOAPdfTemplate(certificate);
}

/**
 * Saves an issuance record then triggers the PDF download.
 * Throws (aborting the download) if the issuance record cannot be persisted.
 */
export async function generateQuotationPdf(quotation: Quotation): Promise<void> {
  // Step 1: Persist issuance record — throws on failure, aborting the download.
  recordIssuance(
    quotation.quotationCode || quotation.quoteNumber || 'QT-???',
    'Quotation',
    quotation.client || '(no client)',
    quotation as unknown as Record<string, unknown>
  );

  // Step 2: Generate & download the PDF.
  return generateQuotationPdfTemplate(quotation);
}

export function exportCOACSV(certificate: Certificate): void {
  exportCOA(certificate);
}

export function exportQuotationCSV(quotation: Quotation): void {
  exportQuotation(quotation);
}

