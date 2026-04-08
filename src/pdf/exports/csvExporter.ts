import * as XLSX from 'xlsx';
import { Certificate, Quotation } from '../../types';
import { sanitizeFilename, formatDateString } from '../utils/formatters';

export function exportCOA(certificate: Certificate): void {
  generateCOA_CSV(certificate);
  generateCOA_Excel(certificate);
}

function generateCOA_CSV(certificate: Certificate): void {
  const BOM = '\uFEFF';
  const samples = certificate.samples || [];

  const headerRow = [
    'Certificate No', 'Client', 'Date Reported', 'Sample Type',
    'Sample Source', 'Parameter', 'Unit', 'Limit',
    ...samples.map((s, i) => s || `Sample ${i + 1}`)
  ];

  const bodyRows = certificate.tableData
    .filter(row => !row.section)
    .map(row => [
      certificate.certNumber  || '',
      certificate.client       || '',
      certificate.dateReported || '',
      certificate.sampleType   || '',
      certificate.location     || '',
      row.name  || '',
      row.unit  || '',
      row.limit || '',
      ...samples.map((_, si) => row.results?.[si] ?? ''),
    ]);

  const csvRows = [headerRow, ...bodyRows];
  const csvContent = BOM + csvRows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const clientClean = sanitizeFilename(certificate.client);
  const dateClean   = formatDateString(certificate.dateReported);
  const certClean   = (certificate.certNumber   || 'COA').replace(/[^A-Za-z0-9-]/g, '');
  const filename    = `COA_${clientClean}_${dateClean}_${certClean}.csv`;

  triggerDownload(csvContent, filename, 'text/csv;charset=utf-8;');
}

function generateCOA_Excel(certificate: Certificate): void {
  const samples = certificate.samples || [];
  
  const headerRow = [
    'Certificate No', 'Client', 'Date Reported', 'Sample Type',
    'Sample Source', 'Parameter', 'Unit', 'Limit',
    ...samples.map((s, i) => s || `Sample ${i + 1}`)
  ];

  const bodyRows = certificate.tableData
    .filter(row => !row.section)
    .map(row => [
      certificate.certNumber  || '',
      certificate.client       || '',
      certificate.dateReported || '',
      certificate.sampleType   || '',
      certificate.location     || '',
      row.name  || '',
      row.unit  || '',
      row.limit || '',
      ...samples.map((_, si) => row.results?.[si] ?? ''),
    ]);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...bodyRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "COA Data");

  const clientClean = sanitizeFilename(certificate.client);
  const dateClean   = formatDateString(certificate.dateReported);
  const certClean   = (certificate.certNumber   || 'COA').replace(/[^A-Za-z0-9-]/g, '');
  const filename    = `COA_${clientClean}_${dateClean}_${certClean}.xlsx`;

  XLSX.writeFile(wb, filename);
}

export function exportQuotation(quotation: Quotation): void {
  generateQuotation_CSV(quotation);
  generateQuotation_Excel(quotation);
}

function generateQuotation_CSV(quotation: Quotation): void {
  const BOM = '\uFEFF';
  const headerRow = [
    'Quote No', 'Date', 'Valid Until', 'Client', 'Address',
    '#', 'Description', 'Qty', 'Unit Price (K)', 'VAT (K)', 'Subtotal (K)', 'Grand Total (K)'
  ];

  const bodyRows = quotation.items.map((item, idx) => [
    quotation.quoteNumber    || '',
    quotation.date            || '',
    quotation.validUntil      || '',
    quotation.client          || '',
    quotation.clientAddress   || '',
    String(idx + 1),
    item.parameterName,
    String(item.quantity),
    item.unitPrice.toFixed(2),
    item.tax.toFixed(2),
    item.amount.toFixed(2),
    idx === 0 ? quotation.totalAmount.toFixed(2) : '',
  ]);

  const csvRows = [headerRow, ...bodyRows];
  const csvContent = BOM + csvRows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const clientClean = sanitizeFilename(quotation.client);
  const dateClean   = formatDateString(quotation.date);
  const qnoClean    = (quotation.quoteNumber || 'QT').replace(/[^A-Za-z0-9-]/g, '');
  const filename    = `QT_${clientClean}_${dateClean}_${qnoClean}.csv`;

  triggerDownload(csvContent, filename, 'text/csv;charset=utf-8;');
}

function generateQuotation_Excel(quotation: Quotation): void {
  const headerRow = [
    'Quote No', 'Date', 'Valid Until', 'Client', 'Address',
    '#', 'Description', 'Qty', 'Unit Price (K)', 'VAT (K)', 'Subtotal (K)', 'Grand Total (K)'
  ];

  const bodyRows = quotation.items.map((item, idx) => [
    quotation.quoteNumber    || '',
    quotation.date            || '',
    quotation.validUntil      || '',
    quotation.client          || '',
    quotation.clientAddress   || '',
    String(idx + 1),
    item.parameterName,
    String(item.quantity),
    item.unitPrice,
    item.tax,
    item.amount,
    idx === 0 ? quotation.totalAmount : '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...bodyRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Quotation Data");

  const clientClean = sanitizeFilename(quotation.client);
  const dateClean   = formatDateString(quotation.date);
  const qnoClean    = (quotation.quoteNumber || 'QT').replace(/[^A-Za-z0-9-]/g, '');
  const filename    = `QT_${clientClean}_${dateClean}_${qnoClean}.xlsx`;

  XLSX.writeFile(wb, filename);
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
