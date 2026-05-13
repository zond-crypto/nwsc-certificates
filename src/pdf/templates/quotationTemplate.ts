import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quotation } from '../../types';
import { A4_W, A4_H, MARGIN, DB, OB, GD } from '../constants';
import { loadImg } from '../utils/imageLoader';
import { sanitizeFilename, formatDateString, formatKwacha } from '../utils/formatters';
import { drawSharedHeader } from '../components/header';
import { drawSharedMetadata } from '../components/metaSection';
import { drawSharedWatermark } from '../components/watermark';
import { drawSharedFooters } from '../components/footer';
import { drawSharedSignatories } from '../components/signatures';

// ─── Status Badge ──────────────────────────────────────────────────────────────
function drawStatusBadge(doc: jsPDF, status: string | undefined, x: number, y: number): void {
  const rawStatus = (status || 'VALID').toUpperCase();

  type StatusKey = 'VALID' | 'EXPIRED' | 'PAID' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'SENT' | 'DRAFT';
  type RGB = [number, number, number];

  const CONFIG: Record<StatusKey, { bg: RGB; text: RGB; label: string }> = {
    VALID:    { bg: [16, 124, 65],    text: [255,255,255], label: 'VALID'    },
    ACCEPTED: { bg: [16, 124, 65],    text: [255,255,255], label: 'ACCEPTED' },
    PAID:     { bg: [11,  78, 138],   text: [255,255,255], label: 'PAID'     },
    SENT:     { bg: [11,  78, 138],   text: [255,255,255], label: 'SENT'     },
    PENDING:  { bg: [184,  92,   0],  text: [255,255,255], label: 'PENDING'  },
    DRAFT:    { bg: [130, 130, 130],  text: [255,255,255], label: 'DRAFT'    },
    EXPIRED:  { bg: [180,  28,  28],  text: [255,255,255], label: 'EXPIRED'  },
    REJECTED: { bg: [180,  28,  28],  text: [255,255,255], label: 'REJECTED' },
  };

  const cfg = CONFIG[rawStatus as StatusKey] ?? CONFIG.VALID;

  const BW = 22;
  const BH = 7;
  doc.setFillColor(...cfg.bg);
  (doc as any).roundedRect(x, y, BW, BH, 2, 2, 'F');
  doc.setTextColor(...cfg.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text(cfg.label, x + BW / 2, y + 4.7, { align: 'center' });
}

// ─── Auto-generated Reference ID ───────────────────────────────────────────────
function buildRefId(quotation: Quotation): string {
  const ym = (quotation.date || '').replace(/-/g, '').slice(0, 6) ||
    new Date().toISOString().slice(0, 7).replace('-', '');
  const seq = (quotation.quotationCode || quotation.quoteNumber || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `NWSC/SHEQ/QT/${ym}/${seq}`;
}

// ─── Main PDF generator ────────────────────────────────────────────────────────
export async function generateQuotationPdf(quotation: Quotation): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });

  let logo: string | null = null;
  try { logo = await loadImg('/logo.png'); } catch { /* skip */ }

  const quoteNo = quotation.quotationCode || quotation.quoteNumber || '—';
  const refId   = buildRefId(quotation);

  // ── Metadata rows (multiline-safe) ──────────────────────────────────────────
  const sampleDesc = (quotation.samples || []).join(' | ') || '—';
  const metaRows = [
    [
      { label: 'Client Name',     value: quotation.client       },
      { label: 'Client Contact',  value: quotation.clientPhone  },
      { label: 'Date Issued',     value: quotation.date         },
      { label: 'Valid Until',     value: quotation.validUntil, isWarning: true },
    ],
    [
      { label: 'Client Email',         value: quotation.clientEmail },
      { label: 'Sample Description',   value: sampleDesc           },
      { label: 'Reference ID',         value: refId                },
    ]
  ];

  await drawSharedWatermark(doc, logo);
  const afterHdr = drawSharedHeader(doc, logo, 'SERVICE QUOTATION', quoteNo, true);
  let curY = drawSharedMetadata(doc, metaRows, afterHdr);

  // ── Status badge (top-right corner, just below header) ──────────────────────
  drawStatusBadge(doc, quotation.status, A4_W - MARGIN - 22, afterHdr - 10);

  // ── Line items table ─────────────────────────────────────────────────────────
  const tableBody = quotation.items.map(item => [
    item.parameterName || '—',
    String(item.quantity),
    formatKwacha(item.unitPrice).replace('K ', ''),
    formatKwacha(item.tax).replace('K ', ''),
    formatKwacha(item.amount).replace('K ', ''),
  ]);

  autoTable(doc, {
    head: [['Parameter / Service', 'Qty', 'Unit Price (ZMW)', 'VAT (16%)', 'Total (ZMW)']],
    body: tableBody,
    startY: curY,
    margin: { left: MARGIN, right: MARGIN, bottom: 20 },
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      valign: 'middle',
      textColor: [51, 51, 51] as [number,number,number],
      lineColor: [221, 231, 244] as [number,number,number],
      lineWidth: 0.18,
    },
    headStyles: {
      fillColor: DB,
      textColor: [255,255,255] as [number,number,number],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    columnStyles: {
      0: { cellWidth: 'auto', halign: 'left'   },
      1: { cellWidth: 14,    halign: 'center'  },
      2: { cellWidth: 30,    halign: 'right'   },
      3: { cellWidth: 25,    halign: 'right'   },
      4: { cellWidth: 30,    halign: 'right', fontStyle: 'bold', textColor: DB },
    },
    alternateRowStyles: { fillColor: [245, 248, 253] as [number,number,number] },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const text = data.cell.text.join(' ');
        data.cell.styles.fontSize = text.includes(' ') ? 7.5 : 8;
      }
    },
  });

  const tableEndY = (doc as any).lastAutoTable?.finalY ?? curY + 40;
  let ty = tableEndY + 8;

  // ── Page break if needed ─────────────────────────────────────────────────────
  if (ty + 75 > A4_H - 20) {
    doc.addPage();
    await drawSharedWatermark(doc, logo);
    const ah = drawSharedHeader(doc, logo, 'SERVICE QUOTATION', quoteNo, true);
    ty = drawSharedMetadata(doc, metaRows, ah) + 8;
  }

  // ── Totals block (right-aligned, full financial hierarchy) ────────────────────
  const totalsW = (A4_W - 2 * MARGIN) * 0.50;
  const totalsX = A4_W - MARGIN - totalsW;

  // Card outline
  doc.setDrawColor(200, 218, 240);
  doc.setLineWidth(0.35);
  (doc as any).roundedRect(totalsX, ty - 4, totalsW, 32, 3, 3, 'S');

  const labelX  = totalsX + 4;
  const valueX  = A4_W - MARGIN - 4;
  let totY = ty;

  // Subtotal row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70);
  doc.text('Subtotal', labelX, totY);
  doc.text(formatKwacha(quotation.subtotal), valueX, totY, { align: 'right' });

  // Hairline
  doc.setDrawColor(220, 232, 246);
  doc.setLineWidth(0.18);
  doc.line(totalsX + 2, totY + 3, totalsX + totalsW - 2, totY + 3);
  totY += 8;

  // VAT row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...GD);
  doc.text('Total VAT (16%)', labelX, totY);
  doc.text(formatKwacha(quotation.totalTax), valueX, totY, { align: 'right' });

  // Hairline before grand total
  doc.setDrawColor(200, 218, 240);
  doc.setLineWidth(0.5);
  doc.line(totalsX + 2, totY + 3.5, totalsX + totalsW - 2, totY + 3.5);
  totY += 6;

  // Grand total bar
  doc.setFillColor(...DB);
  (doc as any).roundedRect(totalsX, totY, totalsW, 11, 0, 0, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('GRAND TOTAL', labelX, totY + 7.5);
  doc.text(formatKwacha(quotation.totalAmount), valueX, totY + 7.5, { align: 'right' });

  ty = totY + 18;

  // ── Two-column info cards ─────────────────────────────────────────────────────
  const colW   = (A4_W - 2 * MARGIN - 8) / 2;
  const cardY  = ty;
  const cardMinH = 40;

  // Terms card (left)
  doc.setFillColor(...DB);
  (doc as any).roundedRect(MARGIN, cardY, colW, 8, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TERMS & CONDITIONS', MARGIN + colW / 2, cardY + 5.5, { align: 'center' });

  doc.setDrawColor(...DB);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, cardY + 8, colW, cardMinH, 'S');

  const terms = [
    '1. Payment is required prior to testing.',
    `2. Quotation valid until ${quotation.validUntil || '—'}.`,
    '3. Prices include 16% VAT where applicable.',
    '4. NWSC reserves the right to revise prices.',
    '5. Results relate only to samples tested.',
  ];
  terms.forEach((tm, i) => {
    const numDot = tm.match(/^(\d+\.)\s/);
    const num    = numDot ? numDot[1] : '';
    const body   = numDot ? tm.slice(num.length + 1) : tm;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...DB);
    doc.text(num, MARGIN + 3, cardY + 14 + i * 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(68, 68, 68);
    doc.text(body, MARGIN + 7, cardY + 14 + i * 5.5, { maxWidth: colW - 10 });
  });

  // Validity card (right)
  const validX = MARGIN + colW + 8;
  doc.setFillColor(...GD);
  (doc as any).roundedRect(validX, cardY, colW, 8, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VALIDITY NOTICE', validX + colW / 2, cardY + 5.5, { align: 'center' });

  doc.setDrawColor(...GD);
  doc.rect(validX, cardY + 8, colW, cardMinH, 'S');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(85, 85, 85);
  doc.text('This quotation expires on', validX + colW / 2, cardY + 15, { align: 'center' });

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GD);
  doc.text(quotation.validUntil || '—', validX + colW / 2, cardY + 23, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(102, 102, 102);
  doc.text(
    'After this date, prices are subject to revision.\nContact NWSC SHEQ to renew.',
    validX + colW / 2, cardY + 30, { align: 'center' }
  );

  // ── Reference ID footer strip ─────────────────────────────────────────────────
  const stripY = cardY + cardMinH + 10;
  doc.setFillColor(240, 245, 251);
  doc.rect(MARGIN, stripY, A4_W - 2 * MARGIN, 6, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`Reference: ${refId}`, MARGIN + 3, stripY + 4);

  ty = stripY + 10;

  // ── Signatory section ──────────────────────────────────────────────────────────
  if (ty + 50 > A4_H - 20) {
    doc.addPage();
    await drawSharedWatermark(doc, logo);
    drawSharedHeader(doc, logo, 'SERVICE QUOTATION', quoteNo, true);
    ty = 70;
  }

  await drawSharedSignatories(
    doc,
    quotation.sign1Name, quotation.sign1Title, quotation.sign1SignatureImage,
    quotation.sign2Name, quotation.sign2Title, quotation.sign2SignatureImage,
    ty,
    true // isQuotation
  );

  drawSharedFooters(doc, doc.getNumberOfPages(), 'QT', 'Rev.1');

  const clientStr = sanitizeFilename(quotation.client);
  const dateStr   = formatDateString(quotation.date);
  const qnoStr    = quoteNo.replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`QT_${clientStr}_${dateStr}_${qnoStr}.pdf`);
}
