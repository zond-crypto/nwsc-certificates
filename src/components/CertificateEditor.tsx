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
import { generateCOAPdf, exportCOACSV } from '../utils/pdfGenerators';

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
  const [newSampleName, setNewSampleName] = useState('');
  const [selectedSign1Id, setSelectedSign1Id] = useState(certificate.sign1SignatureId || '');
  const [selectedSign2Id, setSelectedSign2Id] = useState(certificate.sign2SignatureId || '');

  const printMeasureRef = useRef<HTMLDivElement>(null);
  const [printPages, setPrintPages] = useState<Array<Array<{ row: Parameter | { section: string }; idx: number }>>>([]);
  const [oversizedRowIndexes, setOversizedRowIndexes] = useState<number[]>([]);

  const PAGE_HEIGHT_LIMIT = 1120; // px for print page total usable height
  const PAGE_HEADER_HEIGHT_FIRST = 240; // includes certificate metadata + header on first page
  const PAGE_HEADER_HEIGHT_CONTINUATION = 120; // header + repeated table title on continuation pages
  const PAGE_FOOTER_HEIGHT = 45;

  const SAFE_HEIGHT_FIRST = PAGE_HEIGHT_LIMIT - PAGE_HEADER_HEIGHT_FIRST - PAGE_FOOTER_HEIGHT;
  const SAFE_HEIGHT_CONTINUATION = PAGE_HEIGHT_LIMIT - PAGE_HEADER_HEIGHT_CONTINUATION - PAGE_FOOTER_HEIGHT;

  // ── Auto-apply Regulatory Limits ───────────────────────────────────────
  useEffect(() => {
    setSelectedSign1Id(certificate.sign1SignatureId || '');
    setSelectedSign2Id(certificate.sign2SignatureId || '');
  }, [certificate.sign1SignatureId, certificate.sign2SignatureId]);

  useEffect(() => {
    if (!regLimits || regLimits.length === 0) return;
    const type = certificate.sampleType.toLowerCase();
    const relevantLimits = regLimits.filter(l => {
      if (type.includes('waste') || type.includes('effluent')) return l.regulatoryBody === 'ZEMA';
      return l.regulatoryBody === 'ZABS';
    });
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
      tableData: [
        ...prev.tableData,
        { 
          id: `param-${Date.now()}`, 
          name: '', 
          unit: '', 
          limit: '', 
          results: new Array(prev.samples.length).fill('') 
        }
      ]
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
      tableData: [
        ...prev.tableData, 
        { id: `sec-${Date.now()}`, section: categoryName, results: [] }
      ]
    }));
    setShowCategoryMenu(false);
  }, [setCertificate]);

  const addSample = useCallback(() => {
    const sample = newSampleName.trim();
    if (!sample) return;

    setCertificate(prev => ({
      ...prev,
      samples: [...prev.samples, sample],
      tableData: prev.tableData.map(row => row.section ? row : { ...row, results: [...row.results, ''] })
    }));
    setNewSampleName('');
  }, [newSampleName, setCertificate]);

  const removeSample = useCallback((index: number) => {
    setCertificate(prev => {
      const nextSamples = prev.samples.filter((_, idx) => idx !== index);
      return {
        ...prev,
        samples: nextSamples,
        tableData: prev.tableData.map(row => row.section ? row : { ...row, results: row.results.filter((_, idx) => idx !== index) })
      };
    });
  }, [setCertificate]);

  // ── Signature Management ──────────────────────────────────────────────
  const applySignature = useCallback((signType: 'sign1' | 'sign2', signatureId: string) => {
    const signature = signatures.find(s => s.id === signatureId);
    if (!signature) return;

    setCertificate(prev => ({
      ...prev,
      [`${signType}SignatureId`]: signatureId,
      [`${signType}SignatureImage`]: signature.imageDataUrl,
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
  const downloadPDF = useCallback(async () => {
    try {
      await generateCOAPdf(certificate);
      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('PDF generation failed', error);
      toast.error('Failed to generate PDF');
    }
  }, [certificate]);

  const exportCSV = useCallback(() => {
    try {
      exportCOACSV(certificate);
      toast.success("CSV exported successfully!");
    } catch (error) {
      console.error('CSV export failed', error);
      toast.error('Failed to export CSV');
    }
  }, [certificate]);

  // ── Print Layout Calculation ──────────────────────────────────────────
  useLayoutEffect(() => {
    if (!printMeasureRef.current) return;

    const rowHeights: number[] = [];
    const hugeRows: number[] = [];

    const measureRows = printMeasureRef.current.querySelectorAll<HTMLTableRowElement>('tr[data-print-row-index]');
    measureRows.forEach(rowEl => {
      const idx = Number(rowEl.dataset.printRowIndex);
      const height = Math.ceil(rowEl.getBoundingClientRect().height);
      rowHeights[idx] = height;
    });

    const pages: Array<Array<{ row: Parameter | { section: string }; idx: number }>> = [];
    let currentPage: Array<{ row: Parameter | { section: string }; idx: number }> = [];
    let currentHeight = 0;
    let availableHeight = SAFE_HEIGHT_FIRST;
    let isFirstPage = true;

    certificate.tableData.forEach((row, idx) => {
      const rawHeight = rowHeights[idx] || (row.section ? 26 : 22);
      const rowHeight = rawHeight + 2; // small gap/border cushion
      const cap = isFirstPage ? SAFE_HEIGHT_FIRST : SAFE_HEIGHT_CONTINUATION;

      if (rowHeight > cap) {
        hugeRows.push(idx);
      }

      if (currentHeight + rowHeight > availableHeight && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
        isFirstPage = false;
        availableHeight = SAFE_HEIGHT_CONTINUATION;
      }

      if (rowHeight > availableHeight && currentPage.length === 0) {
        // This row cannot fit with normal formatting; put it on its own page.
        pages.push([{ row, idx }]);
        isFirstPage = false;
        availableHeight = SAFE_HEIGHT_CONTINUATION;
        currentHeight = 0;
        return;
      }

      if (currentHeight + rowHeight > availableHeight) {
        // Start a new page if it still doesn't fit.
        pages.push(currentPage);
        currentPage = [{ row, idx }];
        currentHeight = rowHeight;
        isFirstPage = false;
        availableHeight = SAFE_HEIGHT_CONTINUATION;
      } else {
        currentPage.push({ row, idx });
        currentHeight += rowHeight;
      }

      if (!isFirstPage && currentPage.length === 1 && currentHeight === rowHeight) {
        // no-op, just mark that subsequent pages used
      }

      if (isFirstPage && currentHeight >= availableHeight) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
        isFirstPage = false;
        availableHeight = SAFE_HEIGHT_CONTINUATION;
      }
    });

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    setOversizedRowIndexes(hugeRows);
    setPrintPages(pages);
  }, [certificate.tableData, certificate.samples, certificate.sampleType]);

  const limitHeader = certificate.sampleType === 'Drinking Water' ? 'WHO Limit' :
                      certificate.sampleType === 'Wastewater' ? 'ZABS Limit' : 'Limit';

  // Debug overlay for development mode
  const isDev = true; // TODO: Replace with proper dev mode check

  return (
    <div className="relative">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 print:hidden">
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
            <label className="block text-xs font-bold text-[#003d7a] mb-2">Samples</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {certificate.samples.map((sample, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#e8f1ff] text-xs font-semibold text-[#003d7a]">
                  {sample}
                  <button onClick={() => removeSample(idx)} className="text-[#003d7a] hover:text-red-500" aria-label={`Remove sample ${sample}`}>
                    ×
                  </button>
                </span>
              ))}
              {certificate.samples.length === 0 && <span className="text-xs text-gray-500">No samples yet.</span>}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSampleName}
                onChange={e => setNewSampleName(e.target.value)}
                placeholder="Add sample name"
                className="text-sm"
              />
              <Button onClick={addSample} size="sm" className="h-8 px-2 text-xs">Add</Button>
            </div>
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
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-48">
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

    {/* Debug overlay for development mode - shows page breaks visually */}
    {isDev && printPages.length > 0 && (
      <div className="fixed inset-0 pointer-events-none z-40 print:hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-black/5 flex flex-col">
          {printPages.map((page, pageIndex) => {
            const pageHeight = pageIndex === 0 ? SAFE_HEIGHT_FIRST : SAFE_HEIGHT_CONTINUATION;
            const topOffset = pageIndex === 0 ? PAGE_HEADER_HEIGHT_FIRST : PAGE_HEADER_HEIGHT_CONTINUATION;
            const totalHeight = topOffset + pageHeight;

            return (
              <div
                key={`debug-page-${pageIndex}`}
                className="relative border-2 border-dashed border-red-500 bg-red-500/10"
                style={{
                  height: `${totalHeight}px`,
                  marginBottom: pageIndex < printPages.length - 1 ? '20px' : '0',
                }}
              >
                <div className="absolute -top-6 left-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">
                  Page {pageIndex + 1} of {printPages.length}
                </div>
                <div className="absolute -bottom-6 left-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">
                  Break after {page.length} rows
                </div>
                {page.some(({ idx }) => oversizedRowIndexes.includes(idx)) && (
                  <div className="absolute top-2 right-2 bg-orange-500 text-white px-2 py-1 rounded text-xs font-bold">
                    ⚠️ Oversized row(s)
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="absolute top-4 right-4 bg-black/80 text-white px-3 py-2 rounded-lg text-sm font-mono">
          <div>Pages: {printPages.length}</div>
          <div>Total rows: {certificate.tableData.length}</div>
          <div>Oversized: {oversizedRowIndexes.length}</div>
        </div>
      </div>
    )}

    {/* Print-only paginated Certificate view */}
    <div className="hidden print:block">
      <div
        ref={printMeasureRef}
        style={{
          position: 'absolute',
          top: 0,
          left: '-10000px',
          width: '210mm',
          visibility: 'hidden',
          pointerEvents: 'none',
          zIndex: -1,
        }}
        aria-hidden="true"
      >
        <table className="w-full border-collapse text-[9px]">
          <tbody>
            {certificate.tableData.map((row, idx) => (
              row.section ? (
                <tr key={`measure-section-${idx}`} data-print-row-index={idx}>
                  <td style={{ padding: '6px', fontWeight: 700 }} colSpan={3 + certificate.samples.length}>{row.section}</td>
                </tr>
              ) : (
                <tr key={`measure-row-${idx}`} data-print-row-index={idx}>
                  <td style={{ padding: '6px' }}>{row.name || ' '}</td>
                  <td style={{ padding: '6px' }}>{row.unit || ' '}</td>
                  <td style={{ padding: '6px' }}>{row.limit || ' '}</td>
                  {certificate.samples.map((s, ci) => (
                    <td key={ci} style={{ padding: '6px' }}>{row.results[ci] || ' '}</td>
                  ))}
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      {printPages.map((page, pageIndex) => (
        <div key={`coa-page-${pageIndex}`} className="coa-page page m-0 p-0" style={{ pageBreakAfter: 'always' }}>
          <div className="border-b border-gray-300 p-3">
            <div className="mb-2 text-xs leading-tight uppercase font-black">NKANA WATER SUPPLY AND SANITATION COMPANY</div>
            <div className="mb-1 text-[9px]">Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia.</div>
            <div className="mb-3 text-[9px]">Tel: +260 212 222488 / 221099 / 0971 223 458 | Fax: +260 212 222490</div>
            <div className="grid grid-cols-2 gap-2 text-[9px] mb-3">
              <div><strong>Certificate No:</strong> {certificate.certNumber}</div>
              <div><strong>Date:</strong> {certificate.dateReported}</div>
              <div><strong>Client:</strong> {certificate.client}</div>
              <div><strong>Sample Type:</strong> {certificate.sampleType}</div>
              <div className="col-span-2"><strong>Sample Source:</strong> {certificate.location}</div>
            </div>
          </div>

          <table className="w-full border-collapse text-[9px]">
            <thead>
              <tr className="bg-[#003d7a] text-white">
                <th className="border border-gray-300 p-2 text-left">#</th>
                <th className="border border-gray-300 p-2 text-left">Parameter</th>
                <th className="border border-gray-300 p-2 text-center">Unit</th>
                <th className="border border-gray-300 p-2 text-center">{limitHeader}</th>
                {certificate.samples.map((sample, idx) => (
                  <th key={idx} className="border border-gray-300 p-2 text-center">{sample}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.map(({ row, idx }, rowIndex) => {
                if ('section' in row) {
                  return (
                    <tr key={`section-${idx}`} className="bg-gray-200 font-bold uppercase text-[8px]">
                      <td colSpan={4 + certificate.samples.length} className="border border-gray-300 p-2">{row.section}</td>
                    </tr>
                  );
                }

                const isOversized = oversizedRowIndexes.includes(idx);
                return (
                  <tr key={`row-${idx}`} className={isOversized ? 'text-[7px]' : 'text-[8px]'}>
                    <td className="border border-gray-300 p-2 text-center">{rowIndex + 1}</td>
                    <td className="border border-gray-300 p-2 break-words">{row.name}</td>
                    <td className="border border-gray-300 p-2 text-center">{row.unit}</td>
                    <td className="border border-gray-300 p-2 text-center">{row.limit}</td>
                    {certificate.samples.map((s, sampleIdx) => (
                      <td key={sampleIdx} className="border border-gray-300 p-2 text-center break-words">{row.results[sampleIdx] || '—'}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="border-t border-gray-400 p-2 text-[9px] mt-2">
            <div className="flex justify-between">
              <span><strong>Bigger, Better, Smarter</strong></span>
              <span>Page {pageIndex + 1} of {printPages.length}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
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
