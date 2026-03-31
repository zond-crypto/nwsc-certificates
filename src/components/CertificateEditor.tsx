import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react';
import { Certificate, Parameter, RegulatoryLimit } from '../types';
import { DEFAULT_PARAMS } from '../constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Printer, Download, Save, FileDown, ChevronLeft, ChevronRight, GripHorizontal, LayoutGrid, Eye } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NkanaLogo } from './Logo';
import { buildDocumentFilename } from '../utils/fileNaming';
import { PDFPreviewModal, generateCertificatePreviewHTML } from './PDFPreviewModal';

interface Props {
  certificate: Certificate;
  setCertificate: React.Dispatch<React.SetStateAction<Certificate>>;
  onSave: () => void;
  regLimits: RegulatoryLimit[];
}

export function CertificateEditor({ certificate, setCertificate, onSave, regLimits }: Props) {
  const [rowToDelete, setRowToDelete] = useState<number | null>(null);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const printMeasureRef = useRef<HTMLDivElement>(null);
  const [printPages, setPrintPages] = useState<Array<Array<Parameter | { section: string }>>>([]);

  const PAGE_HEIGHT_LIMIT = 1120; // px for print page total usable height
  const PAGE_HEADER_HEIGHT = 220; // approximate rendered header size
  const PAGE_FOOTER_HEIGHT = 35;

  // ── Auto-apply Regulatory Limits ───────────────────────────────────────
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
    // Only drag on the table area itself, not on inputs/buttons
    if ((e.target as HTMLElement).closest('input, button, select, a')) return;
    isDragging.current = true;
    dragStartX.current = e.pageX - el.offsetLeft;
    dragScrollLeft.current = el.scrollLeft;
    setIsDraggingState(true);
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !scrollRef.current) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - dragStartX.current) * 1.5;
    scrollRef.current.scrollLeft = dragScrollLeft.current - walk;
  }, []);

  const stopDrag = useCallback(() => {
    isDragging.current = false;
    setIsDraggingState(false);
  }, []);

  const scrollBy = useCallback((dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 200 : -200, behavior: 'smooth' });
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  const handleMetaChange = useCallback((field: keyof Certificate, value: string) => {
    setCertificate(prev => ({ ...prev, [field]: value }));
  }, [setCertificate]);

  const addSample = () => {
    setCertificate(prev => {
      const newSample = `Sample ${prev.samples.length + 1}`;
      return {
        ...prev,
        samples: [...prev.samples, newSample],
        tableData: prev.tableData.map(row => ({
          ...row,
          // Always rebuild results to match new sample count, padding if necessary
          results: row.section
            ? []
            : [
                ...Array.from({ length: prev.samples.length }, (_, i) =>
                  row.results[i] ?? ""
                ),
                ""
              ]
        }))
      };
    });
  };

  const updateSampleName = useCallback((idx: number, value: string) => {
    setCertificate(prev => {
      const newSamples = [...prev.samples];
      newSamples[idx] = value;
      return { ...prev, samples: newSamples };
    });
  }, [setCertificate]);

  const removeSample = (idx: number) => {
    if (certificate.samples.length <= 1) return;
    setCertificate(prev => {
      const newSamples = prev.samples.filter((_, i) => i !== idx).map((s, i) => `Sample ${i + 1}`);
      return {
        ...prev,
        samples: newSamples,
        tableData: prev.tableData.map(row => {
          if (row.section) return { ...row, results: [] };
          return { ...row, results: row.results.filter((_, i) => i !== idx) };
        })
      };
    });
  };

  const getLimitHeader = () => 'Limit';

  const updateResult = useCallback((rowIdx: number, sampleIdx: number, value: string) => {
    setCertificate(prev => {
      const newData = prev.tableData.map((row, i) => {
        if (i !== rowIdx) return row;
        const newResults = [...row.results];
        newResults[sampleIdx] = value;
        return { ...row, results: newResults };
      });
      return { ...prev, tableData: newData };
    });
  }, [setCertificate]);

  const updateRow = useCallback((rowIdx: number, field: keyof Parameter, value: string) => {
    setCertificate(prev => {
      const newData = prev.tableData.map((row, i) => {
        if (i !== rowIdx) return row;
        const updated = { ...row, [field]: value };
        if (field === 'limit') {
          const limit = value;
          if (limit.includes("–")) {
            const parts = limit.split("–").map(s => s.trim());
            updated.numeric_limit_low = parseFloat(parts[0]);
            updated.numeric_limit_high = parseFloat(parts[1]);
          } else if (limit.startsWith("≤")) {
            updated.numeric_limit_high = parseFloat(limit.substring(1));
            updated.numeric_limit_low = undefined;
          } else if (limit.startsWith("<")) {
            updated.numeric_limit_high = parseFloat(limit.substring(1));
            updated.numeric_limit_low = undefined;
          } else {
            updated.numeric_limit_high = parseFloat(limit);
            updated.numeric_limit_low = undefined;
          }
        }
        return updated;
      });
      return { ...prev, tableData: newData };
    });
  }, [setCertificate]);

  const addParameterInCategory = (categoryName: string) => {
    setCertificate(prev => {
      const newData = [...prev.tableData];
      let sectionIdx = newData.findIndex(r => r.section === categoryName);
      // If category doesn't exist, append it
      if (sectionIdx === -1) {
        newData.push({ id: `sec-${Date.now()}`, section: categoryName, results: [] });
        sectionIdx = newData.length - 1;
      }
      
      // Find end of section
      let insertIdx = sectionIdx + 1;
      for (let i = sectionIdx + 1; i < newData.length; i++) {
        if (newData[i].section) break;
        insertIdx = i + 1;
      }

      newData.splice(insertIdx, 0, {
        id: `p${Date.now()}`,
        name: "New Parameter",
        unit: "mg/L",
        limit: "",
        results: prev.samples.map(() => "")
      });
      return { ...prev, tableData: newData };
    });
    setShowCategoryMenu(false);
  };


  const confirmRemoveRow = useCallback((idx: number) => {
    setRowToDelete(idx);
  }, []);

  const executeRemoveRow = useCallback(() => {
    if (rowToDelete === null) return;
    setCertificate(prev => {
      const newData = prev.tableData.filter((_, i) => i !== rowToDelete);
      return { ...prev, tableData: newData };
    });
    setRowToDelete(null);
  }, [rowToDelete, setCertificate]);

  const cancelRemoveRow = useCallback(() => {
    setRowToDelete(null);
  }, []);

  const computeStatus = useCallback((row: Parameter, result: string) => {
    if (!result || result.trim() === "" || result === "—") return "NA";
    const val = result.trim().toUpperCase();
    if (val === "ABSENT" || val === "ND" || val === "NIL") {
      return "PASS";
    }
    if (val === "PRESENT" || val === "T.N.T.C" || val === "TNTC") return "FAIL";
    const num = parseFloat(result);
    if (isNaN(num)) return "NA";
    if (row.numeric_limit_low !== undefined && num < row.numeric_limit_low) return "FAIL";
    if (row.numeric_limit_high !== undefined && num > row.numeric_limit_high) return "FAIL";
    return "PASS";
  }, []);

  const limitHeader = React.useMemo(() => {
    const type = certificate.sampleType.toLowerCase();
    if (type.includes('effluent') || type.includes('waste')) {
      return 'ZEMA LIMITS';
    }
    if (type.includes('borehole') || type.includes('drinking') || type.includes('surface')) {
      return 'ZABS Limits';
    }
    return 'WHO/ZS Limit';
  }, [certificate.sampleType]);

  useLayoutEffect(() => {
    const measureContainer = printMeasureRef.current;
    if (!measureContainer) return;

    const rowElements = Array.from(measureContainer.querySelectorAll<HTMLTableRowElement>('tr.measure-row')) as HTMLTableRowElement[];
    const tableHeader = measureContainer.querySelector<HTMLTableSectionElement>('thead');
    const tableHeaderHeight = tableHeader ? tableHeader.offsetHeight : 30;

    const pages: Array<Array<Parameter | { section: string }>> = [];
    let currentPage: Array<Parameter | { section: string }> = [];
    let accumulatedHeight = PAGE_HEADER_HEIGHT + tableHeaderHeight;

    certificate.tableData.forEach((row, index) => {
      const rowEl = rowElements[index];
      const rowHeight = rowEl ? rowEl.offsetHeight : 28;

      if (accumulatedHeight + rowHeight + PAGE_FOOTER_HEIGHT > PAGE_HEIGHT_LIMIT && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        accumulatedHeight = PAGE_HEADER_HEIGHT + tableHeaderHeight;
      }

      currentPage.push(row);
      accumulatedHeight += rowHeight;
    });

    if (currentPage.length > 0) pages.push(currentPage);
    setPrintPages(pages);
  }, [certificate.tableData, certificate.samples, limitHeader]);

  const renderPrintPageHeader = (pageNumber: number, totalPages: number) => (
    <div className="px-4 py-3 border-b border-[#003d7a] print:border-[#003d7a]">
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 p-1 border border-gray-300 rounded-md bg-white">
            <NkanaLogo className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-[#003d7a]">NKANA WATER SUPPLY AND SANITATION COMPANY</div>
            <div className="text-[10px] text-gray-700">WATER ANALYSIS CERTIFICATE</div>
          </div>
        </div>
        <div className="text-right text-[10px] font-semibold text-gray-700">Page {pageNumber} of {totalPages}</div>
      </div>
      <div className="mt-2 text-[9px] text-gray-600">
        Client: {certificate.client || '-'} • Sample Type: {certificate.sampleType || '-'} • Date Sampled: {certificate.dateSampled || '-'}
      </div>
    </div>
  );

  const overallStatus = React.useMemo(() => {
    let hasAnyResult = false;
    let hasFail = false;
    certificate.tableData.forEach(row => {
      if (!row.section) {
        row.results.forEach(result => {
          if (result && result.trim() !== "") {
            hasAnyResult = true;
            const status = computeStatus(row, result);
            if (status === "FAIL") hasFail = true;
          }
        });
      }
    });
    if (!hasAnyResult) return { label: "PENDING", class: "bg-gray-200 text-gray-800" };
    if (hasFail) return { label: "✗ FAIL", class: "bg-red-100 text-red-800" };
    return { label: "✓ PASS", class: "bg-green-100 text-green-800" };
  }, [certificate.tableData, computeStatus]);

  const exportCSV = () => {
    // Match PDF style in CSV by including header metadata and a sectioned table
    let csv = `NKANA WATER SUPPLY AND SANITATION COMPANY,,,...\n`;
    csv += `WATER ANALYSIS CERTIFICATE,,,...\n`;
    csv += `,,,\n`;

    csv += `Certificate No:,"${certificate.certNumber}",Client:,"${certificate.client}",Sample Type:,"${certificate.sampleType}"\n`;
    csv += `Date Sampled:,"${certificate.dateSampled}",Date Reported:,"${certificate.dateReported}",Location:,"${certificate.location}"\n`;
    csv += `Status:,"${overallStatus.label}"\n`;
    csv += `,,,\n`;

    csv += `#,Parameter,Unit,${getLimitHeader()}`;
    certificate.samples.forEach(sample => {
      csv += `,"${sample} Result"`;
    });
    csv += `\n`;

    let rowNum = 0;
    certificate.tableData.forEach(row => {
      if (row.section) {
        csv += `\n"${row.section}"\n`;
      } else {
        rowNum++;
        const sanitizedLimit = row.limit?.replace(/≤/g, '<=');
        csv += `${rowNum},"${row.name}","${row.unit}","${sanitizedLimit}"`;
        certificate.samples.forEach((_, sIdx) => {
          const result = (row.results[sIdx] || "").toString().replace(/≤/g, '<=');
          csv += `,"${result}"`;
        });
        csv += `\n`;
      }
    });

    csv += `\n`;
    csv += `Page 1 of 1 (exported as CSV, see PDF for exact pages),,,\n`;
    csv += `\n`;
    csv += `Signed By:,"${certificate.sign1Name} (${certificate.sign1Title})",,,,,\n`;
    csv += `Signed By:,"${certificate.sign2Name} (${certificate.sign2Title})",,,,,\n`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildDocumentFilename('COA', certificate.client, 'csv');
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  };

  const downloadPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

    const logoDataUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, 400, 400);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = '/logo.png';
    });

    const drawWatermark = () => {
      if (logoDataUrl) {
        doc.saveGraphicsState();
        doc.setGState((doc as any).GState({ opacity: 0.03 }));

        const w = 120;
        const h = 120;
        // Center watermark on page to preserve layout for every page
        const x = (297 - w) / 2;
        const y = (210 - h) / 2;


    const drawHeader = () => {
      // Add Header
      doc.setFillColor(0, 61, 122); // #003d7a
      doc.rect(0, 0, 297, 45, 'F');

      // Draw Logo
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', 15, 5, 35, 35);
      } else {
        const cx = 32.5;
        const cy = 22.5;
        const r = 15;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(0, 0, 255);
        doc.setLineWidth(0.5);
        doc.circle(cx, cy, r, 'FD');
        doc.setFillColor(179, 229, 252);
        doc.circle(cx, cy, r * 0.65, 'FD');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(5);
        doc.setFont("helvetica", "bold");
        doc.text("NKANA WATER", cx, cy - r * 0.75, { align: "center" });
        doc.text("COMPANY", cx, cy + r * 0.85, { align: "center" });
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("NKANA WATER SUPPLY AND SANITATION COMPANY", 148.5, 14, { align: "center" });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia.", 148.5, 20, { align: "center" });
      doc.text("Corporate Head Office Tel: +260 212 222488, 221099, 0971 223 458 | Fax: +260 212 222490", 148.5, 24, { align: "center" });
      doc.text("Email: headoffice@nwsc.com.zm | www.nwsc.zm", 148.5, 28, { align: "center" });

      doc.setTextColor(232, 180, 0); // #e8b400
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("SAFETY HEALTH ENVIRONMENT AND QUALITY DEPARTMENT", 148.5, 34, { align: "center" });

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.text("WATER ANALYSIS CERTIFICATE", 148.5, 41, { align: "center" });

      // Meta Info
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Cert No:", 14, 53);
      doc.setFont("helvetica", "normal");
      doc.text(certificate.certNumber || "-", 30, 53);

      if (overallStatus.label !== "PENDING") {
        doc.setFont("helvetica", "bold");
        doc.text("Status:", 14, 58);
        doc.setFont("helvetica", "normal");
        doc.text(overallStatus.label, 30, 58);
      }

      doc.setFont("helvetica", "bold");
      doc.text("Client:", 80, 53);
      doc.setFont("helvetica", "normal");
      doc.text(certificate.client || "-", 95, 53);

      doc.setFont("helvetica", "bold");
      doc.text("Sample Type:", 80, 58);
      doc.setFont("helvetica", "normal");
      doc.text(certificate.sampleType || "-", 105, 58);

      doc.setFont("helvetica", "bold");
      doc.text("Date Sampled:", 160, 53);
      doc.setFont("helvetica", "normal");
      doc.text(certificate.dateSampled || "-", 185, 53);

      doc.setFont("helvetica", "bold");
      doc.text("Date Reported:", 160, 58);
      doc.setFont("helvetica", "normal");
      doc.text(certificate.dateReported || "-", 185, 58);

      doc.setFont("helvetica", "bold");
      doc.text("Location:", 230, 53);
      doc.setFont("helvetica", "normal");
      doc.text(certificate.location || "-", 248, 53);
    };

    // Table
    const head = [[
      { content: '#', styles: { halign: 'center' as const } },
      { content: 'Parameter' },
      { content: 'Unit' },
      { content: getLimitHeader() },
      ...certificate.samples.map(s => ({ content: s, styles: { halign: 'center' as const } }))
    ]];

    const body: any[] = [];
    let rowNum = 0;
    certificate.tableData.forEach(row => {
      if (row.section) {
        body.push([{ content: row.section, colSpan: 4 + certificate.samples.length, styles: { fillColor: [0, 61, 122], textColor: 255, fontStyle: 'bold' } }]);
      } else {
        rowNum++;
        const sanitizedLimit = row.limit?.replace(/≤/g, '<=');
        const rowData = [
          { content: rowNum.toString(), styles: { halign: 'center' as const } },
          row.name,
          row.unit,
          sanitizedLimit,
          ...certificate.samples.map((_, sIdx) => {
            const rawValue = row.results[sIdx] || "-";
            return { content: rawValue.replace(/≤/g, '<='), styles: { halign: 'center' as const } };
          })
        ];
        body.push(rowData);
      }
    });

    autoTable(doc, {
      startY: 65,
      head: head,
      body: body,
      theme: 'grid',
      showHead: 'everyPage',
      didDrawPage: (data: any) => {
        drawWatermark();
        drawHeader();
      },
      styles: { fontSize: 8, cellPadding: { top: 4, right: 2, bottom: 4, left: 2 } },
      headStyles: { fillColor: [26, 80, 153], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { top: 65, right: 14, bottom: 30, left: 14 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 40 },
        2: { cellWidth: 20 }
      }
    });

    // Signatures
    let finalY = (doc as any).lastAutoTable.finalY || 60;
    
    if (finalY > 165) {
      doc.addPage();
      drawWatermark();
      drawHeader();
      finalY = 80;
    } else {
      finalY += 25;
    }

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    
    // Sign 1
    doc.line(40, finalY, 100, finalY);
    doc.setFont("helvetica", "bold");
    doc.text(certificate.sign1Name || "Name", 70, finalY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(certificate.sign1Title || "Title", 70, finalY + 10, { align: "center" });

    // Sign 2
    doc.line(197, finalY, 257, finalY);
    doc.setFont("helvetica", "bold");
    doc.text(certificate.sign2Name || "Name", 227, finalY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(certificate.sign2Title || "Title", 227, finalY + 10, { align: "center" });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(0, 61, 122);
      doc.rect(0, 195, 297, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Bigger, Better, Smarter", 148.5, 203, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text(`Page ${i} of ${pageCount}`, 280, 203, { align: "right" });
    }

    doc.save(buildDocumentFilename('COA', certificate.client, 'pdf'));
    toast.success("PDF downloaded successfully!");
  };

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

          {/* Cert no. / status side column — desktop */}
          <div className="hidden sm:flex p-5 flex-col items-end justify-center border-l border-white/10 shrink-0 print:border-none print:p-4">
            <div className="bg-white/10 p-4 rounded-xl border border-white/15 shadow-inner print:bg-transparent print:border-none print:p-0 print:shadow-none min-w-[150px]">
              <div className="flex flex-col items-end">
                <div className="text-[10px] tracking-widest text-blue-200/80 uppercase font-semibold mb-0.5 print:text-gray-500">Certificate No.</div>
                <input
                  className="bg-transparent border-none text-[#e8b400] text-lg font-bold font-mono text-right w-full outline-none focus:ring-2 focus:ring-[#e8b400]/50 rounded transition-all print:text-black print:placeholder-gray-300"
                  value={certificate.certNumber}
                  onChange={e => handleMetaChange('certNumber', e.target.value)}
                  placeholder="WAC-001"
                />
              </div>
              {overallStatus.label !== "PENDING" && (
                <div className="mt-3 pt-3 border-t border-white/15 print:border-none flex flex-col items-end">
                  <div className="text-[10px] tracking-widest text-blue-200/80 uppercase font-semibold mb-1 print:text-gray-500">Status</div>
                  <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase border print:border-none ${overallStatus.label.includes('PASS') ? 'bg-green-500/20 text-green-100 border-green-500/50 print:text-green-800' : 'bg-red-500/20 text-red-100 border-red-500/50 print:text-red-800'}`}>
                    {overallStatus.label}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile cert-number row */}
        <div className="flex sm:hidden items-center justify-between px-4 pb-3 gap-4 print:hidden">
          <div>
            <div className="text-[10px] tracking-widest text-blue-200/80 uppercase font-semibold mb-0.5">Certificate No.</div>
            <input
              className="bg-transparent border-none text-[#e8b400] text-base font-bold font-mono outline-none focus:ring-2 focus:ring-[#e8b400]/50 rounded transition-all"
              value={certificate.certNumber}
              onChange={e => handleMetaChange('certNumber', e.target.value)}
              placeholder="WAC-001"
            />
          </div>
          {overallStatus.label !== "PENDING" && (
            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase ${overallStatus.label.includes('PASS') ? 'bg-green-500/20 text-green-100 border border-green-500/50' : 'bg-red-500/20 text-red-100 border border-red-500/50'}`}>
              {overallStatus.label}
            </div>
          )}
        </div>
      </div>

      {/* Meta Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b-2 border-[#003d7a] bg-[#e8f0fa] print:bg-white print:border-b-2">
        <div className={`p-3 border-r border-gray-300 print:border-gray-300 ${!certificate.client?.trim() ? 'bg-red-50/30' : ''}`}>
          <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Client <span className="text-red-600">*</span></div>
          <input className={`w-full bg-transparent border-b ${!certificate.client?.trim() ? 'border-red-400' : 'border-transparent focus:border-blue-500'} outline-none text-sm font-semibold text-[#003d7a] print:text-black`} value={certificate.client} onChange={e => handleMetaChange('client', e.target.value)} placeholder="Client name" />
        </div>
        <div className="p-3 border-r border-gray-300 print:border-gray-300">
          <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Sample Type</div>
          <select className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] print:text-black print:appearance-none" value={certificate.sampleType} onChange={e => handleMetaChange('sampleType', e.target.value)}>
            <option value="Drinking Water">Drinking Water</option>
            <option value="Borehole Water">Borehole Water</option>
            <option value="Surface Water">Surface Water</option>
            <option value="Treated Effluent">Treated Effluent</option>
            <option value="Waste Water">Waste Water</option>
          </select>
        </div>
        <div className="p-3 border-r border-gray-300 print:border-gray-300">
          <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Date Sampled</div>
          <input type="date" className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] print:text-black" value={certificate.dateSampled} onChange={e => handleMetaChange('dateSampled', e.target.value)} />
        </div>
        <div className="p-3 border-r border-gray-300 print:border-gray-300">
          <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Date Reported</div>
          <input type="date" className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] print:text-black" value={certificate.dateReported} onChange={e => handleMetaChange('dateReported', e.target.value)} />
        </div>
        <div className={`p-3 ${!certificate.location?.trim() ? 'bg-red-50/30' : ''}`}>
          <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Sample Location <span className="text-red-600">*</span></div>
          <input className={`w-full bg-transparent border-b ${!certificate.location?.trim() ? 'border-red-400' : 'border-transparent focus:border-blue-500'} outline-none text-sm font-semibold text-[#003d7a] print:text-black`} value={certificate.location} onChange={e => handleMetaChange('location', e.target.value)} placeholder="Location / source" />
        </div>
      </div>

      {/* Samples Management */}
      <div className="p-3 border-b border-gray-200 bg-gray-50 print:hidden">
        <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-2">Samples</div>
        <div className="flex flex-wrap gap-2 items-center">
          {certificate.samples.map((sample, idx) => (
            <div key={idx} className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-300">
              <input 
                className="w-20 text-xs border-none bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded px-1"
                value={sample}
                onChange={e => updateSampleName(idx, e.target.value)}
              />
              {certificate.samples.length > 1 && (
                <button onClick={() => removeSample(idx)} className="text-red-500 hover:text-red-700 p-0.5 rounded-full hover:bg-red-50">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addSample} className="h-7 text-xs px-2 py-1">
            <Plus className="w-3 h-3 mr-1" /> Add Sample
          </Button>
        </div>
      </div>

      {/* Print-only paginated certificate (for print mode) */}
      <div className="hidden print:block">
        {printPages.map((rows, pageIndex) => (
          <section key={pageIndex} className="page bg-white min-h-[280mm] p-4 mb-4 border border-gray-200">
            {renderPrintPageHeader(pageIndex + 1, printPages.length)}

            <div className="mt-3">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th className="border p-1 text-left font-bold">#</th>
                    <th className="border p-1 text-left font-bold">Parameter</th>
                    <th className="border p-1 text-center font-bold">Unit</th>
                    <th className="border p-1 text-center font-bold">{limitHeader}</th>
                    {certificate.samples.map((s, idx) => (
                      <th key={idx} className="border p-1 text-center font-bold">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let pageNumber = 0;
                    return rows.map((row: any, rowIdx: number) => {
                      if (row.section) {
                        return (
                          <tr key={`section-${pageIndex}-${rowIdx}`}>
                            <td colSpan={4 + certificate.samples.length} className="border p-1 font-black bg-[#ebf4ff] text-xs uppercase">
                              {row.section}
                            </td>
                          </tr>
                        );
                      }
                      pageNumber += 1;
                      return (
                        <tr key={`row-${pageIndex}-${rowIdx}`}>
                          <td className="border p-1 text-center">{pageNumber}</td>
                          <td className="border p-1 break-words overflow-hidden">{row.name}</td>
                          <td className="border p-1 text-center">{row.unit}</td>
                          <td className="border p-1 text-center">{row.limit}</td>
                          {row.results.map((value: string, j: number) => (
                            <td key={j} className="border p-1 text-center">{value || '-'}</td>
                          ))}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>

              <div className="mt-4 text-right text-[10px] text-gray-600 border-t border-gray-300 pt-2">
                Page {pageIndex + 1} of {printPages.length}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Hidden measurement table (for print pagination logic) */}
      <div ref={printMeasureRef} className="absolute left-[-9999px] top-0 opacity-0 pointer-events-none" aria-hidden="true">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border p-1">#</th>
              <th className="border p-1">Parameter</th>
              <th className="border p-1">Unit</th>
              <th className="border p-1">{limitHeader}</th>
              {certificate.samples.map((s, idx) => (
                <th key={idx} className="border p-1">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {certificate.tableData.map((row, idx) => {
              if (row.section) {
                return (
                  <tr key={row.id || `section-${idx}`} className="measure-row">
                    <td colSpan={4 + certificate.samples.length} className="border p-1">{row.section}</td>
                  </tr>
                );
              }
              return (
                <tr key={row.id || `row-${idx}`} className="measure-row">
                  <td className="border p-1">{idx + 1}</td>
                  <td className="border p-1 break-words">{row.name}</td>
                  <td className="border p-1">{row.unit}</td>
                  <td className="border p-1">{row.limit}</td>
                  {certificate.samples.map((_, sampleIdx) => (
                    <td key={sampleIdx} className="border p-1">{row.results[sampleIdx] || '-'}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Results Table */}
      <div className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-center bg-[#003d7a]/5 p-3 rounded-lg border border-[#003d7a]/10 mb-2 gap-3">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-[#003d7a] flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" /> Analytical Results Overview
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={addSample} className="h-8 bg-blue-100/50 hover:bg-blue-100 text-[#003d7a] border border-blue-200 text-[10px] font-black uppercase">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Sample Column
            </Button>
            
            <div className="relative">
              <Button size="sm" onClick={() => setShowCategoryMenu(!showCategoryMenu)} className="h-8 bg-[#003d7a] hover:bg-[#002a5a] text-white text-[10px] font-black uppercase">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Parameter
              </Button>
              {showCategoryMenu && (
                <div className="absolute right-0 top-9 w-56 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden text-[#003d7a]">
                  <div className="p-2.5 bg-gray-50 border-b text-[9px] font-black text-gray-400 uppercase tracking-widest">Select Category</div>
                  {["PHYSICAL PARAMETERS", "CHEMICAL PARAMETERS", "BACTERIOLOGICAL PARAMETERS", "HEAVY METALS"].map(cat => (
                    <button key={cat} onClick={() => addParameterInCategory(cat)} className="w-full text-left px-4 py-2.5 text-[11px] font-bold hover:bg-blue-50 transition-colors uppercase">
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* scroll affordance: left arrow, drag-scroll table, right arrow */}
        <div className="relative group">
          {/* Left arrow */}
          <button
            aria-label="Scroll left"
            onClick={() => scrollBy('left')}
            className={`absolute left-0 top-0 bottom-0 z-30 flex items-center justify-center w-10 bg-gradient-to-r from-white/90 via-white/40 to-transparent text-[#003d7a] transition-opacity duration-300 print:hidden ${
              canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="bg-white rounded-full p-1 shadow-md border border-gray-200">
              <ChevronLeft className="w-5 h-5" />
            </div>
          </button>

          {/* Right arrow */}
          <button
            aria-label="Scroll right"
            onClick={() => scrollBy('right')}
            className={`absolute right-0 top-0 bottom-0 z-30 flex items-center justify-center w-10 bg-gradient-to-l from-white/90 via-white/40 to-transparent text-[#003d7a] transition-opacity duration-300 print:hidden ${
              canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="bg-white rounded-full p-1 shadow-md border border-gray-200">
              <ChevronRight className="w-5 h-5" />
            </div>
          </button>

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
      <div className="grid grid-cols-2 border-t-2 border-[#003d7a] print:border-t-2">
        <div className="p-6 text-center border-r border-gray-200">
          <div className="border-t border-black w-48 mx-auto mt-6 mb-2"></div>
          <input className="w-full bg-transparent border-none outline-none text-center font-bold text-sm text-[#003d7a] print:text-black" value={certificate.sign1Name} onChange={e => handleMetaChange('sign1Name', e.target.value)} placeholder="Name" />
          <input className="w-full bg-transparent border-none outline-none text-center text-xs text-gray-500 print:text-black mt-1" value={certificate.sign1Title} onChange={e => handleMetaChange('sign1Title', e.target.value)} placeholder="Title" />
        </div>
        <div className="p-6 text-center">
          <div className="border-t border-black w-48 mx-auto mt-6 mb-2"></div>
          <input className="w-full bg-transparent border-none outline-none text-center font-bold text-sm text-[#003d7a] print:text-black" value={certificate.sign2Name} onChange={e => handleMetaChange('sign2Name', e.target.value)} placeholder="Name" />
          <input className="w-full bg-transparent border-none outline-none text-center text-xs text-gray-500 print:text-black mt-1" value={certificate.sign2Title} onChange={e => handleMetaChange('sign2Title', e.target.value)} placeholder="Title" />
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

// ── Memoized Child Components for Extreme Performance ───────────────────

interface ResultCellProps {
  value: string;
  rowIdx: number;
  sampleIdx: number;
  onChange: (rowIdx: number, sampleIdx: number, value: string) => void;
}

const ResultCell = memo(({ value, rowIdx, sampleIdx, onChange }: ResultCellProps) => {
  return (
    <td className="p-1.5 print:p-1 border-r border-gray-200 text-center">
      <input 
        className="w-full min-w-0 bg-transparent border border-transparent focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none rounded px-1 print:px-0 font-mono text-center" 
        value={value} 
        placeholder="—"
        onChange={e => onChange(rowIdx, sampleIdx, e.target.value)} 
      />
    </td>
  );
});

interface ParameterRowProps {
  row: Parameter;
  idx: number;
  rowNum: number;
  sampleCount: number;
  updateRow: (rowIdx: number, field: keyof Parameter, value: string) => void;
  updateResult: (rowIdx: number, sampleIdx: number, value: string) => void;
  confirmRemoveRow: (idx: number) => void;
}

const ParameterRow = memo(({ 
  row, 
  idx, 
  rowNum, 
  sampleCount, 
  updateRow, 
  updateResult, 
  confirmRemoveRow 
}: ParameterRowProps) => {
  return (
    <tr className="group hover:bg-blue-50 even:bg-gray-50 bg-white print:even:bg-transparent border-b border-gray-200">
      <td className="sticky print:static left-0 z-10 print:z-auto bg-white group-even:bg-gray-50 group-hover:bg-blue-50 p-1.5 print:p-1 text-gray-500 text-[11px] print:text-[9px] text-center border-r border-gray-200">{rowNum}</td>
      <td className="sticky print:static left-8 z-10 print:z-auto bg-white group-even:bg-gray-50 group-hover:bg-blue-50 p-1.5 print:p-1 border-r border-gray-200">
        <input className="w-full min-w-0 bg-transparent border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded px-1 print:px-0 font-semibold text-[#003d7a] print:text-black" value={row.name} onChange={e => updateRow(idx, 'name', e.target.value)} />
      </td>
      <td className="sticky print:static left-[182px] z-10 print:z-auto bg-white group-even:bg-gray-50 group-hover:bg-blue-50 p-1.5 print:p-1 border-r border-gray-200">
        <input className="w-full min-w-0 bg-transparent border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded px-1 print:px-0 text-gray-500 print:text-black" value={row.unit} onChange={e => updateRow(idx, 'unit', e.target.value)} />
      </td>
      <td className="sticky print:static left-[246px] z-10 print:z-auto bg-white group-even:bg-gray-50 group-hover:bg-blue-50 p-1.5 print:p-1 border-r border-gray-200 shadow-[2px_0_10px_-2px_rgba(0,0,0,0.15)] print:shadow-none">
        <input className="w-full min-w-0 bg-transparent border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded px-1 print:px-0" value={row.limit} onChange={e => updateRow(idx, 'limit', e.target.value)} />
      </td>
      
      {Array.from({ length: sampleCount }, (_, sIdx) => (
        <ResultCell
          key={sIdx}
          value={row.results[sIdx] || ""}
          rowIdx={idx}
          sampleIdx={sIdx}
          onChange={updateResult}
        />
      ))}
      <td className="p-1.5 text-center print:hidden">
        <button onClick={() => confirmRemoveRow(idx)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50">
          <X className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
});
