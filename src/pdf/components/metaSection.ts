import jsPDF from 'jspdf';
import { DB, A4_W, MARGIN } from '../constants';

export function drawSharedMetadata(doc: jsPDF, row1: [string, string][], row2: [string, string][], startY: number): number {
  const ROW_H = 7.5;
  const bandH = ROW_H * 2 + 2;
  const availW = A4_W - 2 * MARGIN;

  doc.setFillColor(240, 242, 245);
  doc.rect(MARGIN, startY, availW, bandH, 'F');

  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, startY, availW, bandH, 'S');

  const drawRow = (rowItems: [string, string][], yOffset: number, isFirstRow: boolean) => {
    const colW = availW / rowItems.length;
    rowItems.forEach(([label, val], ci) => {
      const x = MARGIN + ci * colW + 2;
      const textY = startY + yOffset + 4.5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...DB);
      doc.text(label, x, textY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(30, 30, 30);
      const maxW = colW - 4;
      const parts = doc.splitTextToSize(val, maxW);
      doc.text(parts[0] || '', x, textY + 3);

      if (ci < rowItems.length - 1) {
        doc.setDrawColor(200, 205, 215);
        doc.setLineWidth(0.25);
        doc.line(MARGIN + (ci + 1) * colW, startY + yOffset + 1, MARGIN + (ci + 1) * colW, startY + (isFirstRow ? ROW_H : bandH - 1));
      }
    });
  };

  drawRow(row1, 0, true);

  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, startY + ROW_H, MARGIN + availW, startY + ROW_H);

  drawRow(row2, ROW_H, false);

  return startY + bandH + 2;
}
