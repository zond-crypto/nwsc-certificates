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

  const quoteNo = quotation.quotationCode || quotation.quoteNumber || '—';

  const metaRows = [
    [
      { label: 'Client Name', value: quotation.client },
      { label: 'Client Contact', value: quotation.clientPhone },
      { label: 'Date Issued', value: quotation.date },
      { label: 'Valid Until', value: quotation.validUntil, isWarning: true },
    ],
    [
      { label: 'Client Email', value: quotation.clientEmail },
      { label: 'Sample Description', value: (quotation.samples || []).join(' | ') },
    ]
  ];

  await drawSharedWatermark(doc, logo);
  const afterHdr = drawSharedHeader(doc, logo, 'SERVICE QUOTATION', quoteNo, true);
  let curY = drawSharedMetadata(doc, metaRows, afterHdr);

  const tableBody = quotation.items.map((item, idx) => [
    item.parameterName,
    String(item.quantity),
    formatKwacha(item.unitPrice).replace('K ', ''),
    formatKwacha(item.tax).replace('K ', ''),
    formatKwacha(item.amount).replace('K ', ''),
  ]);

  autoTable(doc, {
    head: [['Parameter / Service', 'Qty', 'Unit Price', 'VAT (16%)', 'Total (ZMW)']],
    body: tableBody,
    startY: curY,
    margin: { left: MARGIN, right: MARGIN, bottom: 20 },
    theme: 'grid',
    styles: { 
      fontSize: 8.5, 
      cellPadding: 2.5, 
      valign: 'middle', 
      textColor: [51, 51, 51] as [number,number,number], 
      lineColor: [221, 231, 244] as [number,number,number], 
      lineWidth: 0.18 
    },
    headStyles: { 
      fillColor: DB, 
      textColor: [255,255,255] as [number,number,number], 
      fontStyle: 'bold', 
      fontSize: 9, 
      halign: 'center' 
    },
    columnStyles: {
      0: { cellWidth: 'auto', halign: 'left' },
      1: { cellWidth: 15, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 30, halign: 'center', fontStyle: 'bold', textColor: DB },
    },
    alternateRowStyles: { fillColor: [245, 248, 253] as [number,number,number] },
  });

  const tableEndY = (doc as any).lastAutoTable?.finalY ?? curY + 40;
  let ty = tableEndY + 10;

  if (ty + 90 > A4_H - 15) {
    doc.addPage();
    await drawSharedWatermark(doc, logo);
    const ah = drawSharedHeader(doc, logo, 'SERVICE QUOTATION', quoteNo, true);
    ty = drawSharedMetadata(doc, metaRows, ah) + 10;
  }

  // 6. Totals Block — Contained Card (Anchor to Right)
  const totalsW = (A4_W - 2 * MARGIN) * 0.52;
  const totalsX = A4_W - MARGIN - totalsW;
  const totalsH = 26;

  // Outer Border
  doc.setDrawColor(200, 218, 240);
  doc.setLineWidth(0.35);
  (doc as any).roundedRect(totalsX, ty - 5, totalsW, totalsH, 3, 3, 'S');

  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  
  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal', totalsX + 3, ty);
  doc.text(formatKwacha(quotation.subtotal), A4_W - MARGIN - 3, ty, { align: 'right' });
  
  // Divider
  doc.setLineWidth(0.18);
  doc.line(totalsX, ty + 2.5, totalsX + totalsW, ty + 2.5);
  ty += 6.5;

  // VAT
  doc.setTextColor(184, 92, 0); // #B85C00
  doc.setFont('helvetica', 'bold');
  doc.text('Total VAT (16%)', totalsX + 3, ty);
  doc.text(formatKwacha(quotation.totalTax), A4_W - MARGIN - 3, ty, { align: 'right' });
  
  // Divider
  doc.setDrawColor(200, 218, 240);
  doc.line(totalsX, ty + 2.5, totalsX + totalsW, ty + 2.5);
  ty += 2.5;

  // Grand Total Bar
  doc.setFillColor(...DB);
  (doc as any).roundedRect(totalsX, ty, totalsW, 9.5, 0, 0, 'F'); // No radius needed for internal bar
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('GRAND TOTAL', totalsX + 4, ty + 6.5);
  doc.text(formatKwacha(quotation.totalAmount), A4_W - MARGIN - 4, ty + 6.5, { align: 'right' });
  
  ty += 20;

  // 7 & 8. Two-Column Layout (Terms & Validity)
  const colW = (A4_W - 2 * MARGIN - 8) / 2;
  const cardY = ty;
  const cardMinH = 40;

  // 7. Terms & Conditions Card (Left)
  doc.setFillColor(...DB);
  (doc as any).roundedRect(MARGIN, cardY, colW, 8, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TERMS & CONDITIONS', MARGIN + colW / 2, cardY + 5.5, { align: 'center' });

  // Body
  doc.setDrawColor(...DB);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, cardY + 8, colW, cardMinH, 'S');

  doc.setFontSize(9.5);
  doc.setTextColor(68, 68, 68); // #444444
  const terms = [
    '1. Payment is required prior to testing.',
    `2. Quotation valid until ${quotation.validUntil}.`,
    '3. Prices include 16% VAT where applicable.',
    '4. NWSC reserves the right to revise prices.'
  ];
  terms.forEach((tm, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DB);
    doc.text((i + 1) + '.', MARGIN + 3, cardY + 14 + i * 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(68, 68, 68);
    doc.text(tm.substring(3), MARGIN + 7, cardY + 14 + i * 5.5);
  });

  // 8. Validity Notice Card (Right)
  const validX = MARGIN + colW + 8;
  doc.setFillColor(184, 92, 0); // #B85C00
  (doc as any).roundedRect(validX, cardY, colW, 8, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('VALIDITY NOTICE', validX + colW / 2, cardY + 5.5, { align: 'center' });

  // Body
  doc.setDrawColor(184, 92, 0);
  doc.rect(validX, cardY + 8, colW, cardMinH, 'S');

  doc.setFontSize(9);
  doc.setTextColor(85, 85, 85);
  doc.text('This quotation expires on', validX + colW / 2, cardY + 15, { align: 'center' });
  
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(184, 92, 0);
  doc.text(quotation.validUntil || '—', validX + colW / 2, cardY + 23, { align: 'center' });
  
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(102, 102, 102);
  doc.text('After this date, prices are subject to revision.\nContact NWSC SHEQ to renew.', validX + colW / 2, cardY + 30, { align: 'center' });

  ty = cardY + 8 + cardMinH + 12;

  // 9. Signatory Section
  await drawSharedSignatories(
    doc,
    quotation.sign1Name, quotation.sign1Title, quotation.sign1SignatureImage,
    quotation.sign2Name, quotation.sign2Title, quotation.sign2SignatureImage,
    ty,
    true // isQuotation
  );

  drawSharedFooters(doc, doc.getNumberOfPages());

  const clientStr = sanitizeFilename(quotation.client);
  const dateStr   = formatDateString(quotation.date);
  const qnoStr    = quoteNo.replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`QT_${clientStr}_${dateStr}_${qnoStr}.pdf`);
}
