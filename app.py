from flask import Flask, request, jsonify, render_template
from config import Config
from services.ai_service import analyze_crop, analyze_followup
from utils.file_handlers import validate_file, process_image

app = Flask(__name__)
app.config.from_object(Config)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/diagnose', methods=['POST'])
def diagnose():
    if not app.config['GEMINI_API_KEY']:
        return jsonify({"error": "Server configuration error: Missing API Key"}), 500

    if 'image' not in request.files:
        return jsonify({"error": "No image payload found in the request."}), 400
        
    file = request.files['image']
    description = request.form.get('description', '')

    is_valid, error_msg = validate_file(file)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    try:
        mime_type, base64_data = process_image(file)
        analysis_result = analyze_crop(base64_data, mime_type, description)
        return jsonify(analysis_result), 200
    except Exception as e:
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

@app.route('/api/followup', methods=['POST'])
def followup():
    if not app.config['GEMINI_API_KEY']:
        return jsonify({"error": "Server configuration error: Missing API Key"}), 500

    payload = request.get_json()
    if not payload:
        return jsonify({"error": "No data payload found."}), 400

    base64_data = payload.get('image')
    mime_type = payload.get('mime_type')
    previous_diagnosis = payload.get('previous_diagnosis', '')
    chat_history = payload.get('chat_history', [])
    user_message = payload.get('message', '')

    if not user_message:
        return jsonify({"error": "Query message cannot be empty."}), 400

    try:
        response_data = analyze_followup(base64_data, mime_type, previous_diagnosis, chat_history, user_message)
        return jsonify(response_data), 200
    except Exception as e:
        return jsonify({"error": f"Failed to gather followup details: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True)