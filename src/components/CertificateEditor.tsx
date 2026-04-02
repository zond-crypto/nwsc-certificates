import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react';
import { Certificate, Parameter, RegulatoryLimit, Signature } from '../types';
import { DEFAULT_PARAMS } from '../constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Printer, Download, Save, FileDown, ChevronLeft, ChevronRight, GripHorizontal, LayoutGrid, Eye } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NkanaLogo } from './Logo';
import { PDFPreviewModal, generateCertificatePreviewHTML } from './PDFPreviewModal';
import { buildDocumentFilename } from '../utils/fileNaming';

interface Props {
  certificate: Certificate;
  setCertificate: React.Dispatch<React.SetStateAction<Certificate>>;
  onSave: () => void;
  regLimits: RegulatoryLimit[];
  signatures: Signature[];
}

interface Props {
  certificate: Certificate;
  setCertificate: React.Dispatch<React.SetStateAction<Certificate>>;
  onSave: () => void;
  regLimits: RegulatoryLimit[];
  signatures: Signature[];
}

export function CertificateEditor({ certificate, setCertificate, onSave, regLimits, signatures }: Props) {
  const [rowToDelete, setRowToDelete] = useState<number | null>(null);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedSign1Id, setSelectedSign1Id] = useState(certificate.sign1SignatureId || '');
  const [selectedSign2Id, setSelectedSign2Id] = useState(certificate.sign2SignatureId || '');

  const printMeasureRef = useRef<HTMLDivElement>(null);
  const [printPages, setPrintPages] = useState<Array<Array<Parameter | { section: string }>>>([]);

  const PAGE_HEIGHT_LIMIT = 1120; // px for print page total usable height
  const PAGE_HEADER_HEIGHT = 220; // approximate rendered header size
  const PAGE_FOOTER_HEIGHT = 35;

  // ── Auto-apply Regulatory Limits ───────────────────────────────────────
  useEffect(() => {
    setSelectedSign1Id(certificate.sign1SignatureId || '');
    setSelectedSign2Id(certificate.sign2SignatureId || '');
  }, [certificate.sign1SignatureId, certificate.sign2SignatureId]);

  useEffect(() => {
    if (!regLimits || regLimits.length === 0) return;
    const type = certificate.sampleType;
    const relevantLimits = regLimits.filter(l => l.waterType === type);
    if (relevantLimits.length === 0) return;

    setCertificate(prev => {
      let changed = false;
      const newData = prev.tableData.map(row => {
        if (row.section) return row;
        // Match by name or partial name
        const matchingLimit = relevantLimits.find(rl =>
          rl.parameterName.toLowerCase() === row.name?.toLowerCase() ||
          row.name?.toLowerCase().includes(rl.parameterName.toLowerCase())
        );

        if (matchingLimit && matchingLimit.limitValue !== row.limit) {
          changed = true;
          return { ...row, limit: matchingLimit.limitValue, unit: matchingLimit.unit || row.unit };
        }
        return row;
      });
      if (!changed) return prev;
      return { ...prev, tableData: newData };
    });
  }, [certificate.sampleType, regLimits, setCertificate]);

  // ── Horizontal scroll / drag-to-scroll ─────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDraggingState, setIsDraggingState] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    const ro = new ResizeObserver(updateScrollButtons);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      ro.disconnect();
    };
  }, [updateScrollButtons, certificate.samples.length]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragScrollLeft.current = el.scrollLeft;
    setIsDraggingState(true);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const walk = (e.clientX - dragStartX.current) * 2;
    el.scrollLeft = dragScrollLeft.current - walk;
  }, []);

  const stopDrag = useCallback(() => {
    isDragging.current = false;
    setIsDraggingState(false);
  }, []);

  const scrollToDirection = useCallback((dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 200 : -200, behavior: 'smooth' });
  }, []);

  // ── Table Data Management ─────────────────────────────────────────────
  const updateRow = useCallback((rowIdx: number, field: keyof Parameter, value: string) => {
    setCertificate(prev => ({
      ...prev,
      tableData: prev.tableData.map((row, idx) =>
        idx === rowIdx ? { ...row, [field]: value } : row
      )
    }));
  }, [setCertificate]);

  const updateResult = useCallback((rowIdx: number, sampleIdx: number, value: string) => {
    setCertificate(prev => ({
      ...prev,
      tableData: prev.tableData.map((row, idx) =>
        idx === rowIdx ? {
          ...row,
          results: row.results.map((result, sIdx) =>
            sIdx === sampleIdx ? value : result
          )
        } : row
      )
    }));
  }, [setCertificate]);

  const addRow = useCallback(() => {
    setCertificate(prev => ({
      ...prev,
      tableData: [...prev.tableData, { ...DEFAULT_PARAMS[0], id: `param-${Date.now()}`, results: new Array(prev.samples.length).fill('') }]
    }));
  }, [setCertificate]);

  const confirmRemoveRow = useCallback((idx: number) => {
    setRowToDelete(idx);
  }, []);

  const cancelRemoveRow = useCallback(() => {
    setRowToDelete(null);
  }, []);

  const executeRemoveRow = useCallback(() => {
    if (rowToDelete !== null) {
      setCertificate(prev => ({
        ...prev,
        tableData: prev.tableData.filter((_, idx) => idx !== rowToDelete)
      }));
      setRowToDelete(null);
    }
  }, [rowToDelete, setCertificate]);

  const addCategory = useCallback((categoryName: string) => {
    setCertificate(prev => ({
      ...prev,
      tableData: [...prev.tableData, { id: `sec-${Date.now()}`, section: categoryName, results: [] }]
    }));
    setShowCategoryMenu(false);
  }, [setCertificate]);

  // ── Signature Management ──────────────────────────────────────────────
  const applySignature = useCallback((signType: 'sign1' | 'sign2', signatureId: string) => {
    const signature = signatures.find(s => s.id === signatureId);
    if (!signature) return;

    setCertificate(prev => ({
      ...prev,
      [`${signType}SignatureId`]: signatureId,
      [`${signType}Name`]: signature.fullName,
      [`${signType}Title`]: signature.role
    }));

    if (signType === 'sign1') setSelectedSign1Id(signatureId);
    else setSelectedSign2Id(signatureId);
  }, [signatures, setCertificate]);

  const applyDefaultSignature = useCallback((signType: 'sign1' | 'sign2') => {
    const defaultSig = signatures.find(s => s.isDefault);
    if (defaultSig) {
      applySignature(signType, defaultSig.id);
    }
  }, [signatures, applySignature]);

  const handleMetaChange = useCallback((field: string, value: string) => {
    setCertificate(prev => ({ ...prev, [field]: value }));
  }, [setCertificate]);

  // ── PDF Generation ────────────────────────────────────────────────────
  const downloadPDF = useCallback(() => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("NKANA WATER SUPPLY AND SANITATION COMPANY", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text("Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia.", pageWidth / 2, 30, { align: "center" });
    doc.setFontSize(10);
    doc.text("Tel: +260 212 222488 / 221099 / 0971 223 458  |  Fax: +260 212 222490", pageWidth / 2, 35, { align: "center" });
    doc.text("headoffice@nwsc.com.zm  |  www.nwsc.zm", pageWidth / 2, 40, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("WATER ANALYSIS CERTIFICATE", pageWidth / 2, 55, { align: "center" });
    doc.setFont("helvetica", "italic");
    doc.text("SHEQ DEPARTMENT", pageWidth / 2, 62, { align: "center" });
    doc.setFont("helvetica", "normal");

    // Certificate details
    doc.setFontSize(10);
    doc.text(`Certificate No: ${certificate.certNumber}`, 20, 75);
    doc.text(`Client: ${certificate.client}`, 20, 82);
    doc.text(`Date: ${certificate.dateReported}`, 20, 89);
    doc.text(`Sample Type: ${certificate.sampleType}`, 20, 96);
    doc.text(`Sample Source: ${certificate.location}`, 20, 103);

    // Table
    const tableData = certificate.tableData
      .filter(row => !row.section)
      .map(row => [
        row.name || '',
        row.unit || '',
        row.limit || '',
        ...row.results
      ]);

    autoTable(doc, {
      head: [['Parameter', 'Unit', 'Limit', ...certificate.samples]],
      body: tableData,
      startY: 110,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [26, 80, 153] },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Bigger, Better, Smarter", pageWidth / 2, pageHeight - 10, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 20, pageHeight - 10, { align: "right" });
    }

    doc.save(buildDocumentFilename('COA', certificate.client, 'pdf'));
    toast.success("PDF downloaded successfully!");
  }, [certificate]);

  const exportCSV = useCallback(() => {
    const headers = ['Parameter', 'Unit', 'Limit', ...certificate.samples];
    const rows = certificate.tableData
      .filter(row => !row.section)
      .map(row => [row.name || '', row.unit || '', row.limit || '', ...row.results]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildDocumentFilename('COA', certificate.client, 'csv');
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully!");
  }, [certificate]);

  // ── Print Layout Calculation ──────────────────────────────────────────
  useLayoutEffect(() => {
    if (!printMeasureRef.current) return;

    const container = printMeasureRef.current;
    const pages: Array<Array<Parameter | { section: string }>> = [];
    let currentPage: Array<Parameter | { section: string }> = [];
    let currentHeight = PAGE_HEADER_HEIGHT;

    certificate.tableData.forEach((row, idx) => {
      const rowHeight = row.section ? 25 : 20; // Section headers are taller

      if (currentHeight + rowHeight > PAGE_HEIGHT_LIMIT - PAGE_FOOTER_HEIGHT) {
        if (currentPage.length > 0) {
          pages.push(currentPage);
          currentPage = [];
          currentHeight = PAGE_HEADER_HEIGHT;
        }
      }

      currentPage.push(row);
      currentHeight += rowHeight;
    });

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    setPrintPages(pages);
  }, [certificate.tableData]);

  const limitHeader = certificate.sampleType === 'Drinking Water' ? 'WHO Limit' :
                      certificate.sampleType === 'Wastewater' ? 'ZABS Limit' : 'Limit';

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 print:shadow-none print:border-none">
      <style>{`
        .page { page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        .break-words, .page td { word-wrap: break-word; overflow-wrap: anywhere; white-space: normal; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
      `}</style>

      {/* Header */}
      <div className="bg-gradient-to-br from-[#002050] via-[#003d7a] to-[#004a94] text-white border-b-[3px] border-[#e8b400] print:border-b-2 print:bg-white print:text-black">
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch">
          {/* Logo block */}
          <div className="pt-5 pb-3 sm:py-5 px-5 flex items-center justify-center shrink-0">
            <div className="bg-white rounded-2xl p-2.5 shadow-md print:shadow-none print:rounded-none print:p-0">
              <NkanaLogo className="w-20 h-20 sm:w-[88px] sm:h-[88px] object-contain print:w-16 print:h-16" />
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
                WATER ANALYSIS CERTIFICATE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Certificate Details */}
      <div className="p-4 bg-gray-50 border-b border-gray-200 print:bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#003d7a] mb-1">Certificate No</label>
            <Input
              value={certificate.certNumber}
              onChange={e => handleMetaChange('certNumber', e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#003d7a] mb-1">Client</label>
            <Input
              value={certificate.client}
              onChange={e => handleMetaChange('client', e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#003d7a] mb-1">Date</label>
            <Input
              type="date"
              value={certificate.dateReported}
              onChange={e => handleMetaChange('dateReported', e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#003d7a] mb-1">Sample Type</label>
            <Select value={certificate.sampleType} onValueChange={value => handleMetaChange('sampleType', value)}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Drinking Water">Drinking Water</SelectItem>
                <SelectItem value="Wastewater">Wastewater</SelectItem>
                <SelectItem value="Process Water">Process Water</SelectItem>
                <SelectItem value="Borehole Water">Borehole Water</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-[#003d7a] mb-1">Sample Source</label>
            <Input
              value={certificate.location}
              onChange={e => handleMetaChange('location', e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-[#003d7a] mb-1">Samples</label>
            <Input
              value={certificate.samples.join(', ')}
              onChange={e => handleMetaChange('samples', e.target.value.split(',').map(s => s.trim()))}
              placeholder="Sample 1, Sample 2, Sample 3"
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="relative">
        {/* Scroll controls */}
        <div className="flex items-center justify-between p-2 bg-gray-100 border-b border-gray-200 print:hidden">
          <div className="flex items-center gap-2">
            <Button onClick={addRow} size="sm" className="h-7 px-2 text-xs">
              <Plus className="w-3 h-3 mr-1" /> Add Parameter
            </Button>
            <div className="relative">
              <Button onClick={() => setShowCategoryMenu(!showCategoryMenu)} size="sm" variant="outline" className="h-7 px-2 text-xs">
                <LayoutGrid className="w-3 h-3 mr-1" /> Add Section
              </Button>
              {showCategoryMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-48">
                  <div className="p-2">
                    <button onClick={() => addCategory('Physical Parameters')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Physical Parameters</button>
                    <button onClick={() => addCategory('Chemical Parameters')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Chemical Parameters</button>
                    <button onClick={() => addCategory('Microbiological Parameters')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Microbiological Parameters</button>
                    <button onClick={() => addCategory('Heavy Metals')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Heavy Metals</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              onClick={() => scrollToDirection('left')}
              disabled={!canScrollLeft}
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <Button
              onClick={() => scrollToDirection('right')}
              disabled={!canScrollRight}
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="w-3 h-3" />
            </Button>
            <Button onClick={exportCSV} size="sm" variant="outline" className="h-7 px-2 text-xs">
              <Download className="w-3 h-3 mr-1" /> CSV
            </Button>
          </div>
        </div>

        {/* Drag-to-scroll table wrapper */}
        <div
          ref={scrollRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          className={`overflow-x-auto print:overflow-visible transition-all duration-200 ${
            isDraggingState ? 'cursor-grabbing scale-[0.998]' : (canScrollRight || canScrollLeft) ? 'cursor-grab' : ''
          }`}
        >
          {/* Table remains the same internal structure */}
          <table className="w-full min-w-max border-collapse text-xs print:text-[9px]">
            <thead>
              <tr>
                <th className="sticky print:static left-0 z-20 print:z-auto bg-[#1a5099] text-white p-2 text-left text-[10px] print:text-[8px] font-bold tracking-wider uppercase border-b border-r border-white/20 print:bg-gray-100 print:text-black print:border-gray-300 w-8 print:w-auto print:p-1">#</th>
                <th className="sticky print:static left-8 z-20 print:z-auto bg-[#1a5099] text-white p-2 text-left text-[10px] print:text-[8px] font-bold tracking-wider uppercase border-b border-r border-white/20 print:bg-gray-100 print:text-black print:border-gray-300 w-[150px] print:w-auto print:p-1">Parameter</th>
                <th className="sticky print:static left-[182px] z-20 print:z-auto bg-[#1a5099] text-white p-2 text-left text-[10px] print:text-[8px] font-bold tracking-wider uppercase border-b border-r border-white/20 print:bg-gray-100 print:text-black print:border-gray-300 w-16 print:w-auto print:p-1">Unit</th>
                <th className="sticky print:static left-[246px] z-20 print:z-auto bg-[#1a5099] text-white p-2 text-left text-[10px] print:text-[8px] font-bold tracking-wider uppercase border-b border-r border-white/20 print:bg-gray-100 print:text-black print:border-gray-300 w-24 print:w-auto print:p-1 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] print:shadow-none">{limitHeader}</th>

                {certificate.samples.map((sample, idx) => (
                  <th key={idx} className="bg-[#1a5099] text-white p-1.5 text-center text-[10px] print:text-[8px] font-bold tracking-wider uppercase border-b border-r border-white/20 print:bg-gray-100 print:text-black print:border-gray-300 w-24 print:w-auto print:p-1">
                    {sample}
                  </th>
                ))}
                <th className="bg-[#1a5099] text-white p-2 w-8 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let currentParamNum = 0;
                return certificate.tableData.map((row, i) => {
                  const isSection = !!row.section;
                  if (isSection) {
                    return (
                      <tr key={row.id || i} className="section-header bg-[#003d7a] text-white text-[10px] print:text-[9px] font-bold tracking-widest uppercase print:bg-gray-200 print:text-black">
                        <td colSpan={5 + certificate.samples.length} className="p-1.5 px-2 sticky print:static left-0 z-10 print:z-auto bg-[#003d7a] print:bg-gray-200">{row.section}</td>
                      </tr>
                    );
                  }

                  const rowNum = ++currentParamNum;

                  return (
                    <ParameterRow
                      key={row.id || i}
                      row={row}
                      idx={i}
                      rowNum={rowNum}
                      sampleCount={certificate.samples.length}
                      updateRow={updateRow}
                      updateResult={updateResult}
                      confirmRemoveRow={confirmRemoveRow}
                    />
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {/* Drag hint pill */}
        {(canScrollLeft || canScrollRight) && (
          <div className="flex justify-center mt-2 mb-1 print:hidden">
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 border border-gray-200 rounded-full text-[10px] text-gray-500 animate-in fade-in slide-in-from-bottom-1 underline-offset-2">
              <GripHorizontal className="w-3 h-3 text-[#003d7a]/60" />
              <span>Drag table to scroll</span>
            </div>
          </div>
        )}
      </div>

      {/* Key */}
      <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-4 items-center text-[11px]">
        <strong className="text-[#003d7a]">KEY:</strong>
        <div className="flex gap-1.5"><span className="font-bold text-[#003d7a] font-mono">TDS</span><span className="text-gray-500">Total Dissolved Solids</span></div>
        <div className="flex gap-1.5"><span className="font-bold text-[#003d7a] font-mono">TSS</span><span className="text-gray-500">Total Suspended Solids</span></div>
        <div className="flex gap-1.5"><span className="font-bold text-[#003d7a] font-mono">EC</span><span className="text-gray-500">Electrical Conductivity</span></div>
        <div className="flex gap-1.5"><span className="font-bold text-[#003d7a] font-mono">T/Coli</span><span className="text-gray-500">Total Coliforms</span></div>
        <div className="flex gap-1.5"><span className="font-bold text-[#003d7a] font-mono">F/Coli</span><span className="text-gray-500">Faecal Coliforms</span></div>
        <div className="flex gap-1.5"><span className="font-bold text-[#003d7a] font-mono">T.N.T.C</span><span className="text-gray-500">Too Numerous To Count</span></div>
        <div className="flex gap-1.5"><span className="font-bold text-[#003d7a] font-mono">NTU</span><span className="text-gray-500">Nephelometric Turbidity Units</span></div>
        <div className="flex gap-1.5"><span className="font-bold text-[#003d7a] font-mono">CFU</span><span className="text-gray-500">Colony Forming Units</span></div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-4 border-t-2 border-[#003d7a] print:border-t-2 bg-[#f5faff]">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#003d7a]">Signatory 1 (Authorized By)</label>
          <select value={selectedSign1Id} onChange={e => applySignature('sign1', e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
            <option value="">(Choose saved signature)</option>
            {signatures.map(sig => <option key={sig.id} value={sig.id}>{sig.fullName} • {sig.role}{sig.isDefault ? ' (default)' : ''}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <button className="text-xs text-[#003d7a] underline" onClick={() => applyDefaultSignature('sign1')}>Use default</button>
            <span className="text-xs text-gray-500">or edit below</span>
          </div>
          <div className="text-center">
            <div className="border-t border-black w-48 mx-auto mt-2 mb-2"></div>
            <input className="w-full bg-transparent border-none outline-none text-center font-bold text-sm text-[#003d7a] print:text-black" value={certificate.sign1Name} onChange={e => handleMetaChange('sign1Name', e.target.value)} placeholder="Name" />
            <input className="w-full bg-transparent border-none outline-none text-center text-xs text-gray-500 print:text-black mt-1" value={certificate.sign1Title} onChange={e => handleMetaChange('sign1Title', e.target.value)} placeholder="Title" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#003d7a]">Signatory 2 (Verification)</label>
          <select value={selectedSign2Id} onChange={e => applySignature('sign2', e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
            <option value="">(Choose saved signature)</option>
            {signatures.map(sig => <option key={sig.id} value={sig.id}>{sig.fullName} • {sig.role}{sig.isDefault ? ' (default)' : ''}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <button className="text-xs text-[#003d7a] underline" onClick={() => applyDefaultSignature('sign2')}>Use default</button>
            <span className="text-xs text-gray-500">or edit below</span>
          </div>
          <div className="text-center">
            <div className="border-t border-black w-48 mx-auto mt-2 mb-2"></div>
            <input className="w-full bg-transparent border-none outline-none text-center font-bold text-sm text-[#003d7a] print:text-black" value={certificate.sign2Name} onChange={e => handleMetaChange('sign2Name', e.target.value)} placeholder="Name" />
            <input className="w-full bg-transparent border-none outline-none text-center text-xs text-gray-500 print:text-black mt-1" value={certificate.sign2Title} onChange={e => handleMetaChange('sign2Title', e.target.value)} placeholder="Title" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-[#003d7a] text-white text-center p-2 text-[10px] tracking-widest font-semibold italic opacity-90 print:bg-white print:text-black print:border-t">
        Bigger, Better, Smarter
      </div>

      {/* Floating Actions */}
      <div className="fixed bottom-4 right-3 sm:bottom-6 sm:right-6 flex flex-wrap justify-end gap-1.5 sm:gap-2 print:hidden z-50 max-w-[calc(100vw-1.5rem)]">
        <Button onClick={onSave} size="sm" className="shadow-lg bg-[#003d7a] hover:bg-[#004d99] h-8 px-3 text-xs">
          <Save className="w-3.5 h-3.5 mr-1" /> Save
        </Button>
        <Button onClick={() => window.print()} size="sm" variant="secondary" className="shadow-lg bg-gray-200 text-black hover:bg-gray-300 h-8 px-3 text-xs">
          <Printer className="w-3.5 h-3.5 mr-1" /> Print
        </Button>
        <Button onClick={() => setShowPreview(true)} size="sm" variant="secondary" className="shadow-lg bg-purple-200 text-purple-900 hover:bg-purple-300 h-8 px-3 text-xs font-semibold">
          <Eye className="w-3.5 h-3.5 mr-1" /> Preview
        </Button>
        <Button onClick={downloadPDF} size="sm" variant="secondary" className="shadow-lg bg-[#e8b400] text-black hover:bg-[#d4a200] h-8 px-3 text-xs font-semibold">
          <FileDown className="w-3.5 h-3.5 mr-1" /> PDF
        </Button>
        <Button onClick={exportCSV} size="sm" className="shadow-lg bg-[#0072ce] hover:bg-[#0061b0] h-8 px-3 text-xs">
          <Download className="w-3.5 h-3.5 mr-1" /> CSV
        </Button>
      </div>

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        onDownload={() => {
          setShowPreview(false);
          downloadPDF();
        }}
        title={certificate.certNumber}
        pdfContent={generateCertificatePreviewHTML(certificate)}
      />

      {/* Delete Confirmation Modal */}
      {rowToDelete !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Parameter</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete this parameter? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={cancelRemoveRow}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={executeRemoveRow}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ParameterRow = memo(({ row, idx, rowNum, sampleCount, updateRow, updateResult, confirmRemoveRow }: {
  row: Parameter;
  idx: number;
  rowNum: number;
  sampleCount: number;
  updateRow: (rowIdx: number, field: keyof Parameter, value: string) => void;
  updateResult: (rowIdx: number, sampleIdx: number, value: string) => void;
  confirmRemoveRow: (idx: number) => void;
}) => {
  return (
    <tr className="hover:bg-gray-50 print:bg-white">
      <td className="sticky print:static left-0 z-10 print:z-auto bg-white print:bg-transparent p-1.5 text-center text-[10px] print:text-[8px] font-bold text-[#003d7a] border-b border-r border-gray-200 print:border-gray-300">
        {rowNum}
      </td>
      <td className="sticky print:static left-8 z-10 print:z-auto bg-white print:bg-transparent p-1.5 border-b border-r border-gray-200 print:border-gray-300">
        <Input
          value={row.name || ''}
          onChange={e => updateRow(idx, 'name', e.target.value)}
          className="text-[10px] print:text-[8px] h-6 px-1 border-none bg-transparent focus:bg-white focus:ring-1 focus:ring-[#003d7a]/20"
          placeholder="Parameter name"
        />
      </td>
      <td className="sticky print:static left-[182px] z-10 print:z-auto bg-white print:bg-transparent p-1.5 border-b border-r border-gray-200 print:border-gray-300">
        <Input
          value={row.unit || ''}
          onChange={e => updateRow(idx, 'unit', e.target.value)}
          className="text-[10px] print:text-[8px] h-6 px-1 border-none bg-transparent focus:bg-white focus:ring-1 focus:ring-[#003d7a]/20"
          placeholder="Unit"
        />
      </td>
      <td className="sticky print:static left-[246px] z-10 print:z-auto bg-white print:bg-transparent p-1.5 border-b border-r border-gray-200 print:border-gray-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] print:shadow-none">
        <Input
          value={row.limit || ''}
          onChange={e => updateRow(idx, 'limit', e.target.value)}
          className="text-[10px] print:text-[8px] h-6 px-1 border-none bg-transparent focus:bg-white focus:ring-1 focus:ring-[#003d7a]/20"
          placeholder="Limit"
        />
      </td>

      {Array.from({ length: sampleCount }, (_, sampleIdx) => (
        <ResultCell
          key={sampleIdx}
          value={row.results[sampleIdx] || ''}
          onChange={value => updateResult(idx, sampleIdx, value)}
        />
      ))}

      <td className="p-1.5 border-b border-gray-200 print:hidden">
        <Button
          onClick={() => confirmRemoveRow(idx)}
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
        >
          <X className="w-3 h-3" />
        </Button>
      </td>
    </tr>
  );
});

const ResultCell = memo(({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  return (
    <td className="p-1.5 border-b border-r border-gray-200 print:border-gray-300">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-[10px] print:text-[8px] h-6 px-1 border-none bg-transparent focus:bg-white focus:ring-1 focus:ring-[#003d7a]/20"
        placeholder="Result"
      />
    </td>
  );
});

ParameterRow.displayName = 'ParameterRow';
ResultCell.displayName = 'ResultCell';
