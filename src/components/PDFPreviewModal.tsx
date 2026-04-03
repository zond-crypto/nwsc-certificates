import React, { useState } from 'react';
import { Certificate, Quotation } from '../types';
import { Button } from '@/components/ui/button';
import { X, Eye, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PDFPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
  title: string;
  pdfContent: string; // HTML or text content to preview
}

/**
 * Generic PDF Preview Modal Component
 * Displays a preview of the PDF before download
 */
export function PDFPreviewModal({ isOpen, onClose, onDownload, title, pdfContent }: PDFPreviewProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-black text-[#003d7a] uppercase flex items-center gap-2">
            <Eye className="w-6 h-6" /> {title} Preview
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-auto bg-gray-50 p-8">
          <div className="bg-white rounded-xl shadow-sm p-8 max-w-4xl mx-auto">
            <div
              dangerouslySetInnerHTML={{ __html: pdfContent }}
              className="text-sm leading-relaxed"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <Button
            onClick={onClose}
            variant="outline"
            className="text-gray-700 border-gray-300"
          >
            Close
          </Button>
          <Button
            onClick={onDownload}
            className="bg-[#e8b400] hover:bg-[#d4a200] text-black font-bold"
          >
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Generate HTML preview for Certificate
 */
export function generateCertificatePreviewHTML(cert: Certificate): string {
  const rowsHTML = cert.tableData
    .map(row => {
      if (row.section) {
        return `
          <tr class="bg-gray-100">
            <td colspan="100%" class="font-bold text-gray-700 p-2 text-sm uppercase">
              ${row.section}
            </td>
          </tr>
        `;
      }
      const resultCells = row.results
        .map(r => `<td class="border p-2 text-center text-xs">${r || '—'}</td>`)
        .join('');
      
      return `
        <tr class="hover:bg-blue-50">
          <td class="border p-2 text-sm font-semibold">${row.name}</td>
          <td class="border p-2 text-xs text-center">${row.unit}</td>
          <td class="border p-2 text-xs text-center font-mono">${row.limit}</td>
          ${resultCells}
        </tr>
      `;
    })
    .join('');

  return `
    <div class="relative mb-8">
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 text-8xl font-black text-[#003d7a] tracking-widest">OFFICIAL</div>
      <div class="relative">
        <h1 class="text-2xl font-black text-[#003d7a] mb-2">WATER ANALYSIS CERTIFICATE</h1>
        <p class="text-xs text-gray-500 mb-4">Certificate Number: <strong>${cert.certNumber}</strong></p>
        
        <div class="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div>
            <p class="text-xs text-gray-500 uppercase font-bold">Client</p>
            <p class="font-semibold">${cert.client}</p>
            ${cert.clientPhone ? `<p class="text-xs text-gray-600">📞 ${cert.clientPhone}</p>` : ''}
            ${cert.clientEmail ? `<p class="text-xs text-gray-600">📧 ${cert.clientEmail}</p>` : ''}
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase font-bold">Sample Type</p>
            <p class="font-semibold">${cert.sampleType}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase font-bold">Sample Location</p>
            <p class="font-semibold">${cert.location}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase font-bold">Date Sampled</p>
            <p class="font-semibold">${cert.dateSampled}</p>
          </div>
        </div>

        <div class="mb-3 text-xs text-gray-600"><strong>Samples:</strong> ${cert.samples.length > 0 ? cert.samples.join(', ') : 'None'}</div>

      <table class="w-full border-collapse border border-gray-300 mb-6 text-xs">
        <thead class="bg-[#003d7a] text-white">
          <tr>
            <th class="border p-2 text-left">Parameter</th>
            <th class="border p-2 text-center">Unit</th>
            <th class="border p-2 text-center">Limit</th>
            ${cert.samples.map(s => `<th class="border p-2 text-center">${s}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>

      <div class="border-t-2 border-[#003d7a] pt-6 mt-6">
        <p class="text-xs text-gray-600 mb-4">Date Reported: <strong>${cert.dateReported}</strong></p>
        <div class="grid grid-cols-2 gap-8 text-sm">
          <div class="text-center">
            ${(cert.sign1Name || cert.sign1Title || cert.sign1SignatureImage) ? `
              ${cert.sign1SignatureImage ? `<img src="${cert.sign1SignatureImage}" alt="Signature 1" class="mx-auto mb-2 h-10 object-contain" />` : ''}
              <p class="border-t border-gray-400 pt-2">________________________</p>
              <p class="font-bold text-[#003d7a]">${cert.sign1Name || 'No Name Assigned'}</p>
              <p class="text-xs text-gray-600">${cert.sign1Title || 'No Title Assigned'}</p>
            ` : '<p class="text-xs text-gray-500 italic">No signatory 1 assigned</p>'}
          </div>
          <div class="text-center">
            ${(cert.sign2Name || cert.sign2Title || cert.sign2SignatureImage) ? `
              ${cert.sign2SignatureImage ? `<img src="${cert.sign2SignatureImage}" alt="Signature 2" class="mx-auto mb-2 h-10 object-contain" />` : ''}
              <p class="border-t border-gray-400 pt-2">________________________</p>
              <p class="font-bold text-[#003d7a]">${cert.sign2Name || '(Authorized Officer)'}</p>
              <p class="text-xs text-gray-600">${cert.sign2Title || 'No Title Assigned'}</p>
            ` : '<p class="text-xs text-gray-500 italic">No signatory 2 assigned</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate HTML preview for Quotation
 */
export function generateQuotationPreviewHTML(quote: Quotation): string {
  const itemRows = quote.items
    .map((item, idx) => `
      <tr class="hover:bg-blue-50">
        <td class="border p-2 text-center text-xs">${idx + 1}</td>
        <td class="border p-2 text-sm">${item.parameterName}</td>
        <td class="border p-2 text-center text-xs">${item.quantity}</td>
        <td class="border p-2 text-right text-xs font-mono">K ${item.unitPrice.toFixed(2)}</td>
        <td class="border p-2 text-right text-xs font-mono text-orange-600">K ${item.tax.toFixed(2)}</td>
        <td class="border p-2 text-right text-sm font-bold">K ${item.amount.toFixed(2)}</td>
      </tr>
    `)
    .join('');

  return `
    <div class="relative mb-8">
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 text-8xl font-black text-[#003d7a] tracking-widest">OFFICIAL</div>
      <div class="relative">
        <h1 class="text-2xl font-black text-[#003d7a] mb-2">SERVICE QUOTATION</h1>
        <p class="text-xs text-gray-500 mb-6">Quote Number: <strong>${quote.quoteNumber}</strong></p>

        <div class="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div>
            <p class="text-xs text-gray-500 uppercase font-bold">Client</p>
            <p class="font-semibold">${quote.client}</p>
            ${quote.clientPhone ? `<p class="text-xs text-gray-600">📞 ${quote.clientPhone}</p>` : ''}
            ${quote.clientEmail ? `<p class="text-xs text-gray-600">📧 ${quote.clientEmail}</p>` : ''}
        </div>
        <div>
          <p class="text-xs text-gray-500 uppercase font-bold">Date</p>
          <p class="font-semibold">${quote.date}</p>
        </div>
        <div class="col-span-2">
          <p class="text-xs text-gray-500 uppercase font-bold mb-1">Billing Address</p>
          <p class="text-sm whitespace-pre-wrap">${quote.clientAddress}</p>
        </div>
      </div>

      <div class="mb-4 text-xs text-gray-600"><strong>Samples:</strong> ${quote.samples && quote.samples.length > 0 ? quote.samples.join(', ') : 'None'}</div>

      <table class="w-full border-collapse border border-gray-300 mb-6 text-xs">
        <thead class="bg-[#003d7a] text-white">
          <tr>
            <th class="border p-2 text-center">#</th>
            <th class="border p-2 text-left">Description</th>
            <th class="border p-2 text-center">Qty</th>
            <th class="border p-2 text-right">Unit Price</th>
            <th class="border p-2 text-right">Tax (16%)</th>
            <th class="border p-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <div class="space-y-2 text-sm mb-6 border-t-2 border-[#003d7a] pt-4">
        <div class="flex justify-between">
          <span class="text-gray-600 font-semibold">Subtotal</span>
          <span class="font-bold">K ${quote.subtotal.toFixed(2)}</span>
        </div>
        <div class="flex justify-between text-orange-600">
          <span class="font-semibold">VAT (16%)</span>
          <span class="font-bold">K ${quote.totalTax.toFixed(2)}</span>
        </div>
        <div class="flex justify-between bg-[#e8b400]/10 p-3 rounded font-bold text-[#003d7a]">
          <span class="uppercase">GRAND TOTAL</span>
          <span class="text-lg">K ${quote.totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <p class="text-xs text-gray-600 mb-4">Valid Until: <strong>${quote.validUntil}</strong></p>

      <div class="border-t-2 border-[#003d7a] pt-6 mt-6">
        <div class="grid grid-cols-2 gap-8 text-sm">
          <div class="text-center">
            ${(quote.sign1Name || quote.sign1Title || quote.sign1SignatureImage) ? `
              ${quote.sign1SignatureImage ? `<img src="${quote.sign1SignatureImage}" alt="Signature 1" class="mx-auto mb-2 h-10 object-contain" />` : ''}
              <p class="border-t border-gray-400 pt-2">________________________</p>
              <p class="font-bold text-[#003d7a]">${quote.sign1Name || 'No Name Assigned'}</p>
              <p class="text-xs text-gray-600">${quote.sign1Title || 'No Title Assigned'}</p>
            ` : '<p class="text-xs text-gray-500 italic">No signatory 1 assigned</p>'}
          </div>
          <div class="text-center">
            ${(quote.sign2Name || quote.sign2Title || quote.sign2SignatureImage) ? `
              ${quote.sign2SignatureImage ? `<img src="${quote.sign2SignatureImage}" alt="Signature 2" class="mx-auto mb-2 h-10 object-contain" />` : ''}
              <p class="border-t border-gray-400 pt-2">________________________</p>
              <p class="font-bold text-[#003d7a]">${quote.sign2Name || '(Authorized Officer)'}</p>
              <p class="text-xs text-gray-600">${quote.sign2Title || 'No Title Assigned'}</p>
            ` : '<p class="text-xs text-gray-500 italic">No signatory 2 assigned</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
}
