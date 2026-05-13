import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Certificate } from '../../types';
import { A4_W, A4_H, MARGIN, MAX_SAMPLE_COLS, DB, OB, GD } from '../constants';
import { loadImg } from '../utils/imageLoader';
import { sanitizeFilename, formatDateString } from '../utils/formatters';
import { drawSharedHeader } from '../components/header';
import { drawSharedMetadata } from '../components/metaSection';
import { drawSharedWatermark } from '../components/watermark';
import { drawSharedFooters } from '../components/footer';
import { drawSharedSignatories } from '../components/signatures';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Auto-generated hierarchical reference ID */
function buildCOARefId(cert: Certificate): string {
  const ym  = (cert.dateReported || '').replace(/-/g, '').slice(0, 6) ||
    new Date().toISOString().slice(0, 7).replace('-', '');
  const seq = (cert.certNumber || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `NWSC/SHEQ/WATER/${ym}/${seq}`;
}

/** Turnaround time in whole days, or '—' */
function calcTurnaround(sampled?: string, reported?: string): string {
  if (!sampled || !reported) return '—';
  try {
    const s = new Date(sampled).getTime();
    const r = new Date(reported).getTime();
    const days = Math.round((r - s) / 86_400_000);
    return days >= 0 ? `${days} day${days !== 1 ? 's' : ''}` : '—';
  } catch { return '—'; }
}

/** Normalise a result value — never leave a cell blank */
function normaliseResult(v: string | undefined | null): string {
  if (v === undefined || v === null || String(v).trim() === '') return 'ND';
  return String(v).trim();
}

/** Determine column width per sample so nothing gets squeezed */
function calcSampleColWidth(
  availW: number,       // total usable width (A4_W - 2*MARGIN)
  fixedW: number,       // sum of fixed-width columns (param + unit + limit)
  nSamples: number
): number {
  const minSampleColW = 20; // never narrower than 20 mm
  const ideal = (availW - fixedW) / Math.max(nSamples, 1);
  return Math.max(ideal, minSampleColW);
}

// ─── Accreditation / compliance notice ────────────────────────────────────────
function drawAccreditationNotice(doc: jsPDF, y: number): number {
  const boxH = 9;
  const availW = A4_W - 2 * MARGIN;

  doc.setFillColor(240, 245, 251);
  doc.rect(MARGIN, y, availW, boxH, 'F');

  doc.setDrawColor(200, 218, 240);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y, availW, boxH, 'S');

  // Accent bar on left
  doc.setFillColor(...DB);
  doc.rect(MARGIN, y, 2, boxH, 'F');

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(60, 70, 90);
  doc.text(
    'Methods comply with ZABS / ZEMA / WHO guidelines where applicable.  ' +
    'Results relate only to the samples as received.  ' +
    'This certificate may not be partially reproduced without written approval from NWSC SHEQ.',
    MARGIN + 5, y + 3.5,
    { maxWidth: availW - 8 }
  );

  return y + boxH + 4;
}

// ─── Turnaround tracking strip ─────────────────────────────────────────────────
function drawTurnaroundStrip(doc: jsPDF, cert: Certificate, y: number): number {
  const availW  = A4_W - 2 * MARGIN;
  const fields  = [
    { label: 'Date Sampled',  value: cert.dateSampled   || '—' },
    { label: 'Date Received', value: cert.dateSampled   || '—' },  // same as sampled unless separate field added
    { label: 'Date Reported', value: cert.dateReported  || '—' },
    { label: 'Turnaround',   value: calcTurnaround(cert.dateSampled, cert.dateReported) },
  ];

  const stripH = 12;
  const colW   = availW / fields.length;

  doc.setFillColor(240, 245, 251);
  doc.rect(MARGIN, y, availW, stripH, 'F');
  doc.setDrawColor(200, 218, 240);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y, availW, stripH, 'S');

  fields.forEach((f, i) => {
    const x = MARGIN + i * colW;
    if (i > 0) {
      doc.setDrawColor(200, 218, 240);
      doc.setLineWidth(0.18);
      doc.line(x, y, x, y + stripH);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...DB);
    doc.text(f.label.toUpperCase(), x + 3, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(26, 26, 26);
    doc.text(f.value, x + 3, y + 9.5, { maxWidth: colW - 5 });
  });

  return y + stripH + 4;
}

// ─── Main PDF generator ────────────────────────────────────────────────────────
export async function generateCOAPdf(certificate: Certificate): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });

  let logo: string | null = null;
  try { logo = await loadImg('/logo.png'); } catch { /* skip */ }

  const samples   = certificate.samples  || [];
  const tableData = certificate.tableData || [];
  const refId     = buildCOARefId(certificate);
  const limitHeader = certificate.sampleType === 'Wastewater' ? 'ZEMA Limit' : 'ZABS Limit';

  // ── Dynamic column width ────────────────────────────────────────────────────
  const availW    = A4_W - 2 * MARGIN;
  const PARAM_W   = 52;  // Parameter column
  const UNIT_W    = 14;  // Unit column
  const LIMIT_W   = 24;  // Limit column
  const FIXED_W   = PARAM_W + UNIT_W + LIMIT_W;

  // ── Paginate sample groups ──────────────────────────────────────────────────
  // Determine how many samples fit per page given their widths
  const sampleColW = calcSampleColWidth(availW, FIXED_W, Math.min(samples.length, MAX_SAMPLE_COLS));
  const safeSampleCols = Math.min(
    MAX_SAMPLE_COLS,
    Math.max(1, Math.floor((availW - FIXED_W) / sampleColW))
  );

  const groups: string[][] = [];
  if (samples.length === 0) {
    groups.push([]);
  } else {
    for (let i = 0; i < samples.length; i += safeSampleCols) {
      groups.push(samples.slice(i, i + safeSampleCols));
    }
  }

  // ── Metadata rows ────────────────────────────────────────────────────────────
  const metaRows = [
    [
      { label: 'Client',       value: certificate.client       },
      { label: 'Location',     value: certificate.location     },
      { label: 'Sample Type',  value: certificate.sampleType   },
    ],
    [
      { label: 'Reference ID', value: refId                    },
      { label: 'Status',       value: certificate.status || 'FINAL' },
      { label: 'Date Reported',value: certificate.dateReported  },
    ]
  ];

  // ── Render each group ────────────────────────────────────────────────────────
  for (let gi = 0; gi < groups.length; gi++) {
    const sampleGroup  = groups[gi];
    const globalStart  = gi * safeSampleCols;
    const nSamples     = sampleGroup.length;
    const dynSampleW   = nSamples > 0
      ? calcSampleColWidth(availW, FIXED_W, nSamples)
      : 20;

    if (gi > 0) doc.addPage();
    await drawSharedWatermark(doc, logo);
    const afterHdr  = drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE', certificate.certNumber || '—');
    const afterMeta = drawSharedMetadata(doc, metaRows, afterHdr);

    // Turnaround strip only on first page
    let curY = afterMeta;
    if (gi === 0) {
      curY = drawTurnaroundStrip(doc, certificate, curY);
    }

    // Continuation banner for subsequent sample groups
    if (gi > 0) {
      doc.setFillColor(240, 245, 251);
      doc.rect(MARGIN, curY, availW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...DB);
      doc.text(
        `Samples ${globalStart + 1}–${globalStart + nSamples} of ${samples.length} (continued)`,
        MARGIN + 4, curY + 4.5
      );
      curY += 9;
    }

    // ── Build table data ─────────────────────────────────────────────────────
    const tableHead: any[] = [['Parameter', 'Unit', limitHeader, ...sampleGroup]];
    const tableBody: any[][] = [];

    let currentSection = '';
    tableData.forEach(row => {
      const section = row.section ? row.section.toUpperCase() : '';

      // Section subheading row
      if (section && section !== currentSection) {
        tableBody.push([{
          content: section,
          colSpan: 3 + nSamples,
          styles: {
            fillColor: [225, 235, 250] as [number,number,number],
            textColor: DB,
            fontStyle: 'bold',
            fontSize: 8.5,
            halign: 'left',
            cellPadding: { top: 3, bottom: 3, left: 5, right: 3 },
          }
        }]);
        currentSection = section;
      }

      if (!row.section) {
        const resultCols = sampleGroup.map((_, si) => {
          const v = row.results?.[globalStart + si];
          return normaliseResult(v);
        });
        tableBody.push([
          row.name || '—',
          row.unit  || '—',
          row.limit || '—',
          ...resultCols,
        ]);
      }
    });

    // ── Render autoTable ─────────────────────────────────────────────────────
    autoTable(doc, {
      head: tableHead,
      body: tableBody,
      startY: curY,
      margin: { left: MARGIN, right: MARGIN, bottom: 22 },
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 },
        valign: 'middle',
        textColor: [51, 51, 51] as [number,number,number],
        lineColor: [221, 231, 244] as [number,number,number],
        lineWidth: 0.18,
        overflow: 'linebreak',
        minCellHeight: 7,
      },
      headStyles: {
        fillColor: DB,
        textColor: [255, 255, 255] as [number,number,number],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
        cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
        minCellHeight: 8,
      },
      columnStyles: {
        0: { cellWidth: PARAM_W,  fontStyle: 'bold', halign: 'left'   },
        1: { cellWidth: UNIT_W,   halign: 'center'                    },
        2: { cellWidth: LIMIT_W,  halign: 'center', textColor: DB, fontStyle: 'bold' },
        // Sample columns — dynamic width applied below via didParseCell
      },
      alternateRowStyles: { fillColor: [245, 248, 253] as [number,number,number] },
      didParseCell: (data) => {
        // Apply dynamic width to every sample column
        if (data.column.index >= 3) {
          data.cell.styles.cellWidth = dynSampleW;
          data.cell.styles.halign = 'center';
          // Highlight ND values subtly
          if (data.section === 'body' && data.cell.text[0] === 'ND') {
            data.cell.styles.textColor = [160, 160, 160] as [number,number,number];
            data.cell.styles.fontStyle = 'italic';
          }
        }
        // Header font size adjustment
        if (data.section === 'head') {
          const text = data.cell.text.join(' ');
          // Sample header — allow wrapping; reduce font to fit if single word
          if (data.column.index >= 3) {
            data.cell.styles.fontSize   = 7.5;
            data.cell.styles.overflow   = 'linebreak';
            data.cell.styles.cellWidth  = dynSampleW;
          } else if (!text.includes(' ')) {
            data.cell.styles.fontSize = 7;
          }
          // Accent the limit column header
          if (data.column.index === 2) {
            data.cell.styles.fillColor = [22, 90, 160] as [number,number,number];
          }
        }
      },
      didDrawPage: () => {
        void (async () => { await drawSharedWatermark(doc, logo); })();
        const ah = drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE', certificate.certNumber || '—');
        // On auto-added pages the table continues; push table down past header
        (doc as any).__autoTableCurrentSettings = { margin: { top: ah + 5 } };
      },
    });
  }

  // ── Accreditation notice ───────────────────────────────────────────────────
  doc.setPage(doc.getNumberOfPages());
  const lastTableY = (doc as any).lastAutoTable?.finalY ?? 200;
  let ty = lastTableY + 6;

  if (ty + 9 > A4_H - 22) {
    doc.addPage();
    await drawSharedWatermark(doc, logo);
    drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE', certificate.certNumber || '—');
    ty = 70;
  }
  ty = drawAccreditationNotice(doc, ty);

  // ── Reference ID strip ─────────────────────────────────────────────────────
  doc.setFillColor(240, 245, 251);
  doc.rect(MARGIN, ty, availW, 6, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`Reference: ${refId}`, MARGIN + 3, ty + 4);
  ty += 10;

  // ── Signatories ───────────────────────────────────────────────────────────
  if (ty + 50 > A4_H - 22) {
    doc.addPage();
    await drawSharedWatermark(doc, logo);
    drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE', certificate.certNumber || '—');
    ty = 70;
  }

  await drawSharedSignatories(
    doc,
    certificate.sign1Name, certificate.sign1Title, certificate.sign1SignatureImage,
    certificate.sign2Name, certificate.sign2Title, certificate.sign2SignatureImage,
    ty
  );

  drawSharedFooters(doc, doc.getNumberOfPages(), 'COA', 'Rev.1');

  const clientStr = sanitizeFilename(certificate.client);
  const dateStr   = formatDateString(certificate.dateReported);
  const certStr   = (certificate.certNumber || 'COA').replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`COA_${clientStr}_${dateStr}_${certStr}.pdf`);
}
