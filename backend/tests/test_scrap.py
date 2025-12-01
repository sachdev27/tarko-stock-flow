"""
Scrap Module Test Cases
Tests all scrap scenarios including production scrapping, dispatch scrapping, and edge cases
"""
import pytest

class TestScrapCreation:
    """Test suite for scrap creation"""

    # ==================== PRODUCTION SCRAP TESTS ====================

    def test_scrap_complete_production_roll(self, client, auth_token, hdpe_batch):
        """Test scrapping complete production roll"""
        data = {
            'item_id': hdpe_batch['rolls'][0]['id'],
            'batch_id': hdpe_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 500,  # Full roll
            'reason': 'Manufacturing defect',
            'scrap_type': 'production',
            'notes': 'Quality control failure'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201
        result = response.json()
        assert 'scrap_id' in result
        assert 'scrap_code' in result

    def test_scrap_partial_production_roll(self, client, auth_token, hdpe_batch):
        """Test scrapping partial quantity from production roll"""
        data = {
            'item_id': hdpe_batch['rolls'][0]['id'],
            'batch_id': hdpe_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 200,  # Partial
            'reason': 'Damaged section',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_scrap_cut_roll(self, client, auth_token, hdpe_batch_with_cuts):
        """Test scrapping cut roll"""
        data = {
            'item_id': hdpe_batch_with_cuts['cut_rolls'][0]['id'],
            'batch_id': hdpe_batch_with_cuts['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': hdpe_batch_with_cuts['cut_rolls'][0]['length'],
            'reason': 'Poor quality',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_scrap_sprinkler_bundle(self, client, auth_token, sprinkler_batch):
        """Test scrapping sprinkler bundle"""
        data = {
            'item_id': sprinkler_batch['bundles'][0]['id'],
            'batch_id': sprinkler_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 10,  # Full bundle
            'reason': 'Dimensional issues',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_scrap_sprinkler_partial_bundle(self, client, auth_token, sprinkler_batch):
        """Test scrapping partial quantity from bundle"""
        data = {
            'item_id': sprinkler_batch['bundles'][0]['id'],
            'batch_id': sprinkler_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 5,  # Half bundle
            'reason': 'Some pieces defective',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_scrap_spare_pieces(self, client, auth_token, sprinkler_batch):
        """Test scrapping spare pieces"""
        data = {
            'item_id': sprinkler_batch['spare_pieces'][0]['id'],
            'batch_id': sprinkler_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 3,
            'reason': 'Excess scrap',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    # ==================== DISPATCH SCRAP TESTS ====================

    def test_scrap_from_dispatch(self, client, auth_token, dispatched_item):
        """Test scrapping items from dispatch"""
        data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'dispatch_item_id': dispatched_item['item_id'],
            'scrap_date': '2025-12-02T15:00:00',
            'quantity': 100,
            'reason': 'Damaged during transit',
            'scrap_type': 'dispatch',
            'notes': 'Customer reported damage'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_scrap_complete_dispatched_item(self, client, auth_token, dispatched_item):
        """Test scrapping complete dispatched item"""
        data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'dispatch_item_id': dispatched_item['item_id'],
            'scrap_date': '2025-12-02T15:00:00',
            'quantity': dispatched_item['quantity'],  # Full quantity
            'reason': 'Complete rejection',
            'scrap_type': 'dispatch'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_scrap_partial_dispatched_item(self, client, auth_token, dispatched_item):
        """Test scrapping partial dispatched item"""
        data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'dispatch_item_id': dispatched_item['item_id'],
            'scrap_date': '2025-12-02T15:00:00',
            'quantity': dispatched_item['quantity'] / 2,
            'reason': 'Partial damage',
            'scrap_type': 'dispatch'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    # ==================== EDGE CASES & VALIDATION ====================

    def test_scrap_exceeds_available_stock(self, client, auth_token, hdpe_batch):
        """Test scrapping quantity exceeding available stock"""
        data = {
            'item_id': hdpe_batch['rolls'][0]['id'],
            'batch_id': hdpe_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 9999,  # More than available
            'reason': 'Over scrap',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400
        assert 'insufficient' in response.json()['error'].lower()

    def test_scrap_zero_quantity(self, client, auth_token, hdpe_batch):
        """Test scrap with zero quantity"""
        data = {
            'item_id': hdpe_batch['rolls'][0]['id'],
            'batch_id': hdpe_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 0,
            'reason': 'Zero scrap',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_scrap_negative_quantity(self, client, auth_token, hdpe_batch):
        """Test scrap with negative quantity"""
        data = {
            'item_id': hdpe_batch['rolls'][0]['id'],
            'batch_id': hdpe_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': -100,
            'reason': 'Negative',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_scrap_missing_required_fields(self, client, auth_token):
        """Test scrap with missing required fields"""
        data = {
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 100
            # Missing item_id, reason, scrap_type
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_scrap_nonexistent_item(self, client, auth_token):
        """Test scrapping non-existent item"""
        fake_id = '00000000-0000-0000-0000-000000000000'
        data = {
            'item_id': fake_id,
            'batch_id': fake_id,
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 100,
            'reason': 'Ghost item',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 404

    def test_scrap_from_cancelled_dispatch(self, client, auth_token, cancelled_dispatch):
        """Test scrapping from cancelled dispatch"""
        data = {
            'dispatch_id': cancelled_dispatch['id'],
            'dispatch_item_id': cancelled_dispatch['items'][0]['id'],
            'scrap_date': '2025-12-02T15:00:00',
            'quantity': 100,
            'reason': 'Scrap from cancelled',
            'scrap_type': 'dispatch'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_scrap_invalid_type(self, client, auth_token, hdpe_batch):
        """Test scrap with invalid scrap type"""
        data = {
            'item_id': hdpe_batch['rolls'][0]['id'],
            'batch_id': hdpe_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 100,
            'reason': 'Test',
            'scrap_type': 'invalid_type'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400


class TestScrapHistory:
    """Test scrap history and retrieval"""

    def test_get_all_scraps(self, client, auth_token):
        """Test retrieving all scrap records"""
        response = client.get('/api/scrap/history',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200
        result = response.json()
        assert 'scraps' in result

    def test_get_scrap_details(self, client, auth_token, sample_scrap):
        """Test retrieving specific scrap details"""
        response = client.get(f'/api/scrap/{sample_scrap["id"]}',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200
        result = response.json()
        assert 'scrap_code' in result
        assert 'reason' in result

    def test_filter_scraps_by_type(self, client, auth_token):
        """Test filtering scraps by type"""
        response = client.get('/api/scrap/history?type=production',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200

    def test_filter_scraps_by_date_range(self, client, auth_token):
        """Test filtering scraps by date range"""
        response = client.get('/api/scrap/history?start_date=2025-11-01&end_date=2025-12-31',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200

    def test_get_scraps_for_batch(self, client, auth_token, hdpe_batch):
        """Test retrieving all scraps for a specific batch"""
        response = client.get(f'/api/production/batch/{hdpe_batch["id"]}/scraps',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200


class TestScrapImpactOnInventory:
    """Test how scrap operations affect inventory"""

    def test_scrap_reduces_inventory(self, client, auth_token, hdpe_batch):
        """Test that scrap operation reduces inventory"""
        item_id = hdpe_batch['rolls'][0]['id']

        # Get stock before scrap
        stock_before = client.get(f'/api/inventory/item/{item_id}',
                                  headers={'Authorization': f'Bearer {auth_token}'})
        qty_before = stock_before.json()['quantity']

        # Scrap some quantity
        scrap_qty = 150
        scrap_data = {
            'item_id': item_id,
            'batch_id': hdpe_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': scrap_qty,
            'reason': 'Test',
            'scrap_type': 'production'
        }
        client.post('/api/scrap',
                   json=scrap_data,
                   headers={'Authorization': f'Bearer {auth_token}'})

        # Get stock after scrap
        stock_after = client.get(f'/api/inventory/item/{item_id}',
                                 headers={'Authorization': f'Bearer {auth_token}'})
        qty_after = stock_after.json()['quantity']

        assert qty_after == qty_before - scrap_qty

    def test_multiple_scraps_accumulate(self, client, auth_token, hdpe_batch):
        """Test that multiple scrap operations accumulate correctly"""
        item_id = hdpe_batch['rolls'][0]['id']

        # Get initial stock
        stock_initial = client.get(f'/api/inventory/item/{item_id}',
                                   headers={'Authorization': f'Bearer {auth_token}'})
        qty_initial = stock_initial.json()['quantity']

        # First scrap
        client.post('/api/scrap',
                   json={
                       'item_id': item_id,
                       'batch_id': hdpe_batch['id'],
                       'scrap_date': '2025-12-01T15:00:00',
                       'quantity': 50,
                       'reason': 'First scrap',
                       'scrap_type': 'production'
                   },
                   headers={'Authorization': f'Bearer {auth_token}'})

        # Second scrap
        client.post('/api/scrap',
                   json={
                       'item_id': item_id,
                       'batch_id': hdpe_batch['id'],
                       'scrap_date': '2025-12-01T16:00:00',
                       'quantity': 75,
                       'reason': 'Second scrap',
                       'scrap_type': 'production'
                   },
                   headers={'Authorization': f'Bearer {auth_token}'})

        # Get final stock
        stock_final = client.get(f'/api/inventory/item/{item_id}',
                                 headers={'Authorization': f'Bearer {auth_token}'})
        qty_final = stock_final.json()['quantity']

        assert qty_final == qty_initial - 125


class TestScrapStatusTracking:
    """Test scrap status changes"""

    def test_scrap_status_recorded(self, client, auth_token, hdpe_batch):
        """Test that scrap status is properly recorded"""
        data = {
            'item_id': hdpe_batch['rolls'][0]['id'],
            'batch_id': hdpe_batch['id'],
            'scrap_date': '2025-12-01T15:00:00',
            'quantity': 100,
            'reason': 'Status test',
            'scrap_type': 'production'
        }
        response = client.post('/api/scrap',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

        # Verify item status updated
        scrap_id = response.json()['scrap_id']
        details = client.get(f'/api/scrap/{scrap_id}',
                            headers={'Authorization': f'Bearer {auth_token}'})
        assert details.json()['status'] in ['scrapped', 'completed']
