import jsPDF from 'jspdf';
import { DB, A4_W, MARGIN } from '../constants';

export function drawSharedMetadata(
  doc: jsPDF, 
  rows: { label: string; value: string; isWarning?: boolean }[][], 
  startY: number
): number {
  const ROW_H = 14;
  const cardH = ROW_H * rows.length;
  const availW = A4_W - 2 * MARGIN;

  // Outer Border & Corner Radius
  doc.setDrawColor(200, 218, 240); // #C8DAF0
  doc.setLineWidth(0.35); // ~1pt is too thick for mm units usually, 0.35mm is ~1pt
  (doc as any).roundedRect(MARGIN, startY, availW, cardH, 3, 3, 'S');

  rows.forEach((row, ri) => {
    const y = startY + ri * ROW_H;
    const colW = availW / row.length;

    row.forEach((cell, ci) => {
      const x = MARGIN + ci * colW;
      
      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...DB);
      // Letter spacing simulation (small uppercase effect)
      doc.text(cell.label.toUpperCase(), x + 3, y + 5);

      // Value
      const val = (cell.value && cell.value.trim() !== '') ? cell.value : '—';
      const isMuted = val === '—';

      doc.setFont('helvetica', 'bold'); // "medium weight" -> bold in standard helvetica
      doc.setFontSize(10);
      
      if (isMuted) {
        doc.setTextColor(170, 170, 170); // #AAAAAA
      } else if (cell.isWarning) {
        doc.setTextColor(184, 92, 0); // #B85C00 (Amber-orange)
      } else {
        doc.setTextColor(26, 26, 26); // #1A1A1A
      }
      
      doc.text(val, x + 3, y + 10.5, { maxWidth: colW - 6 });

      // Internal Dividers
      doc.setDrawColor(200, 218, 240);
      doc.setLineWidth(0.18); // ~0.5pt

      // Vertical divider
      if (ci < row.length - 1) {
        doc.line(x + colW, y, x + colW, y + ROW_H);
      }
      // Horizontal divider
      if (ri < rows.length - 1) {
        doc.line(MARGIN, y + ROW_H, MARGIN + availW, y + ROW_H);
      }
    });
  });

  return startY + cardH + 6;
}
