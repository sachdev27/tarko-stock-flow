"""
Pytest configuration and shared fixtures for test suite
REWRITTEN to match actual schema (December 2025)
"""
import pytest
import os
import sys
import json
import bcrypt
from datetime import datetime, timedelta

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import the existing Flask app
from app import app as flask_app
from database import get_db_connection, get_db_cursor, init_connection_pool


@pytest.fixture(scope='session')
def app():
    """Get Flask application for testing"""
    flask_app.config.update({
        'TESTING': True,
        'DATABASE_URL': os.getenv('TEST_DATABASE_URL', os.getenv('DATABASE_URL', 'postgresql://localhost:5432/tarko_inventory')),
        'SECRET_KEY': 'test-secret-key',
        'JWT_SECRET_KEY': 'test-jwt-secret'
    })
    # Initialize connection pool
    init_connection_pool()
    yield flask_app


@pytest.fixture(scope='session')
def client(app):
    """Create test client"""
    return app.test_client()


@pytest.fixture(scope='session')
def runner(app):
    """Create CLI runner"""
    return app.test_cli_runner()


@pytest.fixture(scope='function')
def db_connection(app):
    """Create database connection for test"""
    with get_db_connection() as conn:
        yield conn
        conn.rollback()  # Rollback any changes after test


@pytest.fixture(scope='session', autouse=True)
def setup_test_database(app):
    """Setup test database before all tests"""
    # Setup phase - Delete test user if exists, then create fresh
    with get_db_cursor(commit=False) as cursor:
        # Check if test user exists
        cursor.execute("SELECT id FROM users WHERE email = 'test@test.com'")
        result = cursor.fetchone()
        
        if result:
            test_user_id = result['id']
            print(f"Found existing test user with ID: {test_user_id}, deleting...")
            # Delete all related data in proper order (respecting foreign keys)
            cleanup_queries = [
                # Delete audit logs first (references users)
                f"DELETE FROM audit_logs WHERE user_id = '{test_user_id}'",
                # Delete transactions and inventory
                f"DELETE FROM inventory_transactions WHERE batch_id IN (SELECT id FROM batches WHERE created_by = '{test_user_id}')",
                f"DELETE FROM inventory_stock WHERE batch_id IN (SELECT id FROM batches WHERE created_by = '{test_user_id}')",
                f"DELETE FROM transactions WHERE batch_id IN (SELECT id FROM batches WHERE created_by = '{test_user_id}')",
                # Delete batches
                f"DELETE FROM batches WHERE created_by = '{test_user_id}'",
                # Delete user roles and user
                f"DELETE FROM user_roles WHERE user_id = '{test_user_id}'",
                f"DELETE FROM users WHERE id = '{test_user_id}'"
            ]
            for i, query in enumerate(cleanup_queries):
                try:
                    cursor.execute(query)
                    cursor.connection.commit()
                    print(f"Cleanup {i+1}/{len(cleanup_queries)} succeeded")
                except Exception as e:
                    # If error, rollback this specific query and continue
                    cursor.connection.rollback()
                    print(f"Cleanup {i+1}/{len(cleanup_queries)} failed: {e}")
                    pass
        
        # Create fresh test user with bcrypt (matching auth service)
        password_hash = bcrypt.hashpw('testpass123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        cursor.execute("""
            INSERT INTO users (email, password_hash, created_at, updated_at)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, ('test@test.com', password_hash, datetime.now(), datetime.now()))
        user_id = cursor.fetchone()['id']
        
        # Add admin role
        cursor.execute("""
            INSERT INTO user_roles (user_id, role, created_at, updated_at)
            VALUES (%s, %s, %s, %s)
        """, (user_id, 'admin', datetime.now(), datetime.now()))
        
        cursor.connection.commit()

    yield

    # Cleanup phase - only delete test data from today
    with get_db_cursor(commit=True) as cursor:
        # Note: Order matters due to foreign key constraints
        try:
            cursor.execute("DELETE FROM inventory_transactions WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM scrap_items WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM scraps WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM return_items WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM returns WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM dispatch_items WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM dispatches WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM sprinkler_spare_pieces WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM hdpe_cut_pieces WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM inventory_stock WHERE created_at::date = CURRENT_DATE")
            cursor.execute("DELETE FROM batches WHERE created_at::date = CURRENT_DATE")
        except Exception as e:
            print(f"Cleanup warning: {e}")
@pytest.fixture(scope='function')
def auth_token(client):
    """Get authentication token for tests"""
    response = client.post('/api/auth/login', json={
        'email': 'test@test.com',
        'password': 'testpass123'
    })
    if response.status_code != 200:
        raise Exception(f"Login failed with status {response.status_code}: {response.json}")
    return response.json['access_token']


@pytest.fixture(scope='function')
def auth_headers(auth_token):
    """Get authorization headers"""
    return {
        'Authorization': f'Bearer {auth_token}',
        'Content-Type': 'application/json'
    }


# ==================== HELPER FIXTURES FOR SEEDED DATA ====================

@pytest.fixture(scope='session')
def get_unit_id():
    """Get unit ID by abbreviation"""
    def _get(abbreviation='m'):
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM units WHERE abbreviation = %s LIMIT 1", (abbreviation,))
            result = cursor.fetchone()
            return str(result['id']) if result else None
    return _get


@pytest.fixture(scope='session')
def get_brand_id():
    """Get brand ID by name"""
    def _get(name=None):
        with get_db_cursor() as cursor:
            if name:
                cursor.execute("SELECT id FROM brands WHERE name = %s AND deleted_at IS NULL LIMIT 1", (name,))
            else:
                cursor.execute("SELECT id FROM brands WHERE deleted_at IS NULL LIMIT 1")
            result = cursor.fetchone()
            return str(result['id']) if result else None
    return _get


@pytest.fixture(scope='session')
def get_location_id():
    """Get location ID by name"""
    def _get(name='Main Warehouse'):
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM locations WHERE name = %s AND deleted_at IS NULL LIMIT 1", (name,))
            result = cursor.fetchone()
            return str(result['id']) if result else None
    return _get


@pytest.fixture(scope='session')
def get_product_type_id():
    """Get product type ID by name"""
    def _get(name='HDPE Pipe'):
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM product_types WHERE name = %s AND deleted_at IS NULL LIMIT 1", (name,))
            result = cursor.fetchone()
            return str(result['id']) if result else None
    return _get


@pytest.fixture(scope='function')
def test_product_variant(get_product_type_id, get_brand_id):
    """Create or get a test product variant"""
    with get_db_cursor(commit=True) as cursor:
        product_type_id = get_product_type_id('HDPE Pipe')
        brand_id = get_brand_id()
        
        # Try to find existing
        cursor.execute("""
            SELECT id, product_type_id, brand_id, parameters
            FROM product_variants
            WHERE product_type_id = %s AND brand_id = %s AND deleted_at IS NULL
            LIMIT 1
        """, (product_type_id, brand_id))
        
        variant = cursor.fetchone()
        if variant:
            return {
                'id': str(variant['id']),
                'product_type_id': str(variant['product_type_id']),
                'brand_id': str(variant['brand_id']),
                'parameters': variant['parameters']
            }
        
        # Create new
        cursor.execute("""
            INSERT INTO product_variants (product_type_id, brand_id, parameters, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, product_type_id, brand_id, parameters
        """, (product_type_id, brand_id, {'PE': 'PE80', 'PN': 10, 'OD': 110}, datetime.now(), datetime.now()))
        
        variant = cursor.fetchone()
        return {
            'id': str(variant['id']),
            'product_type_id': str(variant['product_type_id']),
            'brand_id': str(variant['brand_id']),
            'parameters': variant['parameters']
        }


@pytest.fixture(scope='function')
def test_customer(client, auth_headers):
    """Create a test customer"""
    timestamp = int(datetime.now().timestamp())
    response = client.post('/api/dispatch-entities/customers',
                          headers=auth_headers,
                          json={
                              'name': f'Test Customer {timestamp}',
                              'contact_person': 'John Doe',
                              'phone': '1234567890',
                              'email': f'test{timestamp}@customer.com',
                              'address': '123 Test St'
                          })
    if response.status_code not in (200, 201):
        # Customer might exist, try to get one
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id, name FROM customers WHERE deleted_at IS NULL LIMIT 1")
            customer = cursor.fetchone()
            if customer:
                return {'id': str(customer['id']), 'name': customer['name']}
        raise Exception(f"Failed to create customer: {response.json}")
    return response.json


# ==================== PRODUCTION FIXTURES ====================

@pytest.fixture
def hdpe_batch(client, auth_headers, get_product_type_id, get_brand_id):
    """Create HDPE batch for testing"""
    timestamp = int(datetime.now().timestamp())
    response = client.post('/api/production/batch',
                          headers=auth_headers,
                          json={
                              'product_type_id': get_product_type_id('HDPE Pipe'),
                              'brand_id': get_brand_id(),
                              'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 110},
                              'production_date': datetime.now().isoformat(),
                              'quantity': 1000.0,
                              'batch_no': f'TEST-HDPE-{timestamp}',
                              'batch_code': f'HDPE-{timestamp}',
                              'number_of_rolls': 2,
                              'length_per_roll': 500.0,
                              'weight_per_meter': 1.5,
                              'notes': 'Test HDPE batch'
                          })
    if response.status_code not in (200, 201):
        raise Exception(f"Failed to create HDPE batch: {response.json}")
    return response.json


@pytest.fixture
def hdpe_batch_with_cuts(client, auth_token, get_product_type_id, get_brand_id):
    """Create HDPE batch with cut rolls"""
    import time
    timestamp = int(time.time() * 1000000)  # microseconds for uniqueness
    response = client.post('/api/production/batch',
                          json={
                              'product_type_id': get_product_type_id('HDPE Pipe'),
                              'brand_id': get_brand_id(),
                              'parameters': {'diameter': '50mm'},
                              'production_date': '2025-12-01T08:00:00',
                              'batch_no': f'TEST-CUTS-{timestamp}',
                              'batch_code': f'CUTS-{timestamp}',
                              'quantity': 600,
                              'number_of_rolls': 1,
                              'length_per_roll': 300,
                              'cut_rolls': [
                                  {'length': 150},
                                  {'length': 150}
                              ]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def sprinkler_batch(client, auth_token, get_product_type_id, get_brand_id):
    """Create sprinkler batch for testing"""
    import time
    timestamp = int(time.time() * 1000000)  # microseconds for uniqueness
    response = client.post('/api/production/batch',
                          json={
                              'product_type_id': get_product_type_id('Sprinkler Pipe'),
                              'brand_id': get_brand_id(),
                              'parameters': {'diameter': '32mm'},
                              'production_date': '2025-12-01T08:00:00',
                              'batch_no': f'TEST-SPR-{timestamp}',
                              'batch_code': f'SPR-{timestamp}',
                              'quantity': 215,
                              'quantity_based': 'true',
                              'roll_config_type': 'bundles',
                              'number_of_bundles': 20,
                              'bundle_size': 10,
                              'spare_pipes': [
                                  {'length': 7},
                                  {'length': 8}
                              ],
                              'length_per_roll': 6,
                              'weight_per_meter': 0.5
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def hdpe_batch_1(client, auth_token, get_product_type_id, get_brand_id):
    """First HDPE batch for multi-batch tests"""
    import time
    timestamp = int(time.time() * 1000000)  # microseconds for uniqueness
    response = client.post('/api/production/batch',
                          json={
                              'product_type_id': get_product_type_id('HDPE Pipe'),
                              'brand_id': get_brand_id(),
                              'parameters': {'diameter': '40mm'},
                              'production_date': '2025-12-01T08:00:00',
                              'batch_no': f'TEST-BATCH1-{timestamp}',
                              'batch_code': f'BATCH1-{timestamp}',
                              'quantity': 500,
                              'number_of_rolls': 1,
                              'length_per_roll': 500
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def hdpe_batch_2(client, auth_token, get_product_type_id, get_brand_id):
    """Second HDPE batch for multi-batch tests"""
    import time
    timestamp = int(time.time() * 1000000)  # microseconds for uniqueness  
    response = client.post('/api/production/batch',
                          json={
                              'product_type_id': get_product_type_id('HDPE Pipe'),
                              'brand_id': get_brand_id(),
                              'parameters': {'diameter': '40mm'},
                              'production_date': '2025-12-01T09:00:00',
                              'batch_no': f'TEST-BATCH2-{timestamp}',
                              'batch_code': f'BATCH2-{timestamp}',
                              'quantity': 500,
                              'number_of_rolls': 1,
                              'length_per_roll': 500
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def batch_with_attachment(client, auth_headers, get_product_type_id, get_brand_id):
    """Create batch with file attachment"""
    from io import BytesIO

    timestamp = int(datetime.now().timestamp())
    # Create test file
    test_file = BytesIO(b'%PDF-1.4 test content')
    test_file.name = 'test_cert.pdf'

    data = {
        'product_type_id': str(get_product_type_id('HDPE Pipe')),
        'brand_id': str(get_brand_id()),
        'parameters': json.dumps({'PE': 'PE80', 'PN': 10, 'OD': 63}),
        'production_date': datetime.now().isoformat(),
        'quantity': '500',
        'batch_no': f'TEST-ATTACHMENT-{timestamp}',
        'number_of_rolls': '1',
        'length_per_roll': '500',
        'weight_per_meter': '1.5',
        'attachment': (test_file, 'test_cert.pdf', 'application/pdf')
    }

    headers = {'Authorization': auth_headers['Authorization']}
    response = client.post('/api/production/batch',
                          data=data,
                          headers=headers,
                          content_type='multipart/form-data')
    result = response.json
    result['filename'] = 'test_cert.pdf'
    return result


# ==================== DISPATCH FIXTURES ====================

@pytest.fixture
def dispatched_item(client, auth_token, hdpe_batch):
    """Create a dispatched item for testing"""
    response = client.post('/api/dispatch',
                          json={
                              'customer_name': 'Test Customer',
                              'customer_phone': '1234567890',
                              'dispatch_date': '2025-12-01T14:00:00',
                              'items': [{
                                  'batch_id': hdpe_batch['batch_id'],
                                  'item_id': hdpe_batch['rolls'][0]['id'],
                                  'quantity': 500,
                                  'unit_price': 100.00
                              }]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    result = response.json()
    result['item_id'] = result['items'][0]['id']
    result['quantity'] = 500
    return result


@pytest.fixture
def multi_item_dispatch(client, auth_token, hdpe_batch):
    """Create dispatch with multiple items"""
    response = client.post('/api/dispatch',
                          json={
                              'customer_name': 'Multi Item Customer',
                              'customer_phone': '9876543210',
                              'dispatch_date': '2025-12-01T14:00:00',
                              'items': [
                                  {
                                      'batch_id': hdpe_batch['batch_id'],
                                      'item_id': hdpe_batch['rolls'][0]['id'],
                                      'quantity': 300,
                                      'unit_price': 100.00
                                  },
                                  {
                                      'batch_id': hdpe_batch['batch_id'],
                                      'item_id': hdpe_batch['rolls'][1]['id'],
                                      'quantity': 200,
                                      'unit_price': 100.00
                                  }
                              ]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def mixed_batch_dispatch(client, auth_token, hdpe_batch_1, hdpe_batch_2):
    """Create dispatch from multiple batches"""
    response = client.post('/api/dispatch',
                          json={
                              'customer_name': 'Mixed Batch Customer',
                              'customer_phone': '5555555555',
                              'dispatch_date': '2025-12-01T14:00:00',
                              'items': [
                                  {
                                      'batch_id': hdpe_batch_1['batch_id'],
                                      'item_id': hdpe_batch_1['rolls'][0]['id'],
                                      'quantity': 250,
                                      'unit_price': 100.00
                                  },
                                  {
                                      'batch_id': hdpe_batch_2['batch_id'],
                                      'item_id': hdpe_batch_2['rolls'][0]['id'],
                                      'quantity': 250,
                                      'unit_price': 95.00
                                  }
                              ]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def cancelled_dispatch(client, auth_token, hdpe_batch):
    """Create and cancel a dispatch"""
    # Create dispatch
    dispatch_resp = client.post('/api/dispatch',
                                json={
                                    'customer_name': 'Cancelled Customer',
                                    'customer_phone': '1111111111',
                                    'dispatch_date': '2025-12-01T14:00:00',
                                    'items': [{
                                        'batch_id': hdpe_batch['batch_id'],
                                        'item_id': hdpe_batch['rolls'][0]['id'],
                                        'quantity': 200,
                                        'unit_price': 100.00
                                    }]
                                },
                                headers={'Authorization': f'Bearer {auth_token}'})
    dispatch = dispatch_resp.json()

    # Cancel it
    client.post(f'/api/dispatch/{dispatch["dispatch_id"]}/cancel',
               json={'reason': 'Test cancellation'},
               headers={'Authorization': f'Bearer {auth_token}'})

    return dispatch


@pytest.fixture
def hdpe_dispatch(client, auth_token, hdpe_batch):
    """Simple HDPE dispatch fixture"""
    response = client.post('/api/dispatch',
                          json={
                              'customer_name': 'HDPE Customer',
                              'customer_phone': '2223334444',
                              'dispatch_date': '2025-12-01T14:00:00',
                              'items': [{
                                  'batch_id': hdpe_batch['batch_id'],
                                  'item_id': hdpe_batch['rolls'][0]['id'],
                                  'quantity': 500,
                                  'unit_price': 100.00
                              }]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def sprinkler_dispatch(client, auth_token, sprinkler_batch):
    """Simple sprinkler dispatch fixture"""
    response = client.post('/api/dispatch',
                          json={
                              'customer_name': 'Sprinkler Customer',
                              'customer_phone': '3334445555',
                              'dispatch_date': '2025-12-01T14:00:00',
                              'items': [{
                                  'batch_id': sprinkler_batch['batch_id'],
                                  'item_id': sprinkler_batch['bundles'][0]['id'],
                                  'quantity': 10,
                                  'unit_price': 50.00
                              }]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def cut_roll_dispatch(client, auth_token, hdpe_batch_with_cuts):
    """Dispatch from cut roll"""
    response = client.post('/api/dispatch',
                          json={
                              'customer_name': 'Cut Roll Customer',
                              'customer_phone': '4445556666',
                              'dispatch_date': '2025-12-01T14:00:00',
                              'items': [{
                                  'batch_id': hdpe_batch_with_cuts['batch_id'],
                                  'item_id': hdpe_batch_with_cuts['cut_rolls'][0]['id'],
                                  'quantity': 150,
                                  'unit_price': 100.00
                              }]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def sprinkler_spare_dispatch(client, auth_token, sprinkler_batch):
    """Dispatch sprinkler spare pieces"""
    response = client.post('/api/dispatch',
                          json={
                              'customer_name': 'Spare Dispatch Customer',
                              'customer_phone': '5556667777',
                              'dispatch_date': '2025-12-01T14:00:00',
                              'items': [{
                                  'batch_id': sprinkler_batch['batch_id'],
                                  'item_id': sprinkler_batch['spare_pieces'][0]['id'],
                                  'quantity': 5,
                                  'unit_price': 50.00
                              }]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


# ==================== RETURN FIXTURES ====================

@pytest.fixture
def completed_return(client, auth_token, dispatched_item):
    """Create a completed return"""
    response = client.post('/api/returns',
                          json={
                              'dispatch_id': dispatched_item['dispatch_id'],
                              'return_date': '2025-12-02T10:00:00',
                              'items': [{
                                  'dispatch_item_id': dispatched_item['item_id'],
                                  'quantity': dispatched_item['quantity'],
                                  'reason': 'Complete return'
                              }]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def partial_return(client, auth_token, dispatched_item):
    """Create a partial return"""
    response = client.post('/api/returns',
                          json={
                              'dispatch_id': dispatched_item['dispatch_id'],
                              'return_date': '2025-12-02T10:00:00',
                              'items': [{
                                  'dispatch_item_id': dispatched_item['item_id'],
                                  'quantity': dispatched_item['quantity'] / 2,
                                  'reason': 'Partial return'
                              }]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


@pytest.fixture
def reverted_return(client, auth_token, completed_return):
    """Create and revert a return"""
    response = client.post(f'/api/returns/{completed_return["return_id"]}/revert',
                          json={'reason': 'Test revert'},
                          headers={'Authorization': f'Bearer {auth_token}'})
    return completed_return


@pytest.fixture
def sample_return(client, auth_token, dispatched_item):
    """Generic return fixture"""
    response = client.post('/api/returns',
                          json={
                              'dispatch_id': dispatched_item['dispatch_id'],
                              'return_date': '2025-12-02T10:00:00',
                              'items': [{
                                  'dispatch_item_id': dispatched_item['item_id'],
                                  'quantity': 100,
                                  'reason': 'Sample return'
                              }]
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


# ==================== SCRAP FIXTURES ====================

@pytest.fixture
def sample_scrap(client, auth_token, hdpe_batch):
    """Create a sample scrap record"""
    response = client.post('/api/scrap',
                          json={
                              'item_id': hdpe_batch['rolls'][0]['id'],
                              'batch_id': hdpe_batch['batch_id'],
                              'scrap_date': '2025-12-01T15:00:00',
                              'quantity': 100,
                              'reason': 'Sample scrap',
                              'scrap_type': 'production'
                          },
                          headers={'Authorization': f'Bearer {auth_token}'})
    return response.json()


# ==================== GENERAL FIXTURES ====================

@pytest.fixture
def sample_batch_id(hdpe_batch):
    """Get a sample batch ID"""
    return hdpe_batch['batch_id']


@pytest.fixture
def sample_dispatch(dispatched_item):
    """Get a sample dispatch"""
    return dispatched_item
