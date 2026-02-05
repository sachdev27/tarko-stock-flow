from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config
from database import init_connection_pool, close_connection_pool
import atexit
import logging
import os

# Import blueprints
from routes.auth_routes import auth_bp
from routes.inventory_routes import inventory_bp
from routes.production_routes import production_bp
from routes.transaction_routes import transaction_bp
from routes.stats_routes import stats_bp
from routes.admin_routes import admin_bp
from routes.reports_routes import reports_bp
from routes.parameter_routes import parameter_bp
from routes.dispatch_routes import dispatch_bp
from routes.dispatch_entities_routes import dispatch_entities_bp
from routes.version_control_routes import version_control_bp
from routes.return_routes import return_bp
from routes.scrap_routes import scrap_bp
from routes.backup_config_routes import backup_config_bp
from routes.setup_routes import setup_bp
from routes.password_reset_routes import password_reset_bp
from routes.smtp_config_routes import smtp_config_bp
from routes.sync_routes import sync_bp
from routes.swagger_routes import swagger_bp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)

# Enable CORS for all origins (for development)
CORS(app,
     resources={r"/api/*": {
         "origins": "*",
         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization"],
         "expose_headers": ["Content-Type", "Authorization"]
     }},
     supports_credentials=True)

# Setup JWT
jwt = JWTManager(app)

# JWT error handlers
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({
        'error': 'Token has expired',
        'msg': 'The token has expired. Please login again.'
    }), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({
        'error': 'Invalid token',
        'msg': 'Signature verification failed or token is malformed.'
    }), 401

@jwt.unauthorized_loader
def unauthorized_callback(error):
    return jsonify({
        'error': 'Missing authorization',
        'msg': 'Request does not contain an access token.'
    }), 401

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(inventory_bp)
app.register_blueprint(production_bp)
app.register_blueprint(transaction_bp)
app.register_blueprint(stats_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(parameter_bp)
app.register_blueprint(dispatch_bp)
app.register_blueprint(dispatch_entities_bp)
app.register_blueprint(version_control_bp)
app.register_blueprint(return_bp)
app.register_blueprint(scrap_bp)
app.register_blueprint(backup_config_bp)
app.register_blueprint(setup_bp)
app.register_blueprint(password_reset_bp)
app.register_blueprint(smtp_config_bp)
app.register_blueprint(sync_bp)
app.register_blueprint(swagger_bp)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'message': 'Tarko API is running'}), 200

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


def init_app():
    """Initialize database and scheduler for production (gunicorn)"""
    logger.info(f"Initializing app in worker PID {os.getpid()}...")
    init_connection_pool()

    # Initialize scheduler for auto-snapshots
    # In multi-worker environments (Gunicorn), only one worker will run the scheduler
    # (controlled by file-based lock in scheduler_service.py)
    try:
        from services.scheduler_service import init_scheduler, shutdown_scheduler
        logger.info("Attempting to initialize auto-snapshot scheduler...")
        scheduler = init_scheduler(app)
        if scheduler:
            # Only register shutdown if we're the worker running the scheduler
            atexit.register(shutdown_scheduler)
            logger.info("This worker is running the scheduler")
        else:
            logger.info("This worker is NOT running the scheduler (another worker has it)")
    except Exception as e:
        logger.warning(f"Could not initialize scheduler: {e}")

    # Register cleanup
    atexit.register(close_connection_pool)


# Initialize on import for gunicorn
init_app()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5500)