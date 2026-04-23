import jsPDF from 'jspdf';
import { DB, A4_W, A4_H, MARGIN } from '../constants';

export function drawSharedFooters(doc: jsPDF, totalPages: number): void {
  const FOO_H = 10;
  const FOO_Y = A4_H - FOO_H;

  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);

    // Full-width colored bar
    doc.setFillColor(...DB);
    doc.rect(0, FOO_Y, A4_W, FOO_H, 'F');

    // Tagline (Left)
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Bigger, Better, Smarter', MARGIN, FOO_Y + 6.5);

    // Page Counter (Right)
    doc.setFont('helvetica', 'bold'); // "medium weight"
    doc.setFontSize(8.5);
    doc.text(`Page ${pg} of ${totalPages}`, A4_W - MARGIN, FOO_Y + 6.5, { align: 'right' });
  }
}
