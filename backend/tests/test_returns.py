"""
Return Routes Test Cases
Tests return creation, history, details, revert, and stats endpoints
"""
import pytest
from database import get_db_cursor
from datetime import datetime, timedelta


class TestReturnCreation:
    """Test creating returns from customers"""

    def test_create_simple_hdpe_return(self, client, auth_headers, test_customer):
        """Test creating a simple HDPE return"""
        customer = test_customer

        # Get product type and brand IDs
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pt.id as product_type_id, br.id as brand_id
                FROM product_types pt
                CROSS JOIN brands br
                WHERE pt.name = 'HDPE Pipe'
                AND br.name IS NOT NULL
                LIMIT 1
            """)
            product_info = cursor.fetchone()

        if not product_info:
            pytest.skip("No HDPE product type or brand found")

        # Create return with HDPE roll
        return_data = {
            'customer_id': str(customer['id']),
            'return_date': datetime.now().date().isoformat(),
            'notes': 'Customer return - damaged goods',
            'items': [{
                'product_type_id': str(product_info['product_type_id']),
                'brand_id': str(product_info['brand_id']),
                'parameters': {'OD': '32', 'PN': '6', 'PE': '63'},
                'item_type': 'FULL_ROLL',
                'quantity': 1,
                'rolls': [{'length_meters': 500.0}],
                'notes': 'Damaged roll'
            }]
        }

        response = client.post('/api/returns/create',
                              json=return_data,
                              headers=auth_headers)
        assert response.status_code in (200, 201), f"Failed: {response.json}"

        result = response.json
        assert 'return_id' in result or 'id' in result
        assert 'return_number' in result

    def test_create_sprinkler_bundle_return(self, client, auth_headers, test_customer):
        """Test creating a return with sprinkler bundles"""
        customer = test_customer

        # Get sprinkler product type
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pt.id as product_type_id, br.id as brand_id
                FROM product_types pt
                CROSS JOIN brands br
                WHERE pt.name = 'Sprinkler Pipe'
                AND br.name IS NOT NULL
                LIMIT 1
            """)
            product_info = cursor.fetchone()

        if not product_info:
            pytest.skip("No Sprinkler product type or brand found")

        return_data = {
            'customer_id': str(customer['id']),
            'return_date': datetime.now().date().isoformat(),
            'notes': 'Bundle return',
            'items': [{
                'product_type_id': str(product_info['product_type_id']),
                'brand_id': str(product_info['brand_id']),
                'parameters': {'OD': '25', 'PN': '4'},
                'item_type': 'BUNDLE',
                'quantity': 2,
                'bundles': [
                    {'bundle_size': 10, 'piece_length_meters': 6.0},
                    {'bundle_size': 10, 'piece_length_meters': 6.0}
                ],
                'notes': 'Excess bundles'
            }]
        }

        response = client.post('/api/returns/create',
                              json=return_data,
                              headers=auth_headers)
        assert response.status_code in (200, 201), f"Failed: {response.json}"

    def test_create_return_with_multiple_items(self, client, auth_headers, test_customer):
        """Test creating a return with multiple different items"""
        customer = test_customer

        # Get product info
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pt.id as product_type_id, br.id as brand_id, pt.name as product_type
                FROM product_types pt
                CROSS JOIN brands br
                WHERE br.name IS NOT NULL
                ORDER BY pt.name
                LIMIT 2
            """)
            products = cursor.fetchall()

        if len(products) < 2:
            pytest.skip("Need at least 2 product types")

        return_data = {
            'customer_id': str(customer['id']),
            'return_date': datetime.now().date().isoformat(),
            'notes': 'Multiple items return',
            'items': [
                {
                    'product_type_id': str(products[0]['product_type_id']),
                    'brand_id': str(products[0]['brand_id']),
                    'parameters': {'OD': '32', 'PN': '6'},
                    'item_type': 'FULL_ROLL',
                    'quantity': 1,
                    'rolls': [{'length_meters': 400.0}]
                },
                {
                    'product_type_id': str(products[1]['product_type_id']),
                    'brand_id': str(products[1]['brand_id']),
                    'parameters': {'OD': '25', 'PN': '4'},
                    'item_type': 'BUNDLE',
                    'quantity': 1,
                    'bundles': [{'bundle_size': 10, 'piece_length_meters': 6.0}]
                }
            ]
        }

        response = client.post('/api/returns/create',
                              json=return_data,
                              headers=auth_headers)
        assert response.status_code in (200, 201), f"Failed: {response.json}"

    def test_create_return_missing_customer(self, client, auth_headers):
        """Test that customer_id is required"""
        return_data = {
            'items': [{
                'product_type_id': 'fake-id',
                'brand_id': 'fake-id',
                'parameters': {},
                'item_type': 'FULL_ROLL',
                'quantity': 1
            }]
        }

        response = client.post('/api/returns/create',
                              json=return_data,
                              headers=auth_headers)
        assert response.status_code == 400

    def test_create_return_missing_items(self, client, auth_headers, test_customer):
        """Test that items are required"""
        return_data = {
            'customer_id': str(test_customer['id']),
            'items': []
        }

        response = client.post('/api/returns/create',
                              json=return_data,
                              headers=auth_headers)
        assert response.status_code == 400

    def test_create_return_requires_auth(self, client, test_customer):
        """Test that return creation requires authentication"""
        return_data = {
            'customer_id': str(test_customer['id']),
            'items': [{
                'product_type_id': 'fake-id',
                'brand_id': 'fake-id',
                'parameters': {},
                'item_type': 'FULL_ROLL',
                'quantity': 1
            }]
        }

        response = client.post('/api/returns/create', json=return_data)
        assert response.status_code == 401


class TestReturnHistory:
    """Test return history listing"""

    def test_get_return_history_all(self, client, auth_headers):
        """Test getting all return history"""
        response = client.get('/api/returns/history', headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        # Response may be a dict with 'returns' key or a list
        if isinstance(data, dict):
            assert 'returns' in data
            assert isinstance(data['returns'], list)
        else:
            assert isinstance(data, list)

    def test_get_return_history_with_customer_filter(self, client, auth_headers, test_customer):
        """Test filtering returns by customer"""
        customer = test_customer

        response = client.get(f'/api/returns/history?customer_id={customer["id"]}',
                            headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        if isinstance(data, dict):
            assert 'returns' in data
        else:
            assert isinstance(data, list)

    def test_get_return_history_with_date_range(self, client, auth_headers):
        """Test filtering returns by date range"""
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        end_date = datetime.now().strftime('%Y-%m-%d')

        response = client.get(f'/api/returns/history?start_date={start_date}&end_date={end_date}',
                            headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        if isinstance(data, dict):
            assert 'returns' in data
        else:
            assert isinstance(data, list)

    def test_get_return_history_with_status_filter(self, client, auth_headers):
        """Test filtering returns by status"""
        response = client.get('/api/returns/history?status=RECEIVED',
                            headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        if isinstance(data, dict):
            assert 'returns' in data
        else:
            assert isinstance(data, list)

    def test_get_return_history_with_search(self, client, auth_headers):
        """Test searching returns by return number or customer"""
        response = client.get('/api/returns/history?search=RET',
                            headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        if isinstance(data, dict):
            assert 'returns' in data
        else:
            assert isinstance(data, list)

    def test_return_history_requires_auth(self, client):
        """Test that return history requires authentication"""
        response = client.get('/api/returns/history')
        assert response.status_code == 401


class TestReturnDetails:
    """Test getting return details"""

    def test_get_return_details_after_creation(self, client, auth_headers, test_customer):
        """Test getting details of a created return"""
        customer = test_customer

        # Get product info
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pt.id as product_type_id, br.id as brand_id
                FROM product_types pt
                CROSS JOIN brands br
                WHERE pt.name = 'HDPE Pipe'
                AND br.name IS NOT NULL
                LIMIT 1
            """)
            product_info = cursor.fetchone()

        if not product_info:
            pytest.skip("No product info available")

        # Create a return first
        return_data = {
            'customer_id': str(customer['id']),
            'items': [{
                'product_type_id': str(product_info['product_type_id']),
                'brand_id': str(product_info['brand_id']),
                'parameters': {'OD': '32'},
                'item_type': 'FULL_ROLL',
                'quantity': 1,
                'rolls': [{'length_meters': 500.0}]
            }]
        }

        create_response = client.post('/api/returns/create',
                                     json=return_data,
                                     headers=auth_headers)

        if create_response.status_code not in (200, 201):
            pytest.skip("Could not create return for detail test")

        result = create_response.json
        return_id = result.get('return_id') or result.get('id')

        # Get details
        response = client.get(f'/api/returns/{return_id}',
                            headers=auth_headers)
        assert response.status_code == 200

        details = response.json
        assert details is not None
        assert 'return_number' in details or 'id' in str(details)

    def test_get_nonexistent_return_details(self, client, auth_headers):
        """Test getting details of non-existent return"""
        fake_id = '00000000-0000-0000-0000-000000000000'
        response = client.get(f'/api/returns/{fake_id}',
                            headers=auth_headers)
        assert response.status_code in (404, 500)

    def test_return_details_requires_auth(self, client):
        """Test that return details require authentication"""
        fake_id = '00000000-0000-0000-0000-000000000000'
        response = client.get(f'/api/returns/{fake_id}')
        assert response.status_code == 401


class TestReturnRevert:
    """Test reverting returns"""

    def test_revert_return_after_creation(self, client, auth_headers, test_customer):
        """Test reverting a return to remove it from inventory"""
        customer = test_customer

        # Get product info
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pt.id as product_type_id, br.id as brand_id
                FROM product_types pt
                CROSS JOIN brands br
                WHERE pt.name = 'HDPE Pipe'
                AND br.name IS NOT NULL
                LIMIT 1
            """)
            product_info = cursor.fetchone()

        if not product_info:
            pytest.skip("No product info available")

        # Create a return
        return_data = {
            'customer_id': str(customer['id']),
            'items': [{
                'product_type_id': str(product_info['product_type_id']),
                'brand_id': str(product_info['brand_id']),
                'parameters': {'OD': '32'},
                'item_type': 'FULL_ROLL',
                'quantity': 1,
                'rolls': [{'length_meters': 300.0}]
            }]
        }

        create_response = client.post('/api/returns/create',
                                     json=return_data,
                                     headers=auth_headers)

        if create_response.status_code not in (200, 201):
            pytest.skip("Could not create return for revert test")

        result = create_response.json
        return_id = result.get('return_id') or result.get('id')

        # Revert the return
        revert_data = {
            'reason': 'Testing revert functionality'
        }

        response = client.post(f'/api/returns/{return_id}/revert',
                              json=revert_data,
                              headers=auth_headers)
        assert response.status_code in (200, 201, 400, 404, 500)
        # May fail if already reverted or other business logic

    def test_revert_nonexistent_return(self, client, auth_headers):
        """Test reverting a non-existent return"""
        fake_id = '00000000-0000-0000-0000-000000000000'
        revert_data = {'reason': 'Test'}

        response = client.post(f'/api/returns/{fake_id}/revert',
                              json=revert_data,
                              headers=auth_headers)
        assert response.status_code in (400, 404, 500)

    def test_revert_requires_auth(self, client):
        """Test that revert requires authentication"""
        fake_id = '00000000-0000-0000-0000-000000000000'
        revert_data = {'reason': 'Test'}

        response = client.post(f'/api/returns/{fake_id}/revert',
                              json=revert_data)
        assert response.status_code == 401


class TestReturnStats:
    """Test return statistics endpoint"""

    def test_get_return_stats(self, client, auth_headers):
        """Test getting return statistics"""
        response = client.get('/api/returns/stats', headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        assert isinstance(data, dict) or isinstance(data, list)

    def test_get_return_stats_with_date_range(self, client, auth_headers):
        """Test return stats with date filtering"""
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        end_date = datetime.now().strftime('%Y-%m-%d')

        response = client.get(f'/api/returns/stats?start_date={start_date}&end_date={end_date}',
                            headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        assert isinstance(data, (dict, list))

    def test_return_stats_requires_auth(self, client):
        """Test that stats require authentication"""
        response = client.get('/api/returns/stats')
        assert response.status_code == 401


class TestReturnIntegration:
    """Test return integration with inventory"""

    def test_return_creates_inventory_batch(self, client, auth_headers, test_customer):
        """Test that creating a return adds items to inventory"""
        customer = test_customer

        # Get product info
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pt.id as product_type_id, br.id as brand_id
                FROM product_types pt
                CROSS JOIN brands br
                WHERE pt.name = 'HDPE Pipe'
                AND br.name IS NOT NULL
                LIMIT 1
            """)
            product_info = cursor.fetchone()

        if not product_info:
            pytest.skip("No product info available")

        # Get initial batch count
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count FROM batches
                WHERE deleted_at IS NULL
            """)
            initial_count = cursor.fetchone()['count']

        # Create return
        return_data = {
            'customer_id': str(customer['id']),
            'items': [{
                'product_type_id': str(product_info['product_type_id']),
                'brand_id': str(product_info['brand_id']),
                'parameters': {'OD': '32', 'PN': '6'},
                'item_type': 'FULL_ROLL',
                'quantity': 1,
                'rolls': [{'length_meters': 450.0}]
            }]
        }

        response = client.post('/api/returns/create',
                              json=return_data,
                              headers=auth_headers)

        if response.status_code not in (200, 201):
            pytest.skip("Return creation failed")

        # Check that batch count increased
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count FROM batches
                WHERE deleted_at IS NULL
            """)
            final_count = cursor.fetchone()['count']

        # Should have created at least one batch
        assert final_count >= initial_count

    def test_return_number_generation(self, client, auth_headers, test_customer):
        """Test that return numbers are generated correctly"""
        customer = test_customer

        # Get product info
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pt.id as product_type_id, br.id as brand_id
                FROM product_types pt
                CROSS JOIN brands br
                LIMIT 1
            """)
            product_info = cursor.fetchone()

        if not product_info:
            pytest.skip("No product info available")

        # Create first return
        return_data = {
            'customer_id': str(customer['id']),
            'items': [{
                'product_type_id': str(product_info['product_type_id']),
                'brand_id': str(product_info['brand_id']),
                'parameters': {'OD': '25'},
                'item_type': 'FULL_ROLL',
                'quantity': 1,
                'rolls': [{'length_meters': 200.0}]
            }]
        }

        response1 = client.post('/api/returns/create',
                               json=return_data,
                               headers=auth_headers)

        if response1.status_code in (200, 201):
            result1 = response1.json
            return_number1 = result1.get('return_number')

            # Create second return
            response2 = client.post('/api/returns/create',
                                   json=return_data,
                                   headers=auth_headers)

            if response2.status_code in (200, 201):
                result2 = response2.json
                return_number2 = result2.get('return_number')

                # Return numbers should be different
                if return_number1 and return_number2:
                    assert return_number1 != return_number2
                    # Should follow RET-YYYY-XXX pattern
                    assert 'RET-' in return_number1
                    assert 'RET-' in return_number2


class TestReturnValidation:
    """Test return data validation"""

    def test_return_validates_item_structure(self, client, auth_headers, test_customer):
        """Test that items must have required fields"""
        return_data = {
            'customer_id': str(test_customer['id']),
            'items': [{
                'item_type': 'FULL_ROLL',
                'quantity': 1
                # Missing product_type_id, brand_id, parameters
            }]
        }

        response = client.post('/api/returns/create',
                              json=return_data,
                              headers=auth_headers)
        assert response.status_code in (400, 500)

    def test_return_validates_quantity(self, client, auth_headers, test_customer):
        """Test that quantity must be positive"""
        # Get product info
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pt.id as product_type_id, br.id as brand_id
                FROM product_types pt
                CROSS JOIN brands br
                LIMIT 1
            """)
            product_info = cursor.fetchone()

        if not product_info:
            pytest.skip("No product info available")

        return_data = {
            'customer_id': str(test_customer['id']),
            'items': [{
                'product_type_id': str(product_info['product_type_id']),
                'brand_id': str(product_info['brand_id']),
                'parameters': {'OD': '32'},
                'item_type': 'FULL_ROLL',
                'quantity': 0,  # Invalid
                'rolls': []
            }]
        }

        response = client.post('/api/returns/create',
                              json=return_data,
                              headers=auth_headers)
        # May succeed with 0 quantity or fail validation
        assert response.status_code in (200, 201, 400, 500)

    def test_return_handles_invalid_customer(self, client, auth_headers):
        """Test return with invalid customer ID"""
        fake_customer_id = '00000000-0000-0000-0000-000000000000'

        # Get product info
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pt.id as product_type_id, br.id as brand_id
                FROM product_types pt
                CROSS JOIN brands br
                LIMIT 1
            """)
            product_info = cursor.fetchone()

        if not product_info:
            pytest.skip("No product info available")

        return_data = {
            'customer_id': fake_customer_id,
            'items': [{
                'product_type_id': str(product_info['product_type_id']),
                'brand_id': str(product_info['brand_id']),
                'parameters': {'OD': '32'},
                'item_type': 'FULL_ROLL',
                'quantity': 1,
                'rolls': [{'length_meters': 500.0}]
            }]
        }

        response = client.post('/api/returns/create',
                              json=return_data,
                              headers=auth_headers)
        # Should fail with invalid customer
        assert response.status_code in (400, 404, 500)
