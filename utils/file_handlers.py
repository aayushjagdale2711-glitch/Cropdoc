import base64
from config import Config

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

def validate_file(file):
    if file.filename == '':
        return False, "No file selected."
    if not allowed_file(file.filename):
        return False, "Unsupported file format. Please upload a PNG, JPG, JPEG, or WEBP."
    return True, None

def process_image(file):
    mime_type = file.mimetype
    file_bytes = file.read()
    base64_data = base64.b64encode(file_bytes).decode('utf-8')
    return mime_type, base64_data