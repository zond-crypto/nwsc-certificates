import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Quotation, QuotationItem, ServicePrice, Signature } from '../types';
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
import { calculateExpiryDate, formatDisplayDate, getExpiryWarningMessage } from '../utils/quotationUtils';

interface Props {
  quotation: Quotation;
  setQuotation: React.Dispatch<React.SetStateAction<Quotation>>;
  onSave: () => void;
  priceList: ServicePrice[];
  signatures: Signature[];
}

export function QuotationEditor({ quotation, setQuotation, onSave, priceList, signatures }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [newSampleName, setNewSampleName] = useState('');
  const [selectedSign1Id, setSelectedSign1Id] = useState(quotation.sign1SignatureId || '');
  const [selectedSign2Id, setSelectedSign2Id] = useState(quotation.sign2SignatureId || '');

  // Calculate expiry warning
  const expiryWarning = quotation.expiryDate ? getExpiryWarningMessage(quotation.expiryDate) : null;

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

  const handleMetaChange = useCallback((field: keyof Quotation, value: string) => {
    setQuotation(prev => {
      const updated = { ...prev, [field]: value };

      // Auto-calculate expiry date when date changes
      if (field === 'date' && value) {
        const issueDate = new Date(value);
        const expiryDate = calculateExpiryDate(issueDate);
        updated.expiryDate = expiryDate.toISOString();
        updated.validUntil = expiryDate.toISOString().split('T')[0];
      }

      return updated;
    });
  }, []);

  useEffect(() => {
    setSelectedSign1Id(quotation.sign1SignatureId || '');
    setSelectedSign2Id(quotation.sign2SignatureId || '');
  }, [quotation.sign1SignatureId, quotation.sign2SignatureId]);

  const applySignature = (slot: 'sign1' | 'sign2', signatureId: string) => {
    const signature = signatures.find(sig => sig.id === signatureId);
    if (!signature) return;
    setQuotation(prev => ({
      ...prev,
      [`${slot}Name`]: signature.fullName,
      [`${slot}Title`]: signature.role,
      [`${slot}SignatureId`]: signature.id,
      [`${slot}SignatureImage`]: signature.imageDataUrl,
    } as Quotation));
    if (slot === 'sign1') setSelectedSign1Id(signatureId);
    else setSelectedSign2Id(signatureId);
  };

  const applyDefaultSignature = (slot: 'sign1' | 'sign2') => {
    const defaultSig = signatures.find(sig => sig.isDefault);
    if (!defaultSig) return;
    applySignature(slot, defaultSig.id);
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

  const addSample = () => {
    const sampleLabel = newSampleName.trim();
    if (!sampleLabel) return;
    setQuotation(prev => ({
      ...prev,
      samples: [...(prev.samples || []), sampleLabel]
    }));
    setNewSampleName('');
  };

  const removeSample = (index: number) => {
    setQuotation(prev => ({
      ...prev,
      samples: (prev.samples || []).filter((_, idx) => idx !== index)
    }));
  };

  const formatCurrency = (val: number) => `K ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Watermark
    doc.saveGraphicsState();
    (doc as any).setGState(new (doc as any).GState({ opacity: 0.08 }));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(60);
    doc.setTextColor(200, 200, 200);
    doc.text('OFFICIAL', pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
    doc.restoreGraphicsState();

    // Optional logo injection
    const loadImage = (src: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('No canvas context');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject('Logo load failed');
      });
    };

    try {
      const logoDataUrl = await loadImage('/logo.png');
      doc.addImage(logoDataUrl, 'PNG', 15, 12, 22, 22);
    } catch {
      // fallback skip
    }

    // Header
    doc.setFillColor(0, 61, 122);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('NKANA WATER SUPPLY AND SANITATION COMPANY', 105, 12, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Mutondo Crescent, Riverside, Box 20982 Kitwe, Zambia', 105, 18, { align: 'center' });
    doc.text('Tel: +260 212 222488 | Email: headoffice@nwsc.com.zm', 105, 22, { align: 'center' });
    doc.setTextColor(232, 180, 0);
    doc.setFontSize(14);
    doc.text('SERVICE QUOTATION', 105, 30, { align: 'center' });

    // Meta
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Quote No: ${quotation.quoteNumber}`, 15, 50);
    if (quotation.quotationCode) {
      doc.text(`Code: ${quotation.quotationCode}`, 15, 55);
    }
    doc.text(`Date: ${quotation.date}`, 150, 50);
    doc.text(`Valid Until: ${quotation.validUntil}`, 150, 55);
    doc.text(`Client: ${quotation.client}`, 15, 65);
    doc.text(`Address: ${quotation.clientAddress}`, 15, 70);

    doc.text(`Samples: ${(quotation.samples || []).join(', ')}`, 15, 77);

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
      startY: 85,
      head: [['#', 'Description', 'Qty', 'Unit Price', 'Tax (16%)', 'Subtotal']],
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [0, 61, 122] },
      styles: { fontSize: 9, overflow: 'linebreak', cellWidth: 'wrap' }
    });

    // Totals
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal:`, 140, finalY);
    doc.text(formatCurrency(quotation.subtotal), 180, finalY, { align: 'right' });
    doc.text(`Total VAT (16%):`, 140, finalY + 7);
    doc.text(formatCurrency(quotation.totalTax), 180, finalY + 7, { align: 'right' });
    doc.setFillColor(232, 180, 0);
    doc.rect(135, finalY + 10, 60, 10, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text(`GRAND TOTAL:`, 140, finalY + 16);
    doc.text(formatCurrency(quotation.totalAmount), 180, finalY + 16, { align: 'right' });

    // Signatories
    if (quotation.sign1Name || quotation.sign1Title || quotation.sign1SignatureImage || quotation.sign2Name || quotation.sign2Title || quotation.sign2SignatureImage) {
      const signY = finalY + 35;
      doc.setFont('helvetica', 'bold');
      doc.text('Signatories', 20, signY);

      if (quotation.sign1Name || quotation.sign1Title || quotation.sign1SignatureImage) {
        if (quotation.sign1SignatureImage) {
          try { doc.addImage(quotation.sign1SignatureImage, 'PNG', 20, signY + 5, 40, 15); } catch {}
        }
        doc.setFont('helvetica', 'normal');
        doc.text(`${quotation.sign1Name || 'Name not provided'}`, 40, signY + 30, { align: 'center' });
        doc.text(`${quotation.sign1Title || 'Title not provided'}`, 40, signY + 35, { align: 'center' });
      }

      if (quotation.sign2Name || quotation.sign2Title || quotation.sign2SignatureImage) {
        if (quotation.sign2SignatureImage) {
          try { doc.addImage(quotation.sign2SignatureImage, 'PNG', 130, signY + 5, 40, 15); } catch {}
        }
        doc.setFont('helvetica', 'normal');
        doc.text(`${quotation.sign2Name || '(Authorized Officer)'}`, 170, signY + 30, { align: 'center' });
        doc.text(`${quotation.sign2Title || 'Title not provided'}`, 170, signY + 35, { align: 'center' });
      }
    }

    doc.save(buildDocumentFilename('Quotation', quotation.client, 'pdf'));
  };

  const exportCSV = () => {
    let csv = `NKANA WATER SUPPLY AND SANITATION COMPANY,,,...\n`;
    csv += `SERVICE QUOTATION,,,...\n`;
    csv += `,,,...\n`;

    csv += `Quote No:,"${quotation.quoteNumber}",Client:,"${quotation.client}",Date:,"${quotation.date}"\n`;
    if (quotation.quotationCode) {
      csv += `Code:,"${quotation.quotationCode}",Valid Until:,"${quotation.validUntil}",,\n`;
    } else {
      csv += `Valid Until:,"${quotation.validUntil}",,,\n`;
    }
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

      {/* Expiry Warning Banner */}
      {expiryWarning && (
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mx-4 rounded-r-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-orange-800 font-medium">{expiryWarning}</p>
            </div>
          </div>
        </div>
      )}

      {/* Meta Bar */}
      <div className="grid grid-cols-1 md:grid-cols-5 bg-[#f8fbff] border-b divide-x">
         <div className="p-4">
            <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Client Name</label>
            <Input className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] focus:ring-0" value={quotation.client} onChange={e => handleMetaChange('client', e.target.value)} placeholder="Client name" />
         </div>
         <div className="p-4">
            <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Phone</label>
            <Input className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] focus:ring-0" value={quotation.clientPhone || ''} onChange={e => handleMetaChange('clientPhone', e.target.value)} placeholder="+260 212 222488" />
         </div>
         <div className="p-4">
            <label className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Email</label>
            <Input className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] focus:ring-0" value={quotation.clientEmail || ''} onChange={e => handleMetaChange('clientEmail', e.target.value)} placeholder="client@email.com" />
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

      {/* Samples Section */}
      <div className="p-6 border-b border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-sm font-black text-[#003d7a]">Sample Entries</h3>
          <span className="text-xs text-gray-500">Manage multiple samples for this quotation</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {(quotation.samples || []).map((sample, idx) => (
            <span key={idx} className="inline-flex items-center gap-1 rounded bg-[#e8f1ff] px-2 py-1 text-xs text-[#003d7a]">
              {sample}
              <button type="button" onClick={() => removeSample(idx)} className="text-red-500">×</button>
            </span>
          ))}
          {(quotation.samples || []).length === 0 && <span className="text-xs text-gray-400">No samples defined yet.</span>}
        </div>
        <div className="flex gap-2">
          <Input
            value={newSampleName}
            onChange={e => setNewSampleName(e.target.value)}
            placeholder="Add sample description"
            className="flex-1"
          />
          <Button size="sm" onClick={addSample} className="bg-[#003d7a] hover:bg-[#002a5a] text-xs">Add Sample</Button>
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

      {/* Signature Selection */}
      <div className="p-4 bg-[#f5faff] border-t border-[#003d7a]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#003d7a]">Signatory 1</label>
            <select value={selectedSign1Id} onChange={e => applySignature('sign1', e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
              <option value="">(Choose saved signature)</option>
              {signatures.map(sig => <option key={sig.id} value={sig.id}>{sig.fullName} • {sig.role}{sig.isDefault ? ' (default)' : ''}</option>)}
            </select>
            <button className="text-xs text-[#003d7a] underline" onClick={() => applyDefaultSignature('sign1')}>Use default signature</button>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#003d7a]">Signatory 2</label>
            <select value={selectedSign2Id} onChange={e => applySignature('sign2', e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
              <option value="">(Choose saved signature)</option>
              {signatures.map(sig => <option key={sig.id} value={sig.id}>{sig.fullName} • {sig.role}{sig.isDefault ? ' (default)' : ''}</option>)}
            </select>
            <button className="text-xs text-[#003d7a] underline" onClick={() => applyDefaultSignature('sign2')}>Use default signature</button>
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
