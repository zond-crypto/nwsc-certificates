import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError

from flask import Flask, jsonify, make_response, render_template, request, send_from_directory
from flask_compress import Compress

try:
    from pdf_generator import generate_coa_pdf, generate_quotation_pdf
except ImportError:
    def generate_coa_pdf(data, output_path=None): return b""
    def generate_quotation_pdf(data, output_path=None): return b""


app = Flask(__name__, static_folder='static', template_folder='templates')
Compress(app)

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(ROOT_DIR, 'dist')
_pdf_executor = ThreadPoolExecutor(max_workers=2)


@app.after_request
def add_cache_headers(response):
    if request.path.startswith('/static/'):
        response.cache_control.max_age = 31536000
        response.cache_control.public = True
    return response


@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')


@app.route('/sw.js')
def sw():
    response = send_from_directory('static', 'sw.js', mimetype='application/javascript')
    response.cache_control.no_cache = True
    response.cache_control.max_age = 0
    response.headers['Service-Worker-Allowed'] = '/'
    return response


@app.route('/offline.html')
def offline_page():
    return render_template('offline.html')


@app.route('/generate_pdf', methods=['POST'])
def generate_pdf_route():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid JSON payload'}), 400

    pdf_type = data.get('type', 'coa')
    if pdf_type not in {'coa', 'quotation'}:
        return jsonify({'error': 'Unsupported PDF type'}), 400

    filename = data.get('filename', f'{pdf_type}_Export.pdf')
    safe_filename = ''.join(ch if ch.isalnum() or ch in {'-', '_', '.'} else '_' for ch in filename)
    task = generate_coa_pdf if pdf_type == 'coa' else generate_quotation_pdf

    future = _pdf_executor.submit(task, data)
    try:
        pdf_bytes = future.result(timeout=30)
        response = make_response(pdf_bytes)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename="{safe_filename}"'
        response.headers['Cache-Control'] = 'no-store'
        return response
    except TimeoutError:
        return jsonify({'error': 'PDF generation timed out'}), 504
    except Exception as error:
        return jsonify({'error': str(error)}), 500


@app.route('/')
def index():
    if os.path.isfile(os.path.join(DIST_DIR, 'index.html')):
        return send_from_directory(DIST_DIR, 'index.html')
    return send_from_directory(ROOT_DIR, 'index.html')


@app.route('/<path:path>')
def spa_assets(path):
    dist_candidate = os.path.join(DIST_DIR, path)
    root_candidate = os.path.join(ROOT_DIR, path)

    if os.path.isfile(dist_candidate):
        return send_from_directory(DIST_DIR, path)
    if os.path.isfile(root_candidate):
        return send_from_directory(ROOT_DIR, path)
    if os.path.isfile(os.path.join(DIST_DIR, 'index.html')):
        return send_from_directory(DIST_DIR, 'index.html')
    return send_from_directory(ROOT_DIR, 'index.html')


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
