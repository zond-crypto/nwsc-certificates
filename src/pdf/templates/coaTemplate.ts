import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Certificate } from '../../types';
import { A4_W, A4_H, MARGIN, MAX_SAMPLE_COLS, DB, OB } from '../constants';
import { loadImg } from '../utils/imageLoader';
import { sanitizeFilename, formatDateString } from '../utils/formatters';
import { drawSharedHeader } from '../components/header';
import { drawSharedMetadata } from '../components/metaSection';
import { drawSharedWatermark } from '../components/watermark';
import { drawSharedFooters } from '../components/footer';
import { drawSharedSignatories } from '../components/signatures';

export async function generateCOAPdf(certificate: Certificate): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });

  let logo: string | null = null;
  try { logo = await loadImg('/logo.png'); } catch { /* skip */ }

  const samples   = certificate.samples  || [];
  const tableData = certificate.tableData || [];

  const groups: string[][] = [];
  if (samples.length === 0) {
    groups.push([]);
  } else {
    for (let i = 0; i < samples.length; i += MAX_SAMPLE_COLS) {
      groups.push(samples.slice(i, i + MAX_SAMPLE_COLS));
    }
  }

  const limitHeader = certificate.sampleType === 'Wastewater' ? 'ZEMA Limit' : 'ZABS Limit';

  const row1: [string, string][] = [
    ['Cert No:',       certificate.certNumber    || '—'],
    ['Client:',        certificate.client        || '—'],
    ['Date Sampled:',  certificate.dateSampled   || '—'],
    ['Location:',      certificate.location      || '—'],
  ];
  const row2: [string, string][] = [
    ['Sample Type:',   certificate.sampleType    || '—'],
    ['Date Reported:', certificate.dateReported  || '—'],
  ];

  for (let gi = 0; gi < groups.length; gi++) {
    const sampleGroup = groups[gi];
    const globalStart = gi * MAX_SAMPLE_COLS;

    if (gi > 0) doc.addPage();
    drawSharedWatermark(doc, logo);
    const afterHdr = drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE');
    const afterMeta = drawSharedMetadata(doc, row1, row2, afterHdr);

    if (gi > 0) {
      doc.setFillColor(...OB);
      doc.rect(MARGIN, afterMeta - 1, A4_W - 2 * MARGIN, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`Samples ${globalStart + 1}–${globalStart + sampleGroup.length} of ${samples.length}  (continued from previous page)`, MARGIN + 2, afterMeta + 3.5);
    }

    const tableStartY = gi > 0 ? afterMeta + 7 : afterMeta;

    const FIXED_WIDTHS = { 0: 7, 1: 48, 2: 17, 3: 26 };
    const usedFixed = Object.values(FIXED_WIDTHS).reduce((a, b) => a + b, 0);
    const availForSamples = A4_W - 2 * MARGIN - usedFixed;
    const sampleColW = sampleGroup.length > 0 ? Math.min(availForSamples / sampleGroup.length, 25) : 20;

    const colStyles: Record<number, object> = {
      0: { cellWidth: FIXED_WIDTHS[0], halign: 'center' },
      1: { cellWidth: FIXED_WIDTHS[1], halign: 'left' },
      2: { cellWidth: FIXED_WIDTHS[2], halign: 'center' },
      3: { cellWidth: FIXED_WIDTHS[3], halign: 'center' },
    };
    sampleGroup.forEach((_, si) => { colStyles[4 + si] = { cellWidth: sampleColW, halign: 'center' }; });

    const tableHead = [['#', 'Parameter', 'Unit', limitHeader, ...sampleGroup]];
    const tableBody: (string | object)[][] = [];
    let paramCount = 0;

    tableData.forEach(row => {
      if (row.section) {
        tableBody.push([{
          content: row.section || '', colSpan: 4 + sampleGroup.length,
          styles: { fillColor: OB as [number,number,number], textColor: [255, 255, 255] as [number,number,number], fontStyle: 'bold', fontSize: 7, halign: 'left' }
        }]);
      } else {
        paramCount++;
        const resultCols = sampleGroup.map((_, si) => {
          const v = row.results?.[globalStart + si];
          return v !== undefined && v !== null && v !== '' ? v : '—';
        });
        tableBody.push([String(paramCount), row.name || '', row.unit || '', row.limit || '', ...resultCols]);
      }
    });

    autoTable(doc, {
      head: tableHead, body: tableBody, startY: tableStartY,
      margin: { left: MARGIN, right: MARGIN, bottom: 15 },
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, overflow: 'linebreak', valign: 'middle', textColor: [20, 20, 20] as [number,number,number], lineColor: [180, 185, 195] as [number,number,number], lineWidth: 0.2 },
      headStyles: { fillColor: DB, textColor: [255, 255, 255] as [number,number,number], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
      columnStyles: colStyles,
      alternateRowStyles: { fillColor: [235, 240, 248] as [number,number,number] },
      rowPageBreak: 'avoid',
      didDrawPage: (data) => {
        drawSharedWatermark(doc, logo);
        const ah = drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE');
        const am = drawSharedMetadata(doc, row1, row2, ah);
        if (gi > 0) {
          doc.setFillColor(...OB);
          doc.rect(MARGIN, am - 1, A4_W - 2 * MARGIN, 5.5, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(255, 255, 255);
          doc.text(`Samples ${globalStart + 1}–${globalStart + sampleGroup.length} of ${Math.max(samples.length, 1)}  (continued)`, MARGIN + 2, am + 3.5);
          data.settings.margin.top = am + 8;
        } else {
          data.settings.margin.top = am + 2;
        }
      },
    });
  }

  doc.setPage(doc.getNumberOfPages());
  const lastY = (doc as any).lastAutoTable?.finalY ?? 200;
  const signSpace = 60;
  if (lastY + signSpace > A4_H - 15) {
    doc.addPage();
    drawSharedWatermark(doc, logo);
    drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE');
    drawSharedSignatories(doc, certificate.sign1Name, certificate.sign1Title, certificate.sign1SignatureImage, certificate.sign2Name, '', certificate.sign2SignatureImage, 58);
  } else {
    drawSharedSignatories(doc, certificate.sign1Name, certificate.sign1Title, certificate.sign1SignatureImage, certificate.sign2Name, '', certificate.sign2SignatureImage, lastY + 8);
  }

  drawSharedFooters(doc, doc.getNumberOfPages());

  const clientStr = sanitizeFilename(certificate.client);
  const dateStr   = formatDateString(certificate.dateReported);
  const certStr   = (certificate.certNumber   || 'COA').replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`COA_${clientStr}_${dateStr}_${certStr}.pdf`);
}
