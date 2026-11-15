# backend/app/routes/voice_routes.py

from flask import Blueprint, request, jsonify, current_app
from ..models import db
from ..services.gemini_service import GeminiServiceError
from datetime import datetime
import logging

voice_bp = Blueprint('voice', __name__)
logger = logging.getLogger(__name__)

@voice_bp.route('/process', methods=['POST'])
def process_command():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        command = data.get('command')
        if not isinstance(command, str) or not command.strip():
            return jsonify(error="Voice command is required."), 400
        gemini = current_app.gemini_service
        if gemini is None:
            return jsonify(error="AI analysis is not configured."), 503
        return jsonify(gemini.generate_json(
            "Classify the following voice transcript. Return JSON fields "
            "command_type (emergency, navigation, safety_check, contact, or unknown), "
            "parameters (object), and response_message (string). "
            "Do not claim that any actions were performed. Transcript: " + command[:500]
        ))
    except GeminiServiceError as error:
        return jsonify(error=str(error)), error.status_code
    
    except Exception as e:
        logger.error(f"Voice command error: {str(e)}")
        return jsonify({'error': str(e)}), 500
