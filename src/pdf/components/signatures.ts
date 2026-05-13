import jsPDF from 'jspdf';
import { DB, OB, A4_W, MARGIN } from '../constants';
import { compressDataUrl } from '../utils/imageLoader';

/**
 * Draws the signatory block with:
 * - Signature image (centred above line)
 * - Signature rule
 * - Name (bold, dark blue)
 * - Designation / title (regular, muted)
 * - Generated timestamp (italic, smallest size)
 *
 * Returns the Y position below the entire block.
 */
export async function drawSharedSignatories(
  doc: jsPDF,
  s1Name: string, s1Title: string, s1Img: string | undefined,
  s2Name: string, s2Title: string, s2Img: string | undefined,
  startY: number,
  isQuotation: boolean = false
): Promise<number> {
  const sigW  = 68;
  const cols  = [MARGIN, A4_W - MARGIN - sigW];
  const entries = [
    { name: s1Name, title: s1Title, img: s1Img },
    { name: s2Name, title: s2Title, img: s2Img },
  ];

  // ── Section heading ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...DB);
  const sectionLabel = isQuotation ? 'AUTHORISED SIGNATORIES' : 'CERTIFIED BY';
  doc.text(sectionLabel, MARGIN, startY - 4);

  // Full-width rule above the signature block
  doc.setDrawColor(...DB);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, startY - 1, A4_W - MARGIN, startY - 1);

  // ── Timestamp ─────────────────────────────────────────────────────────
  const now = new Date();
  const stamp = now.toLocaleString('en-ZM', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Africa/Lusaka',
  });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(130, 130, 130);
  doc.text(`Generated: ${stamp} CAT`, A4_W - MARGIN, startY - 4, { align: 'right' });

  // ── Compress images in parallel ─────────────────────────────────────
  const compressed = await Promise.all(
    entries.map(e => e.img ? compressDataUrl(e.img, 400, 0.80) : Promise.resolve(undefined))
  );

  let maxBottom = startY;

  entries.forEach((e, ci) => {
    if (!e.name && !e.title && !e.img) return;
    const x  = cols[ci];
    let sy   = startY + 2;

    // ── Signature image ──────────────────────────────────────────────
    const imgData = compressed[ci];
    if (imgData) {
      try {
        doc.addImage(imgData, 'JPEG', x + (sigW - 42) / 2, sy - 14, 42, 12);
      } catch { /* skip if corrupt */ }
    }

    // ── Signature line ───────────────────────────────────────────────
    doc.setDrawColor(...DB);
    doc.setLineWidth(0.5);
    doc.line(x, sy, x + sigW, sy);

    sy += 5.5;

    // ── Name ─────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DB);
    const nameLines = doc.splitTextToSize(e.name || '—', sigW);
    doc.text(nameLines, x, sy);
    sy += nameLines.length * 4.5;

    // ── Designation / Title ──────────────────────────────────────────
    if (e.title) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(90, 90, 90);
      const titleLines = doc.splitTextToSize(e.title, sigW);
      doc.text(titleLines, x, sy);
      sy += titleLines.length * 4 + 1;
    }

    // ── "For and on behalf of NWSC" micro-caption ────────────────────
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text('For and on behalf of NWSC', x, sy);
    sy += 5;

    if (sy > maxBottom) maxBottom = sy;
  });

  return maxBottom + 4;
}
