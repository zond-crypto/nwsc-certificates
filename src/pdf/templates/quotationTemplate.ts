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
    ['Quotation No:', quotation.quoteNumber    || '—'],
    ['Client Name:',  quotation.client         || '—'],
    ['Date Issued:',  quotation.date           || '—'],
    ['Valid Until:',  quotation.validUntil     || '—'],
  ];
  const row2: [string, string][] = [
    ['Prepared By:',     quotation.sign1Name     || '—'],
    ['Client Contact:',  quotation.clientPhone   || '—'],
  ];

  await drawSharedWatermark(doc, logo);
  const afterHdr = drawSharedHeader(doc, logo, 'QUOTATION');
  let curY = drawSharedMetadata(doc, row1, row2, afterHdr);

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
    "Test",
    String(item.quantity),
    formatKwacha(item.unitPrice),
    formatKwacha(item.amount),
  ]);

  autoTable(doc, {
    head: [['#', 'Description', 'Unit', 'Quantity', 'Unit Price', 'Total']],
    body: tableBody,
    startY: curY + 2,
    margin: { left: MARGIN, right: MARGIN, bottom: 15 },
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, overflow: 'linebreak', valign: 'middle', textColor: [20, 20, 20] as [number,number,number], lineColor: [180, 185, 195] as [number,number,number], lineWidth: 0.2 },
    headStyles: { fillColor: DB, textColor: [255,255,255] as [number,number,number], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 70, halign: 'left' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 36, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [235, 240, 248] as [number,number,number] },
    rowPageBreak: 'auto',
    didDrawPage: (data) => {
      void (async () => { await drawSharedWatermark(doc, logo); })();
      const ah = drawSharedHeader(doc, logo, 'QUOTATION');
      const am = drawSharedMetadata(doc, row1, row2, ah);
      data.settings.margin.top = am + 2;
    },
  });

  const tableEndY = (doc as any).lastAutoTable?.finalY ?? curY + 40;
  let ty = tableEndY + 6;

  const totalsBlockW = A4_W / 2 - MARGIN;
  const totalsX      = A4_W - MARGIN - totalsBlockW;

  if (ty + 55 > A4_H - 15) {
    doc.addPage();
    await drawSharedWatermark(doc, logo);
    const ah = drawSharedHeader(doc, logo, 'QUOTATION');
    ty = drawSharedMetadata(doc, row1, row2, ah) + 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...DB);
  doc.text('TERMS & CONDITIONS', MARGIN, ty);
  doc.setDrawColor(...OB);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, ty + 1.5, MARGIN + 60, ty + 1.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text('1. Payment is required prior to testing.', MARGIN, ty + 6);
  doc.text(`2. Quotation valid until ${quotation.validUntil}.`, MARGIN, ty + 10);
  doc.text('3. Prices include 16% VAT where applicable.', MARGIN, ty + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Subtotal', totalsX, ty);
  doc.text(formatKwacha(quotation.subtotal), A4_W - MARGIN, ty, { align: 'right' });
  ty += 6;

  doc.setTextColor(180, 80, 0);
  doc.text('Total VAT (16%)', totalsX, ty);
  doc.text(formatKwacha(quotation.totalTax), A4_W - MARGIN, ty, { align: 'right' });
  ty += 8;

  doc.setFillColor(...DB);
  doc.rect(totalsX - 4, ty - 5, totalsBlockW + 4, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('GRAND TOTAL', totalsX, ty + 3);
  doc.text(formatKwacha(quotation.totalAmount), A4_W - MARGIN - 2, ty + 3, { align: 'right' });
  ty += 16;

  if (ty + 60 > A4_H - 15) {
    doc.addPage();
    await drawSharedWatermark(doc, logo);
    const ah = drawSharedHeader(doc, logo, 'QUOTATION');
    ty = drawSharedMetadata(doc, row1, row2, ah) + 6;
  }

  drawSharedSignatories(
    doc,
    quotation.sign1Name, "Prepared By", quotation.sign1SignatureImage,
    quotation.sign2Name, "", quotation.sign2SignatureImage,
    ty + 10
  );

  drawSharedFooters(doc, doc.getNumberOfPages());

  const clientStr = sanitizeFilename(quotation.client);
  const dateStr   = formatDateString(quotation.date);
  const qnoStr    = (quotation.quoteNumber || 'QT').replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`QT_${clientStr}_${dateStr}_${qnoStr}.pdf`);
}
