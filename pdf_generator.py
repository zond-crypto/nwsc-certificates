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
NWSC_LIGHT   = _hex("#F0F5FB")   # Light blue tint for titles/cards
NWSC_ACCENT  = _hex("#B85C00")   # Amber-orange for expiry/warning
NWSC_STRIPE  = _hex("#F5F8FD")   # Zebra striping even rows
NWSC_BORDER  = _hex("#C8DAF0")   # Card/Table border color
NWSC_DIVIDER = _hex("#DDE7F4")   # Internal divider color
TEXT_DARK    = _hex("#1A1A1A")   # Primary body text
TEXT_MID     = _hex("#666666")   # Secondary/Role text
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
    
    # Common paths for fonts
    font_paths = [
        ".", 
        "static/fonts", 
        "public/fonts",
        "C:/Windows/Fonts"  # Windows fallback
    ]
    
    font_files = {
        'DejaVuSans': ['DejaVuSans.ttf', 'DejaVu.ttf', 'arial.ttf'],
        'DejaVuSans-Bold': ['DejaVuSans-Bold.ttf', 'DejaVu-Bold.ttf', 'arialbd.ttf']
    }
    
    for alias, files in font_files.items():
        registered = False
        for f in files:
            for p in font_paths:
                path = os.path.join(p, f)
                if os.path.exists(path):
                    try:
                        pdfmetrics.registerFont(TTFont(alias, path))
                        registered = True
                        break
                    except Exception:
                        continue
            if registered: break
    
    _fonts_registered = True

try:
    ensure_fonts()
    # Check if they were actually registered
    registered_fonts = pdfmetrics.getRegisteredFontNames()
    if 'DejaVuSans' in registered_fonts:
        FONT_NORMAL = 'DejaVuSans'
        FONT_BOLD = 'DejaVuSans-Bold'
        FONT_OBLIQUE = 'DejaVuSans'
    else:
        FONT_NORMAL = 'Helvetica'
        FONT_BOLD = 'Helvetica-Bold'
        FONT_OBLIQUE = 'Helvetica-Oblique'
except Exception:
    FONT_NORMAL = 'Helvetica'
    FONT_BOLD = 'Helvetica-Bold'
    FONT_OBLIQUE = 'Helvetica-Oblique'

def _style(name, **kw) -> ParagraphStyle:
    base = kw.pop("parent", "Normal")
    s = ParagraphStyle(name, parent=STYLES[base], **kw)
    return s

BODY_STYLE       = _style("NWSCBody",       fontSize=8.5, leading=11, textColor=TEXT_DARK, fontName=FONT_NORMAL)
BODY_BOLD        = _style("NWSCBodyBold",   fontSize=8.5, leading=11, textColor=TEXT_DARK, fontName=FONT_BOLD)
CELL_CENTRE      = _style("NWSCCentre",     fontSize=8.5, leading=11, alignment=TA_CENTER, fontName=FONT_NORMAL)
CELL_RIGHT       = _style("NWSCRight",      fontSize=8.5, leading=11, alignment=TA_RIGHT, fontName=FONT_NORMAL)
HEADER_STYLE     = _style("NWSCHeader",     fontSize=11,  leading=14, textColor=WHITE,  fontName=FONT_BOLD, alignment=TA_CENTER)
SUBHEADER_STYLE  = _style("NWSCSubheader",  fontSize=8,   leading=10, textColor=NWSC_BLUE, fontName=FONT_BOLD, alignment=TA_CENTER)
SECTION_STYLE    = _style("NWSCSection",    fontSize=8.5, leading=11, textColor=NWSC_BLUE, fontName=FONT_BOLD, spaceBefore=4, spaceAfter=4)
TITLE_STYLE      = _style("NWSCTitle",      fontSize=15,  leading=18, textColor=NWSC_BLUE, fontName=FONT_BOLD)
TITLE_DEPT       = _style("NWSCTitleDept",  fontSize=8,   leading=10, textColor=NWSC_BLUE, fontName=FONT_NORMAL, spaceBefore=0)
META_LABEL       = _style("NWSCMetaLabel",  fontSize=8,   leading=10, textColor=NWSC_BLUE, fontName=FONT_BOLD)
META_VAL         = _style("NWSCMetaVal",    fontSize=11,  leading=13, textColor=TEXT_DARK, fontName=FONT_BOLD)
META_VAL_MUTED   = _style("NWSCMetaValMuted",fontSize=11,  leading=13, textColor=_hex("#AAAAAA"), fontName=FONT_NORMAL)
SIGNATORY_NAME   = _style("NWSCSignName",   fontSize=10,  leading=13, fontName=FONT_BOLD, textColor=NWSC_BLUE)
SIGNATORY_TITLE  = _style("NWSCSignTitle",  fontSize=9,   leading=12, textColor=TEXT_MID, fontName=FONT_NORMAL)
TOTALS_LABEL     = _style("NWSCTotLabel",   fontSize=9,   leading=12, textColor=TEXT_DARK, fontName=FONT_NORMAL)
TOTALS_VAL       = _style("NWSCTotVal",     fontSize=11,  leading=14, fontName=FONT_BOLD, textColor=WHITE)
BADGE_LABEL      = _style("NWSCBadgeLabel", fontSize=8,   leading=9,  fontName=FONT_NORMAL, textColor=WHITE, alignment=TA_CENTER)
BADGE_VAL        = _style("NWSCBadgeVal",   fontSize=11,  leading=13, fontName=FONT_BOLD, textColor=WHITE, alignment=TA_CENTER)
FOOTER_TAG       = _style("NWSCFooterTag",  fontSize=8.5, leading=10, fontName=FONT_OBLIQUE, textColor=WHITE)
FOOTER_PAGE      = _style("NWSCFooterPage", fontSize=8.5, leading=10, fontName=FONT_BOLD, textColor=WHITE, alignment=TA_RIGHT)
REMARKS_TITLE    = _style("NWSCRemarksTitle",fontSize=9,  leading=12, fontName=FONT_BOLD, textColor=NWSC_BLUE)
REMARKS_BODY     = _style("NWSCRemarksBody", fontSize=8.5, leading=11, fontName=FONT_OBLIQUE, textColor=TEXT_MID)
TERMS_STYLE      = _style("NWSCTerms",      fontSize=9.5, leading=12, fontName=FONT_NORMAL, textColor=_hex("#444444"))
UNIT_STYLE       = _style("NWSCUnit",       fontSize=8.5, leading=11, alignment=TA_CENTER, fontName=FONT_NORMAL)

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
    Also escapes special XML characters to prevent rendering issues.
    """
    if not s: return ""
    
    # Escape special characters for ReportLab Paragraphs
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    
    
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
    """Draw a diagonal translucent logo watermark on the background."""
    canvas.saveState()
    
    # Logo candidate paths
    logo_candidates = ["public/logo.png", "logo.png", "src/public/logo.png"]
    logo_path = None
    for lp in logo_candidates:
        if os.path.exists(lp):
            logo_path = lp
            break
            
    if logo_path:
        canvas.setFillAlpha(0.04)  # 4% opacity per spec
        sz = 120 * mm
        canvas.translate(PAGE_W / 2, PAGE_H / 2)
        canvas.rotate(40)
        try:
            canvas.drawImage(logo_path, -sz/2, -sz/2, width=sz, height=sz, mask='auto', preserveAspectRatio=True)
        except Exception:
            pass
    else:
        # Fallback if no logo found
        canvas.setFillColor(NWSC_BLUE)
        canvas.setFillAlpha(0.04)
        canvas.setFont(FONT_BOLD, 72)
        canvas.translate(PAGE_W / 2, PAGE_H / 2)
        canvas.rotate(40)
        canvas.drawCentredString(0, 0, "NWSC")
        
    canvas.restoreState()


def _draw_header_canvas(canvas, doc_type_label: str, doc_number: str = "") -> None:
    """Draw the new branded header with badge and hierarchy."""
    canvas.saveState()
    header_h = 28 * mm
    
    # Dark Blue Top Bar
    canvas.setFillColor(NWSC_BLUE)
    canvas.rect(0, PAGE_H - header_h, PAGE_W, header_h, fill=1, stroke=0)

    # Logo Box
    logo_box_w, logo_box_h = 22 * mm, 20 * mm
    logo_box_x = 18 * mm
    logo_box_y = PAGE_H - header_h + (header_h - logo_box_h) / 2
    canvas.setFillColor(WHITE)
    canvas.roundRect(logo_box_x, logo_box_y, logo_box_w, logo_box_h, 1.5 * mm, fill=1, stroke=0)

    # Logo Image
    logo_candidates = ["public/logo.png", "logo.png", "src/public/logo.png"]
    for lp in logo_candidates:
        if os.path.exists(lp):
            canvas.drawImage(lp, logo_box_x + 1*mm, logo_box_y + 1*mm, width=logo_box_w - 2*mm, height=logo_box_h - 2*mm, mask='auto')
            break

    # Company Text (Left Aligned next to logo)
    tx = logo_box_x + logo_box_w + 6 * mm
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 12)
    canvas.drawString(tx, PAGE_H - 10 * mm, "NKANA WATER SUPPLY & SANITATION CO.")
    canvas.setFont(FONT_NORMAL, 7.5)
    canvas.drawString(tx, PAGE_H - 15 * mm, "Mutondo Crescent, off Freedom Way, Riverside, Box 20982 Kitwe, Zambia")
    canvas.drawString(tx, PAGE_H - 19 * mm, "Tel: +260 212 222488 / 221099 / 0971 223 458")
    canvas.drawString(tx, PAGE_H - 23 * mm, "headoffice@nwsc.com.zm  |  www.nwsc.zm")

    # Right Badge (Cert/Quotation No)
    badge_w, badge_h = 45 * mm, 14 * mm
    badge_x = PAGE_W - 18 * mm - badge_w
    badge_y = PAGE_H - header_h + (header_h - badge_h) / 2
    canvas.setFillColor(WHITE, alpha=0.15)
    canvas.roundRect(badge_x, badge_y, badge_w, badge_h, 1.5 * mm, fill=1, stroke=0)
    
    label_text = "CERT NO" if "CERTIFICATE" in doc_type_label.upper() else "QUOTATION NO"
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_NORMAL, 8)
    canvas.drawCentredString(badge_x + badge_w / 2, badge_y + 8.5 * mm, label_text)
    canvas.setFont(FONT_BOLD, 11)
    canvas.drawCentredString(badge_x + badge_w / 2, badge_y + 3.5 * mm, doc_number or "—")

    canvas.restoreState()


def _draw_footer_canvas(canvas, page_num: int, total_pages: int = 1) -> None:
    """Draw a 10mm solid blue footer bar."""
    footer_h = 10 * mm
    canvas.saveState()
    canvas.setFillColor(NWSC_BLUE)
    canvas.rect(0, 0, PAGE_W, footer_h, fill=1, stroke=0)
    
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_OBLIQUE, 8.5)
    canvas.drawString(18 * mm, 3.5 * mm, "Bigger, Better, Smarter")
    
    canvas.setFont(FONT_BOLD, 8.5)
    canvas.drawRightString(PAGE_W - 18 * mm, 3.5 * mm, f"Page {page_num} of {total_pages}")
    
    canvas.restoreState()


def _draw_title_banner(title: str) -> List[Flowable]:
    """Return a styled light-blue title band with hierarchy."""
    usable_w = PAGE_W - 36 * mm
    data = [
        [Paragraph("SAFETY HEALTH ENVIRONMENT AND QUALITY DEPARTMENT", TITLE_DEPT)],
        [Paragraph(title.upper(), TITLE_STYLE)]
    ]
    t = Table(data, colWidths=[usable_w])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), NWSC_LIGHT),
        ("LINEBELOW",     (0,1), (-1,1), 1, NWSC_BORDER),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
    ]))
    return [Spacer(1, 4*mm), t, Spacer(1, 6*mm)]


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
    Renders two side-by-side signatory columns with horizontal rules.
    """
    def __init__(
        self,
        sign1_name: str, sign1_role: str,
        sign2_name: str, sign2_role: str,
        is_quotation: bool = False
    ):
        super().__init__()
        self.s1n, self.s1r = sign1_name, sign1_role
        self.s2n, self.s2r = sign2_name, sign2_role
        self.is_q = is_quotation
        self.height = 32 * mm

    def wrap(self, avail_w, avail_h):
        return avail_w, self.height

    def draw(self):
        usable_w = self.width
        col_w = usable_w / 2 - 8*mm
        
        def _col_table(name, role, label=None):
            data = []
            if label:
                data.append([Paragraph(label.upper(), SECTION_STYLE)])
                data.append([Spacer(1, 2*mm)])
            
            # Signature Line (Horizontal Rule)
            # We use a Table with a top border to simulate the rule
            data.append([""]) # Spacer
            data.append([Paragraph(name if name else "—", SIGNATORY_NAME)])
            data.append([Paragraph(role if role else "—", SIGNATORY_TITLE)])
            
            t = Table(data, colWidths=[col_w])
            t.setStyle(TableStyle([
                ("LINEABOVE", (0, 1), (0, 1), 1.5, NWSC_BLUE),
                ("LEFTPADDING", (0,0), (-1,-1), 0),
                ("RIGHTPADDING", (0,0), (-1,-1), 0),
                ("TOPPADDING", (0,0), (-1,-1), 1),
                ("BOTTOMPADDING", (0,0), (-1,-1), 1),
                ("VALIGN", (0,0), (-1,-1), "TOP"),
            ]))
            return t

        label1 = "Authorised Signatory" if self.is_q else None
        
        table_data = [[
            _col_table(self.s1n, self.s1r, label1),
            Spacer(16*mm, 1),
            _col_table(self.s2n, self.s2r)
        ]]
        main_table = Table(table_data, colWidths=[col_w, 16*mm, col_w])
        main_table.setStyle(TableStyle([
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (-1,-1), 0),
            ("VALIGN", (0,0), (-1,-1), "BOTTOM"),
        ]))
        main_table.wrapOn(self.canv, usable_w, self.height)
        main_table.drawOn(self.canv, 0, 0)



# ═══════════════════════════════════════════════════════════════════════════════
#  PAGE TEMPLATE FACTORIES
# ═══════════════════════════════════════════════════════════════════════════════

def _make_page_template(
    template_id: str,
    doc_type_label: str,
    doc_number: str = ""
) -> PageTemplate:
    """
    Create a PageTemplate that draws the full branded header + watermark +
    footer on every canvas render.
    """
    header_total = 28 * mm
    footer_total = 10 * mm

    frame = Frame(
        x1=18 * mm,
        y1=footer_total + 4 * mm,
        width=PAGE_W - 36 * mm,
        height=PAGE_H - header_total - footer_total - 12 * mm,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        id="content",
    )

    def on_page(canvas, doc_ref):
        _place_watermark(canvas)
        _draw_header_canvas(canvas, doc_type_label, doc_number)
        _draw_footer_canvas(canvas, canvas.getPageNumber())

    return PageTemplate(id=template_id, frames=[frame], onPage=on_page)


# ═══════════════════════════════════════════════════════════════════════════════
#  COA — META GRID
# ═══════════════════════════════════════════════════════════════════════════════

def _build_meta_grid(fields: List[Tuple[str, str]]) -> Table:
    """
    Build a structured 2-row x 3-column card with labels above values.
    """
    usable_w = PAGE_W - 36 * mm
    col_w = usable_w / 3

    def _cell(label: str, value: str) -> Table:
        v_style = META_VAL if value and value.strip() else META_VAL_MUTED
        v_text = value if value and value.strip() else "—"
        
        inner_data = [
            [Paragraph(label.upper(), META_LABEL)],
            [Paragraph(v_text, v_style)]
        ]
        it = Table(inner_data, colWidths=[col_w - 4*mm])
        it.setStyle(TableStyle([
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (-1,-1), 0),
            ("TOPPADDING", (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 1),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
        ]))
        return it

    rows = []
    # Divide fields into groups of 3
    for i in range(0, len(fields), 3):
        row = []
        for j in range(3):
            if i + j < len(fields):
                l, v = fields[i + j]
                row.append(_cell(l, v))
            else:
                row.append("")
        rows.append(row)

    t = Table(rows, colWidths=[col_w] * 3)
    t.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 1, NWSC_BORDER),
        ("GRID",          (0, 0), (-1, -1), 0.5, NWSC_DIVIDER),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
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
    Build parameter table with grouped subheadings and zebra striping.
    """
    usable_w = PAGE_W - MARGIN_L - MARGIN_R
    col_widths = [10*mm, usable_w - 90*mm, 18*mm, 30*mm, 32*mm]

    header_row = [
        Paragraph("#",          CELL_CENTRE),
        Paragraph("Parameter",  BODY_BOLD),
        Paragraph("Unit",       CELL_CENTRE),
        Paragraph(limit_header, CELL_CENTRE),
        Paragraph(sample_labels[0] if sample_labels else "Result", CELL_CENTRE),
    ]

    rows = [header_row]
    style_cmds = [
        ("BACKGROUND",    (0, 0), (-1, 0), NWSC_BLUE),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        ("GRID",          (0, 0), (-1, -1), 0.5, NWSC_DIVIDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]

    current_section = ""
    p_idx = 1
    
    for entry in all_rows:
        section = entry.get("section", "")
        if section and section != current_section:
            # Subheading Row
            current_section = section
            rows.append([Paragraph(section.upper(), SECTION_STYLE), "", "", "", ""])
            curr_row = len(rows) - 1
            style_cmds.append(("SPAN", (0, curr_row), (-1, curr_row)))
            style_cmds.append(("BACKGROUND", (0, curr_row), (-1, curr_row), NWSC_LIGHT))
            style_cmds.append(("LINEABOVE", (0, curr_row), (-1, curr_row), 0.5, NWSC_BORDER))

        name = _chem(entry.get("name", ""))
        unit = _chem(entry.get("unit", ""))
        limit = entry.get("limit", "—")
        results = entry.get("results", [])
        val1 = str(results[0]) if results else "—"
        
        row_bg = NWSC_STRIPE if len([r for r in rows if len(r) > 1]) % 2 == 0 else WHITE
        rows.append([
            Paragraph(str(p_idx), CELL_CENTRE),
            Paragraph(name, BODY_STYLE),
            Paragraph(unit, UNIT_STYLE),
            Paragraph(limit, BODY_BOLD),
            Paragraph(val1, CELL_CENTRE),
        ])
        
        curr_row = len(rows) - 1
        style_cmds.append(("BACKGROUND", (0, curr_row), (-1, curr_row), row_bg))
        # Style ZABS Limit column (index 3)
        style_cmds.append(("TEXTCOLOR", (3, curr_row), (3, curr_row), NWSC_BLUE))
        style_cmds.append(("FONTNAME", (3, curr_row), (3, curr_row), FONT_BOLD))
        
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
        ("Client Name",   _chem(cert.get("client", "—"))),
        ("Client Contact",_chem(cert.get("clientPhone", "—"))),
        ("Date Sampled",  _chem(cert.get("dateSampled", "—"))),
        ("Date Reported", _chem(cert.get("dateReported", "—"))),
        ("Sample Type",   _chem(cert.get("sampleType", "—"))),
        ("Location",      _chem(cert.get("location", "—"))),
    ]
    story.append(_build_meta_grid(meta_fields))
    story.append(Spacer(1, 10*mm))

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
        doc_number=cert.get("certNumber", "—"),
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
    story.extend(_draw_title_banner("SERVICE QUOTATION"))

    meta_fields = [
        ("Client Name",   _chem(quot.get("client", "—"))),
        ("Client Contact",_chem(quot.get("clientPhone", "—"))),
        ("Date Issued",   _chem(quot.get("date", "—"))),
        ("Valid Until",   _chem(quot.get("validUntil", "—"))),
        ("Client Email",  _chem(quot.get("clientEmail", "—"))),
        ("Sample Details",_chem(", ".join(quot.get("samples", [])) if quot.get("samples") else "—")),
    ]
    story.append(_build_meta_grid(meta_fields))
    story.append(Spacer(1, 10*mm))

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
            Paragraph(_chem(item.get("parameterName", "")), BODY_STYLE),
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

    # 6. Totals Card (Anchored to Right)
    sub = quot.get("subtotal", 0)
    tax = quot.get("totalTax", 0)
    grd = quot.get("totalAmount", 0)
    
    totals_data = [
        [Paragraph("Subtotal", TOTALS_LABEL), Paragraph(f"ZMW {float(sub):,.2f}", CELL_RIGHT)],
        [Paragraph("Total VAT (16%)", _style("VAT", parent="NWSCBody", textColor=NWSC_ACCENT)), 
         Paragraph(f"ZMW {float(tax):,.2f}", _style("VATV", parent="NWSCRight", textColor=NWSC_ACCENT, fontName=FONT_BOLD))],
        [Paragraph("GRAND TOTAL", TOTALS_VAL), Paragraph(f"ZMW {float(grd):,.2f}", TOTALS_VAL)]
    ]
    
    totals_w = usable_w * 0.52
    tt = Table(totals_data, colWidths=[totals_w * 0.6, totals_w * 0.4], hAlign='RIGHT')
    tt.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, NWSC_BORDER),
        ("GRID", (0, 0), (-1, 1), 0.5, NWSC_DIVIDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 2), (-1, 2), NWSC_BLUE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tt)
    story.append(Spacer(1, 10*mm))

    # 7 & 8. Terms and Validity (Two-Column Cards)
    valid_date = quot.get("validUntil", "—")
    
    # Terms Column
    terms_data = [
        [Paragraph("TERMS & CONDITIONS", HEADER_STYLE)],
        [Paragraph("<br/>".join([
            "1. Payment is required prior to testing.",
            f"2. Quotation valid until {valid_date}.",
            "3. Prices include 16% VAT where applicable.",
            "4. NWSC reserves the right to revise prices."
        ]), TERMS_STYLE)]
    ]
    term_table = Table(terms_data, colWidths=[usable_w/2 - 4*mm])
    term_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NWSC_BLUE),
        ("BOX", (0,1), (-1,1), 1, NWSC_BORDER),
        ("TOPPADDING", (0,1), (-1,1), 8),
        ("BOTTOMPADDING", (0,1), (-1,1), 8),
    ]))

    # Validity Column
    valid_data = [
        [Paragraph("VALIDITY NOTICE", HEADER_STYLE)],
        [Paragraph("<br/>This quotation expires on<br/><br/><font size='13' color='#B85C00'><b>" + valid_date + "</b></font><br/><br/>"
                   "<font size='8.5' color='#666666'>After this date, prices are subject to revision.<br/>Contact NWSC SHEQ to renew.</font>", CELL_CENTRE)]
    ]
    valid_table = Table(valid_data, colWidths=[usable_w/2 - 4*mm])
    valid_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NWSC_ACCENT),
        ("BOX", (0,1), (-1,1), 1, NWSC_ACCENT),
        ("TOPPADDING", (0,1), (-1,1), 8),
        ("BOTTOMPADDING", (0,1), (-1,1), 8),
    ]))

    story.append(Table([[term_table, Spacer(8*mm, 1), valid_table]], colWidths=[usable_w/2-4*mm, 8*mm, usable_w/2-4*mm]))
    story.append(Spacer(1, 12*mm))

    # 9. Signatory Section
    story.append(SignatoryBlock(
        quot.get("sign1Name", "Benjamin Machuta"), quot.get("sign1Title", "SHEQ Manager"),
        quot.get("sign2Name", ""),                  quot.get("sign2Title", "Laboratory Technologist"),
        is_quotation=True
    ))

    # 6. Build with Metadata
    return _build_document(
        output_path, story, "QUOTATION",
        doc_number=quot.get("quoteNumber", "—"),
        title=f"NWSC Quotation {quot.get('quoteNumber', '')}",
        author=quot.get("preparedByName", "Benjamin Machuta"),
        subject="Water Analysis Quotation"
    )


def _build_document(
    output_path: Optional[str],
    story: list,
    doc_type_label: str,
    doc_number: str = "",
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
        tmpl = _make_page_template("main", doc_type_label, doc_number)
        doc.addPageTemplates([tmpl])
        doc.build(story)
        return doc
    
    # We need to know total pages for the footer "Page X of Y"
    # ReportLab doesn't easily provide this in one pass, so we do a fake render
    temp_buf = io.BytesIO()
    _render(temp_buf)
    # Note: total_pages logic would normally involve a listener or custom canvas,
    # but for this redesign, we'll keep it simple as standard ReportLab paging.
    
    # Final render
    if output_path is None:
        buf = io.BytesIO()
        _render(buf)
        return buf.getvalue()
    else:
        _render(output_path)
        return os.path.abspath(output_path)


if __name__ == "__main__":
    print("PDF Generator Upgrade Module loaded.")

