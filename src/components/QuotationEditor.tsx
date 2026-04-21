import React, { useState, useEffect, useCallback } from 'react';
import { Quotation, QuotationItem, ServicePrice, Signature } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Printer, Save, FileDown, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { PDFPreviewModal, QuotationPreviewDocument } from './PDFPreviewModal';
import { generateQuotationPdf, exportQuotationCSV } from '../utils/pdfGenerators';
import { calculateExpiryDate, formatDisplayDate, getExpiryWarningMessage } from '../utils/quotationUtils';

interface Props {
  quotation: Quotation;
  setQuotation: React.Dispatch<React.SetStateAction<Quotation>>;
  onSave: () => Promise<boolean> | boolean;
  priceList: ServicePrice[];
  signatures: Signature[];
}

export function QuotationEditor({ quotation, setQuotation, onSave, priceList, signatures }: Props) {
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

      if (field === 'date' && value) {
        const issueDate = new Date(value);
        const expiryDate = calculateExpiryDate(issueDate);
        updated.expiryDate = expiryDate.toISOString();
        updated.validUntil = expiryDate.toISOString().split('T')[0];
      }

      if (field === 'validUntil' && value) {
        updated.expiryDate = new Date(`${value}T23:59:59`).toISOString();
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

  const updateSample = (value: string) => {
    setQuotation(prev => ({
      ...prev,
      samples: value ? [value] : []
    }));
  };

  const formatCurrency = (val: number) => `K ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const exportPDF = async () => {
    const success = await onSave();
    if (success === false) return; // Prevent download if save blocked by duplication check

    try {
      await generateQuotationPdf(quotation);
      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('PDF generation failed', error);
      toast.error('Failed to generate PDF');
    }
  };

  const exportCSV = () => {
    try {
      exportQuotationCSV(quotation);
      toast.success('CSV exported successfully!');
    } catch (error) {
      console.error('CSV export failed', error);
      toast.error('Failed to export CSV');
    }
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

      {/* Single Sample Section */}
      <div className="p-6 border-b border-gray-200 bg-white">
        <div className="flex flex-col gap-2 mb-2">
          <label className="text-sm font-black text-[#003d7a]">Sample</label>
          <Input
            value={quotation.samples?.[0] || ''}
            onChange={e => updateSample(e.target.value)}
            placeholder="Enter sample description"
            className="flex-1"
          />
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
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#003d7a]">Prepared By</label>
            <select value={selectedSign2Id} onChange={e => applySignature('sign2', e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
              <option value="">(Choose saved signature)</option>
              {signatures.map(sig => <option key={sig.id} value={sig.id}>{sig.fullName} • {sig.role}{sig.isDefault ? ' (default)' : ''}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <button className="text-xs text-[#003d7a] underline" onClick={() => applyDefaultSignature('sign2')}>Use default</button>
            </div>
            <div className="text-center pt-2">
              {quotation.sign2SignatureImage ? (
                <img src={quotation.sign2SignatureImage} alt="Signature" className="h-10 object-contain mx-auto mb-1" />
              ) : (
                <div className="h-10 border border-dashed border-gray-300 w-32 mx-auto mb-1 flex items-center justify-center text-xs text-gray-400">No Signature</div>
              )}
              <div className="border-t border-black w-48 mx-auto mb-2"></div>
              <input className="w-full bg-transparent border-none outline-none text-center font-bold text-sm text-[#003d7a] print:text-black" value={quotation.sign2Name} onChange={e => handleMetaChange('sign2Name', e.target.value)} placeholder="Technician Name" />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
         <Button onClick={onSave} className="bg-[#003d7a] hover:bg-[#002a5a] font-bold"><Save className="w-4 h-4 mr-2" /> Save Quote</Button>
         <Button onClick={() => setShowPreview(true)} className="border border-[#003d7a]/15 bg-white font-bold text-[#003d7a] hover:bg-blue-50"><Eye className="w-4 h-4 mr-2" /> Preview</Button>
         <Button onClick={exportCSV} className="bg-blue-500 hover:bg-blue-600 text-white font-black"><FileDown className="w-4 h-4 mr-2" /> Export CSV</Button>
         <Button onClick={exportPDF} className="bg-[#e8b400] hover:bg-[#d4a200] text-[#1a1a00] font-black"><Printer className="w-4 h-4 mr-2" /> Download PDF</Button>
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
      >
        <QuotationPreviewDocument quotation={quotation} />
      </PDFPreviewModal>
    </div>
  );
}
