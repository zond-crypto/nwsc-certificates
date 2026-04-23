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
  ];
  const row2: [string, string][] = [
    ['Sample Type:',   certificate.sampleType    || '—'],
    ['Date Reported:', certificate.dateReported  || '—'],
    ['Location:',      certificate.location      || '—'],
  ];

  for (let gi = 0; gi < groups.length; gi++) {
    const sampleGroup = groups[gi];
    const globalStart = gi * MAX_SAMPLE_COLS;

    if (gi > 0) doc.addPage();
    await drawSharedWatermark(doc, logo);
    const afterHdr = drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE');
    const afterMeta = drawSharedMetadata(doc, row1, row2, afterHdr);

    let tableStartY = afterMeta;
    if (gi > 0) {
      doc.setFillColor(240, 249, 255);
      doc.rect(MARGIN, afterMeta, A4_W - 2 * MARGIN, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...DB);
      doc.text(`Samples ${globalStart + 1}–${globalStart + sampleGroup.length} of ${samples.length} (continued)`, MARGIN + 4, afterMeta + 5);
      tableStartY = afterMeta + 10;
    }

    const tableHead = [['Parameter', 'Unit', limitHeader, ...sampleGroup]];
    const tableBody: any[][] = [];

    tableData.forEach(row => {
      if (row.section) {
        tableBody.push([{
          content: row.section.toUpperCase(), colSpan: 3 + sampleGroup.length,
          styles: { fillColor: [245, 245, 245], textColor: DB, fontStyle: 'bold', fontSize: 7, halign: 'left' }
        }]);
      } else {
        const resultCols = sampleGroup.map((_, si) => {
          const v = row.results?.[globalStart + si];
          return v !== undefined && v !== null && v !== '' ? v : '—';
        });
        tableBody.push([row.name || '', row.unit || '', row.limit || '', ...resultCols]);
      }
    });

    autoTable(doc, {
      head: tableHead,
      body: tableBody,
      startY: tableStartY,
      margin: { left: MARGIN, right: MARGIN, bottom: 20 },
      theme: 'grid',
      styles: { 
        fontSize: 7.5, 
        cellPadding: 2, 
        valign: 'middle', 
        textColor: [40, 40, 40] as [number,number,number], 
        lineColor: [200, 200, 200] as [number,number,number], 
        lineWidth: 0.1 
      },
      headStyles: { 
        fillColor: DB, 
        textColor: [255, 255, 255] as [number,number,number], 
        fontStyle: 'bold', 
        fontSize: 7.5, 
        halign: 'center' 
      },
      columnStyles: {
        0: { cellWidth: 'auto', fontStyle: 'bold' },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
      },
      alternateRowStyles: { fillColor: [250, 250, 250] as [number,number,number] },
      didDrawPage: (data) => {
        void (async () => { await drawSharedWatermark(doc, logo); })();
        const ah = drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE');
        const am = drawSharedMetadata(doc, row1, row2, ah);
        data.settings.margin.top = am + 10;
      },
    });
  }

  doc.setPage(doc.getNumberOfPages());
  const lastY = (doc as any).lastAutoTable?.finalY ?? 200;
  let ty = lastY + 12;

  if (ty + 60 > A4_H - 15) {
    doc.addPage();
    await drawSharedWatermark(doc, logo);
    drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE');
    ty = 70; 
  }

  drawSharedSignatories(
    doc,
    certificate.sign1Name, certificate.sign1Title, certificate.sign1SignatureImage,
    certificate.sign2Name, certificate.sign2Title, certificate.sign2SignatureImage,
    ty
  );

  drawSharedFooters(doc, doc.getNumberOfPages());

  const clientStr = sanitizeFilename(certificate.client);
  const dateStr   = formatDateString(certificate.dateReported);
  const certStr   = (certificate.certNumber || 'COA').replace(/[^A-Za-z0-9-]/g, '');
  doc.save(`COA_${clientStr}_${dateStr}_${certStr}.pdf`);
}
