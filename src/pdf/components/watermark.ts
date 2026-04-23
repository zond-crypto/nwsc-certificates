import jsPDF from 'jspdf';
import { A4_W, A4_H } from '../constants';

export function drawSharedWatermark(doc: jsPDF, logoDataUrl: string | null): void {
  doc.saveGraphicsState();
  (doc as any).setGState(new (doc as any).GState({ opacity: 0.04 }));
  
  if (logoDataUrl) {
    const sz = 120;
    doc.addImage(logoDataUrl, 'PNG', (A4_W - sz) / 2, (A4_H - sz) / 2 - 10, sz, sz);
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(0, 74, 153);
  doc.text('NKANA WATER SUPPLY\nAND SANITATION COMPANY', A4_W / 2, A4_H / 2 + 65, { align: 'center' });
  
  doc.restoreGraphicsState();
}
