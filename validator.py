"""
validator.py
═══════════════════════════════════════════════════════════════════════════════
Validation suite for NWSC Document Outputs.
Verifies PDF metadata and CSV structural integrity.
"""
import os
import csv
from typing import Dict, Any

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

def validate_outputs(pdf_path: str, csv_path: str) -> Dict[str, Any]:
    """
    Programmatically verify the generated documents.
    """
    results = {
        "pdf": {"exists": False, "metadata_ok": False},
        "csv": {"exists": False, "structure_ok": False, "encoding_ok": False}
    }

    # 1. PDF Validation
    if os.path.exists(pdf_path):
        results["pdf"]["exists"] = True
        if PdfReader:
            try:
                reader = PdfReader(pdf_path)
                meta = reader.metadata
                # Check for presence of key fields
                if meta and "/Title" in meta and "/Author" in meta:
                    results["pdf"]["metadata_ok"] = True
            except Exception:
                pass

    # 2. CSV Validation
    if os.path.exists(csv_path):
        results["csv"]["exists"] = True
        try:
            # Check for UTF-8-SIG BOM
            with open(csv_path, 'rb') as f:
                bom = f.read(3)
                if bom == b'\xef\xbb\xbf':
                    results["csv"]["encoding_ok"] = True
            
            # Check 5-section structure
            with open(csv_path, 'r', encoding='utf-8-sig') as f:
                reader = list(csv.reader(f))
                # Heuristic: check for section markers or specific labels
                labels = [row[0] for row in reader if row]
                has_header = any(h in reader[0][0] for h in ["NWSC WATER ANALYSIS CERTIFICATE EXPORT", "NWSC QUOTATION EXPORT"])
                has_meta = any("Certificate No" in l or "Quotation No" in l for l in labels)
                if has_header and has_meta:
                    results["csv"]["structure_ok"] = True
        except Exception:
            pass

    return results

if __name__ == "__main__":
    # Example usage
    print("Validator module ready.")
