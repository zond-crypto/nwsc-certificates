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


@app.route('/api/store_pdf', methods=['POST'])
def store_pdf():
    try:
        if 'pdf' not in request.files:
            return jsonify({'error': 'No PDF file provided'}), 400
        
        file = request.files['pdf']
        folder = request.form.get('folder', 'Uncategorized')
        filename = file.filename
        
        # Stores generated PDFs in organized folders
        import datetime
        year_month = datetime.datetime.now().strftime("%Y-%m")
        save_dir = os.path.join(ROOT_DIR, 'workspace', 'generated_pdfs', folder, year_month)
        os.makedirs(save_dir, exist_ok=True)
        
        save_path = os.path.join(save_dir, filename)
        file.save(save_path)
        
        return jsonify({'success': True, 'path': save_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/templates')
def list_templates():
    """Lists custom templates available in workspace/templates."""
    templates_dir = os.path.join(ROOT_DIR, 'workspace', 'templates')
    result = {'coa': [], 'quotation': []}
    
    for t_type in ['coa', 'quotation']:
        path = os.path.join(templates_dir, t_type)
        if os.path.exists(path):
            files = [f for f in os.listdir(path) if f.endswith(('.html', '.docx'))]
            result[t_type] = files
            
    return jsonify(result)


@app.route('/api/generate_from_docx', methods=['POST'])
def generate_from_docx():
    """Populates a Word template and returns a PDF (or docx)."""
    try:
        from docxtpl import DocxTemplate
        data = request.get_json()
        t_type = data.get('type')
        t_name = data.get('template')
        filename = data.get('filename', 'document.pdf')
        
        if not t_type or not t_name:
            return jsonify({'error': 'Missing template information'}), 400
            
        template_path = os.path.join(ROOT_DIR, 'workspace', 'templates', t_type, t_name)
        if not os.path.exists(template_path):
            return jsonify({'error': 'Template not found'}), 404
            
        # 1. Populate the Word document
        doc = DocxTemplate(template_path)
        doc.render(data.get('payload', {}))
        
        # 2. Save to temporary file
        temp_dir = os.path.join(ROOT_DIR, 'workspace', 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        docx_out = os.path.join(temp_dir, t_name.replace('.docx', '_filled.docx'))
        doc.save(docx_out)
        
        # 3. Attempt conversion to PDF if requested and on Windows
        if filename.endswith('.pdf'):
            try:
                import sys
                if sys.platform != 'win32':
                    raise ImportError("PDF conversion via Word is only supported on Windows.")
                    
                from docx2pdf import convert
                import pythoncom
                
                pdf_out = docx_out.replace('.docx', '.pdf')
                
                # Initialize COM for the thread
                pythoncom.CoInitialize()
                convert(docx_out, pdf_out)
                
                with open(pdf_out, 'rb') as f:
                    pdf_bytes = f.read()
                
                response = make_response(pdf_bytes)
                response.headers['Content-Type'] = 'application/pdf'
                response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response
            except Exception as conv_err:
                # Fallback to returning the docx if PDF conversion fails
                print(f"PDF Conversion failed: {conv_err}")
                with open(docx_out, 'rb') as f:
                    docx_bytes = f.read()
                response = make_response(docx_bytes)
                response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                response.headers['Content-Disposition'] = f'attachment; filename="{filename.replace(".pdf", ".docx")}"'
                return response
        else:
            with open(docx_out, 'rb') as f:
                docx_bytes = f.read()
            response = make_response(docx_bytes)
            response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/templates/<t_type>/<name>')
def get_custom_template(t_type, name):
    """Serves a specific custom template from workspace/templates."""
    if t_type not in ['coa', 'quotation']:
        return jsonify({'error': 'Invalid template type'}), 400
    
    templates_dir = os.path.join(ROOT_DIR, 'workspace', 'templates', t_type)
    return send_from_directory(templates_dir, name)


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
