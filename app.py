import os
import io
from flask import Flask, render_template, request, jsonify, Response, send_file
from werkzeug.utils import secure_filename
from converter import AttendanceDataStore

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max upload
UPLOAD_FOLDER = os.path.dirname(os.path.abspath(__file__))
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

EXCEL_FILE = os.path.join(UPLOAD_FOLDER, 'StudentAttendanceReport.xlsx')
data_store = AttendanceDataStore(excel_path=EXCEL_FILE)

# Preload data on startup in background or synchronously
try:
    data_store.load_data()
except Exception as e:
    print(f"Warning: Could not pre-load Excel data: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    is_ready = data_store.is_loaded or os.path.exists(data_store.excel_path)
    if not data_store.is_loaded and os.path.exists(data_store.excel_path):
        data_store.load_data()
    
    total_students = sum(len(b['students']) for b in data_store.batches.values()) if data_store.is_loaded else 0
    return jsonify({
        'is_loaded': data_store.is_loaded,
        'excel_exists': os.path.exists(data_store.excel_path),
        'total_batches': len(data_store.batches),
        'total_students': total_students,
        'total_rows': data_store.total_rows
    })

@app.route('/api/batches', methods=['GET'])
def get_batches():
    if not data_store.is_loaded:
        data_store.load_data()
    batches = data_store.get_batches_summary()
    return jsonify({'batches': batches})

@app.route('/api/batches/<path:batch_name>/details', methods=['GET'])
def get_batch_details(batch_name):
    if not data_store.is_loaded:
        data_store.load_data()
    
    students = data_store.get_students_for_batch(batch_name)
    dates = data_store.get_batch_dates(batch_name)
    
    return jsonify({
        'batch_name': batch_name,
        'students': students,
        'dates': dates,
        'student_count': len(students),
        'date_count': len(dates)
    })

@app.route('/api/preview', methods=['POST'])
def preview_csv():
    data = request.json or {}
    batch_name = data.get('batch_name')
    student_ids = data.get('student_ids')
    date_filter = data.get('date_filter') or data.get('date_search')
    deduplicate = data.get('deduplicate', True)
    id_format = data.get('id_format', 'Student')
    custom_prefix = data.get('custom_prefix', '')

    if not batch_name:
        return jsonify({'error': 'Batch name is required'}), 400

    # Get total unfiltered count for reference
    all_rows = data_store.generate_attendance_rows(
        batch_name=batch_name,
        student_ids=student_ids if student_ids else None,
        date_filter=None,
        deduplicate_dates=deduplicate,
        id_format=id_format,
        custom_prefix=custom_prefix
    )

    filtered_rows = data_store.generate_attendance_rows(
        batch_name=batch_name,
        student_ids=student_ids if student_ids else None,
        date_filter=date_filter if date_filter else None,
        deduplicate_dates=deduplicate,
        id_format=id_format,
        custom_prefix=custom_prefix
    )

    filename = data_store.get_export_filename(batch_name, student_ids)

    return jsonify({
        'total_records': len(filtered_rows),
        'total_unfiltered_records': len(all_rows),
        'is_date_filtered': bool(date_filter),
        'suggested_filename': filename,
        'preview_rows': filtered_rows[:100],
        'sample_csv': data_store.export_csv_string(
            batch_name=batch_name,
            student_ids=student_ids if student_ids else None,
            date_filter=date_filter if date_filter else None,
            deduplicate_dates=deduplicate,
            id_format=id_format,
            custom_prefix=custom_prefix
        )[:1500]
    })

@app.route('/api/export', methods=['POST', 'GET'])
def export_csv():
    if request.method == 'POST':
        data = request.json or {}
    else:
        batch = request.args.get('batch')
        students = request.args.getlist('students')
        dates = request.args.get('date_search') or request.args.getlist('dates')
        dedup = request.args.get('deduplicate', 'true').lower() == 'true'
        id_fmt = request.args.get('id_format', 'Student')
        custom_pfx = request.args.get('custom_prefix', '')
        data = {
            'batch_name': batch,
            'student_ids': students,
            'date_filter': dates,
            'deduplicate': dedup,
            'id_format': id_fmt,
            'custom_prefix': custom_pfx
        }

    batch_name = data.get('batch_name')
    student_ids = data.get('student_ids')
    date_filter = data.get('date_filter') or data.get('date_search')
    deduplicate = data.get('deduplicate', True)
    id_format = data.get('id_format', 'Student')
    custom_prefix = data.get('custom_prefix', '')

    if not batch_name:
        return jsonify({'error': 'Batch name is required'}), 400

    csv_content = data_store.export_csv_string(
        batch_name=batch_name,
        student_ids=student_ids if student_ids else None,
        date_filter=date_filter if date_filter else None,
        deduplicate_dates=deduplicate,
        id_format=id_format,
        custom_prefix=custom_prefix
    )

    filename = data_store.get_export_filename(batch_name, student_ids)

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={
            "Content-disposition": f"attachment; filename={filename}",
            "X-Suggested-Filename": filename,
            "Access-Control-Expose-Headers": "Content-Disposition, X-Suggested-Filename"
        }
    )

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        return jsonify({'error': 'Please upload an Excel (.xlsx or .xls) file'}), 400

    filename = secure_filename(file.filename)
    save_path = os.path.join(app.config['UPLOAD_FOLDER'], 'StudentAttendanceReport.xlsx')
    file.save(save_path)

    # Force reload data store
    data_store.load_data(force_reload=True)

    return jsonify({
        'success': True,
        'message': 'File uploaded and parsed successfully',
        'total_batches': len(data_store.batches),
        'total_rows': data_store.total_rows
    })

if __name__ == '__main__':
    print("Starting Aptech Osquare Attendance Converter Web App...")
    app.run(host='127.0.0.1', port=5000, debug=False)
