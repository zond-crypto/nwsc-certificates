import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quotation } from '../../types';
import { A4_W, A4_H, MARGIN, DB, OB } from '../constants';
import { loadImg } from '../utils/imageLoader';
import { sanitizeFilename, formatDateString, formatKwacha } from '../utils/formatters';
import { drawSharedHeader } from '../components/header';
import { drawSharedMetadata } from '../components/metaSection';
import { drawSharedWatermark } from '../components/watermark';
import { drawSharedFooters } from '../components/footer';
import { drawSharedSignatories } from '../components/signatures';

export async function generateQuotationPdf(quotation: Quotation): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });

  let logo: string | null = null;
  try { logo = await loadImg('/logo.png'); } catch { /* skip */ }

  const row1: [string, string][] = [
    ['Quotation No:', quotation.quotationCode || quotation.quoteNumber || '—'],
    ['Client Name:',  quotation.client         || '—'],
    ['Date Issued:',  quotation.date           || '—'],
    ['Valid Until:',  quotation.validUntil     || '—'],
  ];
  const row2: [string, string][] = [
    ['Client Contact:',  [quotation.clientPhone, quotation.clientEmail].filter(Boolean).join(' | ') || '—'],
  ];

  await drawSharedWatermark(doc, logo);
  const afterHdr = drawSharedHeader(doc, logo, 'QUOTATION');
  let curY = drawSharedMetadata(doc, row1, row2, afterHdr);

  const samples = quotation.samples || [];
  if (samples.length > 0) {
    doc.setFillColor(240, 249, 255);
    doc.rect(MARGIN, curY, A4_W - 2 * MARGIN, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...DB);
    doc.text('Samples:  ' + samples.join('  |  '), MARGIN + 4, curY + 5);
    curY += 12;
  }

  const tableBody = quotation.items.map((item, idx) => [
    item.parameterName,
    String(item.quantity),
    formatKwacha(item.unitPrice),
    formatKwacha(item.tax),
    formatKwacha(item.amount),
  ]);

  autoTable(doc, {
    head: [['Parameter', 'Qty', 'Unit Price', 'VAT (16%)', 'Total']],
    body: tableBody,
    startY: curY,
    margin: { left: MARGIN, right: MARGIN, bottom: 20 },
    theme: 'grid',
    styles: { 
      fontSize: 8, 
      cellPadding: 3, 
      valign: 'middle', 
      textColor: [30, 30, 30] as [number,number,number], 
      lineColor: [200, 200, 200] as [number,number,number], 
      lineWidth: 0.1 
    },
    headStyles: { 
      fillColor: DB, 
      textColor: [255,255,255] as [number,number,number], 
      fontStyle: 'bold', 
      fontSize: 8, 
      halign: 'center' 
    },
    columnStyles: {
      0: { cellWidth: 'auto', halign: 'left' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] as [number,number,number] },
  });

  const tableEndY = (doc as any).lastAutoTable?.finalY ?? curY + 40;
  let ty = tableEndY + 10;

  if (ty + 80 > A4_H - 15) {
    doc.addPage();
    await drawSharedWatermark(doc, logo);
    const ah = drawSharedHeader(doc, logo, 'QUOTATION');
    ty = drawSharedMetadata(doc, row1, row2, ah) + 10;
  }

  // Totals Section
  const totalsW = 80;
  const totalsX = A4_W - MARGIN - totalsW;
  
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal', totalsX + 2, ty);
  doc.text(formatKwacha(quotation.subtotal), A4_W - MARGIN - 2, ty, { align: 'right' });
  ty += 6;

  doc.setTextColor(180, 80, 0);
  doc.text('Total VAT (16%)', totalsX + 2, ty);
  doc.text(formatKwacha(quotation.totalTax), A4_W - MARGIN - 2, ty, { align: 'right' });
  ty += 8;

  doc.setFillColor(...DB);
  doc.rect(totalsX, ty - 5, totalsW, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('GRAND TOTAL', totalsX + 4, ty + 2.5);
  doc.text(formatKwacha(quotation.totalAmount), A4_W - MARGIN - 4, ty + 2.5, { align: 'right' });
  ty += 15;

  // Terms
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DB);
  doc.text('TERMS & CONDITIONS', MARGIN, ty);
  doc.setDrawColor(...DB);
  doc.setGState(new (doc as any).GState({ opacity: 0.2 }));
  doc.line(MARGIN, ty + 2, MARGIN + 40, ty + 2);
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text('1. Payment is required prior to testing.', MARGIN, ty + 8);
  doc.text(`2. Quotation valid until ${quotation.validUntil}.`, MARGIN, ty + 13);
  doc.text('3. Prices include 16% VAT where applicable.', MARGIN, ty + 18);
  ty += 30;

  await drawSharedSignatories(
    doc,
    quotation.sign1Name, quotation.sign1Title, quotation.sign1SignatureImage,
    quotation.sign2Name, quotation.sign2Title, quotation.sign2SignatureImage,
    ty
  );

  drawSharedFooters(doc, doc.getNumberOfPages());

  const clientStr = sanitizeFilename(quotation.client);
  const dateStr   = formatDateString(quotation.date);
  const qnoStr    = (quotation.quotationCode || quotation.quoteNumber || 'QT').replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`QT_${clientStr}_${dateStr}_${qnoStr}.pdf`);
}
