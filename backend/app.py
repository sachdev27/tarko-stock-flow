from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config
from database import init_connection_pool, close_connection_pool
import atexit
import logging

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
from routes.ledger_routes import ledger_bp
from routes.return_routes import return_bp

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
app.register_blueprint(ledger_bp)
app.register_blueprint(return_bp)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'message': 'Tarko API is running'}), 200

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

def init_default_admin():
    """Initialize default admin user on startup"""
    try:
        import subprocess
        result = subprocess.run(
            ['python', 'init_admin.py'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            logger.info("Default admin initialization completed")
            if result.stdout:
                logger.info(result.stdout)
        else:
            logger.warning(f"Admin initialization returned code {result.returncode}")
            if result.stderr:
                logger.warning(result.stderr)
    except Exception as e:
        logger.warning(f"Could not initialize default admin: {e}")

if __name__ == '__main__':
    # Initialize database connection pool
    logger.info("Initializing database connection pool...")
    init_connection_pool()

    # Register cleanup
    atexit.register(close_connection_pool)

    # Initialize default admin user
    init_default_admin()

    app.run(debug=True, host='0.0.0.0', port=5500)
