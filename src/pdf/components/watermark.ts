import jsPDF from 'jspdf';
import { A4_W, A4_H } from '../constants';

export async function drawSharedWatermark(doc: jsPDF, logoDataUrl: string | null): Promise<void> {
  doc.saveGraphicsState();
  (doc as any).setGState(new (doc as any).GState({ opacity: 0.07 }));
  
  if (logoDataUrl) {
    const sz = 110;
    doc.addImage(logoDataUrl, 'PNG', (A4_W - sz) / 2, (A4_H - sz) / 2, sz, sz);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(80);
    doc.setTextColor(180, 180, 180);
    doc.text('NWSC', A4_W / 2, A4_H / 2, { align: 'center', angle: 45 });
  }
  
  doc.restoreGraphicsState();
}
