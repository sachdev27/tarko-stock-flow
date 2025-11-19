from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from database import execute_query

stats_bp = Blueprint('stats', __name__, url_prefix='/api/stats')

@stats_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        # Total batches
        total_query = """
            SELECT COUNT(*) as count
            FROM batches
            WHERE deleted_at IS NULL
        """
        total_result = execute_query(total_query)
        total_batches = total_result[0]['count'] if total_result else 0

        # Active batches (with stock)
        active_query = """
            SELECT COUNT(*) as count
            FROM batches
            WHERE deleted_at IS NULL
            AND current_quantity > 0
        """
        active_result = execute_query(active_query)
        active_batches = active_result[0]['count'] if active_result else 0

        return jsonify({
            'totalBatches': total_batches,
            'activeBatches': active_batches,
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
