import jsPDF from 'jspdf';
import { DB, OB, A4_W, MARGIN } from '../constants';
import { compressDataUrl } from '../utils/imageLoader';

export async function drawSharedSignatories(
  doc: jsPDF,
  s1Name: string, s1Title: string, s1Img: string | undefined,
  s2Name: string, s2Title: string, s2Img: string | undefined,
  startY: number = 220
): Promise<number> {

  const cols = [MARGIN, A4_W / 2 + 10];
  const entries = [
    { name: s1Name, title: s1Title, img: s1Img },
    { name: s2Name, title: s2Title, img: s2Img },
  ];

  // Compress signature images in parallel before drawing
  const compressed = await Promise.all(
    entries.map(e => e.img ? compressDataUrl(e.img, 400, 0.80) : Promise.resolve(undefined))
  );

  let maxY = startY + 6;
  entries.forEach((e, ci) => {
    if (!e.name && !e.title && !e.img) return;
    const x = cols[ci];
    let sy = startY + 12;

    const imgData = compressed[ci];
    if (imgData) {
      try { doc.addImage(imgData, 'JPEG', x, sy - 10, 40, 12); } catch {}
    }

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.5);
    doc.line(x, sy, x + 60, sy);
    sy += 5;

    if (e.name && e.title !== "QUALITY ASSURANCE OFFICER") {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(20, 20, 20);
      doc.text(e.name, x, sy);
      sy += 4;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text(e.title?.toUpperCase() || '', x, sy);
    
    if (sy > maxY) maxY = sy;
  });
  return maxY + 10;
}

