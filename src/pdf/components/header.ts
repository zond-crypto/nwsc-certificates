import jsPDF from 'jspdf';
import { DB, GD, A4_W, MARGIN } from '../constants';

export function drawSharedHeader(doc: jsPDF, logoDataUrl: string | null, documentTitle: string): number {
  const HDR_H = 60; 
  const LOGO_SIZE = 24;
  const LOGO_X = MARGIN;
  const LOGO_Y = 6;

  // Blue background
  doc.setFillColor(...DB);
  doc.rect(0, 0, A4_W, HDR_H, 'F');

  // Logo Circle
  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2 + 1, 'F');
    
    doc.saveGraphicsState();
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2);
    doc.clip();
    doc.addImage(logoDataUrl, 'PNG', LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE);
    doc.restoreGraphicsState();

    doc.setDrawColor(...DB);
    doc.setLineWidth(1);
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2, 'D');
  }

  // Company Info (Left aligned, next to logo)
  const INFO_X = LOGO_X + LOGO_SIZE + 6;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('NKANA WATER SUPPLY AND SANITATION COMPANY', INFO_X, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia', INFO_X, 20, { maxWidth: 120 });
  
  doc.setFontSize(6.5);
  doc.text('Tel: +260 212 222488 / 221099 / 0971 223 458   |   Fax: +260 212 222490', INFO_X, 26);
  doc.text('headoffice@nwsc.com.zm   |   www.nwsc.zm', INFO_X, 30);

  // Bottom part: lines and titles
  const midX = A4_W / 2;
  
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.setGState(new (doc as any).GState({ opacity: 0.3 }));
  doc.line(MARGIN, 38, A4_W - MARGIN, 38);
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GD); // Yellow
  doc.text('SAFETY HEALTH ENVIRONMENT AND QUALITY DEPARTMENT', midX, 44, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(documentTitle, midX, 52, { align: 'center' });

  doc.setGState(new (doc as any).GState({ opacity: 0.3 }));
  doc.line(MARGIN, 56, A4_W - MARGIN, 56);
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  return HDR_H + 5;
}
