import os
from flask import Flask, request, send_from_directory, render_template, make_response, jsonify
from flask_compress import Compress
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
import io

# Import the PDF generator (assumed to be in the same directory)
# We will update pdf_generator.py to include build_pdf_to_bytes
try:
    from pdf_generator import generate_coa_pdf, generate_quotation_pdf
except ImportError:
    # Fallback if not yet fully implemented or in secondary location
    def generate_coa_pdf(data, output_path=None): return b""
    def generate_quotation_pdf(data, output_path=None): return b""

app = Flask(__name__, static_folder='static', template_folder='templates')
Compress(app)

# ── 5B. PDF generation — run in background thread to avoid blocking UI
_pdf_executor = ThreadPoolExecutor(max_workers=2)

@app.after_request
def add_cache_headers(response):
    # Cache static assets for 1 year
    if request.path.startswith('/static/'):
        response.cache_control.max_age = 31536000
        response.cache_control.public = True
    return response

# ── Part 6 routes for PWA
@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json',
                               mimetype='application/manifest+json')

@app.route('/sw.js')
def sw():
    response = send_from_directory('static', 'sw.js',
                                   mimetype='application/javascript')
    response.cache_control.no_cache = True
    response.cache_control.max_age = 0
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@app.route('/offline.html')
def offline_page():
    return render_template('offline.html')

# ── PDF generation routes
@app.route('/generate_pdf', methods=['POST'])
def generate_pdf_route():
    data = request.json
    # data contains 'type' (coa or quotation) and the payload
    pdf_type = data.get('type', 'coa')
    filename = data.get("filename", f"{pdf_type}_Export.pdf")
    
    task = generate_coa_pdf if pdf_type == 'coa' else generate_quotation_pdf
    
    future = _pdf_executor.submit(task, data)
    try:
        pdf_bytes = future.result(timeout=30)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.headers['Cache-Control'] = 'no-store'
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/')
def index():
    # If using Vite, this might serve the index.html from dist or root
    return send_from_directory('.', 'index.html')

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
