import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Quotation, QuotationItem, ServicePrice } from '../types';
import { DEFAULT_QUOTATION_ITEMS } from '../constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Printer, Save, FileDown, Search, Eye } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildDocumentFilename } from '../utils/fileNaming';
import { PDFPreviewModal, generateQuotationPreviewHTML } from './PDFPreviewModal';

interface Props {
  quotation: Quotation;
  setQuotation: React.Dispatch<React.SetStateAction<Quotation>>;
  onSave: () => void;
  priceList: ServicePrice[];
}

export function QuotationEditor({ quotation, setQuotation, onSave, priceList }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const updateTotals = (items: QuotationItem[]) => {
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const totalTax = subtotal * 0.16;
    setQuotation(prev => ({
      ...prev,
      items,
      subtotal,
      totalTax,
      totalAmount: subtotal + totalTax
    }));
  };

  const handleMetaChange = (field: keyof Quotation, value: string) => {
    setQuotation(prev => ({ ...prev, [field]: value }));
  };

  const addItem = () => {
    const newItem: QuotationItem = {
      id: `qi${Date.now()}`,
      parameterName: "New Parameter",
      unitPrice: 0,
      quantity: 1,
      tax: 0,
      amount: 0,
      totalWithTax: 0
    };
    updateTotals([...quotation.items, newItem]);
  };

  const removeItem = (id: string) => {
    updateTotals(quotation.items.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: keyof QuotationItem, value: any) => {
    const newItems = quotation.items.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      
      // If choosing from price list
      if (field === 'parameterName') {
        const priceEntry = priceList.find(p => p.parameterName === value);
        if (priceEntry) {
          updated.unitPrice = priceEntry.unitPrice;
        }
      }

      updated.amount = updated.unitPrice * updated.quantity;
      updated.tax = updated.amount * 0.16;
      updated.totalWithTax = updated.amount + updated.tax;
      return updated;
    });
    updateTotals(newItems);
  };

  const formatCurrency = (val: number) => `K ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
    
    // Header
    doc.setFillColor(0, 61, 122);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("NKANA WATER SUPPLY AND SANITATION COMPANY", 105, 12, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Mutondo Crescent, Riverside, Box 20982 Kitwe, Zambia", 105, 18, { align: "center" });
    doc.text("Tel: +260 212 222488 | Email: headoffice@nwsc.com.zm", 105, 22, { align: "center" });
    doc.setTextColor(232, 180, 0);
    doc.setFontSize(14);
    doc.text("SERVICE QUOTATION", 105, 30, { align: "center" });

    // Meta
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Quote No: ${quotation.quoteNumber}`, 15, 50);
    doc.text(`Date: ${quotation.date}`, 150, 50);
    doc.text(`Client: ${quotation.client}`, 15, 60);
    doc.text(`Address: ${quotation.clientAddress}`, 15, 65);

    // Table
    const body = quotation.items.map((item, idx) => [
      idx + 1,
      item.parameterName,
      item.quantity,
      formatCurrency(item.unitPrice),
      formatCurrency(item.tax),
      formatCurrency(item.amount)
    ]);

    autoTable(doc, {
      startY: 75,
      head: [['#', 'Description', 'Qty', 'Unit Price', 'Tax (16%)', 'Subtotal']],
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [0, 61, 122] },
      styles: { fontSize: 9 }
    });

    // Totals
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold");
    doc.text(`Subtotal:`, 140, finalY);
    doc.text(formatCurrency(quotation.subtotal), 180, finalY, { align: 'right' });
    doc.text(`Total VAT (16%):`, 140, finalY + 7);
    doc.text(formatCurrency(quotation.totalTax), 180, finalY + 7, { align: 'right' });
    doc.setFillColor(232, 180, 0);
    doc.rect(135, finalY + 10, 60, 10, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text(`GRAND TOTAL:`, 140, finalY + 16);
    doc.text(formatCurrency(quotation.totalAmount), 180, finalY + 16, { align: 'right' });

    doc.save(buildDocumentFilename('Quotation', quotation.client, 'pdf'));
  };

  const exportCSV = () => {
    let csv = `NKANA WATER SUPPLY AND SANITATION COMPANY,,,...\n`;
    csv += `SERVICE QUOTATION,,,...\n`;
    csv += `,,,...\n`;

    csv += `Quote No:,"${quotation.quoteNumber}",Client:,"${quotation.client}",Date:,"${quotation.date}"\n`;
    csv += `Valid Until:,"${quotation.validUntil}",,,\n`;
    csv += `,,,...\n`;

    csv += `#,Description,Qty,Unit Price,Tax (16%),Subtotal\n`;

    quotation.items.forEach((item, idx) => {
      csv += `${idx + 1},"${item.parameterName}",${item.quantity},"K ${item.unitPrice.toFixed(2)}",`;
      csv += `"K ${item.tax.toFixed(2)}",`;
      csv += `"K ${item.amount.toFixed(2)}"\n`;
    });

    csv += `,,,...\n`;
    csv += `Subtotal,,"K ${quotation.subtotal.toFixed(2)}"\n`;
    csv += `Total VAT (16%),,"K ${quotation.totalTax.toFixed(2)}"\n`;
    csv += `Grand Total,,"K ${quotation.totalAmount.toFixed(2)}"\n`;

    csv += `,,,...\n`;
    csv += `Signed By:,"${quotation.sign1Name} (${quotation.sign1Title})",,,\n`;
    csv += `Signed By:,"${quotation.sign2Name} (${quotation.sign2Title})",,,\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildDocumentFilename('Quotation', quotation.client, 'csv');
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported!');
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#002050] via-[#003d7a] to-[#004a94] text-white border-b-[3px] border-[#e8b400] print:border-b-2 print:bg-white print:text-black">
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch">
          {/* Logo block */}
          <div className="pt-5 pb-3 sm:py-5 px-5 flex items-center justify-center shrink-0">
            <div className="bg-white rounded-2xl p-2.5 shadow-md print:shadow-none print:rounded-none print:p-0">
              <img src="/logo.png" alt="Nkana Water and Sanitation Company" className="w-20 h-20 sm:w-[88px] sm:h-[88px] object-contain print:w-16 print:h-16" />
            </div>
          </div>

          {/* Title block */}
          <div className="flex-1 min-w-0 px-4 sm:px-0 pb-5 sm:py-5 sm:pr-5 text-center sm:text-left flex flex-col justify-center">
            <h1 className="text-base sm:text-xl md:text-2xl font-black tracking-wider uppercase leading-tight text-white print:text-black">
              NKANA WATER SUPPLY AND SANITATION COMPANY
            </h1>
            <div className="text-[11px] text-blue-200/80 leading-relaxed mt-1 print:text-gray-700">
              Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia.<br/>
              Tel: +260 212 222488 / 221099 / 0971 223 458 &nbsp;|&nbsp; Fax: +260 212 222490<br/>
              <a href="mailto:headoffice@nwsc.com.zm" className="hover:text-white underline print:text-black">headoffice@nwsc.com.zm</a>
              {" | "}
              <a href="http://www.nwsc.zm" target="_blank" rel="noreferrer" className="hover:text-white underline print:text-black">www.nwsc.zm</a>
            </div>
            <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="inline-flex items-center self-center sm:self-auto px-2.5 py-1 rounded-md border border-[#e8b400]/60 bg-[#e8b400]/10 text-[#e8b400] text-[10px] font-bold tracking-widest uppercase print:border-gray-400 print:bg-transparent print:text-gray-700">
                SHEQ DEPARTMENT
              </span>
              <span className="text-lg sm:text-xl md:text-2xl font-bold tracking-widest text-white/95 print:text-black">
                SERVICE QUOTATION
              </span>
            </div>
          </div>

          {/* Quote no. side column — desktop */}
          <div className="hidden sm:flex p-5 flex-col items-end justify-center border-l border-white/10 shrink-0 print:border-none print:p-4">
            <div className="bg-white/10 p-4 rounded-xl border border-white/15 shadow-inner print:bg-transparent print:border-none print:p-0 print:shadow-none min-w-[150px]">
              <div className="flex flex-col items-end">
                <div className="text-[10px] tracking-widest text-blue-200/80 uppercase font-semibold mb-0.5 print:text-gray-500">Quote Number</div>
                <Input
                  className="bg-transparent border-none text-[#e8b400] text-lg font-bold font-mono text-right w-full outline-none focus:ring-2 focus:ring-[#e8b400]/50 rounded transition-all print:text-black print:placeholder-gray-300"
                  value={quotation.quoteNumber}
                  onChange={e => handleMetaChange('quoteNumber', e.target.value)}
                  placeholder="QT-001"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meta Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 bg-[#f8fbff] border-b divide-x">
         <div className="p-4">
            <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Client Name</label>
            <Input className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] focus:ring-0" value={quotation.client} onChange={e => handleMetaChange('client', e.target.value)} placeholder="Client name" />
         </div>
         <div className="p-4">
            <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Date</label>
            <Input type="date" className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] focus:ring-0" value={quotation.date} onChange={e => handleMetaChange('date', e.target.value)} />
         </div>
         <div className="p-4">
            <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Valid Until</label>
            <Input type="date" className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] focus:ring-0" value={quotation.validUntil} onChange={e => handleMetaChange('validUntil', e.target.value)} />
         </div>
      </div>

      {/* Items Table */}
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-black text-[#003d7a]">QUOTATION ITEMS</h3>
          <Button onClick={addItem} size="sm" className="bg-[#003d7a] hover:bg-[#002a5a] text-xs"><Plus className="w-3 h-3 mr-1"/> Add Item</Button>
        </div>

        <div className="border rounded-xl overflow-hidden shadow-inner bg-gray-50">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#003d7a] text-white">
                <th className="p-3 text-left w-12">#</th>
                <th className="p-3 text-left min-w-[200px]">Parameter / Description</th>
                <th className="p-3 text-center w-20">Qty</th>
                <th className="p-3 text-right w-32">Unit Price</th>
                <th className="p-3 text-right w-32">Tax (16%)</th>
                <th className="p-3 text-right w-32">Amount</th>
                <th className="p-3 text-center w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {quotation.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="p-3 text-gray-400 font-mono">{idx + 1}</td>
                  <td className="p-2">
                    <Select value={item.parameterName} onValueChange={v => updateItem(item.id, 'parameterName', v)}>
                      <SelectTrigger className="h-8 border-transparent hover:bg-gray-50 font-bold text-[#003d7a]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {priceList.map(p => <SelectItem key={p.id} value={p.parameterName}>{p.parameterName}</SelectItem>)}
                        <SelectItem value="Custom Service">Custom Service...</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <Input 
                      type="number" 
                      className="h-8 text-center border-transparent hover:bg-gray-50" 
                      value={item.quantity} 
                      onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)} 
                    />
                  </td>
                  <td className="p-2">
                    <Input 
                      type="number" 
                      className="h-8 text-right font-bold text-[#003d7a]" 
                      value={item.unitPrice} 
                      onChange={e => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                    />
                  </td>
                  <td className="p-2 text-right font-medium text-orange-600">{formatCurrency(item.tax)}</td>
                  <td className="p-2 text-right font-black text-[#003d7a]">{formatCurrency(item.amount)}</td>
                  <td className="p-2 text-center">
                    <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="mt-6 flex flex-col md:flex-row justify-between items-start gap-8">
           <div className="flex-1 space-y-4">
              <label className="text-[10px] font-black text-gray-400 uppercase">Billing Address</label>
              <textarea 
                className="w-full p-3 border rounded-xl text-sm italic text-gray-600 focus:ring-2 focus:ring-blue-100 outline-none" 
                rows={3} 
                placeholder="Client Address..."
                value={quotation.clientAddress}
                onChange={e => handleMetaChange('clientAddress', e.target.value)}
              />
           </div>
           <div className="w-full md:w-80 space-y-3 bg-gray-50 p-6 rounded-2xl border">
              <div className="flex justify-between text-sm">
                 <span className="text-gray-500 font-bold">Subtotal</span>
                 <span className="font-bold">{formatCurrency(quotation.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                 <span className="text-orange-600 font-bold">VAT (16%)</span>
                 <span className="font-bold text-orange-600">{formatCurrency(quotation.totalTax)}</span>
              </div>
              <div className="pt-3 border-t-2 border-[#e8b400] flex justify-between items-center">
                 <span className="text-lg font-black text-[#003d7a] uppercase">Grand Total</span>
                 <span className="text-lg font-black text-[#003d7a]">{formatCurrency(quotation.totalAmount)}</span>
              </div>
           </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
         <Button onClick={onSave} className="bg-[#003d7a] hover:bg-[#002a5a] font-bold"><Save className="w-4 h-4 mr-2" /> Save Quote</Button>
         <Button onClick={() => setShowPreview(true)} className="bg-purple-600 hover:bg-purple-700 font-bold"><Eye className="w-4 h-4 mr-2" /> Preview</Button>
         <Button onClick={exportCSV} className="bg-blue-500 hover:bg-blue-600 text-white font-black"><FileDown className="w-4 h-4 mr-2" /> Export CSV</Button>
         <Button onClick={exportPDF} className="bg-[#e8b400] hover:bg-[#d4a200] text-[#1a1a00] font-black"><Printer className="w-4 h-4 mr-2" /> Print PDF</Button>
      </div>

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        onDownload={() => {
          setShowPreview(false);
          exportPDF();
        }}
        title={quotation.quoteNumber}
        pdfContent={generateQuotationPreviewHTML(quotation)}
      />
    </div>
  );
}
