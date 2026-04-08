/**
 * pdfGenerators.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in PDF + CSV generation module for NWSC Laboratory Management System.
 *
 * Produces:
 *   1) Certificate of Analysis (COA) PDF  – generateCOAPdf()
 *   2) Service Quotation PDF               – generateQuotationPdf()
 *   3) COA CSV export                      – exportCOACSV()
 *   4) Quotation CSV export                – exportQuotationCSV()
 *
 * COA layout matches the NWSC reference design EXACTLY:
 *   • Full-width deep-blue header (logo left, company/dept/title centred)
 *   • 2-row light-grey metadata: Cert No | Client | Date Sampled | Location
 *     then Sample Type | Date Reported
 *   • Table: # | Parameter | Unit | Limit | Sample 1 … Sample N
 *   • MAX 8 sample columns per page — overflow → new page with FULL header repeat
 *   • Watermark: NWSC logo centred, ~7% opacity
 *   • Footer: dark-blue band — "Bigger, Better, Smarter" left | Page X of Y right
 * ─────────────────────────────────────────────────────────────────────────────
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Certificate, Quotation } from '../types';

// ─── Brand constants ──────────────────────────────────────────────────────────
const DB = [0,   61,  122] as [number,number,number];  // #003D7A  deep blue
const OB = [0,  119,  182] as [number,number,number];  // #0077B6  ocean blue
const GD = [232,180,   0 ] as [number,number,number];  // #E8B400  gold

const A4_W  = 210;   // mm
const A4_H  = 297;   // mm
const MARGIN = 12;   // mm side margin (left/right)

const MAX_SAMPLE_COLS = 8; // max sample columns per page

// ─── Image loader ─────────────────────────────────────────────────────────────
function loadImg(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = img.naturalWidth  || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext('2d');
      if (!ctx) { reject('No ctx'); return; }
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject('load error: ' + src);
  });
}

function sanitise(s: string): string {
  return (s || 'Unknown').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');
}
function kwacha(v: number): string {
  return `K ${v.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  COA: draw full header block on current page
//  Returns Y position immediately BELOW the header block
// ─────────────────────────────────────────────────────────────────────────────
function drawCOAHeader(doc: jsPDF, logoDataUrl: string | null): number {
  const HDR_H = 50; // total header height (mm)
  const LOGO_SIZE = 20;
  const LOGO_X    = MARGIN;
  const LOGO_Y    = 5;

  // ── Blue background fill ──
  doc.setFillColor(...DB);
  doc.rect(0, 0, A4_W, HDR_H, 'F');

  // ── Logo in white circle ──
  if (logoDataUrl) {
    // white circle
    doc.setFillColor(255, 255, 255);
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2 + 1, 'F');
    doc.addImage(logoDataUrl, 'PNG', LOGO_X, LOGO_Y + 1, LOGO_SIZE, LOGO_SIZE - 2);
  }

  // ── Centred stacked text ──
  const cx = A4_W / 2;

  doc.setTextColor(255, 255, 255);

  // Company name – large
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('NKANA WATER SUPPLY AND SANITATION COMPANY', cx, 12, { align: 'center' });

  // Address lines – small
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia', cx, 18, { align: 'center' });
  doc.text('Tel: +260 212 222488 / 221099 / 0971 223 458   |   Fax: +260 212 222490', cx, 22.5, { align: 'center' });
  doc.text('headoffice@nwsc.com.zm   |   www.nwsc.zm', cx, 27, { align: 'center' });

  // Thin gold divider
  doc.setDrawColor(...GD);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 30.5, A4_W - MARGIN, 30.5);

  // Department label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 215, 60); // warm gold tint
  doc.text('SAFETY HEALTH ENVIRONMENT AND QUALITY DEPARTMENT', cx, 36, { align: 'center' });

  // Document title – largest, white
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('WATER ANALYSIS CERTIFICATE', cx, 43, { align: 'center' });

  // Bottom gold underline of header
  doc.setFillColor(...GD);
  doc.rect(0, HDR_H - 2, A4_W, 2, 'F');

  return HDR_H + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
//  COA: draw metadata rows (light grey band)
//  Returns Y position immediately BELOW the metadata block
// ─────────────────────────────────────────────────────────────────────────────
function drawCOAMetadata(doc: jsPDF, cert: Certificate, startY: number): number {
  const ROW_H = 7.5;
  const bandH = ROW_H * 2 + 2;
  const availW = A4_W - 2 * MARGIN;

  // Background
  doc.setFillColor(240, 242, 245);
  doc.rect(MARGIN, startY, availW, bandH, 'F');

  // Border
  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, startY, availW, bandH, 'S');

  // ── Row 1: Cert No | Client | Date Sampled | Location ──
  const row1: [string, string][] = [
    ['Cert No:',       cert.certNumber    || '—'],
    ['Client:',        cert.client        || '—'],
    ['Date Sampled:',  cert.dateSampled   || '—'],
    ['Location:',      cert.location      || '—'],
  ];
  const colW1 = availW / row1.length;

  row1.forEach(([label, val], ci) => {
    const x = MARGIN + ci * colW1 + 2;
    const y1 = startY + 4.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...DB);
    doc.text(label, x, y1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    const maxW = colW1 - 4;
    const parts = doc.splitTextToSize(val, maxW);
    doc.text(parts[0] || '', x, y1 + 3);

    // Vertical divider (not after last)
    if (ci < row1.length - 1) {
      doc.setDrawColor(200, 205, 215);
      doc.setLineWidth(0.25);
      doc.line(MARGIN + (ci + 1) * colW1, startY + 1, MARGIN + (ci + 1) * colW1, startY + ROW_H);
    }
  });

  // Horizontal divider between rows
  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, startY + ROW_H, MARGIN + availW, startY + ROW_H);

  // ── Row 2: Sample Type | Date Reported ──
  const row2: [string, string][] = [
    ['Sample Type:',    cert.sampleType    || '—'],
    ['Date Reported:',  cert.dateReported  || '—'],
  ];
  const colW2 = availW / row2.length;

  row2.forEach(([label, val], ci) => {
    const x = MARGIN + ci * colW2 + 2;
    const y1 = startY + ROW_H + 4.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...DB);
    doc.text(label, x, y1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    const maxW = colW2 - 4;
    const parts = doc.splitTextToSize(val, maxW);
    doc.text(parts[0] || '', x, y1 + 3);

    if (ci < row2.length - 1) {
      doc.setDrawColor(200, 205, 215);
      doc.setLineWidth(0.25);
      doc.line(MARGIN + (ci + 1) * colW2, startY + ROW_H + 1, MARGIN + (ci + 1) * colW2, startY + bandH - 1);
    }
  });

  return startY + bandH + 2;
}

// ─────────────────────────────────────────────────────────────────────────────
//  COA: draw watermark on current page (must be called BEFORE other content)
// ─────────────────────────────────────────────────────────────────────────────
async function drawCOAWatermark(doc: jsPDF, logoDataUrl: string | null): Promise<void> {
  doc.saveGraphicsState();
  // @ts-ignore
  (doc as any).setGState(new (doc as any).GState({ opacity: 0.07 }));
  if (logoDataUrl) {
    const sz = 110;
    doc.addImage(logoDataUrl, 'PNG', (A4_W - sz) / 2, (A4_H - sz) / 2, sz, sz);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(80);
    doc.setTextColor(180, 180, 180);
    doc.text('NWSC', A4_W / 2, A4_H / 2, { align: 'center', angle: 45 });
  }
  doc.restoreGraphicsState();
}

// ─────────────────────────────────────────────────────────────────────────────
//  COA: draw the footer band on EVERY page
// ─────────────────────────────────────────────────────────────────────────────
function drawCOAFooters(doc: jsPDF, totalPages: number): void {
  const FOO_H  = 8;
  const FOO_Y  = A4_H - FOO_H;

  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);

    // Blue band
    doc.setFillColor(...DB);
    doc.rect(0, FOO_Y, A4_W, FOO_H, 'F');

    // Left: slogan
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('Bigger, Better, Smarter', MARGIN, FOO_Y + 5);

    // Right: page number
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Page ${pg} of ${totalPages}`, A4_W - MARGIN, FOO_Y + 5, { align: 'right' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  COA: draw signatories block
// ─────────────────────────────────────────────────────────────────────────────
function drawCOASignatories(
  doc: jsPDF,
  s1Name: string, s1Title: string, s1Img?: string,
  s2Name: string, s2Title: string, s2Img?: string,
  startY: number = 220
): void {
  // Section label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...DB);
  doc.text('AUTHORISED SIGNATORIES', MARGIN, startY);

  doc.setDrawColor(...OB);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, startY + 1.5, A4_W - MARGIN, startY + 1.5);

  const cols = [MARGIN, A4_W / 2 + 5];
  const entries = [
    { name: s1Name, title: s1Title, img: s1Img },
    { name: s2Name, title: s2Title, img: s2Img },
  ];

  entries.forEach((e, ci) => {
    if (!e.name && !e.title && !e.img) return;
    const x = cols[ci];
    let sy = startY + 5;

    if (e.img) {
      try { doc.addImage(e.img, 'PNG', x, sy, 42, 16); } catch {}
      sy += 18;
    } else {
      sy += 16;
    }

    doc.setDrawColor(...DB);
    doc.setLineWidth(0.5);
    doc.line(x, sy, x + 70, sy);
    sy += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(20, 20, 20);
    doc.text(e.name || '________________________', x, sy);
    sy += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(e.title || '', x, sy);
    sy += 4;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text('Date: ___________________________', x, sy);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  DOCUMENT 1: Certificate of Analysis (COA)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateCOAPdf(certificate: Certificate): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });

  // Load logo
  let logo: string | null = null;
  try { logo = await loadImg('/logo.png'); } catch { /* skip */ }

  const samples   = certificate.samples  || [];
  const tableData = certificate.tableData || [];

  // Split samples into pages of MAX_SAMPLE_COLS
  const groups: string[][] = [];
  if (samples.length === 0) {
    groups.push([]); // one page, no sample columns
  } else {
    for (let i = 0; i < samples.length; i += MAX_SAMPLE_COLS) {
      groups.push(samples.slice(i, i + MAX_SAMPLE_COLS));
    }
  }

  const limitHeader =
    certificate.sampleType === 'Drinking Water' ? 'WHO/ZABS Limit' :
    certificate.sampleType === 'Wastewater'     ? 'ZEMA Limit'     : 'Limit';

  // Pre-compute section row indices for styling
  const sectionRowIdxs: number[] = [];
  tableData.forEach((row, i) => { if (row.section) sectionRowIdxs.push(i); });

  // ── Iterate sample page groups ─────────────────────────────────────────────
  for (let gi = 0; gi < groups.length; gi++) {
    const sampleGroup = groups[gi];
    const globalStart = gi * MAX_SAMPLE_COLS;

    if (gi > 0) doc.addPage();

    // 1. Watermark (draw first so content appears over it)
    await drawCOAWatermark(doc, logo);

    // 2. Header
    const afterHdr = drawCOAHeader(doc, logo);

    // 3. Metadata
    const afterMeta = drawCOAMetadata(doc, certificate, afterHdr);

    // 4. (Optional) continuation banner
    if (gi > 0) {
      doc.setFillColor(...OB);
      doc.rect(MARGIN, afterMeta - 1, A4_W - 2 * MARGIN, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(
        `Samples ${globalStart + 1}–${globalStart + sampleGroup.length} of ${samples.length}  (continued from previous page)`,
        MARGIN + 2, afterMeta + 3.5
      );
    }

    const tableStartY = gi > 0 ? afterMeta + 7 : afterMeta;

    // 5. Column widths
    //    Fixed: # | Parameter | Unit | Limit
    //    Remaining width split across sample columns
    const FIXED_WIDTHS = { 0: 7, 1: 48, 2: 17, 3: 26 };
    const usedFixed = FIXED_WIDTHS[0] + FIXED_WIDTHS[1] + FIXED_WIDTHS[2] + FIXED_WIDTHS[3];
    const availForSamples = A4_W - 2 * MARGIN - usedFixed;
    const sampleColW = sampleGroup.length > 0
      ? Math.min(availForSamples / sampleGroup.length, 25)
      : 20;

    const colStyles: Record<number, object> = {
      0: { cellWidth: FIXED_WIDTHS[0], halign: 'center' },
      1: { cellWidth: FIXED_WIDTHS[1], halign: 'left' },
      2: { cellWidth: FIXED_WIDTHS[2], halign: 'center' },
      3: { cellWidth: FIXED_WIDTHS[3], halign: 'center' },
    };
    sampleGroup.forEach((_, si) => {
      colStyles[4 + si] = { cellWidth: sampleColW, halign: 'center' };
    });

    // 6. Build table head
    const tableHead = [['#', 'Parameter', 'Unit', limitHeader, ...sampleGroup]];

    // 7. Build table body
    let paramCount = 0;
    const tableBody: (string | object)[][] = [];

    tableData.forEach(row => {
      if (row.section) {
        tableBody.push([{
          content: row.section || '',
          colSpan: 4 + sampleGroup.length,
          styles: {
            fillColor: OB as [number,number,number],
            textColor: [255, 255, 255] as [number,number,number],
            fontStyle: 'bold',
            fontSize: 7,
            halign: 'left',
          }
        }]);
      } else {
        paramCount++;
        const resultCols = sampleGroup.map((_, si) => {
          const absIdx = globalStart + si;
          const v = row.results?.[absIdx];
          return v !== undefined && v !== null && v !== '' ? v : '—';
        });
        tableBody.push([String(paramCount), row.name || '', row.unit || '', row.limit || '', ...resultCols]);
      }
    });

    // 8. Render table — autoTable handles its own page-breaks.
    //    Each time it adds a page WE will redraw the header+meta ourselves via didAddPage.
    autoTable(doc, {
      head: tableHead,
      body: tableBody,
      startY: tableStartY,
      margin: { left: MARGIN, right: MARGIN, bottom: 15 }, // 15 mm bottom for footer
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
        overflow: 'linebreak',
        valign: 'middle',
        textColor: [20, 20, 20] as [number,number,number],
        lineColor: [180, 185, 195] as [number,number,number],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: DB,
        textColor: [255, 255, 255] as [number,number,number],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
      },
      columnStyles: colStyles,
      alternateRowStyles: {
        fillColor: [235, 240, 248] as [number,number,number],
      },
      rowPageBreak: 'avoid',
      didAddPage: (data) => {
        // Redraw watermark + full header + metadata on each new page autoTable creates
        void (async () => { await drawCOAWatermark(doc, logo); })();

        const afterH = drawCOAHeader(doc, logo);
        const afterM = drawCOAMetadata(doc, certificate, afterH);

        // Continuation banner
        doc.setFillColor(...OB);
        doc.rect(MARGIN, afterM - 1, A4_W - 2 * MARGIN, 5.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(
          `Samples ${globalStart + 1}–${globalStart + sampleGroup.length} of ${Math.max(samples.length, 1)}  (continued)`,
          MARGIN + 2, afterM + 3.5
        );

        // Update autoTable's top margin for this new page
        data.settings.margin.top = afterM + 8;
      },
    });
  }

  // ── Signatories on last page ────────────────────────────────────────────────
  doc.setPage(doc.getNumberOfPages());
  const lastY = (doc as any).lastAutoTable?.finalY ?? 200;
  const signSpace = 60;

  if (lastY + signSpace > A4_H - 15) {
    doc.addPage();
    await drawCOAWatermark(doc, logo);
    drawCOAHeader(doc, logo);
    drawCOASignatories(
      doc,
      certificate.sign1Name, certificate.sign1Title, certificate.sign1SignatureImage,
      certificate.sign2Name, certificate.sign2Title, certificate.sign2SignatureImage,
      58
    );
  } else {
    drawCOASignatories(
      doc,
      certificate.sign1Name, certificate.sign1Title, certificate.sign1SignatureImage,
      certificate.sign2Name, certificate.sign2Title, certificate.sign2SignatureImage,
      lastY + 8
    );
  }

  // ── Footers on ALL pages ─────────────────────────────────────────────────────
  drawCOAFooters(doc, doc.getNumberOfPages());

  // ── Save ─────────────────────────────────────────────────────────────────────
  const clientStr = sanitise(certificate.client);
  const dateStr   = (certificate.dateReported || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const certStr   = (certificate.certNumber   || 'COA').replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`COA_${clientStr}_${dateStr}_${certStr}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED helpers (used by Quotation)
// ─────────────────────────────────────────────────────────────────────────────
async function drawWatermark(doc: jsPDF, logoDataUrl: string | null): Promise<void> {
  doc.saveGraphicsState();
  // @ts-ignore
  (doc as any).setGState(new (doc as any).GState({ opacity: 0.07 }));
  if (logoDataUrl) {
    const size = 100;
    doc.addImage(logoDataUrl, 'PNG', (A4_W - size) / 2, (A4_H - size) / 2, size, size);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(72);
    doc.setTextColor(180, 180, 180);
    doc.text('NWSC', A4_W / 2, A4_H / 2, { align: 'center', angle: 45 });
  }
  doc.restoreGraphicsState();
}

function drawHeader(
  doc: jsPDF,
  logoDataUrl: string | null,
  badgeLabel: string,
  documentTitle: string
): number {
  const headerH = 42;
  doc.setFillColor(...DB);
  doc.rect(0, 0, A4_W, headerH, 'F');

  doc.setDrawColor(...GD);
  doc.setLineWidth(1.2);
  doc.line(0, headerH, A4_W, headerH);

  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(MARGIN - 1, 3, 22, 22, 2, 2, 'F');
    doc.addImage(logoDataUrl, 'PNG', MARGIN, 4, 20, 20);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('NKANA WATER SUPPLY AND SANITATION COMPANY', A4_W / 2, 10, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(200, 220, 240);
  doc.text('Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia', A4_W / 2, 15, { align: 'center' });
  doc.text('Tel: +260 212 222488 / 221099 / 0971 223 458  |  Fax: +260 212 222490', A4_W / 2, 19.5, { align: 'center' });
  doc.text('headoffice@nwsc.com.zm  |  www.nwsc.zm', A4_W / 2, 24, { align: 'center' });

  const badgeW = 28;
  const badgeX = A4_W - MARGIN - badgeW;
  doc.setFillColor(...OB);
  doc.roundedRect(badgeX, 4, badgeW, 10, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(badgeLabel, badgeX + badgeW / 2, 10.5, { align: 'center' });

  doc.setFillColor(...OB);
  doc.rect(0, headerH + 1, A4_W, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(documentTitle, A4_W / 2, headerH + 7.5, { align: 'center' });

  return headerH + 13;
}

function drawFooters(doc: jsPDF, totalPages: number, leftLabel: string): void {
  const footerY = A4_H - 8;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...OB);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, footerY - 2, A4_W - MARGIN, footerY - 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(leftLabel, MARGIN, footerY + 1);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...DB);
    doc.text('Bigger, Better, Smarter', A4_W / 2, footerY + 1, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${totalPages}`, A4_W - MARGIN, footerY + 1, { align: 'right' });
  }
}

function drawSignatories(
  doc: jsPDF,
  sign1Name: string, sign1Title: string, sign1Img?: string,
  sign2Name: string, sign2Title: string, sign2Img?: string,
  startY?: number
): number {
  const y0 = startY ?? ((doc as any).lastAutoTable?.finalY ?? 210) + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DB);
  doc.text('AUTHORISED SIGNATORIES', MARGIN, y0);
  doc.setDrawColor(...OB);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y0 + 2, A4_W - MARGIN, y0 + 2);

  const col1X = MARGIN;
  const col2X = A4_W / 2 + 5;
  let maxY = y0 + 4;

  for (const [colX, imgData, name, title] of [
    [col1X, sign1Img, sign1Name, sign1Title],
    [col2X, sign2Img, sign2Name, sign2Title],
  ] as [number, string | undefined, string, string][]) {
    if (!name && !title && !imgData) continue;
    let sigY = y0 + 6;
    if (imgData) {
      try { doc.addImage(imgData, 'PNG', colX, sigY, 42, 16); sigY += 18; } catch { sigY += 16; }
    } else { sigY += 16; }
    doc.setDrawColor(...DB);
    doc.setLineWidth(0.6);
    doc.line(colX, sigY, colX + 70, sigY);
    sigY += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text(name || '________________________________', colX, sigY);
    sigY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text(title || '', colX, sigY);
    sigY += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Date: ___________________________', colX, sigY);
    sigY += 2;
    if (sigY > maxY) maxY = sigY;
  }
  return maxY + 4;
}

// ─────────────────────────────────────────────────────────────────────────────
//  DOCUMENT 2: Service Quotation
// ─────────────────────────────────────────────────────────────────────────────
export async function generateQuotationPdf(quotation: Quotation): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  let logoDataUrl: string | null = null;
  try { logoDataUrl = await loadImg('/logo.png'); } catch { /* skip */ }

  await drawWatermark(doc, logoDataUrl);
  const afterHeaderY = drawHeader(doc, logoDataUrl, 'OFFICIAL', 'SERVICE QUOTATION');
  let curY = afterHeaderY + 2;

  const metaFields: [string, string][] = [
    ['Quote No',     quotation.quoteNumber    || '—'],
    ['Date',         quotation.date            || '—'],
    ['Valid Until',  quotation.validUntil      || '—'],
    ['Status',       (quotation.status || 'draft').toUpperCase()],
    ['Client',       quotation.client          || '—'],
    ['Client Phone', quotation.clientPhone     || '—'],
    ['Client Email', quotation.clientEmail     || '—'],
    ['Address',      quotation.clientAddress   || '—'],
  ];

  const cellH   = 6.5;
  const col1W   = 32;
  const colValW = (A4_W - 2 * MARGIN - col1W * 2) / 2;

  metaFields.forEach(([label, val], fi) => {
    const col  = fi % 2;
    const row  = Math.floor(fi / 2);
    const cellX = MARGIN + col * (col1W + colValW);
    const cellY = curY + row * cellH;
    doc.setFillColor(...DB);
    doc.rect(cellX, cellY, col1W, cellH - 0.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(label, cellX + 2, cellY + cellH - 2);
    doc.setFillColor(245, 248, 255);
    doc.rect(cellX + col1W, cellY, colValW, cellH - 0.5, 'F');
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');
    const displayVal = doc.splitTextToSize(val, colValW - 3);
    doc.text(displayVal[0] || '', cellX + col1W + 2, cellY + cellH - 2);
  });

  curY += Math.ceil(metaFields.length / 2) * cellH + 4;

  const samples = quotation.samples || [];
  if (samples.length > 0) {
    doc.setFillColor(...OB);
    doc.rect(MARGIN, curY, A4_W - 2 * MARGIN, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Samples:  ' + samples.join('  |  '), MARGIN + 2, curY + 4.2);
    curY += 8;
  }

  const tableBody = quotation.items.map((item, idx) => [
    String(idx + 1),
    item.parameterName,
    String(item.quantity),
    kwacha(item.unitPrice),
    kwacha(item.tax),
    kwacha(item.amount),
  ]);

  autoTable(doc, {
    head: [['#', 'Description', 'Qty', 'Unit Price (K)', 'VAT 16% (K)', 'Subtotal (K)']],
    body: tableBody,
    startY: curY,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, overflow: 'linebreak' },
    headStyles: { fillColor: OB, textColor: [255,255,255] as [number,number,number], fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 72 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [235, 240, 248] as [number,number,number] },
    rowPageBreak: 'auto',
    didAddPage() {
      void (async () => { await drawWatermark(doc, logoDataUrl); })();
      doc.setFillColor(...DB);
      doc.rect(0, 0, A4_W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(`NKANA WATER SUPPLY AND SANITATION COMPANY  —  ${quotation.quoteNumber || ''}  (continued)`, A4_W / 2, 5.5, { align: 'center' });
    },
  });

  const tableEndY = (doc as any).lastAutoTable?.finalY ?? curY + 40;
  const totalsBlockW = 90;
  const totalsX      = A4_W - MARGIN - totalsBlockW;
  let   ty           = tableEndY + 6;

  if (ty + 30 > A4_H - 15) {
    doc.addPage();
    await drawWatermark(doc, logoDataUrl);
    doc.setFillColor(...DB);
    doc.rect(0, 0, A4_W, 8, 'F');
    ty = 14;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Subtotal', totalsX, ty);
  doc.text(kwacha(quotation.subtotal), A4_W - MARGIN, ty, { align: 'right' });
  ty += 6;
  doc.setTextColor(180, 80, 0);
  doc.text('Total VAT (16%)', totalsX, ty);
  doc.text(kwacha(quotation.totalTax), A4_W - MARGIN, ty, { align: 'right' });
  ty += 6;
  doc.setFillColor(...DB);
  doc.roundedRect(totalsX - 4, ty - 4, totalsBlockW + 4 + MARGIN, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('GRAND TOTAL', totalsX, ty + 4);
  doc.text(kwacha(quotation.totalAmount), A4_W - MARGIN, ty + 4, { align: 'right' });
  ty += 16;

  if (ty + 55 > A4_H - 15) {
    doc.addPage();
    await drawWatermark(doc, logoDataUrl);
    doc.setFillColor(...DB);
    doc.rect(0, 0, A4_W, 8, 'F');
    ty = 14;
  }

  drawSignatories(
    doc,
    quotation.sign1Name, quotation.sign1Title, quotation.sign1SignatureImage,
    quotation.sign2Name, quotation.sign2Title, quotation.sign2SignatureImage,
    ty
  );

  drawFooters(doc, doc.getNumberOfPages(), 'NWSC — OFFICIAL');

  const client = sanitise(quotation.client);
  const date   = (quotation.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const qno    = (quotation.quoteNumber || 'QT').replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`QT_${client}_${date}_${qno}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  COA CSV EXPORT  (UTF-8 BOM for Excel symbol compatibility)
// ─────────────────────────────────────────────────────────────────────────────
export function exportCOACSV(certificate: Certificate): void {
  const BOM = '\uFEFF';
  const samples = certificate.samples || [];

  const headerRow = [
    'Certificate No', 'Client', 'Date Reported', 'Sample Type',
    'Sample Source', 'Parameter', 'Unit', 'Limit',
    ...samples.map((s, i) => s || `Sample ${i + 1}`)
  ];

  const bodyRows = certificate.tableData
    .filter(row => !row.section)
    .map(row => [
      certificate.certNumber  || '',
      certificate.client       || '',
      certificate.dateReported || '',
      certificate.sampleType   || '',
      certificate.location     || '',
      row.name  || '',
      row.unit  || '',
      row.limit || '',
      ...samples.map((_, si) => row.results?.[si] ?? ''),
    ]);

  const csvRows = [headerRow, ...bodyRows];
  const csvContent = BOM + csvRows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const clientClean = sanitise(certificate.client);
  const dateClean   = (certificate.dateReported || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const certClean   = (certificate.certNumber   || 'COA').replace(/[^A-Za-z0-9-]/g, '');
  const filename    = `COA_${clientClean}_${dateClean}_${certClean}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
//  QUOTATION CSV EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export function exportQuotationCSV(quotation: Quotation): void {
  const BOM = '\uFEFF';

  const headerRow = [
    'Quote No', 'Date', 'Valid Until', 'Client', 'Address',
    '#', 'Description', 'Qty', 'Unit Price (K)', 'VAT (K)', 'Subtotal (K)', 'Grand Total (K)'
  ];

  const bodyRows = quotation.items.map((item, idx) => [
    quotation.quoteNumber    || '',
    quotation.date            || '',
    quotation.validUntil      || '',
    quotation.client          || '',
    quotation.clientAddress   || '',
    String(idx + 1),
    item.parameterName,
    String(item.quantity),
    item.unitPrice.toFixed(2),
    item.tax.toFixed(2),
    item.amount.toFixed(2),
    idx === 0 ? quotation.totalAmount.toFixed(2) : '',
  ]);

  const csvRows = [headerRow, ...bodyRows];
  const csvContent = BOM + csvRows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const clientClean = sanitise(quotation.client);
  const dateClean   = (quotation.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const qnoClean    = (quotation.quoteNumber || 'QT').replace(/[^A-Za-z0-9-]/g, '');
  const filename    = `QT_${clientClean}_${dateClean}_${qnoClean}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
