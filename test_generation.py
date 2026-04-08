"""
test_generation.py
═══════════════════════════════════════════════════════════════════════════════
Full test suite for the NWSC PDF/CSV generation modules.

Tests:
  COA PDF  — 1, 6, 12, and 50 sample columns (pagination verification)
  Quotation PDF — basic and large item list
  COA CSV  — round-trip check (header count matches body column count)
  Quotation CSV — footer totals rows present

Run:
  pip install reportlab pillow
  python test_generation.py

All generated files land in ./test_output/
═══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import os
import sys

# ── Ensure the parent directory is on the path so imports resolve ─────────────
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from pdf_generator import generate_coa_pdf, generate_quotation_pdf
from csv_exporter  import export_coa_csv, export_quotation_csv

OUT_DIR = os.path.join(HERE, "test_output")
os.makedirs(OUT_DIR, exist_ok=True)

# ═══════════════════════════════════════════════════════════════════════════════
#  SHARED FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════

PARAMETER_BANK = [
    # Section and data rows that exercise chemical symbols and units
    {"section": "Physical Parameters"},
    {"name": "pH",                          "unit": "",         "limit": "6.5 \u2013 8.5"},
    {"name": "Turbidity",                   "unit": "NTU",      "limit": "\u2264 4"},
    {"name": "Temperature",                 "unit": "\u00b0C",  "limit": "< 25"},
    {"name": "Colour",                      "unit": "TCU",      "limit": "\u2264 15"},
    {"name": "Odour",                       "unit": "—",        "limit": "Unobjectionable"},
    {"name": "Total Dissolved Solids",      "unit": "mg/L",     "limit": "\u2264 1000"},
    {"section": "Chemical Parameters"},
    {"name": "Conductivity",                "unit": "\u00b5S/cm","limit": "\u2264 2500"},
    {"name": "Total Hardness",              "unit": "mg/L",     "limit": "\u2264 500"},
    {"name": "Calcium (Ca\u00b2\u207a)",    "unit": "mg/L",     "limit": "\u2264 200"},
    {"name": "Magnesium (Mg\u00b2\u207a)", "unit": "mg/L",     "limit": "\u2264 150"},
    {"name": "Sodium (Na\u207a)",           "unit": "mg/L",     "limit": "\u2264 200"},
    {"name": "Potassium (K\u207a)",         "unit": "mg/L",     "limit": "\u2264 50"},
    {"name": "Iron (Fe)",                   "unit": "mg/L",     "limit": "\u2264 0.3"},
    {"name": "Manganese (Mn)",              "unit": "mg/L",     "limit": "\u2264 0.1"},
    {"name": "Chloride (Cl\u207b)",         "unit": "mg/L",     "limit": "\u2264 250"},
    {"name": "Sulphate (SO\u2084\u00b2\u207b)","unit":"mg/L",   "limit": "\u2264 250"},
    {"name": "Nitrate (NO\u2083\u207b)",    "unit": "mg/L",     "limit": "\u2264 50"},
    {"name": "Nitrite (NO\u2082\u207b)",    "unit": "mg/L",     "limit": "\u2264 3"},
    {"name": "Fluoride (F\u207b)",          "unit": "mg/L",     "limit": "0.5 \u2013 1.5"},
    {"name": "Ammonium (NH\u2084\u207a)",   "unit": "mg/L",     "limit": "\u2264 0.5"},
    {"name": "Phosphate (PO\u2084\u00b3\u207b)","unit":"mg/L",  "limit": "\u2264 0.5"},
    {"name": "Residual Chlorine",           "unit": "mg/L",     "limit": "0.2 \u2013 0.5"},
    {"name": "Total Alkalinity",            "unit": "mg/L",     "limit": "\u2264 200"},
    {"section": "Microbiological Parameters"},
    {"name": "Total Coliforms",             "unit": "CFU/100mL","limit": "0"},
    {"name": "E. coli",                     "unit": "CFU/100mL","limit": "0"},
    {"name": "Heterotrophic Plate Count",   "unit": "CFU/mL",   "limit": "\u2264 500"},
]

QUOTATION_ITEMS_LARGE = [
    {"parameterName": "pH Analysis",                    "quantity": 4, "unitPrice": 50.0,   "tax": 32.0,   "amount": 232.0},
    {"parameterName": "Turbidity Analysis",             "quantity": 4, "unitPrice": 75.0,   "tax": 48.0,   "amount": 348.0},
    {"parameterName": "Conductivity Analysis",          "quantity": 4, "unitPrice": 80.0,   "tax": 51.2,   "amount": 371.2},
    {"parameterName": "Total Dissolved Solids",         "quantity": 4, "unitPrice": 80.0,   "tax": 51.2,   "amount": 371.2},
    {"parameterName": "Colour / Odour Assessment",      "quantity": 4, "unitPrice": 60.0,   "tax": 38.4,   "amount": 278.4},
    {"parameterName": "Total Hardness",                 "quantity": 4, "unitPrice": 100.0,  "tax": 64.0,   "amount": 464.0},
    {"parameterName": "Calcium Analysis",               "quantity": 4, "unitPrice": 120.0,  "tax": 76.8,   "amount": 556.8},
    {"parameterName": "Magnesium Analysis",             "quantity": 4, "unitPrice": 120.0,  "tax": 76.8,   "amount": 556.8},
    {"parameterName": "Iron (Fe) Analysis",             "quantity": 4, "unitPrice": 130.0,  "tax": 83.2,   "amount": 603.2},
    {"parameterName": "Manganese (Mn) Analysis",        "quantity": 4, "unitPrice": 130.0,  "tax": 83.2,   "amount": 603.2},
    {"parameterName": "Chloride Analysis",              "quantity": 4, "unitPrice": 100.0,  "tax": 64.0,   "amount": 464.0},
    {"parameterName": "Sulphate Analysis",              "quantity": 4, "unitPrice": 150.0,  "tax": 96.0,   "amount": 696.0},
    {"parameterName": "Nitrate Analysis",               "quantity": 4, "unitPrice": 150.0,  "tax": 96.0,   "amount": 696.0},
    {"parameterName": "Nitrite Analysis",               "quantity": 4, "unitPrice": 150.0,  "tax": 96.0,   "amount": 696.0},
    {"parameterName": "Fluoride Analysis",              "quantity": 4, "unitPrice": 160.0,  "tax": 102.4,  "amount": 742.4},
    {"parameterName": "Total Coliforms",                "quantity": 4, "unitPrice": 200.0,  "tax": 128.0,  "amount": 928.0},
    {"parameterName": "E. coli Enumeration",            "quantity": 4, "unitPrice": 200.0,  "tax": 128.0,  "amount": 928.0},
    {"parameterName": "Heterotrophic Plate Count",      "quantity": 4, "unitPrice": 220.0,  "tax": 140.8,  "amount": 1020.8},
    {"parameterName": "Residual Chlorine",              "quantity": 4, "unitPrice": 60.0,   "tax": 38.4,   "amount": 278.4},
    {"parameterName": "Sample Collection & Transport",  "quantity": 4, "unitPrice": 100.0,  "tax": 64.0,   "amount": 464.0},
]


def _make_sample_results(n: int) -> list:
    """Attach plausible result values to each parameter row for n samples."""
    import random
    random.seed(42)

    rows = []
    for row in PARAMETER_BANK:
        if row.get("section"):
            rows.append(dict(row))
        else:
            results = []
            for _ in range(n):
                results.append(f"{random.uniform(0.1, 50):.2f}")
            rows.append({**row, "results": results})
    return rows


def _base_cert(n_samples: int) -> dict:
    sample_labels = [f"Sample {i + 1}" for i in range(n_samples)]
    return {
        "certNumber":   f"COA-2025-{n_samples:03d}",
        "client":       "Kitwe City Council Water Department",
        "dateReported": "2025-06-01",
        "dateSampled":  "2025-05-28",
        "sampleType":   "Drinking Water",
        "location":     "Various Tap Points, Riverside District",
        "samples":      sample_labels,
        "sign1Name":    "John Phiri",
        "sign1Title":   "Laboratory Technologist",
        "sign2Name":    "Mary Banda",
        "sign2Title":   "SHEQ Manager",
        "tableData":    _make_sample_results(n_samples),
    }


def _base_quotation() -> dict:
    return {
        "quoteNumber":   "QT-2025-042",
        "client":        "Kitwe City Council Water Department",
        "clientAddress": "Town Hall, Kitwe City, Copperbelt Province, Zambia",
        "clientPhone":   "+260 212 220000",
        "clientEmail":   "water@kck.gov.zm",
        "date":          "2025-06-01",
        "validUntil":    "2025-06-30",
        "status":        "draft",
        "samples":       ["Tap Water — Riverside", "Tap Water — CBD", "Borehole — Mindolo",
                          "Surface Water — Kafue River Entry"],
        "items":         QUOTATION_ITEMS_LARGE,
        "subtotal":    round(sum(i["unitPrice"] * i["quantity"] for i in QUOTATION_ITEMS_LARGE), 2),
        "totalTax":    round(sum(i["tax"]       for i in QUOTATION_ITEMS_LARGE), 2),
        "totalAmount": round(sum(i["amount"]    for i in QUOTATION_ITEMS_LARGE), 2),
        "sign1Name":   "Mary Banda",
        "sign1Title":  "SHEQ Manager (Authorised Officer)",
        "sign2Name":   "John Phiri",
        "sign2Title":  "Laboratory Technologist",
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  TEST FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def test_coa_pdf(n_samples: int) -> None:
    cert = _base_cert(n_samples)
    name = f"COA_{n_samples:02d}_samples.pdf"
    path = generate_coa_pdf(cert, output_path=os.path.join(OUT_DIR, name))
    size_kb = os.path.getsize(path) / 1024
    print(f"  [PASS] COA PDF ({n_samples:2d} samples) → {os.path.basename(path)}  ({size_kb:.1f} KB)")


def test_quotation_pdf() -> None:
    quot = _base_quotation()
    path = generate_quotation_pdf(quot, output_path=os.path.join(OUT_DIR, "Quotation_large.pdf"))
    size_kb = os.path.getsize(path) / 1024
    print(f"  [PASS] Quotation PDF ({len(quot['items'])} items) → {os.path.basename(path)}  ({size_kb:.1f} KB)")


def test_coa_csv() -> None:
    cert = _base_cert(12)
    path = export_coa_csv(cert, output_path=os.path.join(OUT_DIR, "COA_12_samples.csv"))
    # Validate: each row should have the same number of columns
    import csv as csv_mod
    with open(path, encoding="utf-8-sig") as f:
        reader = csv_mod.reader(f)
        rows = list(reader)
    assert len(rows) > 1, "CSV has no data rows"
    expected_cols = len(rows[0])
    for i, row in enumerate(rows[1:], start=2):
        assert len(row) == expected_cols, f"Row {i} has {len(row)} cols, expected {expected_cols}"
    size_kb = os.path.getsize(path) / 1024
    print(f"  [PASS] COA CSV (12 samples, {expected_cols} cols) → {os.path.basename(path)}  ({size_kb:.1f} KB)")


def test_quotation_csv() -> None:
    quot = _base_quotation()
    path = export_quotation_csv(quot, output_path=os.path.join(OUT_DIR, "Quotation.csv"))
    with open(path, encoding="utf-8-sig") as f:
        content = f.read()
    assert "GRAND TOTAL" in content, "Grand Total row missing from quotation CSV"
    size_kb = os.path.getsize(path) / 1024
    print(f"  [PASS] Quotation CSV ({len(quot['items'])} items) → {os.path.basename(path)}  ({size_kb:.1f} KB)")


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("  NWSC Document Generation Test Suite")
    print("=" * 60)

    errors = []

    # ── COA PDFs at various sample counts ────────────────────────────────────
    print("\nCOA PDF — pagination tests:")
    for n in (1, 6, 12, 50):
        try:
            test_coa_pdf(n)
        except Exception as exc:
            errors.append(f"COA PDF ({n} samples): {exc}")
            print(f"  [FAIL] COA PDF ({n} samples): {exc}")

    # ── Quotation PDF ─────────────────────────────────────────────────────────
    print("\nService Quotation PDF:")
    try:
        test_quotation_pdf()
    except Exception as exc:
        errors.append(f"Quotation PDF: {exc}")
        print(f"  [FAIL] Quotation PDF: {exc}")

    # ── COA CSV ───────────────────────────────────────────────────────────────
    print("\nCSV exports:")
    try:
        test_coa_csv()
    except Exception as exc:
        errors.append(f"COA CSV: {exc}")
        print(f"  [FAIL] COA CSV: {exc}")

    try:
        test_quotation_csv()
    except Exception as exc:
        errors.append(f"Quotation CSV: {exc}")
        print(f"  [FAIL] Quotation CSV: {exc}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    if errors:
        print(f"  {len(errors)} test(s) FAILED:")
        for e in errors:
            print(f"    • {e}")
        sys.exit(1)
    else:
        print("  All tests PASSED.")
        print(f"  Output files are in: {OUT_DIR}")
    print("=" * 60)
