import jsPDF from 'jspdf';
import { DB, GD, A4_W, MARGIN } from '../constants';

export function drawSharedHeader(doc: jsPDF, logoDataUrl: string | null, documentTitle: string): number {
  const HDR_H = 50; 
  const LOGO_SIZE = 20;
  const LOGO_X = MARGIN;
  const LOGO_Y = 5;

  doc.setFillColor(...DB);
  doc.rect(0, 0, A4_W, HDR_H, 'F');

  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2 + 1, 'F');
    doc.addImage(logoDataUrl, 'PNG', LOGO_X, LOGO_Y + 1, LOGO_SIZE, LOGO_SIZE - 2);
  }

  const cx = A4_W / 2;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('NKANA WATER SUPPLY AND SANITATION COMPANY', cx, 12, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia', cx, 18, { align: 'center' });
  doc.text('Tel: +260 212 222488 / 221099 / 0971 223 458   |   Fax: +260 212 222490', cx, 22.5, { align: 'center' });
  doc.text('headoffice@nwsc.com.zm   |   www.nwsc.zm', cx, 27, { align: 'center' });

  doc.setDrawColor(...GD);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 30.5, A4_W - MARGIN, 30.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 215, 60); 
  doc.text('SAFETY HEALTH ENVIRONMENT AND QUALITY DEPARTMENT', cx, 36, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(documentTitle, cx, 43, { align: 'center' });

  doc.setFillColor(...GD);
  doc.rect(0, HDR_H - 2, A4_W, 2, 'F');

  return HDR_H + 1;
}
