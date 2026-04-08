import jsPDF from 'jspdf';
import { DB, OB, A4_W, MARGIN } from '../constants';

export function drawSharedSignatories(
  doc: jsPDF,
  s1Name: string, s1Title: string, s1Img: string | undefined,
  s2Name: string, s2Title: string, s2Img: string | undefined,
  startY: number = 220
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...DB);
  doc.text('AUTHORISED SIGNATORIES', MARGIN, startY);

  doc.setDrawColor(...OB);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, startY + 1.5, A4_W - MARGIN, startY + 1.5);

  const cols = [MARGIN, A4_W / 2 + 5];
  const entries = [
    { name: s1Name, title: s1Title, img: s1Img },
    { name: s2Name, title: s2Title, img: s2Img },
  ];

  let maxY = startY + 4;
  entries.forEach((e, ci) => {
    if (!e.name && !e.title && !e.img) return;
    const x = cols[ci];
    let sy = startY + 5;

    if (e.img) {
      try { doc.addImage(e.img, 'PNG', x, sy, 42, 16); } catch {}
      sy += 18;
    } else {
      sy += 16;
    }

    doc.setDrawColor(...DB);
    doc.setLineWidth(0.5);
    doc.line(x, sy, x + 70, sy);
    sy += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(20, 20, 20);
    doc.text(e.name || '________________________', x, sy);
    sy += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(e.title || '', x, sy);
    sy += 4;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text('Date: ___________________________', x, sy);
    sy += 2;
    if (sy > maxY) maxY = sy;
  });
  return maxY + 4;
}
