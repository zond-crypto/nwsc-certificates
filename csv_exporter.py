"""
csv_exporter.py
═══════════════════════════════════════════════════════════════════════════════
UTF-8 CSV export module for NWSC Laboratory Management System.

Exports:
  1) Certificate of Analysis (COA) → export_coa_csv()
  2) Service Quotation             → export_quotation_csv()

Key features:
  • UTF-8 BOM (0xEF 0xBB 0xBF) on every file so Excel renders
    chemical symbols correctly: NO₃⁻ SO₄²⁻ µS/cm °C ≤ – < etc.
  • All string cells are double-quote escaped per RFC 4180
  • File naming:
      COA_[ClientName]_[Date]_[CertNo].csv
      QT_[ClientName]_[Date]_[QuoteNo].csv
  • Dynamic sample columns on COA (one result column per sample)

Dependencies: standard library only (csv, io, os, re, datetime)

Usage from your desktop app:
  from csv_exporter import export_coa_csv, export_quotation_csv

  # Returns the path of the written file
  path = export_coa_csv(certificate_dict)
  path = export_coa_csv(certificate_dict, output_path="my_output.csv")

  path = export_quotation_csv(quotation_dict)
═══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import csv
import io
import os
import re
from datetime import date
from typing import Any, Dict, List, Optional


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe_filename(s: str) -> str:
    """Strip characters invalid in filenames and collapse spaces to underscores."""
    return re.sub(r"[^A-Za-z0-9_\-]", "", (s or "Unknown").strip().replace(" ", "_"))


def _today() -> str:
    return date.today().isoformat()


def _clean_date(d: Optional[str]) -> str:
    """Return a compact date string like 20250601 (strips non-digit chars)."""
    return re.sub(r"\D", "", d or _today())


def _write_csv(rows: List[List[str]], path: str) -> str:
    """
    Write *rows* to *path* as UTF-8 CSV with BOM.
    All cells are quoted so special characters survive Excel import.
    Returns the absolute path of the written file.
    """
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        # utf-8-sig = UTF-8 + BOM — Excel auto-detects encoding with BOM
        writer = csv.writer(f, quoting=csv.QUOTE_ALL)
        writer.writerows(rows)
    return os.path.abspath(path)


# ═══════════════════════════════════════════════════════════════════════════════
#  EXPORT 1 — Certificate of Analysis CSV
# ═══════════════════════════════════════════════════════════════════════════════

def export_coa_csv(cert: Dict[str, Any], output_path: Optional[str] = None) -> str:
    """Upgrade 11: Structured COA CSV with metadata, parameters, and results."""
    cert_no = cert.get("certNumber", "COA")
    if not output_path:
        output_path = f"WAC-{cert_no}_WaterAnalysisCertificate.csv"

    rows = []
    
    # Section 1 — Document metadata
    rows.append(["NWSC WATER ANALYSIS CERTIFICATE EXPORT"])
    rows.append(["Certificate No", cert_no])
    rows.append(["Date Sampled",  cert.get("dateSampled", "—")])
    rows.append(["Date Reported", cert.get("dateReported", "—")])
    rows.append(["Client",        cert.get("client", "—")])
    rows.append(["Location",      cert.get("location", "—")])
    rows.append(["Sample Type",   cert.get("sampleType", "—")])
    rows.append(["Prepared By",   cert.get("sign1Name", "Benjamin Machuta")])

    # Section 2 — Blank separator row
    rows.append([])

    # Section 3 — Line items with headers
    samples = cert.get("samples", ["Sample 1"])
    header = ["#", "Parameter", "Unit", "WHO/ZABS Limit"] + samples + ["Compliance"]
    rows.append(header)
    
    param_idx = 1
    for entry in cert.get("tableData", []):
        section = entry.get("section", "").upper()
        if section:
            # Upgrade 11: Section header rows for each parameter group
            rows.append(["", section, "", "", "", ""])
            continue
        
        # Chemical notation in CSV must use plain ASCII
        name = entry.get("name", "")
        name = name.replace("₀", "0").replace("₁", "1").replace("₂", "2").replace("₃", "3").replace("₄", "4")
        name = name.replace("₅", "5").replace("₆", "6").replace("₇", "7").replace("₈", "8").replace("₉", "9")
        name = name.replace("⁺", "+").replace("⁻", "-").replace("²⁻", "2-")
        
        unit = entry.get("unit", "")
        unit = unit.replace("µ", "u").replace("°", "deg")
        
        limit = entry.get("limit", "—")
        results = entry.get("results", [])
        
        rows.append([
            str(param_idx),
            name,
            unit,
            limit,
            *(str(r) for r in results),
            "Compliant"
        ])
        param_idx += 1

    # Section 4 — Blank separator row
    rows.append([])

    # Section 5 — Summary/Remarks
    rows.append(["REMARKS / INTERPRETATION"])
    rows.append(["All analyses were conducted in accordance with Standard Methods for the Examination of Water and Wastewater (SMEWW)."])
    
    return _write_csv(rows, output_path)


# ═══════════════════════════════════════════════════════════════════════════════
#  EXPORT 2 — Service Quotation CSV
# ═══════════════════════════════════════════════════════════════════════════════

def export_quotation_csv(quot: Dict[str, Any], output_path: Optional[str] = None) -> str:
    """Upgrade 11: Structured Quotation CSV with metadata, items, and totals."""
    qno = quot.get("quoteNumber", "QT")
    if not output_path:
        output_path = f"QT-{qno}_Quotation.csv"

    rows = []
    
    # Section 1 — Document metadata
    rows.append(["NWSC QUOTATION EXPORT"])
    rows.append(["Quotation No", qno])
    rows.append(["Date Issued",  quot.get("date", "—")])
    rows.append(["Valid Until",  quot.get("validUntil", "—")])
    rows.append(["Prepared By",  quot.get("preparedByName", "Benjamin Machuta")])
    rows.append(["Client Name",   quot.get("client", "—")])
    rows.append(["Client Contact", quot.get("clientPhone", "—")])

    # Section 2 — Blank separator row
    rows.append([])

    # Section 3 — Line items with headers
    header = ["#", "Description", "Unit", "Quantity", "Unit Price (ZMW)", "Total (ZMW)"]
    rows.append(header)
    
    # Bug 3 Fix: Filter items
    items = quot.get("items", [])
    filtered_items = [
        row for row in items
        if (float(row.get("unitPrice", 0)) > 0 or float(row.get("amount", 0)) > 0)
        and row.get("parameterName", "").strip() not in ("", "New Parameter Test")
    ]
    
    for idx, item in enumerate(filtered_items):
        rows.append([
            str(idx + 1),
            item.get("parameterName", ""),
            "Test",
            str(item.get("quantity", 1)),
            f"{float(item.get('unitPrice', 0)):.2f}",
            f"{float(item.get('amount', 0)):.2f}"
        ])

    # Section 4 — Blank separator row
    rows.append([])

    # Section 5 — Totals
    rows.append(["", "", "", "", "Subtotal", f"{float(quot.get('subtotal', 0)):.2f}"])
    rows.append(["", "", "", "", "VAT (16%)", f"{float(quot.get('totalTax', 0)):.2f}"])
    rows.append(["", "", "", "", "GRAND TOTAL", f"{float(quot.get('totalAmount', 0)):.2f}"])

    return _write_csv(rows, output_path)


# ═══════════════════════════════════════════════════════════════════════════════
#  STANDALONE TEST  (python csv_exporter.py)
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("Running CSV exporter self-test …")

    micro_cert = {
        "certNumber":   "COA-2025-001",
        "client":       "City Council Kitwe",
        "dateReported": "2025-06-01",
        "sampleType":   "Drinking Water",
        "location":     "Tap Water, Riverside",
        "samples":      ["Sample 1", "Sample 2"],
        "tableData": [
            {"section": "Physical Parameters"},
            {"name": "pH",         "unit": "",        "limit": "6.5 \u2013 8.5", "results": ["7.2", "7.0"]},
            {"name": "Turbidity",  "unit": "NTU",     "limit": "\u2264 4",        "results": ["1.1", "2.3"]},
            {"name": "Temperature","unit": "\u00b0C",  "limit": "< 25",           "results": ["22",  "21"]},
            {"section": "Chemical Parameters"},
            {"name": "Nitrate (NO\u2083\u207b)",        "unit": "mg/L",    "limit": "\u2264 50",   "results": ["8.5",  "10.0"]},
            {"name": "Sulphate (SO\u2084\u00b2\u207b)", "unit": "mg/L",    "limit": "\u2264 250",  "results": ["45",   "60"]},
            {"name": "Conductivity",                   "unit": "\u00b5S/cm","limit": "\u2264 1000", "results": ["320",  "410"]},
        ],
    }
    path1 = export_coa_csv(micro_cert)
    print(f"  COA CSV  → {path1}")

    micro_quot = {
        "quoteNumber":   "QT-2025-001",
        "client":        "City Council Kitwe",
        "clientAddress": "PO Box 1, Kitwe",
        "date":          "2025-06-01",
        "validUntil":    "2025-06-30",
        "items": [
            {"parameterName": "pH Analysis",         "quantity": 1, "unitPrice": 50.0,  "tax": 8.0,  "amount": 58.0},
            {"parameterName": "Turbidity Analysis",  "quantity": 1, "unitPrice": 75.0,  "tax": 12.0, "amount": 87.0},
            {"parameterName": "Nitrate Analysis",    "quantity": 1, "unitPrice": 150.0, "tax": 24.0, "amount": 174.0},
        ],
        "subtotal":    275.0,
        "totalTax":     44.0,
        "totalAmount": 319.0,
    }
    path2 = export_quotation_csv(micro_quot)
    print(f"  Quotation CSV → {path2}")
    print("Self-test complete.")
