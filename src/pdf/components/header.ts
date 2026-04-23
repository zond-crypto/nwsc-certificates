import jsPDF from 'jspdf';
import { DB, GD, A4_W, MARGIN } from '../constants';

export function drawSharedHeader(
  doc: jsPDF, 
  logoDataUrl: string | null, 
  documentTitle: string, 
  docNumber: string,
  isQuotation: boolean = false
): number {
  const HDR_H = 40; 
  const LOGO_SIZE = 22;
  const LOGO_X = MARGIN;
  const LOGO_Y = 6;

  // 1. Top Section (Logo + Company Info + Badge)
  // White background for top part
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, A4_W, HDR_H, 'F');

  // Logo Circle
  if (logoDataUrl) {
    // Inscribed square to fit perfectly without clipping
    const innerSize = LOGO_SIZE * 0.85;
    const offset = (LOGO_SIZE - innerSize) / 2;
    doc.addImage(logoDataUrl, 'JPEG', LOGO_X + offset, LOGO_Y + offset, innerSize, innerSize);

    doc.setDrawColor(...DB);
    doc.setLineWidth(0.8);
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2, 'D');
  }

  // Company Info
  const INFO_X = LOGO_X + LOGO_SIZE + 5;
  doc.setTextColor(...DB);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('NKANA WATER SUPPLY AND SANITATION COMPANY', INFO_X, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia', INFO_X, 19.5);
  doc.text('Tel: +260 212 222488 | Fax: +260 212 222490 | headoffice@nwsc.com.zm', INFO_X, 23.5);

  // Badge (Right aligned)
  const BADGE_W = 45;
  const BADGE_H = 14;
  const BADGE_X = A4_W - MARGIN - BADGE_W;
  const BADGE_Y = LOGO_Y + (LOGO_SIZE - BADGE_H) / 2;

  doc.setFillColor(...DB);
  // Rounded rect for badge (4px radius)
  (doc as any).roundedRect(BADGE_X, BADGE_Y, BADGE_W, BADGE_H, 4, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const label = isQuotation ? 'QUOTATION NO' : 'CERT NO';
  doc.text(label, BADGE_X + BADGE_W / 2, BADGE_Y + 5, { align: 'center' });
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(docNumber, BADGE_X + BADGE_W / 2, BADGE_Y + 10.5, { align: 'center' });

  // Main Header Rule
  doc.setDrawColor(...DB);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, 36, A4_W - MARGIN, 36);

  // 2. Title Band (Below Header Rule)
  const T_BAND_Y = 36.1;
  const T_BAND_H = 20;
  
  // Light blue tint (#F0F5FB)
  doc.setFillColor(240, 245, 251);
  doc.rect(MARGIN, T_BAND_Y, A4_W - 2 * MARGIN, T_BAND_H, 'F');
  
  // Bottom border (#C8DAF0)
  doc.setDrawColor(200, 218, 240);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, T_BAND_Y + T_BAND_H, A4_W - MARGIN, T_BAND_Y + T_BAND_H);

  // Text hierarchy
  doc.setTextColor(...DB);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('SAFETY HEALTH ENVIRONMENT AND QUALITY DEPARTMENT', MARGIN + 4, T_BAND_Y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(documentTitle, MARGIN + 4, T_BAND_Y + 14.5);

  return T_BAND_Y + T_BAND_H + 6;
}
