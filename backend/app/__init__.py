# backend/app/__init__.py

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import os
from .models import db
from .config import Config
from .services.gemini_service import GeminiService
from .services.omniroute_service import OmniRouteService
from werkzeug.exceptions import HTTPException
import logging
from logging.handlers import RotatingFileHandler
from werkzeug.security import generate_password_hash

load_dotenv()

def configure_logging(app):
    log_dir = (
        os.getenv("JUGNU_LOG_DIR")
        or os.getenv("GO_GUARDIAN_LOG_DIR")
        or os.path.join(app.instance_path, "logs")
    )
    os.makedirs(log_dir, exist_ok=True)
        
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, "emergency.log"),
        maxBytes=10240, 
        backupCount=10
    )
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
    ))
    file_handler.setLevel(logging.INFO)
    app.logger.addHandler(file_handler)
    app.logger.setLevel(logging.INFO)
    app.logger.info('Emergency service startup')

def create_app():
    app = Flask(__name__)
    configure_logging(app)

    app.config.from_object(Config)
    app.extensions["dummy_password_hash"] = generate_password_hash(os.urandom(32).hex())
    gemini_api_key = app.config['GEMINI_API_KEY']
    omniroute_url = os.getenv("OMNIROUTE_BASE_URL")
    ai_provider = os.getenv("JUGNU_AI_PROVIDER", "").strip().lower()
    if ai_provider not in {"", "gemini", "omniroute"}:
        raise ValueError("JUGNU_AI_PROVIDER must be gemini or omniroute.")
    if not ai_provider:
        ai_provider = "gemini" if gemini_api_key else "omniroute"

    if ai_provider == "gemini" and gemini_api_key:
        app.gemini_service = GeminiService(gemini_api_key)
    elif ai_provider == "omniroute" and omniroute_url:
        app.gemini_service = OmniRouteService(
            omniroute_url, os.getenv("OMNIROUTE_MODEL", "auto/best-free"),
            os.getenv("OMNIROUTE_API_KEY", ""),
        )
    else:
        app.gemini_service = None
    
    # Configure CORS
    CORS(app, 
         resources={
             r"/api/*": {
                 "origins": ["http://localhost:3000"],
                 "methods": ["GET", "POST"],
                 "allow_headers": ["Content-Type", "Authorization"],
                 "supports_credentials": True
             }
         },
         allow_credentials=True)
    
    # Configure SQLAlchemy
    # Keep using existing data in checkouts created before the rename.
    legacy_db = os.path.join(app.instance_path, "go_guardian.db")
    if not os.getenv("DATABASE_URL") and os.path.isfile(legacy_db) and not os.path.exists(os.path.join(app.instance_path, "jugnu.db")):
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///go_guardian.db"
    
    # Initialize database
    db.init_app(app)

    

    # Debug route
    @app.route('/debug/routes')
    def list_routes():
        routes = []
        for rule in app.url_map.iter_rules():
            routes.append({
                'endpoint': rule.endpoint,
                'methods': list(rule.methods),
                'path': str(rule)
            })
        return jsonify(routes)
    
    # Initialize database
    # Create database tables
    with app.app_context():
        try:
            db.create_all()
            print("Database tables created successfully")
            
        except Exception as e:
            print(f"Error initializing database: {str(e)}")
    
    # Register blueprints
    from .routes.safety_routes import safety_bp
    from .routes.emergency_routes import emergency_bp
    from .routes.monitoring_routes import monitoring_bp
    from .routes.voice_routes import voice_bp
    from .routes.incident_routes import incident_bp
    from .routes.account_routes import account_bp, require_account
    
    # Register core blueprints
    app.register_blueprint(safety_bp, url_prefix='/api/safety')
    app.register_blueprint(emergency_bp, url_prefix='/api/safety')
    
    # Register new feature blueprints
    app.register_blueprint(monitoring_bp, url_prefix='/api/monitoring')
    app.register_blueprint(voice_bp, url_prefix='/api/voice')
    app.register_blueprint(incident_bp, url_prefix='/api/incidents')
    app.register_blueprint(account_bp, url_prefix='/api/account')

    @app.before_request
    def protect_legacy_records():
        if request.method == "OPTIONS":
            return None
        if request.blueprint == "monitoring" or request.endpoint in {"safety.active_route", "safety.route_history"}:
            return jsonify(error="Use the account safety session in Jugnu."), 410
        if request.blueprint == "emergency" and request.endpoint != "emergency.get_emergency_resources":
            return require_account()
    
    @app.route('/health')
    def health_check():
        return {
            "status": "healthy",
            "services": {
                "ai": "available" if app.gemini_service else "unavailable",
                "ai_provider": ai_provider if app.gemini_service else None,
                "database": "connected" if db.engine else "disconnected",
                "monitoring": "available",
                "voice": "available" if app.gemini_service else "unavailable",
                "nearby_places": "available" if os.getenv("GOOGLE_MAPS_SERVER_API_KEY") else "unavailable",
            },
            "version": "1.0.0"
        }

    # Global error handler
    @app.errorhandler(Exception)
    def handle_error(error):
        if isinstance(error, HTTPException):
            return jsonify(error=error.description), error.code
        app.logger.exception("Unexpected error")
        return jsonify({
            "error": "Unexpected server error",
            "status": "error"
        }), 500

    return app
