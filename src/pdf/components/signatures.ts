import jsPDF from 'jspdf';
import { DB, OB, A4_W, MARGIN } from '../constants';
import { compressDataUrl } from '../utils/imageLoader';

export async function drawSharedSignatories(
  doc: jsPDF,
  s1Name: string, s1Title: string, s1Img: string | undefined,
  s2Name: string, s2Title: string, s2Img: string | undefined,
  startY: number,
  isQuotation: boolean = false
): Promise<number> {
  const sigW = 65;
  const cols = [MARGIN, A4_W - MARGIN - sigW];
  const entries = [
    { name: s1Name, title: s1Title, img: s1Img },
    { name: s2Name, title: s2Title, img: s2Img },
  ];

  // Section Label (For left block if quotation)
  if (isQuotation) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...DB);
    doc.text('AUTHORISED SIGNATORIES', MARGIN, startY - 4);
  }

  const compressed = await Promise.all(
    entries.map(e => e.img ? compressDataUrl(e.img, 400, 0.80) : Promise.resolve(undefined))
  );

  entries.forEach((e, ci) => {
    if (!e.name && !e.title && !e.img) return;
    const x = cols[ci];
    let sy = startY;

    const imgData = compressed[ci];
    if (imgData) {
      try { doc.addImage(imgData, 'JPEG', x + (sigW - 40) / 2, sy - 15, 40, 12); } catch {}
    }

    // Horizontal Rule (1.5pt)
    doc.setDrawColor(...DB);
    doc.setLineWidth(0.5); // ~1.5pt is about 0.53mm
    doc.line(x, sy, x + sigW, sy);

    sy += 5;

    // Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DB);
    doc.text(e.name || '—', x, sy);

    sy += 4.5;

    // Title
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(102, 102, 102); // #666666
    doc.text(e.title || '', x, sy);
  });

  return startY + 20;
}

