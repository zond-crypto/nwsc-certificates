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
    """
    Export a Certificate of Analysis to a UTF-8 CSV file.

    Column layout
    ─────────────
    Certificate No | Client | Date Reported | Sample Type | Sample Source |
    Parameter | Unit | Limit | [Sample 1 Result] | [Sample 2 Result] | …

    One row per parameter (section-header pseudo-rows are written as a
    merged label row with empty result cells so the structure is clear).

    Parameters
    ----------
    cert : dict
        Keys matching the TypeScript Certificate interface in src/types.ts.
    output_path : str, optional
        Full file path for the CSV. Auto-generated if omitted.

    Returns
    -------
    str
        Absolute path of the written CSV file.
    """
    # ── File name ─────────────────────────────────────────────────────────────
    client_clean = _safe_filename(cert.get("client", ""))
    date_clean   = _clean_date(cert.get("dateReported"))
    cert_clean   = re.sub(r"[^A-Za-z0-9\-]", "", cert.get("certNumber", "COA"))
    if not output_path:
        output_path = f"COA_{client_clean}_{date_clean}_{cert_clean}.csv"

    # ── Fixed metadata ────────────────────────────────────────────────────────
    cert_no      = cert.get("certNumber",   "")
    client       = cert.get("client",        "")
    date_rep     = cert.get("dateReported",  "")
    sample_type  = cert.get("sampleType",    "")
    location     = cert.get("location",      "")

    # ── Sample labels ─────────────────────────────────────────────────────────
    raw_samples: List[str] = cert.get("samples", []) or []
    sample_labels = [
        (s if s else f"Sample {i + 1}") for i, s in enumerate(raw_samples)
    ]
    n_samples = len(sample_labels)

    # ── Header row ────────────────────────────────────────────────────────────
    fixed_headers = [
        "Certificate No", "Client", "Date Reported",
        "Sample Type", "Sample Source",
        "Parameter", "Unit", "Limit",
    ]
    header_row = fixed_headers + sample_labels

    # ── Data rows ─────────────────────────────────────────────────────────────
    rows: List[List[str]] = [header_row]

    for entry in cert.get("tableData", []):
        if entry.get("section"):
            # Section header → write as a labelled separator row
            section_name = entry["section"]
            row = [
                cert_no, client, date_rep, sample_type, location,
                f"── {section_name} ──", "", "",
            ] + [""] * n_samples
            rows.append(row)
        else:
            results = entry.get("results", [])
            result_cells = [
                (str(results[i]) if i < len(results) and results[i] is not None else "")
                for i in range(n_samples)
            ]
            row = [
                cert_no,
                client,
                date_rep,
                sample_type,
                location,
                entry.get("name",  ""),
                entry.get("unit",  ""),
                entry.get("limit", ""),
                *result_cells,
            ]
            rows.append(row)

    return _write_csv(rows, output_path)


# ═══════════════════════════════════════════════════════════════════════════════
#  EXPORT 2 — Service Quotation CSV
# ═══════════════════════════════════════════════════════════════════════════════

def export_quotation_csv(quot: Dict[str, Any], output_path: Optional[str] = None) -> str:
    """
    Export a Service Quotation to a UTF-8 CSV file.

    Column layout
    ─────────────
    Quote No | Date | Valid Until | Client | Address |
    # | Description | Qty | Unit Price (K) | VAT (K) | Subtotal (K) | Grand Total (K)

    The Grand Total is written only on the first data row (not repeated).
    A summary footer row is appended at the bottom for auditing convenience.

    Parameters
    ----------
    quot : dict
        Keys matching the TypeScript Quotation interface in src/types.ts.
    output_path : str, optional
        Full file path for the CSV. Auto-generated if omitted.

    Returns
    -------
    str
        Absolute path of the written CSV file.
    """
    # ── File name ─────────────────────────────────────────────────────────────
    client_clean = _safe_filename(quot.get("client", ""))
    date_clean   = _clean_date(quot.get("date"))
    qno_clean    = re.sub(r"[^A-Za-z0-9\-]", "", quot.get("quoteNumber", "QT"))
    if not output_path:
        output_path = f"QT_{client_clean}_{date_clean}_{qno_clean}.csv"

    # ── Fixed metadata ────────────────────────────────────────────────────────
    qno         = quot.get("quoteNumber",  "")
    q_date      = quot.get("date",          "")
    valid_until = quot.get("validUntil",    "")
    client      = quot.get("client",        "")
    address     = quot.get("clientAddress", "")
    subtotal    = quot.get("subtotal",    0)
    total_tax   = quot.get("totalTax",    0)
    total_amt   = quot.get("totalAmount", 0)

    # ── Header row ────────────────────────────────────────────────────────────
    header_row = [
        "Quote No", "Date", "Valid Until", "Client", "Address",
        "#", "Description", "Qty",
        "Unit Price (K)", "VAT (K)", "Subtotal (K)", "Grand Total (K)",
    ]

    # ── Data rows ─────────────────────────────────────────────────────────────
    items = quot.get("items", [])
    rows: List[List[str]] = [header_row]

    for idx, item in enumerate(items):
        grand_total_cell = f"{float(total_amt):.2f}" if idx == 0 else ""
        row = [
            qno,
            q_date,
            valid_until,
            client,
            address,
            str(idx + 1),
            item.get("parameterName", ""),
            str(item.get("quantity", 1)),
            f"{float(item.get('unitPrice', 0)):.2f}",
            f"{float(item.get('tax', 0)):.2f}",
            f"{float(item.get('amount', 0)):.2f}",
            grand_total_cell,
        ]
        rows.append(row)

    # ── Summary footer block ──────────────────────────────────────────────────
    rows.append([""] * 12)   # blank separator
    rows.append([
        "", "", "", "", "",
        "", "SUBTOTAL", "", "", "",
        f"{float(subtotal):.2f}", "",
    ])
    rows.append([
        "", "", "", "", "",
        "", "TOTAL VAT (16%)", "", "", "",
        f"{float(total_tax):.2f}", "",
    ])
    rows.append([
        "", "", "", "", "",
        "", "GRAND TOTAL", "", "", "",
        f"{float(total_amt):.2f}", "",
    ])

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
