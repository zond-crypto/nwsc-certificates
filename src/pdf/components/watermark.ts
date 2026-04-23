import jsPDF from 'jspdf';
import { A4_W, A4_H } from '../constants';

export function drawSharedWatermark(doc: jsPDF, logoDataUrl: string | null): void {
  doc.saveGraphicsState();
  (doc as any).setGState(new (doc as any).GState({ opacity: 0.09 }));
  
  if (logoDataUrl) {
    const sz = 120;
    doc.addImage(logoDataUrl, 'JPEG', (A4_W - sz) / 2, (A4_H - sz) / 2 - 10, sz, sz);
  }
  
  // Text watermark removed as per specifications, retaining logo only
  
  doc.restoreGraphicsState();
}
