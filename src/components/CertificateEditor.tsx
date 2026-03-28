import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Certificate, Parameter } from '../types';
import { DEFAULT_PARAMS } from '../constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Printer, Download, Save, FileDown, ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NkanaLogo } from './Logo';

interface Props {
  certificate: Certificate;
  setCertificate: React.Dispatch<React.SetStateAction<Certificate>>;
  onSave: () => void;
}

export function CertificateEditor({ certificate, setCertificate, onSave }: Props) {
  const [rowToDelete, setRowToDelete] = useState<number | null>(null);

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
    setCertificate(prev => ({
      ...prev,
      samples: prev.samples.filter((_, i) => i !== idx),
      tableData: prev.tableData.map(row => {
        if (row.section) return { ...row, results: [] };
        return { ...row, results: row.results.filter((_, i) => i !== idx) };
      })
    }));
  };

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

  const addParameter = () => {
    const newRow: Parameter = {
      id: `p${Date.now()}`,
      name: "New Parameter",
      unit: "mg/L",
      limit: "",
      results: certificate.samples.map(() => "")
    };
    setCertificate(prev => ({
      ...prev,
      tableData: [...prev.tableData, newRow]
    }));
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
    let csv = `Certificate No,Client,Date Sampled,Date Reported,Sample Type,Location\n`;
    csv += `"${certificate.certNumber}","${certificate.client}","${certificate.dateSampled}","${certificate.dateReported}",`;
    csv += `"${certificate.sampleType}","${certificate.location}"\n\n`;

    csv += `#,Parameter,Unit,${getLimitHeader()}`;
    certificate.samples.forEach(sample => {
      csv += `,"${sample} Result"`;
    });
    csv += `\n`;

    let rowNum = 0;
    certificate.tableData.forEach(row => {
      if (row.section) {
        csv += `\n[${row.section}]\n`;
      } else {
        rowNum++;
        csv += `${rowNum},"${row.name}","${row.unit}","${row.limit}"`;
        certificate.samples.forEach((_, sIdx) => {
          const result = row.results[sIdx] || "";
          csv += `,"${result}"`;
        });
        csv += `\n`;
      }
    });

    csv += `\nSigned By,"${certificate.sign1Name} (${certificate.sign1Title})"`;
    csv += `,"${certificate.sign2Name} (${certificate.sign2Title})"\n`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NKANA_WaterAnalysis_${certificate.client}_${certificate.dateSampled}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported!");
  };

  const downloadPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

    const svgString = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="98" fill="#ffffff" stroke="#0000FF" stroke-width="3"/>
  <circle cx="100" cy="100" r="65" fill="#b3e5fc" stroke="#0000FF" stroke-width="1"/>
  <path id="topTextPath" d="M 18 100 A 82 82 0 0 1 182 100" fill="none" />
  <path id="bottomTextPath" d="M 18 100 A 82 82 0 0 0 182 100" fill="none" />
  <text font-family="Arial, sans-serif" font-weight="bold" font-size="15" fill="#000" letter-spacing="1">
    <textPath href="#topTextPath" startOffset="50%" text-anchor="middle">NKANA WATER AND SEWERAGE</textPath>
  </text>
  <text font-family="Arial, sans-serif" font-weight="bold" font-size="18" fill="#000" letter-spacing="2" dominant-baseline="hanging">
    <textPath href="#bottomTextPath" startOffset="50%" text-anchor="middle">COMPANY</textPath>
  </text>
  <clipPath id="innerClip">
    <circle cx="100" cy="100" r="65"/>
  </clipPath>
  <g clip-path="url(#innerClip)">
    <rect x="0" y="130" width="200" height="8" fill="#00FF00"/>
    <rect x="0" y="138" width="200" height="12" fill="#8B4513"/>
    <rect x="0" y="150" width="200" height="50" fill="#00BFFF"/>
    <path d="M 0 155 Q 20 145 40 155 T 80 155 T 120 155 T 160 155 T 200 155" fill="none" stroke="#fff" stroke-width="1.5"/>
    <path d="M 0 165 Q 20 155 40 165 T 80 165 T 120 165 T 160 165 T 200 165" fill="none" stroke="#fff" stroke-width="1.5"/>
    <path d="M 0 175 Q 20 165 40 175 T 80 175 T 120 175 T 160 175 T 200 175" fill="none" stroke="#fff" stroke-width="1.5"/>
    <path d="M 115 130 L 115 70 L 85 70 L 85 85 L 75 85 L 75 60 L 125 60 L 125 130 Z" fill="#808080"/>
    <rect x="95" y="50" width="10" height="10" fill="#FFD700"/>
    <rect x="85" y="45" width="30" height="5" fill="#FFD700"/>
    <path d="M 80 95 Q 80 102 85 102 Q 90 102 90 95 L 85 88 Z" fill="#0000FF"/>
    <path d="M 80 110 Q 80 117 85 117 Q 90 117 90 110 L 85 103 Z" fill="#0000FF"/>
    <polygon points="65,130 105,130 100,100 70,100" fill="#CC0000"/>
  </g>
</svg>`;

    const logoDataUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, 400, 400);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    });

    const drawWatermark = () => {
      if (logoDataUrl) {
        doc.saveGraphicsState();
        doc.setGState((doc as any).GState({ opacity: 0.05 }));
        
        const w = 100;
        const h = 100;
        const x = (297 - w) / 2;
        const y = (210 - h) / 2;
        
        doc.addImage(logoDataUrl, 'PNG', x, y, w, h);
        doc.restoreGraphicsState();
      }
    };

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
        const rowData = [
          { content: rowNum.toString(), styles: { halign: 'center' as const } },
          row.name,
          row.unit,
          row.limit,
          ...certificate.samples.map((_, sIdx) => {
            return { content: row.results[sIdx] || "-", styles: { halign: 'center' as const } };
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
      horizontalPageBreak: true,
      horizontalPageBreakRepeat: [0, 1], // Repeat '#' and 'Parameter'
      styles: { fontSize: 8, cellPadding: { top: 4, right: 2, bottom: 4, left: 2 } },
      headStyles: { fillColor: [26, 80, 153], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { top: 65, right: 14, bottom: 20, left: 14 },
      didDrawPage: () => {
        drawWatermark();
        drawHeader();
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

    doc.save(`Certificate_${certificate.certNumber || 'Draft'}.pdf`);
    toast.success("PDF downloaded successfully!");
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 print:shadow-none print:border-none">
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
        <div className="p-3 border-r border-gray-300 print:border-gray-300">
          <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Client</div>
          <input className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] print:text-black" value={certificate.client} onChange={e => handleMetaChange('client', e.target.value)} placeholder="Client name" />
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
        <div className="p-3">
          <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Sample Location</div>
          <input className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-semibold text-[#003d7a] print:text-black" value={certificate.location} onChange={e => handleMetaChange('location', e.target.value)} placeholder="Location / source" />
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

      {/* Results Table */}
      <div className="w-full">
        <div className="bg-[#003d7a] text-white px-4 py-2 text-[11px] font-bold tracking-widest uppercase flex items-center justify-between print:bg-gray-200 print:text-black">
          <span>ANALYTICAL RESULTS</span>
          <Button variant="ghost" size="sm" onClick={addParameter} className="h-6 text-[10px] hover:bg-white/20 print:hidden">
            <Plus className="w-3 h-3 mr-1" /> Add Parameter
          </Button>
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
        <Button onClick={downloadPDF} size="sm" variant="secondary" className="shadow-lg bg-[#e8b400] text-black hover:bg-[#d4a200] h-8 px-3 text-xs font-semibold">
          <FileDown className="w-3.5 h-3.5 mr-1" /> PDF
        </Button>
        <Button onClick={exportCSV} size="sm" className="shadow-lg bg-[#0072ce] hover:bg-[#0061b0] h-8 px-3 text-xs">
          <Download className="w-3.5 h-3.5 mr-1" /> CSV
        </Button>
      </div>

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
