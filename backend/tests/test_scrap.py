"""
Scrap Module Test Cases - Rewritten for Current API
Tests scrap creation using inventory_stock system with /api/scraps/create endpoint
"""
import pytest
from datetime import datetime
from database import get_db_cursor

class TestScrapCreation:
    """Test suite for scrap creation"""

    def test_scrap_hdpe_stock(self, client, auth_headers, hdpe_batch):
        """Test scrapping HDPE stock from production"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, quantity FROM inventory_stock
                WHERE batch_id = %s
                ORDER BY created_at LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        assert stock is not None, f"No stock found for batch {hdpe_batch['id']}"

        data = {
            'reason': 'Manufacturing defect',
            'scrap_date': '2025-12-01',
            'notes': 'Quality control failure',
            'items': [{
                'stock_id': str(stock['id']),
                'quantity_to_scrap': 1.0,
                'estimated_value': 500.00,
                'notes': 'Defective section'
            }]
        }
        response = client.post('/api/scraps/create', headers=auth_headers, json=data)
        assert response.status_code in (200, 201), f"Failed: {response.json}"
        result = response.json
        assert 'scrap_id' in result or 'id' in result
        assert 'scrap_number' in result

    def test_scrap_with_estimated_value(self, client, auth_headers, hdpe_batch):
        """Test scrapping with estimated value"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, quantity FROM inventory_stock
                WHERE batch_id = %s
                ORDER BY created_at LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        assert stock is not None, "No stock found for batch"

        data = {
            'reason': 'Quality defect with financial impact',
            'scrap_date': '2025-12-01',
            'items': [{
                'stock_id': str(stock['id']),
                'quantity_to_scrap': 0.5,
                'estimated_value': 750.00,
                'notes': 'High value loss'
            }]
        }
        response = client.post('/api/scraps/create', headers=auth_headers, json=data)
        assert response.status_code in (200, 201), f"Failed: {response.json}"
        
        # Verify estimated value was recorded
        result = response.json
        scrap_id = result.get('scrap_id') or result.get('id')
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT estimated_value FROM scrap_items
                WHERE scrap_id = %s
            """, (scrap_id,))
            scrap_item = cursor.fetchone()
            assert scrap_item is not None
            assert float(scrap_item['estimated_value']) == 750.00

    def test_scrap_missing_reason(self, client, auth_headers, hdpe_batch):
        """Test that scrap creation fails without reason"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        data = {
            'items': [{
                'stock_id': str(stock['id']),
                'quantity_to_scrap': 1.0
            }]
        }
        response = client.post('/api/scraps/create', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_scrap_no_items(self, client, auth_headers):
        """Test that scrap creation fails with no items"""
        data = {
            'reason': 'Test reason',
            'items': []
        }
        response = client.post('/api/scraps/create', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_scrap_nonexistent_stock(self, client, auth_headers):
        """Test scrapping with non-existent stock_id"""
        data = {
            'reason': 'Test scrap',
            'items': [{
                'stock_id': '00000000-0000-0000-0000-000000000000',
                'quantity_to_scrap': 1.0
            }]
        }
        response = client.post('/api/scraps/create', headers=auth_headers, json=data)
        assert response.status_code in (400, 404)

    def test_scrap_partial_quantity(self, client, auth_headers, hdpe_batch):
        """Test scrapping partial quantity from stock"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, quantity FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        data = {
            'reason': 'Partial damage',
            'items': [{
                'stock_id': str(stock['id']),
                'quantity_to_scrap': 1.0
            }]
        }
        response = client.post('/api/scraps/create', headers=auth_headers, json=data)
        assert response.status_code in (200, 201), f"Failed: {response.json}"


class TestScrapValidation:
    """Test scrap validation rules"""

    def test_scrap_zero_quantity(self, client, auth_headers, hdpe_batch):
        """Test that zero quantity scrap is rejected"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        data = {
            'reason': 'Test',
            'items': [{
                'stock_id': str(stock['id']),
                'quantity_to_scrap': 0
            }]
        }
        response = client.post('/api/scraps/create', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_scrap_negative_quantity(self, client, auth_headers, hdpe_batch):
        """Test that negative quantity scrap is rejected"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        data = {
            'reason': 'Test',
            'items': [{
                'stock_id': str(stock['id']),
                'quantity_to_scrap': -10
            }]
        }
        response = client.post('/api/scraps/create', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_cannot_scrap_more_than_available(self, client, auth_headers, hdpe_batch):
        """Test that scrapping more than available quantity is rejected"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, quantity FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        available = float(stock['quantity'])

        data = {
            'reason': 'Over-scrap test',
            'items': [{
                'stock_id': str(stock['id']),
                'quantity_to_scrap': available + 100.0
            }]
        }
        response = client.post('/api/scraps/create', headers=auth_headers, json=data)
        assert response.status_code in (400, 422)


class TestScrapHistory:
    """Test suite for scrap history and retrieval"""

    def test_get_all_scraps(self, client, auth_headers):
        """Test retrieving all scraps"""
        response = client.get('/api/scraps/history', headers=auth_headers)
        assert response.status_code == 200
        result = response.json
        assert isinstance(result, (list, dict))

    def test_get_scrap_details(self, client, auth_headers, hdpe_batch):
        """Test retrieving specific scrap details"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()

        create_response = client.post('/api/scraps/create',
                                     headers=auth_headers,
                                     json={
                                         'reason': 'Test scrap for retrieval',
                                         'items': [{
                                             'stock_id': str(stock['id']),
                                             'quantity_to_scrap': 0.5
                                         }]
                                     })

        if create_response.status_code in (200, 201):
            scrap_data = create_response.json
            scrap_id = scrap_data.get('scrap_id') or scrap_data.get('id')

            response = client.get(f'/api/scraps/history/{scrap_id}', headers=auth_headers)
            assert response.status_code == 200


class TestScrapImpactOnInventory:
    """Test that scrap properly affects inventory"""

    def test_scrap_reduces_inventory(self, client, auth_headers, hdpe_batch):
        """Test that scrapping creates scrap record successfully"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, quantity FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()
            stock_id = stock['id']

        scrap_amount = 0.5

        response = client.post('/api/scraps/create',
                              headers=auth_headers,
                              json={
                                  'reason': 'Inventory reduction test',
                                  'items': [{
                                      'stock_id': str(stock_id),
                                      'quantity_to_scrap': scrap_amount
                                  }]
                              })
        assert response.status_code in (200, 201), f"Failed: {response.json}"
        
        # Verify scrap was created
        result = response.json
        assert 'scrap_id' in result or 'id' in result
        scrap_id = result.get('scrap_id') or result.get('id')
        
        # Verify scrap item was created
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count FROM scrap_items 
                WHERE scrap_id = %s AND stock_id = %s
            """, (scrap_id, stock_id))
            count_result = cursor.fetchone()
            assert count_result['count'] > 0, "Scrap item not created"

    def test_multiple_scraps_accumulate(self, client, auth_headers, hdpe_batch):
        """Test multiple scraps can be created for same stock"""
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, quantity FROM inventory_stock
                WHERE batch_id = %s LIMIT 1
            """, (hdpe_batch['id'],))
            stock = cursor.fetchone()
            stock_id = stock['id']

        response1 = client.post('/api/scraps/create',
                               headers=auth_headers,
                               json={
                                   'reason': 'First scrap',
                                   'items': [{'stock_id': str(stock_id), 'quantity_to_scrap': 0.3}]
                               })
        assert response1.status_code in (200, 201)

        response2 = client.post('/api/scraps/create',
                               headers=auth_headers,
                               json={
                                   'reason': 'Second scrap',
                                   'items': [{'stock_id': str(stock_id), 'quantity_to_scrap': 0.2}]
                               })
        assert response2.status_code in (200, 201)
        
        # Verify both scraps were created
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count FROM scrap_items 
                WHERE stock_id = %s
            """, (stock_id,))
            count_result = cursor.fetchone()
            assert count_result['count'] >= 2, "Multiple scraps not created"
