/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Droplets } from 'lucide-react';
import { COMPANY_INFO } from '../../pdf/constants';
import { QuotationData } from '../../types';
import DocumentHeader from './DocumentHeader';

interface QuotationProps {
  data: QuotationData;
}

export default function Quotation({ data }: QuotationProps) {
  const subtotal = data.items.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = data.discount || 0;
  const taxableAmount = subtotal - discountAmount;
  const vat = taxableAmount * data.vatRate;
  const grandTotal = taxableAmount + vat;

  return (
    <div className="relative flex flex-col bg-white shadow-2xl mx-auto w-[210mm] min-h-[297mm] font-sans text-[#1a1a1a] print:shadow-none print:m-0 overflow-hidden">
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
        <div className="flex flex-col items-center">
          <Droplets className="w-[500px] h-[500px]" />
          <p className="text-6xl font-bold mt-4 text-center">NKANA WATER SUPPLY<br/>AND SANITATION COMPANY</p>
        </div>
      </div>

      <DocumentHeader 
        company={COMPANY_INFO} 
        department="SAFETY HEALTH ENVIRONMENT AND QUALITY DEPARTMENT" 
        documentTitle="QUOTATION" 
      />

      <div className="px-14 py-6 flex-grow flex flex-col relative z-10">
        {/* Metadata section */}
        <div className="grid grid-cols-4 gap-0 border border-gray-300 rounded-sm overflow-hidden mb-10 text-xs bg-sky-50/50">
          <div className="border-r border-b border-gray-300 p-2">
            <p className="font-bold text-[#004a99]">Quotation No:</p>
            <p className="mt-1">{data.quotationNo}</p>
          </div>
          <div className="border-r border-b border-gray-300 p-2">
            <p className="font-bold text-[#004a99]">Client Name:</p>
            <p className="mt-1">{data.clientName}</p>
          </div>
          <div className="border-r border-b border-gray-300 p-2">
            <p className="font-bold text-[#004a99]">Date Issued:</p>
            <p className="mt-1">{data.dateIssued}</p>
          </div>
          <div className="border-b border-gray-300 p-2">
            <p className="font-bold text-[#004a99]">Valid Until:</p>
            <p className="mt-1">{data.validUntil}</p>
          </div>
          <div className="p-2 col-span-4">
            <p className="font-bold text-[#004a99]">Client Contact:</p>
            <p className="mt-1">{data.clientContact}</p>
          </div>
        </div>

        {/* Quotation Table */}
        <div className="border border-gray-300 rounded-sm overflow-hidden mb-10">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#004a99] text-white text-center">
                <th className="border border-white/20 p-2 text-left">Parameter</th>
                <th className="border border-white/20 p-2 w-20">Unit</th>
                <th className="border border-white/20 p-2 w-20">Quantity</th>
                <th className="border border-white/20 p-2 w-28">Unit Price</th>
                <th className="border border-white/20 p-2 w-28">VAT (16%)</th>
                <th className="border border-white/20 p-2 w-32">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => {
                const itemVat = item.total * data.vatRate;
                return (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 p-3 font-medium px-4">{item.description}</td>
                    <td className="border border-gray-300 p-3 text-center">{item.unit}</td>
                    <td className="border border-gray-300 p-3 text-center">{item.quantity}</td>
                    <td className="border border-gray-300 p-3 text-right px-4">K {item.unitPrice.toFixed(2)}</td>
                    <td className="border border-gray-300 p-3 text-right px-4 text-orange-600 font-medium">K {itemVat.toFixed(2)}</td>
                    <td className="border border-gray-300 p-3 text-right px-4 font-bold">K {item.total.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
               <tr className="text-right">
                  <td colSpan={4} className="border-l border-b border-gray-300 p-2 font-medium">Subtotal</td>
                  <td colSpan={2} className="border border-gray-300 p-2 px-4 font-bold">K {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
               </tr>
               {discountAmount > 0 && (
                 <tr className="text-right text-red-600">
                    <td colSpan={4} className="border-l border-b border-gray-300 p-2 font-medium">Discount</td>
                    <td colSpan={2} className="border border-gray-300 p-2 px-4 font-bold">- K {discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                 </tr>
               )}
               {discountAmount > 0 && (
                 <tr className="text-right">
                    <td colSpan={4} className="border-l border-b border-gray-300 p-2 font-medium">Taxable Amount</td>
                    <td colSpan={2} className="border border-gray-300 p-2 px-4 font-bold text-gray-700 font-mono">K {taxableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                 </tr>
               )}
               <tr className="text-right">
                  <td colSpan={4} className="border-l border-b border-gray-300 p-2 font-medium text-orange-600">Total VAT (16%)</td>
                  <td colSpan={2} className="border border-gray-300 p-2 px-4 font-bold text-orange-600">K {vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
               </tr>
               <tr className="text-right bg-[#004a99] text-white">
                  <td colSpan={4} className="p-3 text-lg font-bold uppercase tracking-widest">Grand Total</td>
                  <td colSpan={2} className="p-3 px-4 text-xl font-bold">K {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
               </tr>
            </tfoot>
          </table>
        </div>

        {/* Terms & Conditions */}
        <div className="mt-4">
          <h4 className="text-sm font-bold text-[#004a99] uppercase tracking-wider mb-2">Terms & Conditions</h4>
          <ul className="text-xs space-y-1 list-decimal list-inside text-gray-700">
            {data.terms.map((term, i) => (
              <li key={i}>{term}</li>
            ))}
          </ul>
        </div>

        {/* Preparation & Authorization */}
        <div className="mt-16 border-t-2 border-[#004a99]/20 pt-6">
          <div className="flex justify-between items-start">
            {/* Prepared By Section */}
            <div className="w-1/3">
              <h4 className="text-sm font-bold text-[#004a99] uppercase tracking-wider mb-6">Prepared By</h4>
              <div className="border-b-2 border-gray-400 h-8 mb-2"></div>
              <p className="text-xs text-gray-500 uppercase">Technician Name & Signature</p>
            </div>

            {/* Authorised Signatories Section */}
            <div className="w-1/2">
              <div className="flex gap-10 mt-12">
                {data.signatories.map((sig, i) => (
                  <div key={i} className="flex-1">
                    <div className="border-b-2 border-gray-400 h-8 mb-2"></div>
                    {sig.name && sig.title !== "QUALITY ASSURANCE OFFICER" && (
                      <p className="font-bold text-sm">{sig.name}</p>
                    )}
                    <p className="text-xs text-gray-500 uppercase">{sig.title}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-[#004a99] text-white p-2 mt-auto flex justify-between items-center text-[10px] px-14">
        <p className="italic font-light tracking-wide">Bigger, Better, Smarter</p>
        <p>Page 1 of 1</p>
      </div>
    </div>
  );
}
