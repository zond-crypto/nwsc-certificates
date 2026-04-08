import { generateCOAPdf as generateCOAPdfTemplate } from './templates/coaTemplate';
import { generateQuotationPdf as generateQuotationPdfTemplate } from './templates/quotationTemplate';
import { exportCOA, exportQuotation } from './exports/csvExporter';
import { Certificate, Quotation } from '../types';

export function generateCOAPdf(certificate: Certificate): Promise<void> {
  return generateCOAPdfTemplate(certificate);
}

export function generateQuotationPdf(quotation: Quotation): Promise<void> {
  return generateQuotationPdfTemplate(quotation);
}

export function exportCOACSV(certificate: Certificate): void {
  exportCOA(certificate);
}

export function exportQuotationCSV(quotation: Quotation): void {
  exportQuotation(quotation);
}
