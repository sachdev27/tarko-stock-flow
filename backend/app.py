from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config
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
from routes.version_control_routes import version_control_bp
from routes.ledger_routes import ledger_bp

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
app.register_blueprint(version_control_bp)
app.register_blueprint(ledger_bp)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'message': 'Tarko API is running'}), 200

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5500)
