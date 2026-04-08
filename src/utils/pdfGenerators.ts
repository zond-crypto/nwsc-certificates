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
 * Key features:
 *   • Full NWSC brand identity on every page (Ocean Blue #0077B6 palette)
 *   • Semi-transparent NWSC watermark on every page body (~8% opacity)
 *   • Multi-sample COA pagination: max 6 sample columns per A4 page; the
 *     Parameter / Unit / Limit columns repeat on every continuation page
 *   • Proper Unicode rendering for ≤, –, <, °, µ, ² ³ subscripts via UTF-8
 *   • Alternating white / #ADE8F4 row fill
 *   • Signatories section (last page only) with signature images
 *   • Footer: NWSC — Certified | Bigger, Better, Smarter | Page X of Y
 *   • UTF-8 BOM on all CSV exports so Excel decodes special characters
 * ─────────────────────────────────────────────────────────────────────────────
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Certificate, Quotation } from '../types';
import { buildDocumentFilename } from './fileNaming';

// ─── Brand constants ──────────────────────────────────────────────────────────
const OCEAN_BLUE_R = 0;
const OCEAN_BLUE_G = 119;
const OCEAN_BLUE_B = 182;       // #0077B6

const DARK_BLUE_R  = 0;
const DARK_BLUE_G  = 61;
const DARK_BLUE_B  = 122;       // #003D7A

const GOLD_R = 232;
const GOLD_G = 180;
const GOLD_B = 0;               // #E8B400

const LIGHT_BLUE_R = 173;
const LIGHT_BLUE_G = 232;
const LIGHT_BLUE_B = 244;       // #ADE8F4  – alternating row tint

const A4_W = 210;   // mm
const A4_H = 297;   // mm
const MARGIN = 14;  // mm side margin

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Load an image URL into a base64 data-URI for jsPDF.addImage() */
function loadImageAsDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth  || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject('No canvas context'); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject('Image load failed: ' + src);
  });
}

/** Format Zambian Kwacha */
function kwacha(val: number): string {
  return `K ${val.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Sanitise client name for filenames */
function sanitiseFilename(s: string): string {
  return (s || 'Unknown').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED: draw the NWSC watermark on the current page
// ─────────────────────────────────────────────────────────────────────────────
async function drawWatermark(doc: jsPDF, logoDataUrl: string | null): Promise<void> {
  doc.saveGraphicsState();
  // @ts-ignore – jsPDF GState exists at runtime
  (doc as any).setGState(new (doc as any).GState({ opacity: 0.07 }));

  if (logoDataUrl) {
    // Large centred logo watermark
    const size = 100; // mm
    const x = (A4_W - size) / 2;
    const y = (A4_H - size) / 2;
    doc.addImage(logoDataUrl, 'PNG', x, y, size, size);
  } else {
    // Fallback text watermark
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(72);
    doc.setTextColor(180, 180, 180);
    doc.text('NWSC', A4_W / 2, A4_H / 2, { align: 'center', angle: 45 });
  }

  doc.restoreGraphicsState();
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED: draw the branded header block
//  Returns the Y position immediately below the header
// ─────────────────────────────────────────────────────────────────────────────
function drawHeader(
  doc: jsPDF,
  logoDataUrl: string | null,
  badgeLabel: string,   // e.g. "CERTIFIED" or "OFFICIAL"
  documentTitle: string // e.g. "WATER ANALYSIS CERTIFICATE"
): number {
  const headerH = 42; // mm

  // ── Background fill ──
  doc.setFillColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
  doc.rect(0, 0, A4_W, headerH, 'F');

  // ── Gold accent line ──
  doc.setDrawColor(GOLD_R, GOLD_G, GOLD_B);
  doc.setLineWidth(1.2);
  doc.line(0, headerH, A4_W, headerH);

  // ── Logo (top-left) ──
  if (logoDataUrl) {
    // White circle background
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(MARGIN - 1, 3, 22, 22, 2, 2, 'F');
    doc.addImage(logoDataUrl, 'PNG', MARGIN, 4, 20, 20);
  }

  // ── Company name (centre) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('NKANA WATER SUPPLY AND SANITATION COMPANY', A4_W / 2, 10, { align: 'center' });

  // ── Address & contacts ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(200, 220, 240);
  doc.text('Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia', A4_W / 2, 15, { align: 'center' });
  doc.text('Tel: +260 212 222488 / 221099 / 0971 223 458  |  Fax: +260 212 222490', A4_W / 2, 19.5, { align: 'center' });
  doc.text('headoffice@nwsc.com.zm  |  www.nwsc.zm', A4_W / 2, 24, { align: 'center' });

  // ── Badge (top-right) ──
  const badgeW = 28;
  const badgeX = A4_W - MARGIN - badgeW;
  doc.setFillColor(OCEAN_BLUE_R, OCEAN_BLUE_G, OCEAN_BLUE_B);
  doc.roundedRect(badgeX, 4, badgeW, 10, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(badgeLabel, badgeX + badgeW / 2, 10.5, { align: 'center' });

  // ── Document title ──
  doc.setFillColor(OCEAN_BLUE_R, OCEAN_BLUE_G, OCEAN_BLUE_B);
  doc.rect(0, headerH + 1, A4_W, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(documentTitle, A4_W / 2, headerH + 7.5, { align: 'center' });

  return headerH + 13; // Y below the title bar
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED: draw the footer on every page
// ─────────────────────────────────────────────────────────────────────────────
function drawFooters(doc: jsPDF, totalPages: number, leftLabel: string): void {
  const footerY = A4_H - 8;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Footer rule
    doc.setDrawColor(OCEAN_BLUE_R, OCEAN_BLUE_G, OCEAN_BLUE_B);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, footerY - 2, A4_W - MARGIN, footerY - 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);

    // Left: classification
    doc.text(leftLabel, MARGIN, footerY + 1);

    // Centre: slogan
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
    doc.text('Bigger, Better, Smarter', A4_W / 2, footerY + 1, { align: 'center' });

    // Right: page number
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${totalPages}`, A4_W - MARGIN, footerY + 1, { align: 'right' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED: draw the signatories block at position Y
//  Returns the Y position after the block
// ─────────────────────────────────────────────────────────────────────────────
function drawSignatories(
  doc: jsPDF,
  sign1Name: string, sign1Title: string, sign1Img?: string,
  sign2Name: string, sign2Title: string, sign2Img?: string,
  startY?: number
): number {
  // Determine start position
  const y0 = startY ?? ((doc as any).lastAutoTable?.finalY ?? 210) + 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
  doc.text('AUTHORISED SIGNATORIES', MARGIN, y0);

  // Divider
  doc.setDrawColor(OCEAN_BLUE_R, OCEAN_BLUE_G, OCEAN_BLUE_B);
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

    // Signature image
    if (imgData) {
      try {
        doc.addImage(imgData, 'PNG', colX, sigY, 42, 16);
        sigY += 18;
      } catch { /* skip corrupt image */ }
    } else {
      sigY += 16; // reserved space
    }

    // Signature line
    doc.setDrawColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
    doc.setLineWidth(0.6);
    doc.line(colX, sigY, colX + 70, sigY);
    sigY += 4;

    // Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text(name || '________________________________', colX, sigY);
    sigY += 4;

    // Title
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text(title || '', colX, sigY);
    sigY += 4;

    // Date line
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
//  DOCUMENT 1: Certificate of Analysis (COA)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates and downloads a fully branded, multi-page COA PDF.
 *
 * Multi-sample pagination strategy:
 *   – leftmost 3 columns are always: Parameter | Unit | Limit
 *   – A4 page width (210mm) minus margins and those 3 fixed columns leaves
 *     room for exactly MAX_SAMPLE_COLS (6) sample columns per page
 *   – Excess samples flow to continuation pages with header + fixed cols repeated
 */
export async function generateCOAPdf(certificate: Certificate): Promise<void> {
  const MAX_SAMPLE_COLS = 6;  // sample columns per page
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });

  // ── Load logo ──────────────────────────────────────────────────────────────
  let logoDataUrl: string | null = null;
  try { logoDataUrl = await loadImageAsDataUrl('/logo.png'); } catch { /* skip */ }

  // ── Build sample page groups ───────────────────────────────────────────────
  const samples = certificate.samples || [];
  const sampleGroups: string[][] = [];
  for (let i = 0; i < Math.max(samples.length, 1); i += MAX_SAMPLE_COLS) {
    sampleGroups.push(samples.slice(i, i + MAX_SAMPLE_COLS));
  }

  // ── Filter out section headers from "data" rows for the table body ─────────
  // We keep sections as their own special rows (see below)
  const allRows = certificate.tableData;

  let pdfPageIndex = 0; // tracks absolute PDF pages across all sample-groups

  for (let groupIdx = 0; groupIdx < sampleGroups.length; groupIdx++) {
    const sampleGroup = sampleGroups[groupIdx];
    const globalSampleStartIdx = groupIdx * MAX_SAMPLE_COLS;

    if (groupIdx > 0) {
      doc.addPage();
    }

    // ── Watermark (page will be filled later with footer) ─────────────────
    await drawWatermark(doc, logoDataUrl);

    // ── Header ────────────────────────────────────────────────────────────
    const afterHeaderY = drawHeader(doc, logoDataUrl, 'CERTIFIED', 'WATER ANALYSIS CERTIFICATE');
    let curY = afterHeaderY + 2;

    // ── Certificate metadata grid ─────────────────────────────────────────
    // Draw a 2-col info table without depending on autoTable
    const metaFields: [string, string][] = [
      ['Certificate No', certificate.certNumber || '—'],
      ['Client',         certificate.client      || '—'],
      ['Date Reported',  certificate.dateReported || '—'],
      ['Sample Type',    certificate.sampleType   || '—'],
      ['Sample Source',  certificate.location     || '—'],
      ['Date Sampled',   certificate.dateSampled  || '—'],
    ];

    const cellH  = 6.5;
    const col1W  = 32;
    const colValW = (A4_W - 2 * MARGIN - col1W * 2) / 2;
    let mx = MARGIN;
    let my = curY;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    metaFields.forEach(([label, val], fi) => {
      const col = fi % 2;
      const row = Math.floor(fi / 2);
      const cellX = mx + col * (col1W + colValW);
      const cellY = my + row * cellH;

      // Label bg
      doc.setFillColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
      doc.rect(cellX, cellY, col1W, cellH - 0.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text(label, cellX + 2, cellY + cellH - 2);

      // Value bg
      doc.setFillColor(245, 248, 255);
      doc.rect(cellX + col1W, cellY, colValW, cellH - 0.5, 'F');
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'normal');
      const displayVal = doc.splitTextToSize(val, colValW - 3);
      doc.text(displayVal[0] || '', cellX + col1W + 2, cellY + cellH - 2);
    });

    curY = my + Math.ceil(metaFields.length / 2) * cellH + 4;

    // ── Samples label bar (current group) ─────────────────────────────────
    if (sampleGroups.length > 1) {
      doc.setFillColor(OCEAN_BLUE_R, OCEAN_BLUE_G, OCEAN_BLUE_B);
      doc.rect(MARGIN, curY, A4_W - 2 * MARGIN, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      const label = `Samples ${globalSampleStartIdx + 1}–${globalSampleStartIdx + sampleGroup.length} of ${samples.length}  [Page group ${groupIdx + 1} of ${sampleGroups.length}]`;
      doc.text(label, MARGIN + 2, curY + 4);
      curY += 7;
    }

    // ── Parameters table ──────────────────────────────────────────────────
    const limitHeader = certificate.sampleType === 'Drinking Water' ? 'WHO / ZABS Limit' :
                        certificate.sampleType === 'Wastewater'     ? 'ZEMA Limit'       : 'Limit';

    // Build header row
    const tableHead = [['#', 'Parameter', 'Unit', limitHeader, ...sampleGroup]];

    // Build body rows — section headers become a single wide cell
    let paramCounter = 0;
    const tableBody: (string | object)[][] = [];
    const sectionRowIdxs: number[] = [];

    allRows.forEach((row) => {
      if (row.section) {
        sectionRowIdxs.push(tableBody.length);
        tableBody.push([{ content: row.section || '', colSpan: 4 + sampleGroup.length }]);
      } else {
        paramCounter++;
        const resultCols = sampleGroup.map((_, si) => {
          const absIdx = globalSampleStartIdx + si;
          return row.results?.[absIdx] ?? '—';
        });
        tableBody.push([
          String(paramCounter),
          row.name  || '',
          row.unit  || '',
          row.limit || '',
          ...resultCols,
        ]);
      }
    });

    // Column widths
    const fixedW = {
      0: 8,    // #
      1: 48,   // Parameter
      2: 18,   // Unit
      3: 26,   // Limit
    };
    const usedW = fixedW[0] + fixedW[1] + fixedW[2] + fixedW[3];
    const remainW = A4_W - 2 * MARGIN - usedW;
    const sampleColW = sampleGroup.length > 0 ? remainW / sampleGroup.length : remainW;

    const colStyles: Record<number, object> = {
      0: { cellWidth: fixedW[0], halign: 'center' },
      1: { cellWidth: fixedW[1] },
      2: { cellWidth: fixedW[2], halign: 'center' },
      3: { cellWidth: fixedW[3], halign: 'center' },
    };
    for (let s = 0; s < sampleGroup.length; s++) {
      colStyles[4 + s] = { cellWidth: sampleColW, halign: 'center' };
    }

    autoTable(doc, {
      head: tableHead,
      body: tableBody,
      startY: curY,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B] as [number,number,number],
        textColor: [255, 255, 255] as [number,number,number],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
      },
      columnStyles: colStyles,
      alternateRowStyles: {
        fillColor: [LIGHT_BLUE_R, LIGHT_BLUE_G, LIGHT_BLUE_B] as [number,number,number],
      },
      rowPageBreak: 'auto',
      // Style section-header rows
      didParseCell(data) {
        if (data.section === 'body' && sectionRowIdxs.includes(data.row.index)) {
          data.cell.styles.fillColor = [OCEAN_BLUE_R, OCEAN_BLUE_G, OCEAN_BLUE_B] as [number,number,number];
          data.cell.styles.textColor = [255, 255, 255] as [number,number,number];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize  = 7;
        }
      },
      // Add watermark on every new page autoTable creates
      didAddPage(data) {
        void (async () => { await drawWatermark(doc, logoDataUrl); })();
        // Re-draw the light header strip for continuation pages
        doc.setFillColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
        doc.rect(0, 0, A4_W, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(
          `NKANA WATER SUPPLY AND SANITATION COMPANY  —  ${certificate.certNumber || ''}  (continued)`,
          A4_W / 2, 5.5, { align: 'center' }
        );
      },
    });

    pdfPageIndex = doc.getNumberOfPages();
  }

  // ── Signatories (last page only) ──────────────────────────────────────────
  doc.setPage(doc.getNumberOfPages());
  const lastTableFinalY = (doc as any).lastAutoTable?.finalY ?? 220;

  // Check if signatories fit on the current page; if not, add a new page
  const spaceNeeded = 55; // mm for signatories block
  if (lastTableFinalY + spaceNeeded > A4_H - 15) {
    doc.addPage();
    await drawWatermark(doc, logoDataUrl);
    // Minimal continuation header
    doc.setFillColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
    doc.rect(0, 0, A4_W, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(`NKANA WATER SUPPLY AND SANITATION COMPANY  —  ${certificate.certNumber || ''}`, A4_W / 2, 5.5, { align: 'center' });
    drawSignatories(
      doc,
      certificate.sign1Name, certificate.sign1Title, certificate.sign1SignatureImage,
      certificate.sign2Name, certificate.sign2Title, certificate.sign2SignatureImage,
      14
    );
  } else {
    drawSignatories(
      doc,
      certificate.sign1Name, certificate.sign1Title, certificate.sign1SignatureImage,
      certificate.sign2Name, certificate.sign2Title, certificate.sign2SignatureImage,
    );
  }

  // ── Footers on ALL pages ───────────────────────────────────────────────────
  drawFooters(doc, doc.getNumberOfPages(), 'NWSC — CERTIFIED');

  // ── Save ──────────────────────────────────────────────────────────────────
  const client = sanitiseFilename(certificate.client);
  const date   = (certificate.dateReported || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const cert   = (certificate.certNumber  || 'COA').replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`COA_${client}_${date}_${cert}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  DOCUMENT 2: Service Quotation
// ─────────────────────────────────────────────────────────────────────────────

export async function generateQuotationPdf(quotation: Quotation): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });

  // ── Load logo ─────────────────────────────────────────────────────────────
  let logoDataUrl: string | null = null;
  try { logoDataUrl = await loadImageAsDataUrl('/logo.png'); } catch { /* skip */ }

  // ── Page 1 watermark ──────────────────────────────────────────────────────
  await drawWatermark(doc, logoDataUrl);

  // ── Header ────────────────────────────────────────────────────────────────
  const afterHeaderY = drawHeader(doc, logoDataUrl, 'OFFICIAL', 'SERVICE QUOTATION');
  let curY = afterHeaderY + 2;

  // ── Metadata grid ─────────────────────────────────────────────────────────
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

    doc.setFillColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
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

  // ── Samples strip (if any) ────────────────────────────────────────────────
  const samples = quotation.samples || [];
  if (samples.length > 0) {
    doc.setFillColor(OCEAN_BLUE_R, OCEAN_BLUE_G, OCEAN_BLUE_B);
    doc.rect(MARGIN, curY, A4_W - 2 * MARGIN, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Samples:  ' + samples.join('  |  '), MARGIN + 2, curY + 4.2);
    curY += 8;
  }

  // ── Items table ───────────────────────────────────────────────────────────
  const formatCurrency = kwacha;

  const tableBody = quotation.items.map((item, idx) => [
    String(idx + 1),
    item.parameterName,
    String(item.quantity),
    formatCurrency(item.unitPrice),
    formatCurrency(item.tax),
    formatCurrency(item.amount),
  ]);

  autoTable(doc, {
    head: [['#', 'Description', 'Qty', 'Unit Price (K)', 'VAT 16% (K)', 'Subtotal (K)']],
    body: tableBody,
    startY: curY,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [OCEAN_BLUE_R, OCEAN_BLUE_G, OCEAN_BLUE_B] as [number,number,number],
      textColor: [255, 255, 255] as [number,number,number],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 72 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [LIGHT_BLUE_R, LIGHT_BLUE_G, LIGHT_BLUE_B] as [number,number,number],
    },
    rowPageBreak: 'auto',
    didAddPage() {
      void (async () => { await drawWatermark(doc, logoDataUrl); })();
      // Minimal continuation header
      doc.setFillColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
      doc.rect(0, 0, A4_W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(
        `NKANA WATER SUPPLY AND SANITATION COMPANY  —  ${quotation.quoteNumber || ''}  (continued)`,
        A4_W / 2, 5.5, { align: 'center' }
      );
    },
  });

  // ── Totals summary block ──────────────────────────────────────────────────
  const tableEndY = (doc as any).lastAutoTable?.finalY ?? curY + 40;
  const totalsBlockW = 90;
  const totalsX      = A4_W - MARGIN - totalsBlockW;
  let   ty           = tableEndY + 6;

  // Check if totals fit; if not, new page
  if (ty + 30 > A4_H - 15) {
    doc.addPage();
    await drawWatermark(doc, logoDataUrl);
    doc.setFillColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
    doc.rect(0, 0, A4_W, 8, 'F');
    ty = 14;
  }

  // Subtotal row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Subtotal', totalsX, ty);
  doc.text(formatCurrency(quotation.subtotal), A4_W - MARGIN, ty, { align: 'right' });
  ty += 6;

  // VAT row
  doc.setTextColor(180, 80, 0);
  doc.text('Total VAT (16%)', totalsX, ty);
  doc.text(formatCurrency(quotation.totalTax), A4_W - MARGIN, ty, { align: 'right' });
  ty += 6;

  // Grand Total — highlighted box
  doc.setFillColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
  doc.roundedRect(totalsX - 4, ty - 4, totalsBlockW + 4 + MARGIN, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('GRAND TOTAL', totalsX, ty + 4);
  doc.text(formatCurrency(quotation.totalAmount), A4_W - MARGIN, ty + 4, { align: 'right' });
  ty += 16;

  // ── Signatories ───────────────────────────────────────────────────────────
  const signSpace = 55;
  if (ty + signSpace > A4_H - 15) {
    doc.addPage();
    await drawWatermark(doc, logoDataUrl);
    doc.setFillColor(DARK_BLUE_R, DARK_BLUE_G, DARK_BLUE_B);
    doc.rect(0, 0, A4_W, 8, 'F');
    ty = 14;
  }

  drawSignatories(
    doc,
    quotation.sign1Name, quotation.sign1Title, quotation.sign1SignatureImage,
    quotation.sign2Name, quotation.sign2Title, quotation.sign2SignatureImage,
    ty
  );

  // ── Footers ───────────────────────────────────────────────────────────────
  drawFooters(doc, doc.getNumberOfPages(), 'NWSC — OFFICIAL');

  // ── Save ──────────────────────────────────────────────────────────────────
  const client = sanitiseFilename(quotation.client);
  const date   = (quotation.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const qno    = (quotation.quoteNumber || 'QT').replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`QT_${client}_${date}_${qno}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  COA CSV EXPORT
//  UTF-8 BOM included so Excel reads ≤ µ ° ² ³ correctly
// ─────────────────────────────────────────────────────────────────────────────
export function exportCOACSV(certificate: Certificate): void {
  const BOM = '\uFEFF'; // UTF-8 byte-order mark

  const samples = certificate.samples || [];

  // Header row: fixed cols + one col per sample
  const headerRow = [
    'Certificate No', 'Client', 'Date Reported', 'Sample Type',
    'Sample Source', 'Parameter', 'Unit', 'Limit',
    ...samples.map((s, i) => s || `Sample ${i + 1}`)
  ];

  // Body rows: one row per parameter (skip section headers)
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

  // File name: COA_[ClientName]_[Date]_[CertNo].csv
  const clientClean = sanitiseFilename(certificate.client);
  const dateClean   = (certificate.dateReported || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const certClean   = (certificate.certNumber   || 'COA').replace(/[^A-Za-z0-9-]/g, '');
  const filename    = `COA_${clientClean}_${dateClean}_${certClean}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
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
    idx === 0 ? quotation.totalAmount.toFixed(2) : '', // Grand total on first row only
  ]);

  const csvRows = [headerRow, ...bodyRows];
  const csvContent = BOM + csvRows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const clientClean = sanitiseFilename(quotation.client);
  const dateClean   = (quotation.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const qnoClean    = (quotation.quoteNumber || 'QT').replace(/[^A-Za-z0-9-]/g, '');
  const filename    = `QT_${clientClean}_${dateClean}_${qnoClean}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
