"""
Dispatch Module Test Cases - Rewritten for Current API
Tests dispatch creation using inventory_stock system with /api/dispatch/create-dispatch endpoint
"""
import pytest
from datetime import datetime
from database import get_db_cursor


@pytest.fixture
def test_customer(client, auth_headers):
    """Create a test customer for dispatch tests"""
    import time
    timestamp = int(time.time() * 1000000)
    
    data = {
        'name': f'Test Customer {timestamp}',
        'city': 'Test City',
        'contact_person': 'John Doe',
        'phone': '1234567890',
        'email': 'test@customer.com'
    }
    response = client.post('/api/customers', headers=auth_headers, json=data)
    assert response.status_code == 201, f"Failed to create customer: {response.json}"
    return response.json


class TestDispatchCreation:
    """Test suite for dispatch creation"""

    def test_dispatch_hdpe_full_roll(self, client, auth_headers, hdpe_batch, test_customer):
        """Test dispatching full HDPE roll"""
        # Get stock from batch
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, quantity, product_variant_id, stock_type
                FROM inventory_stock
                WHERE batch_id = %s AND stock_type = 'FULL_ROLL'
                LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        assert stock is not None, "No stock found for batch"

        data = {
            'customer_id': test_customer['id'],
            'invoice_number': 'INV-TEST-001',
            'notes': 'Test full roll dispatch',
            'items': [{
                'stock_id': str(stock['id']),
                'product_variant_id': str(stock['product_variant_id']),
                'item_type': 'FULL_ROLL',
                'quantity': 1
            }]
        }

        response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201), f"Failed: {response.json}"
        
        result = response.json
        assert 'dispatch_id' in result or 'id' in result
        assert 'dispatch_number' in result

    def test_dispatch_missing_customer(self, client, auth_headers, hdpe_batch):
        """Test dispatch fails without customer_id"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, product_variant_id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        data = {
            'items': [{
                'stock_id': str(stock['id']),
                'product_variant_id': str(stock['product_variant_id']),
                'item_type': 'FULL_ROLL',
                'quantity': 1
            }]
        }

        response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_dispatch_empty_items(self, client, auth_headers, test_customer):
        """Test dispatch fails with empty items array"""
        data = {
            'customer_id': test_customer['id'],
            'items': []
        }

        response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_dispatch_nonexistent_stock(self, client, auth_headers, test_customer):
        """Test dispatch fails with non-existent stock_id"""
        data = {
            'customer_id': test_customer['id'],
            'items': [{
                'stock_id': '00000000-0000-0000-0000-000000000000',
                'product_variant_id': '00000000-0000-0000-0000-000000000000',
                'item_type': 'FULL_ROLL',
                'quantity': 1
            }]
        }

        response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=data)
        assert response.status_code == 404

    def test_dispatch_insufficient_quantity(self, client, auth_headers, hdpe_batch, test_customer):
        """Test dispatch fails when requesting more than available"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, quantity, product_variant_id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        available = float(stock['quantity'])

        data = {
            'customer_id': test_customer['id'],
            'items': [{
                'stock_id': str(stock['id']),
                'product_variant_id': str(stock['product_variant_id']),
                'item_type': 'FULL_ROLL',
                'quantity': available + 100
            }]
        }

        response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_dispatch_with_invoice_number(self, client, auth_headers, hdpe_batch, test_customer):
        """Test dispatch with invoice number"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, product_variant_id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        import time
        invoice_no = f'INV-{int(time.time())}'

        data = {
            'customer_id': test_customer['id'],
            'invoice_number': invoice_no,
            'notes': 'Dispatch with invoice',
            'items': [{
                'stock_id': str(stock['id']),
                'product_variant_id': str(stock['product_variant_id']),
                'item_type': 'FULL_ROLL',
                'quantity': 1
            }]
        }

        response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201), f"Failed: {response.json}"
        
        result = response.json
        dispatch_id = result.get('dispatch_id') or result.get('id')
        
        # Verify invoice number was saved
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT invoice_number FROM dispatches WHERE id = %s
            """, (dispatch_id,))
            dispatch = cursor.fetchone()
            assert dispatch['invoice_number'] == invoice_no

    def test_dispatch_multiple_items(self, client, auth_headers, hdpe_batch, test_customer):
        """Test dispatching multiple items in one dispatch"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, product_variant_id FROM inventory_stock
                WHERE batch_id = %s
                ORDER BY created_at
                LIMIT 2
            """, (hdpe_batch['id'],))
            stocks = cursor.fetchall()

        if len(stocks) < 2:
            pytest.skip("Need at least 2 stock items for this test")

        data = {
            'customer_id': test_customer['id'],
            'notes': 'Multi-item dispatch',
            'items': [
                {
                    'stock_id': str(stocks[0]['id']),
                    'product_variant_id': str(stocks[0]['product_variant_id']),
                    'item_type': 'FULL_ROLL',
                    'quantity': 1
                },
                {
                    'stock_id': str(stocks[1]['id']),
                    'product_variant_id': str(stocks[1]['product_variant_id']),
                    'item_type': 'FULL_ROLL',
                    'quantity': 1
                }
            ]
        }

        response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201), f"Failed: {response.json}"


class TestDispatchValidation:
    """Test dispatch validation rules"""

    def test_dispatch_missing_stock_id(self, client, auth_headers, test_customer):
        """Test dispatch fails without stock_id"""
        data = {
            'customer_id': test_customer['id'],
            'items': [{
                'product_variant_id': '00000000-0000-0000-0000-000000000000',
                'item_type': 'FULL_ROLL',
                'quantity': 1
            }]
        }

        response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_dispatch_missing_item_type(self, client, auth_headers, hdpe_batch, test_customer):
        """Test dispatch fails without item_type"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, product_variant_id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        data = {
            'customer_id': test_customer['id'],
            'items': [{
                'stock_id': str(stock['id']),
                'product_variant_id': str(stock['product_variant_id']),
                'quantity': 1
            }]
        }

        response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=data)
        assert response.status_code == 400


class TestDispatchHistory:
    """Test dispatch history and retrieval"""

    def test_get_all_dispatches(self, client, auth_headers):
        """Test retrieving all dispatches"""
        response = client.get('/api/dispatch/dispatches', headers=auth_headers)
        assert response.status_code == 200
        result = response.json
        assert isinstance(result, (list, dict))

    def test_get_dispatch_details(self, client, auth_headers, hdpe_batch, test_customer):
        """Test retrieving specific dispatch details"""
        # Create a dispatch first
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, product_variant_id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        create_response = client.post('/api/dispatch/create-dispatch',
                                      headers=auth_headers,
                                      json={
                                          'customer_id': test_customer['id'],
                                          'items': [{
                                              'stock_id': str(stock['id']),
                                              'product_variant_id': str(stock['product_variant_id']),
                                              'item_type': 'FULL_ROLL',
                                              'quantity': 1
                                          }]
                                      })

        if create_response.status_code in (200, 201):
            dispatch_data = create_response.json
            dispatch_id = dispatch_data.get('dispatch_id') or dispatch_data.get('id')

            response = client.get(f'/api/dispatch/dispatches/{dispatch_id}', headers=auth_headers)
            assert response.status_code == 200


class TestDispatchWithStock:
    """Test dispatch impact on stock"""

    def test_dispatch_creates_dispatch_record(self, client, auth_headers, hdpe_batch, test_customer):
        """Test that dispatch creates proper records"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, product_variant_id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()
            stock_id = stock['id']

        response = client.post('/api/dispatch/create-dispatch',
                              headers=auth_headers,
                              json={
                                  'customer_id': test_customer['id'],
                                  'items': [{
                                      'stock_id': str(stock_id),
                                      'product_variant_id': str(stock['product_variant_id']),
                                      'item_type': 'FULL_ROLL',
                                      'quantity': 1
                                  }]
                              })
        assert response.status_code in (200, 201), f"Failed: {response.json}"
        
        result = response.json
        dispatch_id = result.get('dispatch_id') or result.get('id')
        
        # Verify dispatch record exists
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count FROM dispatches WHERE id = %s
            """, (dispatch_id,))
            count_result = cursor.fetchone()
            assert count_result['count'] == 1, "Dispatch record not created"

    def test_dispatch_creates_dispatch_items(self, client, auth_headers, hdpe_batch, test_customer):
        """Test that dispatch creates dispatch_items records"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, product_variant_id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()
            stock_id = stock['id']

        response = client.post('/api/dispatch/create-dispatch',
                              headers=auth_headers,
                              json={
                                  'customer_id': test_customer['id'],
                                  'items': [{
                                      'stock_id': str(stock_id),
                                      'product_variant_id': str(stock['product_variant_id']),
                                      'item_type': 'FULL_ROLL',
                                      'quantity': 1
                                  }]
                              })
        assert response.status_code in (200, 201), f"Failed: {response.json}"
        
        result = response.json
        dispatch_id = result.get('dispatch_id') or result.get('id')
        
        # Verify dispatch_items record exists
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count FROM dispatch_items
                WHERE dispatch_id = %s AND stock_id = %s
            """, (dispatch_id, stock_id))
            count_result = cursor.fetchone()
            assert count_result['count'] > 0, "Dispatch item not created"
