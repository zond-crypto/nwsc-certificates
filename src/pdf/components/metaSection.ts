import jsPDF from 'jspdf';
import { DB, A4_W, MARGIN } from '../constants';

export function drawSharedMetadata(doc: jsPDF, row1: [string, string][], row2: [string, string][], startY: number): number {
  const ROW_H = 10;
  const bandH = ROW_H * 2;
  const availW = A4_W - 2 * MARGIN;

  // Sky blue background (bg-sky-50/50)
  doc.setFillColor(240, 249, 255);
  doc.rect(MARGIN, startY, availW, bandH, 'F');

  // Border
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, startY, availW, bandH, 'S');

  const drawRow = (rowItems: [string, string][], yOffset: number) => {
    const colW = availW / rowItems.length;
    rowItems.forEach(([label, val], ci) => {
      const x = MARGIN + ci * colW + 2.5;
      const textY = startY + yOffset + 4;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...DB);
      doc.text(label, x, textY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(20, 20, 20);
      doc.text(String(val), x, textY + 4, { maxWidth: colW - 5 });

      // Vertical separator
      if (ci < rowItems.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.line(MARGIN + (ci + 1) * colW, startY + yOffset, MARGIN + (ci + 1) * colW, startY + yOffset + ROW_H);
      }
    });
  };

  drawRow(row1, 0);

  // Horizontal separator
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGIN, startY + ROW_H, MARGIN + availW, startY + ROW_H);

  drawRow(row2, ROW_H);

  return startY + bandH + 5;
}
