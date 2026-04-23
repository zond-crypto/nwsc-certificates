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

  const metaRows = [
    [
      { label: 'Client', value: certificate.client },
      { label: 'Location', value: certificate.location },
      { label: 'Date Sampled', value: certificate.dateSampled },
    ],
    [
      { label: 'Sample Type', value: certificate.sampleType },
      { label: 'Date Reported', value: certificate.dateReported },
      { label: 'Status', value: certificate.status || 'FINAL' },
    ]
  ];

  for (let gi = 0; gi < groups.length; gi++) {
    const sampleGroup = groups[gi];
    const globalStart = gi * MAX_SAMPLE_COLS;

    if (gi > 0) doc.addPage();
    await drawSharedWatermark(doc, logo);
    const afterHdr = drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE', certificate.certNumber || '—');
    const afterMeta = drawSharedMetadata(doc, metaRows, afterHdr);

    let tableStartY = afterMeta;
    if (gi > 0) {
      doc.setFillColor(240, 245, 251);
      doc.rect(MARGIN, afterMeta, A4_W - 2 * MARGIN, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...DB);
      doc.text(`Samples ${globalStart + 1}–${globalStart + sampleGroup.length} of ${samples.length} (continued)`, MARGIN + 4, afterMeta + 4.5);
      tableStartY = afterMeta + 9;
    }

    const tableHead = [['Parameter', 'Unit', limitHeader, ...sampleGroup]];
    const tableBody: any[][] = [];

    // Helper to identify and insert subheadings
    let currentSection = '';
    tableData.forEach(row => {
      const section = row.section ? row.section.toUpperCase() : '';
      if (section && section !== currentSection) {
        tableBody.push([{
          content: section, 
          colSpan: 3 + sampleGroup.length,
          styles: { 
            fillColor: [232, 240, 251], // #E8F0FB
            textColor: DB, 
            fontStyle: 'bold', 
            fontSize: 8.5, 
            halign: 'left',
            cellPadding: 3
          }
        }]);
        currentSection = section;
      }

      if (!row.section) {
        const resultCols = sampleGroup.map((_, si) => {
          const v = row.results?.[globalStart + si];
          return v !== undefined && v !== null && v !== '' ? v : '—';
        });
        
        // ZABS Limit styling is handled via columnStyles/didParseCell
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
        fontSize: 8, 
        cellPadding: 2.5, 
        valign: 'middle', 
        textColor: [51, 51, 51] as [number,number,number], // #333333
        lineColor: [221, 231, 244] as [number,number,number], // #DDE7F4
        lineWidth: 0.18 
      },
      headStyles: { 
        fillColor: DB, 
        textColor: [255, 255, 255] as [number,number,number], 
        fontStyle: 'bold', 
        fontSize: 8.5, 
        halign: 'center' 
      },
      columnStyles: {
        0: { cellWidth: 'auto', fontStyle: 'bold' },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 25, halign: 'center', textColor: DB, fontStyle: 'bold' }, // ZABS Limit
      },
      alternateRowStyles: { fillColor: [245, 248, 253] as [number,number,number] }, // #F5F8FD
      didParseCell: (data) => {
        // Special overlay for ZABS Limit header
        if (data.section === 'head' && data.column.index === 2) {
          data.cell.styles.fillColor = [22, 90, 160]; // Deeper blue overlay simulation
        }
      },
      didDrawPage: (data) => {
        void (async () => { await drawSharedWatermark(doc, logo); })();
        const ah = drawSharedHeader(doc, logo, 'WATER ANALYSIS CERTIFICATE', certificate.certNumber || '—');
        const am = drawSharedMetadata(doc, metaRows, ah);
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

  await drawSharedSignatories(
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
