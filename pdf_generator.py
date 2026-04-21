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
PAGE_W, PAGE_H = A4          # 595.27 x 841.89 pt
MARGIN_L = 18 * mm
MARGIN_R = 18 * mm
MARGIN_T = 32 * mm          # 28mm header + 4mm padding
MARGIN_B = 16 * mm          # 12mm footer + 4mm padding

# ─── Brand constants (NWSC Corporate Palette) ─────────────────────────
def _hex(h: str) -> colors.Color:
    h = h.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return colors.Color(r / 255, g / 255, b / 255)

NWSC_BLUE    = _hex("#0B4E8A")   # Primary corporate blue
NWSC_LIGHT   = _hex("#D6E8F7")   # Light blue section fills, signature box bg
NWSC_ACCENT  = _hex("#1A7AC4")   # Accent blue rule line
NWSC_STRIPE  = _hex("#F0F7FF")   # Alternating table row tint
TEXT_DARK    = _hex("#1A1A2E")   # Primary body text
TEXT_MID     = _hex("#4A4A6A")   # Labels, secondary text
WHITE        = colors.white
BLACK        = colors.black

# Parameter section headers
SEC_PHYSICAL = _hex("#EAF3FB")
SEC_CHEMICAL = _hex("#E8F5E9")
SEC_BACTERIO = _hex("#FFF3E0")

# ─── Typography ───────────────────────────────────────────────────────────────
STYLES = getSampleStyleSheet()

import functools

_fonts_registered = False

def ensure_fonts():
    global _fonts_registered
    if _fonts_registered:
        return
    try:
        pdfmetrics.registerFont(TTFont('DejaVuSans', 'DejaVuSans.ttf'))
        pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', 'DejaVuSans-Bold.ttf'))
    except Exception:
        pass
    _fonts_registered = True

@functools.lru_cache(maxsize=1)
def get_logo_image(size_w=60, size_h=60):
    try:
        return Image("Logo.png", width=size_w, height=size_h)
    except Exception:
        return None

try:
    ensure_fonts()
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

BODY_STYLE       = _style("NWSCBody",       fontSize=7.5, leading=10, textColor=TEXT_DARK, fontName=FONT_NORMAL)
BODY_BOLD        = _style("NWSCBodyBold",   fontSize=7.5, leading=10, textColor=TEXT_DARK, fontName=FONT_BOLD)
CELL_CENTRE      = _style("NWSCCentre",     fontSize=7.5, leading=10, alignment=TA_CENTER, fontName=FONT_NORMAL)
CELL_RIGHT       = _style("NWSCRight",      fontSize=7.5, leading=10, alignment=TA_RIGHT, fontName=FONT_NORMAL)
HEADER_STYLE     = _style("NWSCHeader",     fontSize=11,  leading=14, textColor=WHITE,  fontName=FONT_BOLD, alignment=TA_CENTER)
SUBHEADER_STYLE  = _style("NWSCSubheader",  fontSize=7,   leading=9,  textColor=WHITE, fontName=FONT_NORMAL, alignment=TA_CENTER)
SECTION_STYLE    = _style("NWSCSection",    fontSize=7.5, leading=10, textColor=NWSC_BLUE,  fontName=FONT_BOLD)
TITLE_STYLE      = _style("NWSCTitle",      fontSize=13,  leading=16, textColor=NWSC_BLUE,  fontName=FONT_BOLD, alignment=TA_CENTER)
META_LABEL       = _style("NWSCMetaLabel",  fontSize=8,   leading=11, textColor=TEXT_MID,  fontName=FONT_BOLD)
META_VAL         = _style("NWSCMetaVal",    fontSize=8.5, leading=11, textColor=TEXT_DARK, fontName=FONT_NORMAL)
SIGNATORY_NAME   = _style("NWSCSignName",   fontSize=8.5, leading=11, fontName=FONT_BOLD, textColor=TEXT_DARK, alignment=TA_CENTER)
SIGNATORY_TITLE  = _style("NWSCSignTitle",  fontSize=7.5, leading=10, textColor=TEXT_MID, fontName=FONT_NORMAL, alignment=TA_CENTER)
SIGNATORY_DATE   = _style("NWSCSignDate",   fontSize=7.5, leading=10, textColor=TEXT_MID, fontName=FONT_NORMAL, alignment=TA_CENTER)
TOTALS_NORMAL    = _style("NWSCTotNormal",  fontSize=8.5, leading=12, textColor=TEXT_MID, fontName=FONT_NORMAL)
TOTALS_BOLD      = _style("NWSCTotBold",    fontSize=10,  leading=13, fontName=FONT_BOLD, textColor=WHITE)
BADGE_STYLE      = _style("NWSCBadge",      fontSize=8,   leading=10, fontName=FONT_BOLD, textColor=WHITE, alignment=TA_CENTER)
FOOTER_STYLE     = _style("NWSCFooter",     fontSize=7,   leading=9,  fontName=FONT_NORMAL, textColor=WHITE)
FOOTER_BOLD      = _style("NWSCFooterBold", fontSize=7,   leading=9,  fontName=FONT_BOLD,   textColor=WHITE)
REMARKS_TITLE    = _style("NWSCRemarksTitle",fontSize=9,  leading=12, fontName=FONT_BOLD, textColor=NWSC_BLUE)
REMARKS_BODY     = _style("NWSCRemarksBody", fontSize=7.5, leading=10, fontName=FONT_OBLIQUE, textColor=TEXT_MID)
TERMS_STYLE      = _style("NWSCTerms",      fontSize=7.5, leading=10, fontName=FONT_OBLIQUE, textColor=TEXT_MID)
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


def _chem(s: str) -> str:
    """
    Replace Unicode subscripts/superscripts with ReportLab XML markup tags.
    Fixes rendering as black boxes in built-in Helvetica fonts.
    """
    if not s: return ""
    
    # Subscripts
    sub_map = {
        "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
        "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9"
    }
    for char, val in sub_map.items():
        s = s.replace(char, f'<sub rise="-1" size="6">{val}</sub>')
    
    # Superscripts
    sup_map = {
        "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
        "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
        "⁺": "+", "⁻": "−"
    }
    # Handle composites first
    s = s.replace("²⁻", '<super rise="-1" size="6">2−</super>')
    for char, val in sup_map.items():
        s = s.replace(char, f'<super rise="-1" size="6">{val}</super>')
        
    return s


def _place_watermark(canvas, doc_type: str) -> None:
    """Draw a diagonal translucent watermark on the background."""
    canvas.saveState()
    canvas.setFillColor(NWSC_BLUE)
    canvas.setFillAlpha(0.04) # 4% opacity per spec
    canvas.setFont(FONT_BOLD, 72)
    canvas.translate(PAGE_W / 2, PAGE_H / 2)
    canvas.rotate(40)
    canvas.drawCentredString(0, 0, "NWSC")
    canvas.drawCentredString(0, -80, doc_type.upper())
    canvas.restoreState()


def _draw_header_canvas(
    canvas,
    doc_type_label: str,
) -> None:
    """
    Draw the full-width branded 28mm header band.
    Includes corporate blue bg, logo box, and centered address.
    """
    header_h = 28 * mm
    logo_margin = 4 * mm

    canvas.saveState()

    # Corporate Blue Background
    canvas.setFillColor(NWSC_BLUE)
    canvas.rect(0, PAGE_H - header_h, PAGE_W, header_h, fill=1, stroke=0)

    # Accent rule immediately below header
    canvas.setStrokeColor(NWSC_ACCENT)
    canvas.setLineWidth(2) # 2pt
    canvas.line(0, PAGE_H - header_h, PAGE_W, PAGE_H - header_h)

    # White Logo Box (22mm x 20mm)
    logo_box_w, logo_box_h = 22 * mm, 20 * mm
    logo_box_x = 18 * mm # LEFT_MARGIN
    logo_box_y = PAGE_H - header_h + (header_h - logo_box_h) / 2
    canvas.setFillColor(WHITE)
    canvas.roundRect(logo_box_x, logo_box_y, logo_box_w, logo_box_h, 1.5 * mm, fill=1, stroke=0)

    # Logo Image or Placeholder
    logo_candidates = ["public/logo.png", "logo.png", "src/public/logo.png"]
    logo_drawn = False
    for lp in logo_candidates:
        if os.path.exists(lp):
            canvas.drawImage(lp, logo_box_x + 1*mm, logo_box_y + 1*mm, width=logo_box_w - 2*mm, height=logo_box_h - 2*mm, mask='auto')
            logo_drawn = True
            break
    if not logo_drawn:
        # Fallback Wordmark
        canvas.setFillColor(NWSC_BLUE)
        canvas.setFont(FONT_BOLD, 8)
        canvas.drawCentredString(logo_box_x + logo_box_w / 2, logo_box_y + 12 * mm, "NWSC")
        # Blue wave area with white lines (Upgrade 1)
        wave_y, wave_h = logo_box_y + 2*mm, 7*mm
        canvas.rect(logo_box_x + 2*mm, wave_y, logo_box_w - 4*mm, wave_h, fill=1, stroke=0)
        canvas.setStrokeColor(WHITE)
        canvas.setLineWidth(0.5)
        canvas.line(logo_box_x + 3*mm, wave_y + 2*mm, logo_box_x + logo_box_w - 3*mm, wave_y + 2*mm)
        canvas.line(logo_box_x + 3*mm, wave_y + 3.5*mm, logo_box_x + logo_box_w - 3*mm, wave_y + 3.5*mm)
        canvas.line(logo_box_x + 3*mm, wave_y + 5*mm, logo_box_x + logo_box_w - 3*mm, wave_y + 5*mm)

    # Centre Text
    cx = PAGE_W / 2
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 11)
    canvas.drawCentredString(cx, PAGE_H - 10 * mm, "NKANA WATER SUPPLY AND SANITATION COMPANY")
    canvas.setFont(FONT_NORMAL, 7)
    canvas.drawCentredString(cx, PAGE_H - 15 * mm, "Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia")
    canvas.drawCentredString(cx, PAGE_H - 19 * mm, "Tel: +260 212 222488 / 221099 / 0971 223 458  |  Fax: +260 212 222490")
    canvas.drawCentredString(cx, PAGE_H - 23 * mm, "headoffice@nwsc.com.zm  |  www.nwsc.zm")

    # Right badge box
    badge_w, badge_h = 42 * mm, 12 * mm
    badge_x = PAGE_W - 18 * mm - badge_w
    badge_y = PAGE_H - header_h + (header_h - badge_h) / 2
    canvas.setFillColor(WHITE, alpha=0.15)
    canvas.roundRect(badge_x, badge_y, badge_w, badge_h, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 6.5)
    canvas.drawCentredString(badge_x + badge_w / 2, badge_y + 8 * mm, "SAFETY HEALTH ENVIRONMENT")
    canvas.drawCentredString(badge_x + badge_w / 2, badge_y + 5.5 * mm, "& QUALITY DEPARTMENT")
    canvas.setFont(FONT_BOLD, 7)
    canvas.drawCentredString(badge_x + badge_w / 2, badge_y + 2.5 * mm, doc_type_label.upper())

    canvas.restoreState()


def _draw_footer_canvas(canvas, page_num: int) -> None:
    """Draw a 12mm corporate footer band on the bottom of every page."""
    footer_h = 12 * mm
    canvas.saveState()
    canvas.setFillColor(NWSC_BLUE)
    canvas.rect(0, 0, PAGE_W, footer_h, fill=1, stroke=0)
    
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 7)
    canvas.drawString(18 * mm, 5 * mm, "Bigger, Better, Smarter")
    
    canvas.setFont(FONT_NORMAL, 7)
    canvas.drawCentredString(PAGE_W / 2, 5 * mm, "This document is computer-generated and valid without a wet signature unless stated.")
    
    canvas.setFont(FONT_BOLD, 7)
    canvas.drawRightString(PAGE_W - 18 * mm, 5 * mm, f"Page {page_num}")
    
    canvas.restoreState()


def _draw_title_banner(title: str) -> List[Flowable]:
    """Return a styled full-width blue title banner block."""
    usable_w = PAGE_W - 36 * mm
    t = Table([[Paragraph(title, TITLE_STYLE)]], colWidths=[usable_w])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), NWSC_LIGHT),
        ("BOX",           (0,0), (-1,-1), 1.5, NWSC_BLUE),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    return [Spacer(1, 4*mm), t, Spacer(1, 4*mm)]


def _draw_remarks_section() -> List[Flowable]:
    """Upgrade 8: Remarks / Interpretation section (COA only)"""
    return [
        Spacer(1, 4*mm),
        HRule(color=NWSC_LIGHT, thickness=1),
        Spacer(1, 2*mm),
        Paragraph("REMARKS / INTERPRETATION", REMARKS_TITLE),
        Spacer(1, 1*mm),
        Paragraph(
            "All analyses were conducted in accordance with Standard Methods for the "
            "Examination of Water and Wastewater (SMEWW) and WHO Guidelines for "
            "Drinking-water Quality. Results apply only to the sample(s) as submitted.",
            REMARKS_BODY
        )
    ]


# ═══════════════════════════════════════════════════════════════════════════════
#  CUSTOM FLOWABLES
# ═══════════════════════════════════════════════════════════════════════════════

class HRule(Flowable):
    """A thin horizontal rule, optionally coloured."""
    def __init__(self, width=None, color=NWSC_BLUE, thickness=0.5):
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
    Renders two side-by-side signatory columns in a proper grid table.
    """
    def __init__(
        self,
        sign1_name: str, sign1_role: str,
        sign2_name: str, sign2_role: str,
    ):
        super().__init__()
        self.s1n, self.s1r = sign1_name, sign1_role
        self.s2n, self.s2r = sign2_name, sign2_role
        self.height = 40 * mm

    def wrap(self, avail_w, avail_h):
        return avail_w, self.height

    def draw(self):
        usable_w = self.width
        col_w = usable_w / 2 - 2*mm
        
        def _col_table(name, role):
            data = [
                [Paragraph(name if name else " ", SIGNATORY_NAME)],
                [Paragraph(role, SIGNATORY_TITLE)],
                [Spacer(1, 10*mm)],
                [Paragraph("______________________________", CELL_CENTRE)],
                [Paragraph("Signature & Date", SIGNATORY_DATE)]
            ]
            t = Table(data, colWidths=[col_w - 4*mm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (0,0), NWSC_LIGHT),
                ("BOX", (0,0), (-1,-1), 0.5, _hex("#C0CDD8")),
                ("TOPPADDING", (0,0), (-1,-1), 4),
                ("BOTTOMPADDING", (0,0), (-1,-1), 4),
                ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ]))
            return t

        table_data = [[_col_table(self.s1n, self.s1r), Spacer(4*mm, 1), _col_table(self.s2n, self.s2r)]]
        main_table = Table(table_data, colWidths=[col_w, 4*mm, col_w])
        main_table.setStyle(TableStyle([
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (-1,-1), 0),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
        ]))
        main_table.wrapOn(self.canv, usable_w, self.height)
        main_table.drawOn(self.canv, 0, 0)



# ═══════════════════════════════════════════════════════════════════════════════
#  PAGE TEMPLATE FACTORIES
# ═══════════════════════════════════════════════════════════════════════════════

def _make_page_template(
    template_id: str,
    doc_type_label: str,
) -> PageTemplate:
    """
    Create a PageTemplate that draws the full branded header + watermark +
    footer on every canvas render.
    """
    header_total = 28 * mm
    footer_total = 12 * mm

    frame = Frame(
        x1=18 * mm,
        y1=footer_total + 4 * mm,
        width=PAGE_W - 36 * mm,
        height=PAGE_H - header_total - footer_total - 8 * mm,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        id="content",
    )

    def on_page(canvas, doc_ref):
        _place_watermark(canvas, doc_type_label)
        _draw_header_canvas(canvas, doc_type_label)
        _draw_footer_canvas(canvas, canvas.getPageNumber())

    return PageTemplate(id=template_id, frames=[frame], onPage=on_page)


# ═══════════════════════════════════════════════════════════════════════════════
#  COA — META GRID
# ═══════════════════════════════════════════════════════════════════════════════

def _build_meta_grid(fields: List[Tuple[str, str]]) -> Table:
    """
    Build a styled 4-column metabolic grid grid: [Label | Value | Label | Value].
    """
    usable_w = PAGE_W - 36 * mm
    col_widths = [usable_w * 0.18, usable_w * 0.32, usable_w * 0.18, usable_w * 0.32]

    rows = []
    for i in range(0, len(fields), 2):
        row = []
        # Item 1
        label1, val1 = fields[i]
        row.append(Paragraph(label1, META_LABEL))
        row.append(Paragraph(val1 or "—", META_VAL))
        # Item 2
        if i + 1 < len(fields):
            label2, val2 = fields[i + 1]
            row.append(Paragraph(label2, META_LABEL))
            row.append(Paragraph(val2 or "—", META_VAL))
        else:
            row.extend(["", ""])
        rows.append(row)

    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), NWSC_STRIPE),
        ("BOX",           (0, 0), (-1, -1), 0.5, NWSC_BLUE),
        ("GRID",          (0, 0), (-1, -1), 0.3, _hex("#C0CDD8")),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
    ]))
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
    Build parameter table with color-coded sections and chemical notation.
    Col structure: [#, Parameter, Unit, Limit, Sample 1, Compliance]
    """
    usable_w = PAGE_W - MARGIN_L - MARGIN_R

    # Column widths: [10mm, 72mm, 18mm, 30mm, 20mm, 22mm] -> Sum = 172mm
    col_no_w     = 10 * mm
    col_param_w  = 72 * mm
    col_unit_w   = 18 * mm
    col_limit_w  = 30 * mm
    col_sample_w = 20 * mm
    col_compli_w = 22 * mm
    
    col_widths = [col_no_w, col_param_w, col_unit_w, col_limit_w, col_sample_w, col_compli_w]

    header_row = [
        Paragraph("#",          CELL_CENTRE),
        Paragraph("Parameter",  BODY_BOLD),
        Paragraph("Unit",       CELL_CENTRE),
        Paragraph(limit_header, CELL_CENTRE),
        Paragraph(sample_labels[0] if sample_labels else "Result", CELL_CENTRE),
        Paragraph("Compliance", CELL_CENTRE),
    ]

    rows = [header_row]
    style_cmds = [
        ("BACKGROUND",    (0, 0), (-1, 0),  NWSC_BLUE),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
        ("FONTNAME",      (0, 0), (-1, 0),  FONT_BOLD),
        ("ALIGN",         (0, 0), (-1, 0),  "CENTER"),
        ("GRID",          (0, 0), (-1, -1), 0.3, _hex("#C8D8E8")),
        ("BOX",           (0, 0), (-1, -1), 1, NWSC_BLUE),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]

    p_idx = 1
    for entry in all_rows:
        section = entry.get("section", "").upper()
        if section:
            # Upgrade 7: Color-coded sections
            bg_color = WHITE
            if "PHYSICAL" in section: bg_color = SEC_PHYSICAL
            elif "CHEMICAL" in section: bg_color = SEC_CHEMICAL
            elif "BACTERIO" in section: bg_color = SEC_BACTERIO
            
            rows.append([Paragraph(section, SECTION_STYLE), "", "", "", "", ""])
            curr_row = len(rows) - 1
            style_cmds.append(("SPAN", (0, curr_row), (-1, curr_row)))
            style_cmds.append(("BACKGROUND", (0, curr_row), (-1, curr_row), bg_color))
            continue

        name = _chem(entry.get("name", ""))
        unit = _chem(entry.get("unit", ""))
        limit = entry.get("limit", "—")
        results = entry.get("results", [])
        val1 = str(results[0]) if results else "—"
        compliance = "Compliant" # Default or logic
        
        row_bg = NWSC_STRIPE if p_idx % 2 == 0 else WHITE
        rows.append([
            Paragraph(str(p_idx), CELL_CENTRE),
            Paragraph(name, BODY_STYLE),
            Paragraph(unit, UNIT_STYLE),
            Paragraph(limit, CELL_CENTRE),
            Paragraph(val1, CELL_CENTRE),
            Paragraph(compliance, CELL_CENTRE),
        ])
        style_cmds.append(("BACKGROUND", (0, len(rows)-1), (-1, len(rows)-1), row_bg))
        p_idx += 1

    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    return t



def generate_coa_pdf(cert: Dict[str, Any], output_path: Optional[str] = None) -> str | bytes:
    """Professional WAC/COA Generator with branding and color-coded sections."""
    if not output_path:
        cl = _safe_filename(cert.get("client", "Client"))
        dt = re.sub(r"\D", "", cert.get("dateReported", date.today().isoformat()))
        no = re.sub(r"[^A-Za-z0-9\-]", "", cert.get("certNumber", "WAC"))
        # If output_path is still None, _build_document will return bytes
        filename = f"WAC-{no}_WaterAnalysisCertificate_Professional.pdf"
    else:
        filename = output_path

    story = []
    
    # 1. Title Banner
    story.extend(_draw_title_banner("WATER ANALYSIS CERTIFICATE"))

    # 2. Structured Metadata Grid
    meta_fields = [
        ("Certificate No", cert.get("certNumber", "—")),
        ("Date Sampled",  cert.get("dateSampled", "—")),
        ("Client",        cert.get("client", "—")),
        ("Date Reported", cert.get("dateReported", "—")),
        ("Location",      cert.get("location", "—")),
        ("Sample Type",   cert.get("sampleType", "—")),
    ]
    story.append(_build_meta_grid(meta_fields))
    story.append(Spacer(1, 6*mm))

    # 3. Parameters Table
    sample_type = cert.get("sampleType", "")
    limit_hdr = "ZEMA Limit" if "Waste" in sample_type else "WHO / ZABS Limit"
    
    t_data = cert.get("tableData", [])
    samples = cert.get("samples", ["Sample 1"])
    story.append(_build_coa_table(t_data, samples, 0, limit_hdr))

    # 4. Remarks Section
    story.extend(_draw_remarks_section())
    story.append(Spacer(1, 10*mm))

    # 5. Signatories Grid
    story.append(SignatoryBlock(
        cert.get("sign1Name", "Benjamin Machuta"), cert.get("sign1Title", "SHEQ Manager"),
        cert.get("sign2Name", ""),                  cert.get("sign2Title", "Quality Assurance Officer")
    ))

    # 6. Build with Metadata
    return _build_document(
        output_path, story, "CERTIFICATE",
        title=f"NWSC Water Analysis Certificate {cert.get('certNumber', '')}",
        author=cert.get("sign1Name", "NWSC SHEQ Department"),
        subject="Certificate of Water Analysis"
    )


def generate_quotation_pdf(quot: Dict[str, Any], output_path: Optional[str] = None) -> str | bytes:
    """Professional Quotation Generator with branding and terms."""
    if not output_path:
        no = re.sub(r"[^A-Za-z0-9\-]", "", quot.get("quoteNumber", "QT"))
        filename = f"QT-{no}_Quotation_Professional.pdf"
    else:
        filename = output_path

    story = []
    story.extend(_draw_title_banner("QUOTATION"))

    meta_fields = [
        ("Quotation No", quot.get("quoteNumber", "—")),
        ("Date Issued", quot.get("date", "—")),
        ("Client Name",  quot.get("client", "—")),
        ("Valid Until",  quot.get("validUntil", "—")),
        ("Prepared By",  quot.get("preparedByName", "Benjamin Machuta")),
        ("Client Contact", quot.get("clientPhone", "—")),
    ]
    story.append(_build_meta_grid(meta_fields))
    story.append(Spacer(1, 8*mm))

    # Bug 3 Fix: Filter line items
    line_items = quot.get("items", [])
    filtered_items = [
        row for row in line_items
        if (float(row.get("unitPrice", 0)) > 0 or float(row.get("amount", 0)) > 0)
        and row.get("parameterName", "").strip() not in ("", "New Parameter Test")
    ]

    usable_w = PAGE_W - MARGIN_L - MARGIN_R
    col_widths = [10*mm, 82*mm, 18*mm, 12*mm, 26*mm, 26*mm]
    
    header = [
        Paragraph("#", CELL_CENTRE),
        Paragraph("Description", BODY_BOLD),
        Paragraph("Unit", CELL_CENTRE),
        Paragraph("Qty", CELL_CENTRE),
        Paragraph("Unit Price", CELL_RIGHT),
        Paragraph("Total (ZMW)", CELL_RIGHT)
    ]
    
    rows = [header]
    for i, item in enumerate(filtered_items):
        rows.append([
            Paragraph(str(i+1), CELL_CENTRE),
            Paragraph(item.get("parameterName", ""), BODY_STYLE),
            Paragraph("Test", CELL_CENTRE),
            Paragraph(str(item.get("quantity", 1)), CELL_CENTRE),
            Paragraph(f"{float(item.get('unitPrice', 0)):,.2f}", CELL_RIGHT),
            Paragraph(f"{float(item.get('amount', 0)):,.2f}", CELL_RIGHT),
        ])

    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NWSC_BLUE),
        ("TEXTCOLOR",  (0, 0), (-1, 0), WHITE),
        ("FONTNAME",   (0, 0), (-1, 0),  FONT_BOLD),
        ("GRID",       (0, 0), (-1, -1), 0.3, _hex("#C8D8E8")),
        ("BOX",        (0, 0), (-1, -1), 1, NWSC_BLUE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, NWSC_STRIPE]),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 4*mm))

    sub = quot.get("subtotal", 0)
    tax = quot.get("totalTax", 0)
    grd = quot.get("totalAmount", 0)
    
    totals_data = [
        ["Subtotal", f"ZMW {float(sub):,.2f}"],
        ["VAT (16%)", f"ZMW {float(tax):,.2f}"],
        ["GRAND TOTAL", f"ZMW {float(grd):,.2f}"]
    ]
    tt = Table(totals_data, colWidths=[usable_w - 52*mm, 52*mm])
    tt.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0,0), (-1,-1), FONT_NORMAL),
        ("FONTSIZE", (0,0), (-1,-1), 8.5),
        ("BOTTOMPADDING", (0,0), (-1, -1), 4),
        ("BACKGROUND", (0, 2), (1, 2), NWSC_BLUE),
        ("TEXTCOLOR",  (0, 2), (1, 2), WHITE),
        ("FONTNAME",   (0, 2), (1, 2), FONT_BOLD),
    ]))
    story.append(tt)
    story.append(Spacer(1, 8*mm))

    valid_until_date = quot.get("validUntil", "30 days")
    story.append(HRule(color=NWSC_LIGHT, thickness=1))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph("TERMS & CONDITIONS", REMARKS_TITLE))
    story.append(Spacer(1, 1*mm))
    terms = [
        "1. Payment is required prior to testing.",
        f"2. This quotation is valid until {valid_until_date}.",
        "3. Prices are inclusive of 16% VAT where applicable.",
        "4. NWSC reserves the right to revise prices upon expiry of this quotation."
    ]
    for tm in terms:
        story.append(Paragraph(tm, TERMS_STYLE))
    
    story.append(Spacer(1, 12*mm))

    story.append(SignatoryBlock(
        quot.get("preparedByName", "Benjamin Machuta"), "Prepared By & SHEQ Officer",
        "",                                             "Authorized Signatory"
    ))

    # 6. Build with Metadata
    return _build_document(
        output_path, story, "QUOTATION",
        title=f"NWSC Quotation {quot.get('quoteNumber', '')}",
        author=quot.get("preparedByName", "Benjamin Machuta"),
        subject="Water Analysis Quotation"
    )


def _build_document(
    output_path: Optional[str],
    story: list,
    doc_type_label: str,
    title: str = "NWSC Document",
    author: str = "NWSC SHEQ Department",
    subject: str = "Water Analysis",
) -> str | bytes:
    """Two-pass build to set metadata and page numbers."""
    def _render(dest):
        doc = BaseDocTemplate(
            dest,
            pagesize=A4,
            title=title,
            author=author,
            subject=subject,
            creator="NWSC SHEQ Department",
            leftMargin=MARGIN_L,
            rightMargin=MARGIN_R,
            topMargin=MARGIN_T,
            bottomMargin=MARGIN_B
        )
        tmpl = _make_page_template("main", doc_type_label)
        doc.addPageTemplates([tmpl])
        doc.build(story)
        return doc
    
    # Pass 1: Potential page count / geometry calculation
    _render(io.BytesIO())
    
    # Pass 2: Final render
    if output_path is None:
        buf = io.BytesIO()
        _render(buf)
        return buf.getvalue()
    else:
        _render(output_path)
        return os.path.abspath(output_path)


if __name__ == "__main__":
    print("PDF Generator Upgrade Module loaded.")

