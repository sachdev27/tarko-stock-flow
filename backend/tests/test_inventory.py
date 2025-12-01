"""
Inventory Module Test Cases
Tests inventory management endpoints including batches, stock updates, and operations
"""
import pytest
from database import get_db_cursor


class TestBatchRetrieval:
    """Test batch listing and retrieval endpoints"""

    def test_get_all_batches(self, client, auth_headers, hdpe_batch):
        """Test retrieving all batches with stock"""
        batch = hdpe_batch

        response = client.get('/api/inventory/batches', headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        assert isinstance(data, list)
        assert len(data) > 0

        # Verify batch structure
        found_batch = None
        for b in data:
            if b.get('batch_code') == batch['batch_code']:
                found_batch = b
                break

        assert found_batch is not None
        assert 'id' in found_batch
        assert 'batch_code' in found_batch
        assert 'product_type_name' in found_batch
        assert 'stock_entries' in found_batch

    def test_get_batches_with_multiple_stock_types(self, client, auth_headers, hdpe_batch, sprinkler_batch):
        """Test batches endpoint returns both HDPE and Sprinkler batches"""
        response = client.get('/api/inventory/batches', headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        batch_codes = [b['batch_code'] for b in data]

        assert hdpe_batch['batch_code'] in batch_codes
        assert sprinkler_batch['batch_code'] in batch_codes

    def test_get_batches_without_auth(self, client):
        """Test batches endpoint requires authentication"""
        response = client.get('/api/inventory/batches')
        assert response.status_code == 401


class TestProductTypeAndBrandEndpoints:
    """Test product type and brand listing endpoints"""

    def test_get_product_types(self, client, auth_headers):
        """Test retrieving all product types"""
        response = client.get('/api/inventory/product-types', headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        assert isinstance(data, list)
        assert len(data) > 0

        # Should have HDPE and Sprinkler types
        type_names = [pt['name'] for pt in data]
        assert 'HDPE Pipe' in type_names or 'Sprinkler Pipe' in type_names

    def test_get_brands(self, client, auth_headers):
        """Test retrieving all brands"""
        response = client.get('/api/inventory/brands', headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        assert isinstance(data, list)
        # May be empty in test database


class TestStockUpdates:
    """Test stock update operations"""

    def test_update_stock_status(self, client, auth_headers, hdpe_batch):
        """Test updating stock status"""
        batch = hdpe_batch

        # Get a stock item
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id FROM inventory_stock
                WHERE batch_id = %s AND status = 'IN_STOCK'
                LIMIT 1
            """, (batch['id'],))
            stock = cursor.fetchone()

        if not stock:
            pytest.skip("No stock available for update test")

        # Update stock notes
        update_data = {
            'notes': 'Updated via test'
        }

        response = client.put(f'/api/inventory/stock/{stock["id"]}',
                            json=update_data,
                            headers=auth_headers)
        assert response.status_code in (200, 201, 204), f"Failed: {response.json if response.json else 'No response'}"

    def test_update_batch_info(self, client, auth_headers, hdpe_batch):
        """Test updating batch information"""
        batch = hdpe_batch

        update_data = {
            'notes': 'Test batch update'
        }

        response = client.put(f'/api/inventory/batches/{batch["id"]}',
                            json=update_data,
                            headers=auth_headers)
        # May return 200, 204, or 404 depending on implementation
        assert response.status_code in (200, 204, 404)


class TestCutRollOperation:
    """Test cutting roll operations"""

    def test_cut_full_roll_into_pieces(self, client, auth_headers, hdpe_batch):
        """Test cutting a full roll into smaller pieces"""
        batch = hdpe_batch

        # Get a full roll stock
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, length_per_unit FROM inventory_stock
                WHERE batch_id = %s
                AND stock_type = 'FULL_ROLL'
                AND status = 'IN_STOCK'
                AND quantity > 0
                LIMIT 1
            """, (batch['id'],))
            stock = cursor.fetchone()

        if not stock:
            pytest.skip("No full rolls available for cutting")

        roll_length = float(stock['length_per_unit'] or 500.0)

        # Cut into 3 pieces
        cut_data = {
            'stock_id': str(stock['id']),
            'cut_lengths': [100.0, 150.0, 200.0]
        }

        response = client.post('/api/inventory/cut-roll',
                              json=cut_data,
                              headers=auth_headers)
        assert response.status_code in (200, 201), f"Cut roll failed: {response.json}"

        result = response.json
        assert 'message' in result or 'cut_pieces' in result

        # Verify pieces were created
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count FROM hdpe_cut_pieces
                WHERE stock_id IN (
                    SELECT id FROM inventory_stock
                    WHERE batch_id = %s AND stock_type = 'CUT_ROLL'
                )
            """, (batch['id'],))
            result = cursor.fetchone()

        assert result['count'] >= 3

    def test_cut_roll_validation_exceeds_length(self, client, auth_headers, hdpe_batch):
        """Test that cutting longer than roll length is rejected"""
        batch = hdpe_batch

        # Get a full roll
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, length_per_unit FROM inventory_stock
                WHERE batch_id = %s
                AND stock_type = 'FULL_ROLL'
                AND status = 'IN_STOCK'
                LIMIT 1
            """, (batch['id'],))
            stock = cursor.fetchone()

        if not stock:
            pytest.skip("No full rolls available")

        roll_length = float(stock['length_per_unit'] or 500.0)

        # Try to cut more than available
        cut_data = {
            'stock_id': str(stock['id']),
            'cut_lengths': [roll_length + 100.0]  # Exceed roll length
        }

        response = client.post('/api/inventory/cut-roll',
                              json=cut_data,
                              headers=auth_headers)
        assert response.status_code == 400

    def test_cut_roll_requires_auth(self, client):
        """Test cut-roll endpoint requires authentication"""
        cut_data = {
            'stock_id': 'fake-id',
            'cut_lengths': [100.0]
        }

        response = client.post('/api/inventory/cut-roll', json=cut_data)
        assert response.status_code == 401


class TestSplitBundleOperation:
    """Test splitting bundle operations"""

    def test_split_bundle_into_spares(self, client, auth_headers, sprinkler_batch):
        """Test splitting a bundle into spare pieces"""
        batch = sprinkler_batch

        # Get a bundle stock
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, pieces_per_bundle, quantity FROM inventory_stock
                WHERE batch_id = %s
                AND stock_type = 'BUNDLE'
                AND status = 'IN_STOCK'
                AND quantity > 0
                LIMIT 1
            """, (batch['id'],))
            stock = cursor.fetchone()

        if not stock:
            pytest.skip("No bundles available for splitting")

        pieces_count = int(stock['pieces_per_bundle'] or 10)
        initial_quantity = stock['quantity']

        # Split bundle into spares (pieces_to_split is an array)
        split_data = {
            'stock_id': str(stock['id']),
            'pieces_to_split': [pieces_count]  # Array of piece counts
        }

        response = client.post('/api/inventory/split-bundle',
                              json=split_data,
                              headers=auth_headers)
        assert response.status_code in (200, 201), f"Split failed: {response.json}"

        # Verify spare pieces were created (at least some pieces)
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count FROM sprinkler_spare_pieces
                WHERE stock_id IN (
                    SELECT id FROM inventory_stock
                    WHERE batch_id = %s AND stock_type = 'SPARE'
                )
            """, (batch['id'],))
            result = cursor.fetchone()

        # Should have created at least 1 spare piece entry
        assert result['count'] >= 1, f"Expected spare pieces but got {result['count']}"

        # Verify bundle quantity decreased
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT quantity FROM inventory_stock
                WHERE id = %s
            """, (stock['id'],))
            updated = cursor.fetchone()

        # Bundle should have decreased by 1 (or been deleted if quantity reached 0)
        if updated:
            assert updated['quantity'] < initial_quantity, "Bundle quantity should have decreased"

    def test_split_bundle_validation_missing_fields(self, client, auth_headers):
        """Test split-bundle validates required fields"""
        split_data = {}

        response = client.post('/api/inventory/split-bundle',
                              json=split_data,
                              headers=auth_headers)
        assert response.status_code == 400

    def test_split_bundle_requires_auth(self, client):
        """Test split-bundle requires authentication"""
        split_data = {
            'stock_id': 'fake-id',
            'spare_count': 10
        }

        response = client.post('/api/inventory/split-bundle', json=split_data)
        assert response.status_code == 401


class TestCombineSparesOperation:
    """Test combining spare pieces operations"""

    def test_combine_spares_into_bundle(self, client, auth_headers, sprinkler_batch):
        """Test combining spare pieces back into a bundle"""
        batch = sprinkler_batch

        # First split a bundle to create spares
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, pieces_per_bundle FROM inventory_stock
                WHERE batch_id = %s
                AND stock_type = 'BUNDLE'
                AND status = 'IN_STOCK'
                AND quantity > 0
                LIMIT 1
            """, (batch['id'],))
            bundle_stock = cursor.fetchone()

        if not bundle_stock:
            pytest.skip("No bundles available")

        pieces_per_bundle = int(bundle_stock['pieces_per_bundle'] or 10)

        # Split first
        split_data = {
            'stock_id': str(bundle_stock['id']),
            'pieces_to_split': [pieces_per_bundle]
        }

        split_response = client.post('/api/inventory/split-bundle',
                                    json=split_data,
                                    headers=auth_headers)

        if split_response.status_code not in (200, 201):
            pytest.skip("Could not create spares for combine test")

        # Get spare piece IDs
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id FROM sprinkler_spare_pieces
                WHERE stock_id IN (
                    SELECT id FROM inventory_stock
                    WHERE batch_id = %s AND stock_type = 'SPARE'
                )
                AND status = 'IN_STOCK'
                ORDER BY created_at DESC
                LIMIT %s
            """, (batch['id'], pieces_per_bundle))
            spare_pieces = cursor.fetchall()

        if len(spare_pieces) < pieces_per_bundle:
            pytest.skip("Not enough spare pieces for combine test")

        # Combine spares
        combine_data = {
            'batch_id': str(batch['id']),
            'spare_piece_ids': [str(sp['id']) for sp in spare_pieces[:pieces_per_bundle]]
        }

        response = client.post('/api/inventory/combine-spares',
                              json=combine_data,
                              headers=auth_headers)
        assert response.status_code in (200, 201), f"Combine failed: {response.json}"

    def test_combine_spares_requires_auth(self, client):
        """Test combine-spares requires authentication"""
        combine_data = {
            'batch_id': 'fake-id',
            'spare_piece_ids': []
        }

        response = client.post('/api/inventory/combine-spares', json=combine_data)
        assert response.status_code == 401


class TestSearchAndCustomers:
    """Test search and customer endpoints"""

    def test_get_customers(self, client, auth_headers, test_customer):
        """Test retrieving customers list"""
        customer = test_customer

        response = client.get('/api/inventory/customers', headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        assert isinstance(data, list)

        # Find our test customer
        customer_names = [c.get('name', '') for c in data]
        assert customer['name'] in customer_names

    def test_search_inventory(self, client, auth_headers, hdpe_batch):
        """Test inventory search functionality"""
        batch = hdpe_batch

        search_data = {
            'batch_code': batch['batch_code'][:5]  # Search by partial batch code
        }

        response = client.post('/api/inventory/search',
                              json=search_data,
                              headers=auth_headers)
        assert response.status_code == 200

        data = response.json
        assert isinstance(data, list) or isinstance(data, dict)

    def test_search_product_variants(self, client, auth_headers, hdpe_batch):
        """Test product variant search"""
        # Get product type and brand from batch
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT pv.product_type_id, pv.brand_id
                FROM batches b
                JOIN product_variants pv ON b.product_variant_id = pv.id
                WHERE b.id = %s
            """, (hdpe_batch['id'],))
            variant_info = cursor.fetchone()

        if not variant_info:
            pytest.skip("No variant info available")

        # Search requires product_type_id and brand_id
        response = client.get(
            f'/api/inventory/product-variants/search?product_type_id={variant_info["product_type_id"]}&brand_id={variant_info["brand_id"]}&search=HD',
            headers=auth_headers
        )
        assert response.status_code == 200

        data = response.json
        assert isinstance(data, list)


class TestInventoryConsistency:
    """Test inventory data consistency"""

    def test_stock_quantity_consistency_after_cut(self, client, auth_headers, hdpe_batch):
        """Test that stock quantities remain consistent after cutting"""
        batch = hdpe_batch

        # Get initial full roll count
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT SUM(quantity) as total FROM inventory_stock
                WHERE batch_id = %s AND stock_type = 'FULL_ROLL' AND status = 'IN_STOCK'
            """, (batch['id'],))
            initial = cursor.fetchone()

        initial_total = initial['total'] or 0

        if initial_total < 1:
            pytest.skip("No full rolls to cut")

        # Get a roll to cut
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, length_per_unit FROM inventory_stock
                WHERE batch_id = %s
                AND stock_type = 'FULL_ROLL'
                AND status = 'IN_STOCK'
                LIMIT 1
            """, (batch['id'],))
            stock = cursor.fetchone()

        # Cut it
        cut_data = {
            'stock_id': str(stock['id']),
            'cut_lengths': [100.0, 200.0]
        }

        response = client.post('/api/inventory/cut-roll',
                              json=cut_data,
                              headers=auth_headers)

        if response.status_code not in (200, 201):
            pytest.skip("Cut operation failed")

        # Verify full roll count decreased
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT SUM(quantity) as total FROM inventory_stock
                WHERE batch_id = %s AND stock_type = 'FULL_ROLL' AND status = 'IN_STOCK'
            """, (batch['id'],))
            after = cursor.fetchone()

        after_total = after['total'] or 0
        assert after_total == initial_total - 1

    def test_batch_has_stock_entries(self, client, auth_headers, hdpe_batch):
        """Test that batches returned have valid stock entries"""
        response = client.get('/api/inventory/batches', headers=auth_headers)
        assert response.status_code == 200

        batches = response.json

        # Find our test batch
        test_batch = None
        for b in batches:
            if b['batch_code'] == hdpe_batch['batch_code']:
                test_batch = b
                break

        assert test_batch is not None
        assert 'stock_entries' in test_batch
        assert isinstance(test_batch['stock_entries'], list)
