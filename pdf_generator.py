"""
pdf_generator.py
═══════════════════════════════════════════════════════════════════════════════
Drop-in ReportLab PDF generation module for the NWSC Laboratory Management
System desktop application.

Generates:
  1) Certificate of Analysis (COA) PDF   → generate_coa_pdf()
  2) Service Quotation PDF               → generate_quotation_pdf()

Key features:
  • Full NWSC brand identity on every page (Ocean Blue #0077B6 palette)
  • Semi-transparent NWSC watermark on every page body (~8% opacity)
  • Multi-sample COA pagination:
      – Fixed columns (Parameter | Unit | Limit) repeated on every page
      – Max MAX_SAMPLE_COLS (6) sample columns per A4 page
      – Samples 7+ overflow to continuation pages automatically
  • Proper Unicode rendering for chemical symbols: NO₃⁻ SO₄²⁻ µS/cm °C etc.
  • Alternating white / #ADE8F4 row fill in all tables
  • Signatories section (last page only): signature image + name + title + date
  • Footer every page: NWSC — Certified | Bigger, Better, Smarter | Page X of Y
  • Runs as a standalone script for testing (see __main__ block)

Dependencies:
  pip install reportlab pillow

Usage from your desktop app:
  from pdf_generator import generate_coa_pdf, generate_quotation_pdf
  generate_coa_pdf(certificate_dict, output_path="COA_Client_20250101_001.pdf")
  generate_quotation_pdf(quotation_dict, output_path="QT_Client_20250101_001.pdf")

Data structures expected match the TypeScript types in src/types.ts.
═══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import base64
import io
import os
import re
import textwrap
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ─── Page dimensions ──────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4          # 595.27 x 841.89 pt  (ReportLab uses points)
MARGIN_L = 14 * mm
MARGIN_R = 14 * mm
MARGIN_T = 14 * mm          # top margin below header (header is in canvas)
MARGIN_B = 14 * mm          # bottom margin above footer

# ─── Brand colours (as 0..1 fractions for ReportLab) ─────────────────────────
def _hex(h: str) -> colors.Color:
    h = h.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return colors.Color(r / 255, g / 255, b / 255)


OCEAN_BLUE  = _hex("0077B6")   # primary blue
DARK_BLUE   = _hex("003D7A")   # deep navy
GOLD        = _hex("E8B400")   # accent gold rule
LIGHT_BLUE  = _hex("ADE8F4")   # alternating row tint
WHITE       = colors.white
BLACK       = colors.black
MID_GREY    = _hex("555555")
LIGHT_GREY  = _hex("999999")

# ─── Typography ───────────────────────────────────────────────────────────────
STYLES = getSampleStyleSheet()

try:
    pdfmetrics.registerFont(TTFont('DejaVuSans', 'DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', 'DejaVuSans-Bold.ttf'))
    FONT_NORMAL = 'DejaVuSans'
    FONT_BOLD = 'DejaVuSans-Bold'
    FONT_OBLIQUE = 'DejaVuSans'
except Exception:
    FONT_NORMAL = 'Helvetica'
    FONT_BOLD = 'Helvetica-Bold'
    FONT_OBLIQUE = 'Helvetica-Oblique'

def _style(name, **kw) -> ParagraphStyle:
    base = kw.pop("parent", "Normal")
    s = ParagraphStyle(name, parent=STYLES[base], **kw)
    return s

BODY_STYLE       = _style("NWSCBody",       fontSize=7.5, leading=10, textColor=BLACK, fontName=FONT_NORMAL)
BODY_BOLD        = _style("NWSCBodyBold",   fontSize=7.5, leading=10, textColor=BLACK, fontName=FONT_BOLD)
CELL_CENTRE      = _style("NWSCCentre",     fontSize=7.5, leading=10, alignment=TA_CENTER, fontName=FONT_NORMAL)
CELL_RIGHT       = _style("NWSCRight",      fontSize=7.5, leading=10, alignment=TA_RIGHT, fontName=FONT_NORMAL)
HEADER_STYLE     = _style("NWSCHeader",     fontSize=11,  leading=14, textColor=WHITE,  fontName=FONT_BOLD, alignment=TA_CENTER)
SUBHEADER_STYLE  = _style("NWSCSubheader",  fontSize=7,   leading=9,  textColor=_hex("C8DCF0"), alignment=TA_CENTER, fontName=FONT_NORMAL)
SECTION_STYLE    = _style("NWSCSection",    fontSize=7.5, leading=10, textColor=WHITE,  fontName=FONT_BOLD)
TITLE_STYLE      = _style("NWSCTitle",      fontSize=10,  leading=13, textColor=WHITE,  fontName=FONT_BOLD, alignment=TA_CENTER)
META_LABEL       = _style("NWSCMetaLabel",  fontSize=7.5, leading=10, textColor=WHITE,  fontName=FONT_BOLD)
META_VAL         = _style("NWSCMetaVal",    fontSize=7.5, leading=10, textColor=BLACK, fontName=FONT_NORMAL)
SIGNATORY_NAME   = _style("NWSCSignName",   fontSize=8,   leading=11, fontName=FONT_BOLD, textColor=_hex("1E1E1E"))
SIGNATORY_TITLE  = _style("NWSCSignTitle",  fontSize=7.5, leading=10, textColor=MID_GREY, fontName=FONT_NORMAL)
SIGNATORY_DATE   = _style("NWSCSignDate",   fontSize=7,   leading=9,  textColor=LIGHT_GREY, fontName=FONT_OBLIQUE)
TOTALS_NORMAL    = _style("NWSCTotNormal",  fontSize=8.5, leading=12, textColor=MID_GREY, fontName=FONT_NORMAL)
TOTALS_BOLD      = _style("NWSCTotBold",    fontSize=10,  leading=13, fontName=FONT_BOLD, textColor=WHITE)
BADGE_STYLE      = _style("NWSCBadge",      fontSize=8,   leading=10, fontName=FONT_BOLD, textColor=WHITE, alignment=TA_CENTER)
FOOTER_CENTRE    = _style("NWSCFooterC",    fontSize=7,   leading=9,  fontName=FONT_OBLIQUE, textColor=DARK_BLUE, alignment=TA_CENTER)
FOOTER_SIDE      = _style("NWSCFooterS",    fontSize=7,   leading=9,  textColor=LIGHT_GREY, fontName=FONT_NORMAL)
SAMPLE_STYLE     = _style("NWSCSample",     fontSize=7.5, leading=10, alignment=TA_CENTER, fontName=FONT_BOLD, wordWrap=None, allowWidows=0, allowOrphans=0)
UNIT_STYLE       = _style("NWSCUnit",       fontSize=7,   leading=9,  alignment=TA_CENTER, fontName=FONT_NORMAL, wordWrap=None)

MAX_SAMPLE_COLS = 6   # sample columns per A4 page

# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _safe_filename(s: str) -> str:
    """Strip characters invalid in filenames and collapse spaces."""
    return re.sub(r"[^A-Za-z0-9_\-]", "", (s or "Unknown").strip().replace(" ", "_"))


def _kwacha(v) -> str:
    """Format a numeric value as Zambian Kwacha with 2 decimal places."""
    try:
        return f"K {float(v):,.2f}"
    except (TypeError, ValueError):
        return f"K {v}"


def _load_image(source: Optional[str]) -> Optional[ImageReader]:
    """
    Load an image from:
      • a file-system path  (if the file exists)
      • a base64 data-URI   (data:image/...;base64,<data>)
    Returns an ImageReader or None on failure.
    """
    if not source:
        return None
    try:
        if source.startswith("data:"):
            # Strip the MIME prefix and decode
            _, encoded = source.split(",", 1)
            raw = base64.b64decode(encoded)
            return ImageReader(io.BytesIO(raw))
        if os.path.isfile(source):
            return ImageReader(source)
    except Exception:
        pass
    return None


def _place_watermark(canvas, logo_reader: Optional[ImageReader]) -> None:
    """Draw the semi-transparent NWSC logo watermark behind all page content."""
    canvas.saveState()
    canvas.setFillAlpha(0.07)
    try:
        canvas.drawImage("Logo.png", x=(PAGE_W - 180) / 2, y=(PAGE_H - 180) / 2, width=180, height=180, mask="auto")
    except Exception:
        # Fallback: large diagonal text
        canvas.setFont("Helvetica-Bold", 90)
        canvas.setFillColor(colors.Color(0.7, 0.7, 0.7))
        canvas.translate(PAGE_W / 2, PAGE_H / 2)
        canvas.rotate(45)
        canvas.drawCentredString(0, 0, "NWSC")
    canvas.restoreState()


def _draw_header_canvas(
    canvas,
    logo_reader: Optional[ImageReader],
    badge_label: str,
    document_title: str,
) -> float:
    """
    Paint the branded header bar directly on the canvas.
    Returns the Y coordinate (in points from bottom) just below the header band.
    """
    header_h = 42 * mm
    title_bar_h = 10 * mm

    # ── Dark navy background ──────────────────────────────────────────────────
    canvas.saveState()
    canvas.setFillColor(DARK_BLUE)
    canvas.rect(0, PAGE_H - header_h, PAGE_W, header_h, fill=1, stroke=0)

    # ── Gold accent rule at bottom of header ──────────────────────────────────
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1.5)
    canvas.line(0, PAGE_H - header_h, PAGE_W, PAGE_H - header_h)

    # ── Logo (top-left white-circle background + image) ───────────────────────
    logo_x = MARGIN_L
    logo_y = PAGE_H - header_h + (header_h - 20 * mm) / 2  # vertically centred
    try:
        canvas.setFillColor(WHITE)
        canvas.roundRect(logo_x - 1 * mm, logo_y - 1 * mm, 22 * mm, 22 * mm, 2 * mm, fill=1, stroke=0)
        canvas.drawImage("Logo.png", logo_x, logo_y, width=20 * mm, height=20 * mm, mask="auto")
    except Exception:
        pass

    # ── Company name (centred) ────────────────────────────────────────────────
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 11)
    canvas.drawCentredString(PAGE_W / 2, PAGE_H - 12 * mm, "NKANA WATER SUPPLY AND SANITATION COMPANY")

    canvas.setFillColor(_hex("C8DCF0"))
    canvas.setFont(FONT_NORMAL, 7)
    canvas.drawCentredString(PAGE_W / 2, PAGE_H - 17 * mm,
                             "Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia")
    canvas.drawCentredString(PAGE_W / 2, PAGE_H - 21.5 * mm,
                             "Tel: +260 212 222488 / 221099 / 0971 223 458  |  Fax: +260 212 222490")
    canvas.drawCentredString(PAGE_W / 2, PAGE_H - 26 * mm,
                             "headoffice@nwsc.com.zm  |  www.nwsc.zm")

    # ── Badge (top-right corner) ──────────────────────────────────────────────
    badge_w = 28 * mm
    badge_h = 10 * mm
    badge_x = PAGE_W - MARGIN_R - badge_w
    badge_y = PAGE_H - 6 * mm - badge_h
    canvas.setFillColor(OCEAN_BLUE)
    canvas.roundRect(badge_x, badge_y, badge_w, badge_h, 1.5 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 8)
    canvas.drawCentredString(badge_x + badge_w / 2, badge_y + 3 * mm, badge_label)

    # ── Document title bar (ocean blue) below header ──────────────────────────
    title_y = PAGE_H - header_h - title_bar_h
    canvas.setFillColor(OCEAN_BLUE)
    canvas.rect(0, title_y, PAGE_W, title_bar_h, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 10)
    canvas.drawCentredString(PAGE_W / 2, title_y + 3.5 * mm, document_title)

    canvas.restoreState()

    # Return the Y from the bottom of the page just below the title bar
    return PAGE_H - header_h - title_bar_h


def _draw_footer_canvas(canvas, page_num: int, total_pages: int, left_label: str) -> None:
    """Draw the branded footer on the canvas."""
    footer_y = MARGIN_B
    rule_y = footer_y + 5 * mm

    canvas.saveState()
    canvas.setStrokeColor(OCEAN_BLUE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_L, rule_y, PAGE_W - MARGIN_R, rule_y)

    canvas.setFont(FONT_NORMAL, 7)
    canvas.setFillColor(LIGHT_GREY)
    canvas.drawString(MARGIN_L, footer_y, left_label)

    canvas.setFont(FONT_OBLIQUE, 7)
    canvas.setFillColor(DARK_BLUE)
    canvas.drawCentredString(PAGE_W / 2, footer_y, "Bigger, Better, Smarter")

    canvas.setFont(FONT_NORMAL, 7)
    canvas.setFillColor(LIGHT_GREY)
    canvas.drawRightString(PAGE_W - MARGIN_R, footer_y, f"Page {page_num} of {total_pages}")
    canvas.restoreState()


# ═══════════════════════════════════════════════════════════════════════════════
#  CUSTOM FLOWABLES
# ═══════════════════════════════════════════════════════════════════════════════

class HRule(Flowable):
    """A thin horizontal rule, optionally coloured."""
    def __init__(self, width=None, color=OCEAN_BLUE, thickness=0.5):
        super().__init__()
        self._width = width
        self.color = color
        self.thickness = thickness
        self.height = thickness + 2 * mm

    def wrap(self, avail_w, avail_h):
        self.width = self._width or avail_w
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.thickness, self.width, self.thickness)
        self.canv.restoreState()


class SignatoryBlock(Flowable):
    """
    Renders two side-by-side signatory columns each with:
    optional signature image → underline → name → title → date line
    """
    def __init__(
        self,
        sign1_name: str, sign1_title: str, sign1_img: Optional[ImageReader],
        sign2_name: str, sign2_title: str, sign2_img: Optional[ImageReader],
    ):
        super().__init__()
        self.s1n, self.s1t, self.s1i = sign1_name, sign1_title, sign1_img
        self.s2n, self.s2t, self.s2i = sign2_name, sign2_title, sign2_img
        self.block_height = 60 * mm

    def wrap(self, avail_w, avail_h):
        self.avail_w = avail_w
        return avail_w, self.block_height

    def draw(self):
        c = self.canv
        avail_w = self.avail_w
        col_w = avail_w / 2 - 5 * mm

        c.saveState()

        # Section heading
        c.setFont(FONT_BOLD, 9)
        c.setFillColor(DARK_BLUE)
        c.drawString(0, self.block_height - 6 * mm, "AUTHORISED SIGNATORIES")

        # Ocean blue rule under heading
        c.setStrokeColor(OCEAN_BLUE)
        c.setLineWidth(0.6)
        c.line(0, self.block_height - 8 * mm, avail_w, self.block_height - 8 * mm)

        # Draw each column
        for i, (img, name, title) in enumerate([
            (self.s1i, self.s1n, self.s1t),
            (self.s2i, self.s2n, self.s2t),
        ]):
            col_x = i * (avail_w / 2)
            y_ptr = self.block_height - 12 * mm

            # Signature image
            if img:
                try:
                    img_h = 16 * mm
                    img_w = 42 * mm
                    c.drawImage(img, col_x, y_ptr - img_h, width=img_w, height=img_h, mask="auto")
                    y_ptr -= img_h + 1 * mm
                except Exception:
                    y_ptr -= 17 * mm
            else:
                y_ptr -= 16 * mm   # empty space reserved for handwritten sig

            # Underline (signature line)
            c.setStrokeColor(DARK_BLUE)
            c.setLineWidth(0.7)
            c.line(col_x, y_ptr, col_x + 70 * mm, y_ptr)
            y_ptr -= 4 * mm

            # Name
            c.setFont(FONT_BOLD, 8)
            c.setFillColor(_hex("1E1E1E"))
            c.drawString(col_x, y_ptr, name or "_________________________________")
            y_ptr -= 4 * mm

            # Title
            c.setFont(FONT_NORMAL, 7.5)
            c.setFillColor(MID_GREY)
            c.drawString(col_x, y_ptr, title or "")
            y_ptr -= 4 * mm

            # Date
            c.setFont(FONT_OBLIQUE, 7)
            c.setFillColor(LIGHT_GREY)
            c.drawString(col_x, y_ptr, "Date: ___________________________")

        c.restoreState()


# ═══════════════════════════════════════════════════════════════════════════════
#  PAGE TEMPLATE FACTORIES
# ═══════════════════════════════════════════════════════════════════════════════

def _make_page_template(
    template_id: str,
    logo_reader: Optional[ImageReader],
    badge_label: str,
    document_title: str,
    left_footer_label: str,
    doc: BaseDocTemplate,
) -> PageTemplate:
    """
    Create a PageTemplate that draws the full branded header + watermark +
    footer on every canvas render.

    The content frame starts below the header band and ends above the footer.
    """
    header_bottom = _draw_header_canvas.__doc__  # just a reference check

    # We need to know where the header ends to position the frame.
    # Header occupies top (42mm title bar) + (10mm doc-title bar) = 52mm
    header_total = 42 * mm + 10 * mm
    footer_total = 15 * mm   # space for footer rule + text

    frame = Frame(
        x1=MARGIN_L,
        y1=footer_total,
        width=PAGE_W - MARGIN_L - MARGIN_R,
        height=PAGE_H - header_total - footer_total - 4 * mm,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        id="content",
    )

    def on_page(canvas, doc_ref):
        # Watermark first (drawn behind everything)
        _place_watermark(canvas, logo_reader)
        # Header
        _draw_header_canvas(canvas, logo_reader, badge_label, document_title)
        # Footer with final page count
        _draw_footer_canvas(canvas, canvas.getPageNumber(), doc_ref.page, left_footer_label)

    # We need two-pass rendering so total pages is known.
    # We'll patch the footer in generate functions after build.
    return PageTemplate(id=template_id, frames=[frame], onPage=on_page)


# ═══════════════════════════════════════════════════════════════════════════════
#  COA — META GRID
# ═══════════════════════════════════════════════════════════════════════════════

def _build_meta_grid(fields: List[Tuple[str, str]]) -> Table:
    """
    Build a 2-column info grid: [Label | Value | Label | Value].
    Fields are laid out 2-per-row.
    """
    usable_w = PAGE_W - MARGIN_L - MARGIN_R
    label_w = 32 * mm
    val_w   = usable_w / 2 - label_w

    rows = []
    for i in range(0, len(fields), 2):
        row = []
        for j in range(2):
            if i + j < len(fields):
                lbl, val = fields[i + j]
                row.append(Paragraph(lbl, META_LABEL))
                row.append(Paragraph(val or "—", META_VAL))
            else:
                row.extend(["", ""])
        rows.append(row)

    col_widths = [label_w, val_w, label_w, val_w]
    t = Table(rows, colWidths=col_widths, repeatRows=0)

    style_cmds = [
        ("BACKGROUND",  (0, 0), (0, -1), DARK_BLUE),
        ("BACKGROUND",  (2, 0), (2, -1), DARK_BLUE),
        ("BACKGROUND",  (1, 0), (1, -1), _hex("F5F8FF")),
        ("BACKGROUND",  (3, 0), (3, -1), _hex("F5F8FF")),
        ("TEXTCOLOR",   (0, 0), (0, -1), WHITE),
        ("TEXTCOLOR",   (2, 0), (2, -1), WHITE),
        ("TEXTCOLOR",   (1, 0), (1, -1), BLACK),
        ("TEXTCOLOR",   (3, 0), (3, -1), BLACK),
        ("FONTNAME",    (0, 0), (-1, -1), FONT_NORMAL),
        ("FONTNAME",    (0, 0), (0, -1), FONT_BOLD),
        ("FONTNAME",    (2, 0), (2, -1), FONT_BOLD),
        ("FONTSIZE",    (0, 0), (-1, -1), 7.5),
        ("TOPPADDING",  (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("GRID",        (0, 0), (-1, -1), 0.5, _hex("CCCCCC")),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t


# ═══════════════════════════════════════════════════════════════════════════════
#  COA — PARAMETERS TABLE (single sample group)
# ═══════════════════════════════════════════════════════════════════════════════

def _build_coa_table(
    all_rows: List[Dict[str, Any]],
    sample_labels: List[str],
    global_start_idx: int,
    limit_header: str,
) -> Table:
    """
    Build one parameters table for a single group of sample columns.

    Fixed columns: # | Parameter | Unit | [limit_header]
    Variable columns: one per sample label in `sample_labels`

    Section-header rows span the full width with ocean blue background.
    Data rows alternate white / LIGHT_BLUE.
    """
    usable_w = PAGE_W - MARGIN_L - MARGIN_R
    n_samples = len(sample_labels)

    # ── Column widths (points) ────────────────────────────────────────────────
    col_no_w     = 8  * mm
    col_param_w  = 48 * mm
    col_unit_w   = 52        # At least 52pt for Unit
    col_limit_w  = 26 * mm
    fixed_w      = col_no_w + col_param_w + col_unit_w + col_limit_w
    remaining_w  = usable_w - fixed_w
    sample_col_w = max(55, remaining_w / n_samples) if n_samples else remaining_w
    col_widths   = [col_no_w, col_param_w, col_unit_w, col_limit_w] + [sample_col_w] * n_samples

    # ── Header row ────────────────────────────────────────────────────────────
    total_cols = 4 + n_samples
    header_row = [
        Paragraph("#",          CELL_CENTRE),
        Paragraph("Parameter",  BODY_BOLD),
        Paragraph("Unit",       CELL_CENTRE),
        Paragraph(limit_header, CELL_CENTRE),
    ] + [Paragraph(lbl, SAMPLE_STYLE) for lbl in sample_labels]

    # ── Body rows ─────────────────────────────────────────────────────────────
    body_rows   = []
    section_row_idxs: List[int] = []   # track which rows are section headers
    param_counter = 0

    current_section = None
    for row in all_rows:
        sec = row.get("section")
        name = row.get("name")
        
        if sec and sec != current_section:
            section_row_idxs.append(len(body_rows) + 1)
            body_rows.append([Paragraph(sec, SECTION_STYLE)] + [""] * (total_cols - 1))
            current_section = sec
            
        if not name:
            continue

        param_counter += 1
        result_cells = []
        for si in range(n_samples):
            abs_idx = global_start_idx + si
            results = row.get("results", [])
            val = results[abs_idx] if abs_idx < len(results) else "—"
            result_cells.append(Paragraph(str(val) if val is not None else "—", CELL_CENTRE))
            
        body_rows.append([
            Paragraph(str(param_counter), CELL_CENTRE),
            Paragraph(name,  BODY_STYLE),
            Paragraph(row.get("unit", ""),  UNIT_STYLE),
            Paragraph(row.get("limit", ""), CELL_CENTRE),
            *result_cells,
        ])

    all_table_rows = [header_row] + body_rows

    # ── TableStyle ────────────────────────────────────────────────────────────
    style_cmds = [
        # Header row
        ("BACKGROUND",    (0, 0), (-1, 0),  OCEAN_BLUE),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
        ("FONTNAME",      (0, 0), (-1, 0),  FONT_BOLD),
        ("FONTSIZE",      (0, 0), (-1, 0),  7.5),
        ("ALIGN",         (0, 0), (-1, 0),  "CENTER"),
        # All cells
        ("FONTSIZE",      (0, 1), (-1, -1), 7.5),
        ("FONTNAME",      (0, 1), (-1, -1), FONT_NORMAL),
        ("TOPPADDING",    (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 3),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("INNERGRID",     (0, 0), (-1, -1), 0.25, _hex("DDDDDD")),
        ("BOX",           (0, 0), (-1, -1), 0.5,  _hex("AAAAAA")),
        # Alternating rows (data rows only)
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BLUE]),
    ]

    # Section-header rows override alternating colours and span full width
    for row_idx in section_row_idxs:
        if row_idx < len(all_table_rows):
            style_cmds += [
                ("BACKGROUND",  (0, row_idx), (-1, row_idx), OCEAN_BLUE),
                ("TEXTCOLOR",   (0, row_idx), (-1, row_idx), WHITE),
                ("FONTNAME",    (0, row_idx), (-1, row_idx), "Helvetica-Bold"),
                ("SPAN",        (0, row_idx), (-1, row_idx)),
                ("TOPPADDING",  (0, row_idx), (-1, row_idx), 2),
                ("BOTTOMPADDING", (0, row_idx), (-1, row_idx), 2),
            ]

    t = Table(all_table_rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    return t


# ═══════════════════════════════════════════════════════════════════════════════
#  DOCUMENT 1 — Certificate of Analysis
# ═══════════════════════════════════════════════════════════════════════════════

def generate_coa_pdf(cert: Dict[str, Any], output_path: Optional[str] = None) -> str:
    """
    Generate a fully branded, paginated Certificate of Analysis PDF.

    Parameters
    ----------
    cert : dict
        Keys matching the TypeScript Certificate interface in src/types.ts.
        Required: certNumber, client, dateReported, sampleType, location,
                  dateSampled, samples, tableData, sign1Name, sign1Title,
                  sign2Name, sign2Title.
        Optional: sign1SignatureImage, sign2SignatureImage (file paths or
                  base64 data-URIs beginning with "data:image/").
    output_path : str, optional
        Destination file path.  Defaults to COA_[client]_[date]_[certno].pdf.

    Returns
    -------
    str
        Absolute path of the generated PDF file.
    """
    # ── File naming ───────────────────────────────────────────────────────────
    client_clean = _safe_filename(cert.get("client", ""))
    date_clean   = re.sub(r"\D", "", cert.get("dateReported", "") or date.today().isoformat())
    cert_clean   = re.sub(r"[^A-Za-z0-9\-]", "", cert.get("certNumber", "COA"))
    if not output_path:
        output_path = f"COA_{client_clean}_{date_clean}_{cert_clean}.pdf"

    # ── Logo ──────────────────────────────────────────────────────────────────
    # Try several common locations for the logo
    logo_candidates = [
        "public/logo.png",
        "logo.png",
        os.path.join(os.path.dirname(__file__), "public", "logo.png"),
        os.path.join(os.path.dirname(__file__), "logo.png"),
    ]
    logo_reader: Optional[ImageReader] = None
    for lc in logo_candidates:
        if os.path.isfile(lc):
            try:
                logo_reader = ImageReader(lc)
                break
            except Exception:
                pass

    # ── Sample groups (dynamic based on 55pt minimum) ───────────────────────────
    samples   = cert.get("samples", []) or ["Sample 1"]
    all_rows  = cert.get("tableData", [])
    n_samples = len(samples)

    usable_w = PAGE_W - MARGIN_L - MARGIN_R
    fixed_w = 8 * mm + 48 * mm + 52 + 26 * mm
    available = usable_w - fixed_w
    max_samples_per_page = int(max(1, available / 55))
    max_samples_per_page = max(1, min(8, max_samples_per_page))

    # Chunk samples into groups of max_samples_per_page
    groups: List[List[str]] = []
    for i in range(0, max(n_samples, 1), max_samples_per_page):
        groups.append(samples[i: i + max_samples_per_page])

    # ── Limit header label ────────────────────────────────────────────────────
    sample_type = cert.get("sampleType", "")
    if "Drinking" in sample_type:
        limit_hdr = "WHO / ZABS Limit"
    elif "Waste" in sample_type:
        limit_hdr = "ZEMA Limit"
    else:
        limit_hdr = "Limit"

    # ── Signature images ─────────────────────────────────────────────────────
    sign1_img = _load_image(cert.get("sign1SignatureImage"))
    sign2_img = _load_image(cert.get("sign2SignatureImage"))

    # ── Build the story (content) ─────────────────────────────────────────────
    story = []

    # Meta fields for the information grid
    meta_fields = [
        ("Certificate No",  cert.get("certNumber",   "—")),
        ("Client",          cert.get("client",        "—")),
        ("Date Reported",   cert.get("dateReported",  "—")),
        ("Sample Type",     cert.get("sampleType",    "—")),
        ("Sample Source",   cert.get("location",      "—")),
        ("Date Sampled",    cert.get("dateSampled",   "—")),
    ]

    for group_idx, sample_group in enumerate(groups):
        global_start = group_idx * MAX_SAMPLE_COLS

        if group_idx > 0:
            story.append(PageBreak())

        # Meta grid (every page group gets the metadata for context)
        story.append(_build_meta_grid(meta_fields))
        story.append(Spacer(1, 3 * mm))

        # Sample range banner (always shown)
        banner_text = (
            f"Samples {global_start + 1}–{global_start + len(sample_group)} "
            f"of {n_samples}"
        )
        if len(groups) > 1:
            banner_text += f"  [Page group {group_idx + 1} of {len(groups)}]"
        banner_row = [Paragraph(banner_text, SECTION_STYLE), "", "", ""]
        banner_w   = PAGE_W - MARGIN_L - MARGIN_R
        banner_tbl = Table([[Paragraph(banner_text, SECTION_STYLE)]], colWidths=[banner_w])
        banner_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), OCEAN_BLUE),
            ("TEXTCOLOR",     (0, 0), (-1, -1), WHITE),
            ("FONTNAME",      (0, 0), (-1, -1), FONT_BOLD),
            ("FONTSIZE",      (0, 0), (-1, -1), 7),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ]))
        story.append(banner_tbl)
        story.append(Spacer(1, 2 * mm))

        # Parameters table for this sample column group
        story.append(
            _build_coa_table(all_rows, sample_group, global_start, limit_hdr)
        )
        story.append(Spacer(1, 3 * mm))

    # Signatories block at end
    story.append(
        SignatoryBlock(
            cert.get("sign1Name",  ""),
            cert.get("sign1Title", ""),
            sign1_img,
            cert.get("sign2Name",  ""),
            cert.get("sign2Title", ""),
            sign2_img,
        )
    )

    # ── Build document ────────────────────────────────────────────────────────
    _build_document(
        output_path, story, logo_reader,
        badge_label="CERTIFIED",
        document_title="WATER ANALYSIS CERTIFICATE",
        left_footer_label="NWSC — CERTIFIED",
    )
    return os.path.abspath(output_path)


# ═══════════════════════════════════════════════════════════════════════════════
#  DOCUMENT 2 — Service Quotation
# ═══════════════════════════════════════════════════════════════════════════════

def generate_quotation_pdf(quot: Dict[str, Any], output_path: Optional[str] = None) -> str:
    """
    Generate a fully branded Service Quotation PDF.

    Parameters
    ----------
    quot : dict
        Keys matching the TypeScript Quotation interface in src/types.ts.
    output_path : str, optional
        Destination file path. Defaults to QT_[client]_[date]_[quoteno].pdf.

    Returns
    -------
    str
        Absolute path of the generated PDF file.
    """
    # ── File naming ───────────────────────────────────────────────────────────
    client_clean = _safe_filename(quot.get("client", ""))
    date_clean   = re.sub(r"\D", "", quot.get("date", "") or date.today().isoformat())
    qno_clean    = re.sub(r"[^A-Za-z0-9\-]", "", quot.get("quoteNumber", "QT"))
    if not output_path:
        output_path = f"QT_{client_clean}_{date_clean}_{qno_clean}.pdf"

    # ── Logo ──────────────────────────────────────────────────────────────────
    logo_candidates = [
        "public/logo.png",
        "logo.png",
        os.path.join(os.path.dirname(__file__), "public", "logo.png"),
        os.path.join(os.path.dirname(__file__), "logo.png"),
    ]
    logo_reader: Optional[ImageReader] = None
    for lc in logo_candidates:
        if os.path.isfile(lc):
            try:
                logo_reader = ImageReader(lc)
                break
            except Exception:
                pass

    # ── Signature images ─────────────────────────────────────────────────────
    sign1_img = _load_image(quot.get("sign1SignatureImage"))
    sign2_img = _load_image(quot.get("sign2SignatureImage"))

    # ── Story ─────────────────────────────────────────────────────────────────
    story = []

    # Meta grid
    meta_fields = [
        ("Quote No",     quot.get("quoteNumber",  "—")),
        ("Date",         quot.get("date",          "—")),
        ("Valid Until",  quot.get("validUntil",    "—")),
        ("Status",       (quot.get("status", "draft") or "draft").upper()),
        ("Client",       quot.get("client",        "—")),
        ("Phone",        quot.get("clientPhone",   "—")),
        ("Email",        quot.get("clientEmail",   "—")),
        ("Address",      quot.get("clientAddress", "—")),
    ]
    story.append(_build_meta_grid(meta_fields))
    story.append(Spacer(1, 3 * mm))

    # Samples strip (if any)
    samples = quot.get("samples", [])
    if samples:
        banner_w = PAGE_W - MARGIN_L - MARGIN_R
        banner_text = "Samples:  " + "  |  ".join(str(s) for s in samples)
        banner_tbl = Table(
            [[Paragraph(banner_text, SECTION_STYLE)]],
            colWidths=[banner_w],
        )
        banner_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), OCEAN_BLUE),
            ("TEXTCOLOR",     (0, 0), (-1, -1), WHITE),
            ("FONTNAME",      (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 7.5),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ]))
        story.append(banner_tbl)
        story.append(Spacer(1, 3 * mm))

    # Items table
    usable_w = PAGE_W - MARGIN_L - MARGIN_R
    items_col_widths = [
        10 * mm,   # #
        72 * mm,   # Description
        14 * mm,   # Qty
        28 * mm,   # Unit Price
        28 * mm,   # VAT
        usable_w - 10 * mm - 72 * mm - 14 * mm - 28 * mm - 28 * mm,  # Subtotal
    ]
    items_header = [
        Paragraph("#",               CELL_CENTRE),
        Paragraph("Description",     BODY_BOLD),
        Paragraph("Qty",             CELL_CENTRE),
        Paragraph("Unit Price (K)",  CELL_CENTRE),
        Paragraph("VAT 16% (K)",     CELL_CENTRE),
        Paragraph("Subtotal (K)",    CELL_CENTRE),
    ]
    items_data = [items_header]
    for idx, item in enumerate(quot.get("items", [])):
        param_name = item.get("parameterName", "")
        if param_name.endswith(" Test"):
            param_name = param_name[:-5]
        items_data.append([
            Paragraph(str(idx + 1),                        CELL_CENTRE),
            Paragraph(param_name,                          BODY_STYLE),
            Paragraph(str(item.get("quantity", 1)),        CELL_CENTRE),
            Paragraph(_kwacha(item.get("unitPrice", 0)),   CELL_RIGHT),
            Paragraph(_kwacha(item.get("tax", 0)),         CELL_RIGHT),
            Paragraph(_kwacha(item.get("amount", 0)),      CELL_RIGHT),
        ])

    items_tbl = Table(items_data, colWidths=items_col_widths, repeatRows=1)
    items_tbl.setStyle(TableStyle([
        # Header
        ("BACKGROUND",    (0, 0), (-1, 0),  OCEAN_BLUE),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
        ("FONTNAME",      (0, 0), (-1, 0),  FONT_BOLD),
        ("FONTSIZE",      (0, 0), (-1, 0),  8),
        ("ALIGN",         (0, 0), (-1, 0),  "CENTER"),
        # Body
        ("FONTSIZE",      (0, 1), (-1, -1), 8),
        ("FONTNAME",      (0, 1), (-1, -1), FONT_NORMAL),
        ("TOPPADDING",    (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 3),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BLUE]),
        ("INNERGRID",     (0, 0), (-1, -1), 0.25, _hex("DDDDDD")),
        ("BOX",           (0, 0), (-1, -1), 0.5,  _hex("AAAAAA")),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 6 * mm))

    # Totals summary block (right-aligned)
    subtotal    = quot.get("subtotal",    0)
    total_tax   = quot.get("totalTax",    0)
    total_amt   = quot.get("totalAmount", 0)

    totals_w    = 90 * mm
    label_col_w = 50 * mm
    val_col_w   = totals_w - label_col_w

    totals_data = [
        [Paragraph("Subtotal",         TOTALS_NORMAL), Paragraph(_kwacha(subtotal),  CELL_RIGHT)],
        [Paragraph("Total VAT (16%)",  TOTALS_NORMAL), Paragraph(_kwacha(total_tax), CELL_RIGHT)],
        [Paragraph("GRAND TOTAL",      TOTALS_BOLD),   Paragraph(_kwacha(total_amt), TOTALS_BOLD)],
    ]
    totals_tbl = Table(totals_data, colWidths=[label_col_w, val_col_w])
    totals_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 2), (-1, 2),  DARK_BLUE),
        ("TEXTCOLOR",     (0, 2), (-1, 2),  WHITE),
        ("FONTNAME",      (0, 2), (-1, 2),  FONT_BOLD),
        ("FONTSIZE",      (0, 2), (-1, 2),  10),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("ALIGN",         (1, 0), (1, -1),  "RIGHT"),
        ("FONTNAME",      (0, 0), (-1, 1),  FONT_NORMAL),
        ("FONTSIZE",      (0, 0), (-1, 1),  8.5),
        ("BOX",           (0, 0), (-1, -1), 0.5, _hex("AAAAAA")),
        ("INNERGRID",     (0, 0), (-1, -1), 0.25, _hex("DDDDDD")),
        ("ROUNDEDCORNERS", [2], ),
    ]))

    # Right-align the totals table within the page
    outer_w = PAGE_W - MARGIN_L - MARGIN_R
    padding_w = outer_w - totals_w
    outer_data = [["", totals_tbl]]
    outer_tbl = Table(outer_data, colWidths=[padding_w, totals_w])
    outer_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))
    story.append(outer_tbl)
    story.append(Spacer(1, 8 * mm))

    # Signatories block
    story.append(
        SignatoryBlock(
            quot.get("sign1Name",  ""),
            quot.get("sign1Title", ""),
            sign1_img,
            quot.get("sign2Name",  ""),
            quot.get("sign2Title", ""),
            sign2_img,
        )
    )

    # ── Build document ────────────────────────────────────────────────────────
    _build_document(
        output_path, story, logo_reader,
        badge_label="OFFICIAL",
        document_title="SERVICE QUOTATION",
        left_footer_label="NWSC — OFFICIAL",
    )
    return os.path.abspath(output_path)


# ═══════════════════════════════════════════════════════════════════════════════
#  SHARED: two-pass document builder (enables "Page X of Y")
# ═══════════════════════════════════════════════════════════════════════════════

def _build_document(
    output_path: str,
    story: list,
    logo_reader: Optional[ImageReader],
    badge_label: str,
    document_title: str,
    left_footer_label: str,
) -> None:
    """
    Two-pass build using ReportLab's BaseDocTemplate + PageTemplate.

    Pass 1: determine total page count.
    Pass 2: render with correct "Page X of Y" in every footer.
    """
    header_total = 42 * mm + 10 * mm   # navy bar + title banner
    footer_total = 15 * mm

    frame = Frame(
        x1=MARGIN_L,
        y1=footer_total,
        width=PAGE_W - MARGIN_L - MARGIN_R,
        height=PAGE_H - header_total - footer_total - 4 * mm,
        leftPadding=0, rightPadding=0, topPadding=2 * mm, bottomPadding=0,
        id="content",
    )

    # We build to a BytesIO first with a placeholder, then again to file.
    # ReportLab's SimpleDocTemplate doesn't give us total page count during build.
    # We use a two-pass approach via a mutable container.

    class _TwoPassDoc(BaseDocTemplate):
        def __init__(self, filename, total_pages_ref, **kw):
            super().__init__(filename, **kw)
            self._total_pages_ref = total_pages_ref

        def handle_pageEnd(self):
            super().handle_pageEnd()

    total_pages_container = [0]

    def make_template(total_ref_list):
        def on_page(canvas, doc_ref):
            _place_watermark(canvas, logo_reader)
            _draw_header_canvas(canvas, logo_reader, badge_label, document_title)
            page_num   = canvas.getPageNumber()
            total      = total_ref_list[0]
            _draw_footer_canvas(canvas, page_num, total if total else "?", left_footer_label)
        return on_page

    def _render(dest, total_ref_list):
        doc = BaseDocTemplate(
            dest,
            pagesize=A4,
            leftMargin=MARGIN_L,
            rightMargin=MARGIN_R,
            topMargin=header_total + 4 * mm,
            bottomMargin=footer_total + 2 * mm,
        )
        tmpl = PageTemplate(
            id="main",
            frames=[frame],
            onPage=make_template(total_ref_list),
        )
        doc.addPageTemplates([tmpl])
        doc.build(story)
        return doc

    # Pass 1 — count pages (render to BytesIO)
    buf = io.BytesIO()
    doc1 = _render(buf, [0])
    total_pages = doc1.page
    total_pages_container[0] = total_pages

    # Pass 2 — render to actual file with correct total
    _render(output_path, total_pages_container)


# ═══════════════════════════════════════════════════════════════════════════════
#  STANDALONE TEST  (python pdf_generator.py)
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys
    # Quick self-test with a tiny dataset; import test_generation for full suite.
    print("Running quick self-test …")

    micro_cert = {
        "certNumber":   "COA-2025-001",
        "client":       "Test Client",
        "dateReported": "2025-06-01",
        "dateSampled":  "2025-05-28",
        "sampleType":   "Drinking Water",
        "location":     "Tap Water, Riverside",
        "samples":      ["Sample 1"],
        "sign1Name":    "John Phiri",
        "sign1Title":   "Laboratory Technologist",
        "sign2Name":    "Mary Banda",
        "sign2Title":   "SHEQ Manager",
        "tableData": [
            {"section": "Physical Parameters"},
            {"name": "pH",         "unit": "",       "limit": "6.5 \u2013 8.5", "results": ["7.2"]},
            {"name": "Turbidity",  "unit": "NTU",    "limit": "\u2264 4",       "results": ["1.1"]},
            {"name": "Temperature","unit": "\u00b0C", "limit": "< 25",          "results": ["22"]},
            {"section": "Chemical Parameters"},
            {"name": "Nitrate (NO\u2083\u207b)", "unit": "mg/L",  "limit": "\u2264 50",  "results": ["8.5"]},
            {"name": "Sulphate (SO\u2084\u00b2\u207b)", "unit": "mg/L", "limit": "\u2264 250", "results": ["45"]},
            {"name": "Conductivity", "unit": "\u00b5S/cm", "limit": "\u2264 1000", "results": ["320"]},
            {"section": "Microbiological Parameters"},
            {"name": "Total Coliforms (T/Coli)", "unit": "CFU/100mL", "limit": "0", "results": ["0"]},
            {"name": "Faecal Coliforms (F/Coli)", "unit": "CFU/100mL", "limit": "0", "results": ["0"]},
            {"name": "HPC (22\u00B0C)",           "unit": "CFU/mL",    "limit": "\u2264 100", "results": ["42"]},
        ],
    }

    path = generate_coa_pdf(micro_cert)
    print(f"  COA PDF → {path}")

    micro_quot = {
        "quoteNumber":   "QT-2025-001",
        "client":        "Test Client",
        "clientAddress": "123 Test Road, Kitwe",
        "clientPhone":   "+260 977 000000",
        "clientEmail":   "test@example.com",
        "date":          "2025-06-01",
        "validUntil":    "2025-06-30",
        "status":        "draft",
        "samples":       ["Tap Water Sample 1", "Tap Water Sample 2"],
        "items": [
            {"parameterName": "pH Analysis",          "quantity": 1, "unitPrice": 50.0,  "tax": 8.0,  "amount": 58.0},
            {"parameterName": "Turbidity Analysis",   "quantity": 1, "unitPrice": 75.0,  "tax": 12.0, "amount": 87.0},
            {"parameterName": "Nitrate Analysis",     "quantity": 1, "unitPrice": 150.0, "tax": 24.0, "amount": 174.0},
            {"parameterName": "Microbiological Tests","quantity": 2, "unitPrice": 200.0, "tax": 32.0, "amount": 432.0},
        ],
        "subtotal":     475.0,
        "totalTax":     76.0,
        "totalAmount":  751.0,
        "sign1Name":    "Mary Banda",
        "sign1Title":   "SHEQ Manager (Authorised Officer)",
        "sign2Name":    "John Phiri",
        "sign2Title":   "Laboratory Technologist",
    }

    path2 = generate_quotation_pdf(micro_quot)
    print(f"  Quotation PDF → {path2}")
    print("Self-test complete.")
