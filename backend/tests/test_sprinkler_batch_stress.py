"""
Stress tests for sprinkler pipe batch inventory system.

Tests edge cases with bundles and spare pieces:
1. Multiple production batches of sprinkler pipes
2. Multiple returns with bundles
3. Multiple dispatches of bundles
4. Split bundle operations
5. Combine spare pieces operations
6. Scrap operations on bundles and spares

Goal: Verify batch system correctly tracks quantities in PIECES for sprinkler products.
"""

import pytest
from datetime import datetime
from database import get_db_cursor
import json


@pytest.fixture(scope='function')
def sprinkler_product(client, auth_headers, request):
    """Create a sprinkler pipe product variant for testing

    Uses unique parameters per test to avoid data accumulation between tests.
    """
    with get_db_cursor(commit=False) as cursor:
        cursor.execute("""
            SELECT id FROM product_types
            WHERE name LIKE '%Sprinkler%'
            LIMIT 1
        """)
        product_type = cursor.fetchone()

        if not product_type:
            pytest.skip("No Sprinkler product type found")

        product_type_id = str(product_type['id'])

        # Get brand
        cursor.execute("SELECT id FROM brands WHERE deleted_at IS NULL LIMIT 1")
        brand = cursor.fetchone()
        brand_id = str(brand['id']) if brand else None

        if not brand_id:
            pytest.skip("No brand found")

    # Use test-specific unique OD value to ensure complete isolation
    import hashlib
    test_id = request.node.nodeid
    hash_suffix = hashlib.md5(test_id.encode()).hexdigest()[:4]
    unique_od = f"TEST-{hash_suffix}"

    return {
        'product_type_id': product_type_id,
        'brand_id': brand_id,
        'parameters': {'OD': unique_od, 'PN': '6', 'Length': '6'}  # Use '6' not '6m' to match DB storage
    }


@pytest.fixture(scope='function')
def test_customer(client, auth_headers):
    """Get test customer"""
    with get_db_cursor(commit=False) as cursor:
        cursor.execute("""
            SELECT id FROM customers
            WHERE deleted_at IS NULL
            LIMIT 1
        """)
        customer = cursor.fetchone()
        if not customer:
            pytest.skip("No customer found")
        return str(customer['id'])


def get_total_inventory_quantity(product_type_id, parameters):
    """Get total quantity (in pieces) for a sprinkler product"""
    with get_db_cursor(commit=False) as cursor:
        cursor.execute("""
            SELECT COALESCE(SUM(b.current_quantity), 0) as total_qty
            FROM batches b
            JOIN product_variants pv ON b.product_variant_id = pv.id
            WHERE pv.product_type_id = %s
            AND pv.parameters = %s::jsonb
            AND b.deleted_at IS NULL
        """, (product_type_id, json.dumps(parameters)))
        result = cursor.fetchone()
        return int(result['total_qty']) if result else 0


def get_batch_count(product_type_id, parameters):
    """Count batches for a product variant"""
    with get_db_cursor(commit=False) as cursor:
        cursor.execute("""
            SELECT COUNT(DISTINCT b.id) as batch_count
            FROM batches b
            JOIN product_variants pv ON b.product_variant_id = pv.id
            WHERE pv.product_type_id = %s
            AND pv.parameters = %s::jsonb
            AND b.deleted_at IS NULL
        """, (product_type_id, json.dumps(parameters)))
        result = cursor.fetchone()
        return int(result['batch_count']) if result else 0


class TestSprinklerMultipleProduction:
    """Test multiple production batches of sprinkler pipes"""

    def test_multiple_sprinkler_production_batches(self, client, auth_headers, sprinkler_product):
        """
        Create 3 production batches of sprinkler bundles.
        Verify: Each creates separate batch, total pieces sum correctly.
        """
        product = sprinkler_product
        initial_qty = get_total_inventory_quantity(product['product_type_id'], product['parameters'])
        initial_batches = get_batch_count(product['product_type_id'], product['parameters'])

        # Batch 1: 10 bundles × 50 pieces = 500 pieces
        # Batch 2: 8 bundles × 50 pieces = 400 pieces
        # Batch 3: 12 bundles × 50 pieces = 600 pieces
        # Total: 1500 pieces
        batch_configs = [
            {'bundles': 10, 'bundle_size': 50, 'expected_pieces': 500},
            {'bundles': 8, 'bundle_size': 50, 'expected_pieces': 400},
            {'bundles': 12, 'bundle_size': 50, 'expected_pieces': 600}
        ]

        created_batch_ids = []
        total_expected_pieces = 0

        for i, config in enumerate(batch_configs):
            production_data = {
                'product_type_id': product['product_type_id'],
                'brand_id': product['brand_id'],
                'parameters': product['parameters'],
                'batch_no': f'SPR-STRESS-{i+1}-{datetime.now().timestamp()}',
                'quantity': config['expected_pieces'],  # Total pieces
                'roll_config_type': 'bundles',
                'quantity_based': 'true',
                'number_of_bundles': config['bundles'],
                'bundle_size': config['bundle_size'],
                'length_per_roll': 6.0,  # piece_length
                'production_date': datetime.now().isoformat()
            }

            response = client.post('/api/production/batch', headers=auth_headers, json=production_data)
            assert response.status_code in (200, 201), f"Production {i+1} failed: {response.json}"

            batch_result = response.json
            created_batch_ids.append(batch_result.get('batch_id') or batch_result.get('id'))
            total_expected_pieces += config['expected_pieces']

        # Verify: 3 new batches created
        final_batches = get_batch_count(product['product_type_id'], product['parameters'])
        assert final_batches == initial_batches + 3, \
            f"Expected {initial_batches + 3} batches, got {final_batches}"

        # Verify: Total quantity increased by sum (1500 pieces)
        expected_qty = initial_qty + total_expected_pieces
        final_qty = get_total_inventory_quantity(product['product_type_id'], product['parameters'])
        assert final_qty == expected_qty, \
            f"Expected {expected_qty} total pieces, got {final_qty}"

        # Verify: Each batch has correct quantity (in pieces)
        with get_db_cursor(commit=False) as cursor:
            for batch_id, config in zip(created_batch_ids, batch_configs):
                cursor.execute("""
                    SELECT initial_quantity, current_quantity
                    FROM batches WHERE id = %s
                """, (batch_id,))
                batch_info = cursor.fetchone()
                assert batch_info['initial_quantity'] == config['expected_pieces'], \
                    f"Batch {batch_id}: expected initial {config['expected_pieces']}, got {batch_info['initial_quantity']}"
                assert batch_info['current_quantity'] == config['expected_pieces'], \
                    f"Batch {batch_id}: expected current {config['expected_pieces']}, got {batch_info['current_quantity']}"


class TestSprinklerMultipleReturns:
    """Test multiple returns of sprinkler bundles"""

    def test_multiple_sprinkler_returns(self, client, auth_headers, sprinkler_product, test_customer):
        """
        Create 3 return entries for sprinkler bundles.
        Verify: Returns create separate batches, inventory increases correctly (in pieces).
        """
        product = sprinkler_product
        customer_id = test_customer

        initial_qty = get_total_inventory_quantity(product['product_type_id'], product['parameters'])
        initial_batches = get_batch_count(product['product_type_id'], product['parameters'])

        # Return 1: 2 bundles × 50 = 100 pieces
        # Return 2: 3 bundles × 50 = 150 pieces
        # Return 3: 1 bundle × 50 = 50 pieces
        # Total: 300 pieces
        return_configs = [
            {'bundles': 2, 'bundle_size': 50, 'expected_pieces': 100},
            {'bundles': 3, 'bundle_size': 50, 'expected_pieces': 150},
            {'bundles': 1, 'bundle_size': 50, 'expected_pieces': 50}
        ]

        total_returned_pieces = 0
        created_return_ids = []

        for i, config in enumerate(return_configs):
            return_data = {
                'customer_id': customer_id,
                'return_date': datetime.now().isoformat(),
                'notes': f'Sprinkler stress test return {i+1}',
                'items': [{
                    'product_type_id': product['product_type_id'],
                    'brand_id': product['brand_id'],
                    'parameters': product['parameters'],
                    'item_type': 'BUNDLE',
                    'quantity': config['bundles'],
                    'bundles': [{
                        'bundle_size': config['bundle_size'],
                        'piece_length_meters': 6.0
                    } for _ in range(config['bundles'])],
                    'notes': f'Return batch {i+1}'
                }]
            }

            response = client.post('/api/returns/create', headers=auth_headers, json=return_data)
            assert response.status_code in (200, 201), f"Return {i+1} failed: {response.json}"

            return_result = response.json
            created_return_ids.append(return_result['return_id'])
            total_returned_pieces += config['expected_pieces']

        # Verify: Inventory increased by total pieces (300)
        expected_qty = initial_qty + total_returned_pieces
        final_qty = get_total_inventory_quantity(product['product_type_id'], product['parameters'])

        assert final_qty == expected_qty, \
            f"Expected {expected_qty} after returns, got {final_qty}"        # Verify: New return batches created (at least 3)
        final_batches = get_batch_count(product['product_type_id'], product['parameters'])
        assert final_batches >= initial_batches + 3, \
            f"Expected at least {initial_batches + 3} batches after returns, got {final_batches}"


class TestSprinklerMultipleDispatches:
    """Test multiple dispatches of sprinkler bundles"""

    def test_multiple_sprinkler_dispatches(self, client, auth_headers, sprinkler_product, test_customer):
        """
        Create production, then dispatch bundles in 3 operations.
        Verify: Inventory decreases correctly (in pieces).
        """
        product = sprinkler_product
        customer_id = test_customer

        # Step 1: Create production (20 bundles × 50 = 1000 pieces)
        production_data = {
            'product_type_id': product['product_type_id'],
            'brand_id': product['brand_id'],
            'parameters': product['parameters'],
            'batch_no': f'SPR-DISPATCH-{datetime.now().timestamp()}',
            'quantity': 1000,
            'roll_config_type': 'bundles',
            'quantity_based': 'true',
            'number_of_bundles': 20,
            'bundle_size': 50,
            'length_per_roll': 6.0,
            'production_date': datetime.now().isoformat()
        }

        response = client.post('/api/production/batch', headers=auth_headers, json=production_data)
        assert response.status_code in (200, 201), f"Production failed: {response.json}"
        batch_id = response.json.get('batch_id') or response.json.get('id')

        initial_qty = get_total_inventory_quantity(product['product_type_id'], product['parameters'])

        # Step 2: Dispatch in 3 operations (5, 8, 3 bundles = 250, 400, 150 pieces)
        dispatch_configs = [
            {'bundles': 5, 'expected_pieces': 250},
            {'bundles': 8, 'expected_pieces': 400},
            {'bundles': 3, 'expected_pieces': 150}
        ]

        total_dispatched_pieces = 0

        for i, config in enumerate(dispatch_configs):
            # Get available stock
            with get_db_cursor(commit=False) as cursor:
                cursor.execute("""
                    SELECT id, product_variant_id FROM inventory_stock
                    WHERE batch_id = %s
                    AND stock_type = 'BUNDLE'
                    AND status = 'IN_STOCK'
                    AND deleted_at IS NULL
                    LIMIT 1
                """, (batch_id,))

                stock = cursor.fetchone()
                if not stock:
                    pytest.fail(f"No stock available for dispatch {i+1}")

                stock_id = str(stock['id'])
                variant_id = str(stock['product_variant_id'])

            dispatch_data = {
                'customer_id': customer_id,
                'invoice_number': f'INV-SPR-{i+1}-{datetime.now().timestamp()}',
                'notes': f'Sprinkler stress test dispatch {i+1}',
                'items': [{
                    'stock_id': stock_id,
                    'product_variant_id': variant_id,
                    'item_type': 'BUNDLE',
                    'quantity': config['bundles'],
                    'bundle_size': 50,
                    'pieces_per_bundle': 50,
                    'piece_length_meters': 6.0
                }]
            }

            response = client.post('/api/dispatch/create-dispatch', headers=auth_headers, json=dispatch_data)
            assert response.status_code in (200, 201), f"Dispatch {i+1} failed: {response.json}"

            total_dispatched_pieces += config['expected_pieces']

        # Verify: Inventory decreased by total dispatched pieces (800)
        expected_qty = initial_qty - total_dispatched_pieces
        final_qty = get_total_inventory_quantity(product['product_type_id'], product['parameters'])
        assert final_qty == expected_qty, \
            f"Expected {expected_qty} after dispatches, got {final_qty}"

        # Verify remaining: 1000 - 800 = 200 pieces (4 bundles)
        assert final_qty == 200, f"Expected 200 pieces remaining, got {final_qty}"


class TestSprinklerMultipleScraps:
    """Test multiple scrap operations on sprinkler bundles"""

    def test_multiple_sprinkler_scraps(self, client, auth_headers, sprinkler_product):
        """
        Create production, then scrap bundles in 2 operations.
        Verify: Inventory decreases correctly (in pieces).
        """
        product = sprinkler_product

        # Step 1: Create production (15 bundles × 50 = 750 pieces)
        production_data = {
            'product_type_id': product['product_type_id'],
            'brand_id': product['brand_id'],
            'parameters': product['parameters'],
            'batch_no': f'SPR-SCRAP-{datetime.now().timestamp()}',
            'quantity': 750,
            'roll_config_type': 'bundles',
            'quantity_based': 'true',
            'number_of_bundles': 15,
            'bundle_size': 50,
            'length_per_roll': 6.0,
            'production_date': datetime.now().isoformat()
        }

        response = client.post('/api/production/batch', headers=auth_headers, json=production_data)
        assert response.status_code in (200, 201), f"Production failed: {response.json}"
        batch_id = response.json.get('batch_id') or response.json.get('id')

        initial_qty = get_total_inventory_quantity(product['product_type_id'], product['parameters'])

        # Step 2: Scrap in 2 operations (3 bundles, 5 bundles = 150, 250 pieces)
        scrap_configs = [
            {'bundles': 3, 'expected_pieces': 150},
            {'bundles': 5, 'expected_pieces': 250}
        ]

        total_scrapped_pieces = 0

        for i, config in enumerate(scrap_configs):
            # Get stock
            with get_db_cursor(commit=False) as cursor:
                cursor.execute("""
                    SELECT id FROM inventory_stock
                    WHERE batch_id = %s
                    AND stock_type = 'BUNDLE'
                    AND status = 'IN_STOCK'
                    AND deleted_at IS NULL
                    LIMIT 1
                """, (batch_id,))

                stock = cursor.fetchone()
                if not stock:
                    pytest.fail(f"No stock available for scrap {i+1}")

                stock_id = str(stock['id'])

            scrap_data = {
                'scrap_type': 'Damaged',
                'reason': f'Sprinkler stress test scrap {i+1}',
                'scrap_date': datetime.now().isoformat(),
                'items': [{
                    'stock_id': stock_id,
                    'quantity_to_scrap': config['bundles'],
                    'item_type': 'BUNDLE'
                }]
            }

            response = client.post('/api/scraps/create', headers=auth_headers, json=scrap_data)
            assert response.status_code in (200, 201), f"Scrap {i+1} failed: {response.json}"

            total_scrapped_pieces += config['expected_pieces']

        # Verify: Inventory decreased by total scrapped pieces (400)
        expected_qty = initial_qty - total_scrapped_pieces
        final_qty = get_total_inventory_quantity(product['product_type_id'], product['parameters'])
        assert final_qty == expected_qty, \
            f"Expected {expected_qty} after scraps, got {final_qty}"

        # Verify remaining: 750 - 400 = 350 pieces (7 bundles)
        assert final_qty == 350, f"Expected 350 pieces remaining, got {final_qty}"


class TestSprinklerSplitBundle:
    """Test split bundle operation maintains piece count"""

    def test_split_bundle_preserves_quantity(self, client, auth_headers, sprinkler_product):
        """
        Create production with bundles, split one bundle into spares.
        Verify: Batch quantity remains unchanged (transformation, not consumption).
        """
        product = sprinkler_product

        # Step 1: Create production (5 bundles × 50 = 250 pieces)
        production_data = {
            'product_type_id': product['product_type_id'],
            'brand_id': product['brand_id'],
            'parameters': product['parameters'],
            'batch_no': f'SPR-SPLIT-{datetime.now().timestamp()}',
            'quantity': 250,
            'roll_config_type': 'bundles',
            'quantity_based': 'true',
            'number_of_bundles': 5,
            'bundle_size': 50,
            'length_per_roll': 6.0,
            'production_date': datetime.now().isoformat()
        }

        response = client.post('/api/production/batch', headers=auth_headers, json=production_data)
        assert response.status_code in (200, 201), f"Production failed: {response.json}"
        batch_id = response.json.get('batch_id') or response.json.get('id')

        qty_before_split = get_total_inventory_quantity(product['product_type_id'], product['parameters'])
        assert qty_before_split == 250, f"Expected 250 pieces after production, got {qty_before_split}"

        # Step 2: Split 1 bundle (50 pieces)
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id FROM inventory_stock
                WHERE batch_id = %s
                AND stock_type = 'BUNDLE'
                AND status = 'IN_STOCK'
                LIMIT 1
            """, (batch_id,))
            stock = cursor.fetchone()
            if not stock:
                pytest.skip("No bundle stock found for split")

            stock_id = str(stock['id'])

        # Split 1 bundle into all spare pieces (50 pieces as a single group)
        split_data = {
            'stock_id': stock_id,
            'pieces_to_split': [50]  # API expects array of piece counts
        }

        response = client.post('/api/inventory/split-bundle', headers=auth_headers, json=split_data)
        assert response.status_code in (200, 201), f"Split failed: {response.json}"

        # Step 3: Verify quantity unchanged (still 250 pieces, now 4 bundles + 50 spares)
        qty_after_split = get_total_inventory_quantity(product['product_type_id'], product['parameters'])
        assert qty_after_split == qty_before_split, \
            f"Split should preserve quantity. Expected {qty_before_split}, got {qty_after_split}"

        # Verify stock composition: Should have BUNDLE stock (4 bundles = 200 pieces) + SPARE stock (50 pieces)
        with get_db_cursor(commit=False) as cursor:
            cursor.execute("""
                SELECT id, stock_type, quantity, pieces_per_bundle
                FROM inventory_stock
                WHERE batch_id = %s
                AND deleted_at IS NULL
                ORDER BY stock_type
            """, (batch_id,))
            stocks = cursor.fetchall()

            bundle_pieces = sum(s['quantity'] * s['pieces_per_bundle']
                               for s in stocks if s['stock_type'] == 'BUNDLE')

            # For SPARE, get actual piece count from sprinkler_spare_pieces table
            spare_stock_ids = [str(s['id']) for s in stocks if s['stock_type'] == 'SPARE']
            spare_pieces = 0
            if spare_stock_ids:
                placeholders = ','.join(['%s'] * len(spare_stock_ids))
                cursor.execute(f"""
                    SELECT COALESCE(SUM(piece_count), 0) as total_pieces
                    FROM sprinkler_spare_pieces
                    WHERE stock_id IN ({placeholders})
                    AND status = 'IN_STOCK'
                """, spare_stock_ids)
                result = cursor.fetchone()
                spare_pieces = int(result['total_pieces'])

            assert bundle_pieces + spare_pieces == 250, \
                f"Expected 250 total pieces, got {bundle_pieces} (bundles) + {spare_pieces} (spares)"
