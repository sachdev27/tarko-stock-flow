"""
Dispatch Module Test Cases
Tests all dispatch scenarios including standard dispatches, cut roll dispatches, returns, and edge cases
"""
import pytest
from datetime import datetime, timedelta

class TestDispatchCreation:
    """Test suite for dispatch creation"""

    # ==================== HDPE PIPE DISPATCH TESTS ====================

    def test_dispatch_complete_rolls_only(self, client, auth_token, hdpe_batch):
        """Test dispatching complete HDPE rolls"""
        data = {
            'customer_name': 'Test Customer Inc.',
            'customer_phone': '1234567890',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],  # First roll
                    'quantity': 500,  # Full roll
                    'unit_price': 100.00
                }
            ],
            'notes': 'Standard dispatch'
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201
        result = response.json()
        assert 'dispatch_id' in result
        assert 'dispatch_code' in result

    def test_dispatch_partial_roll(self, client, auth_token, hdpe_batch):
        """Test dispatching partial quantity from HDPE roll"""
        data = {
            'customer_name': 'Partial Customer',
            'customer_phone': '9876543210',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],
                    'quantity': 250,  # Half of 500m roll
                    'unit_price': 100.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_dispatch_multiple_rolls_same_batch(self, client, auth_token, hdpe_batch):
        """Test dispatching multiple rolls from same batch"""
        data = {
            'customer_name': 'Multi Roll Customer',
            'customer_phone': '5555555555',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],
                    'quantity': 500,
                    'unit_price': 100.00
                },
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][1]['id'],
                    'quantity': 500,
                    'unit_price': 100.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_dispatch_mixed_batches(self, client, auth_token, hdpe_batch_1, hdpe_batch_2):
        """Test dispatching items from multiple different batches"""
        data = {
            'customer_name': 'Mixed Batch Customer',
            'customer_phone': '1112223333',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch_1['id'],
                    'item_id': hdpe_batch_1['rolls'][0]['id'],
                    'quantity': 300,
                    'unit_price': 100.00
                },
                {
                    'batch_id': hdpe_batch_2['id'],
                    'item_id': hdpe_batch_2['rolls'][0]['id'],
                    'quantity': 200,
                    'unit_price': 95.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_dispatch_cut_rolls(self, client, auth_token, hdpe_batch_with_cuts):
        """Test dispatching cut rolls"""
        data = {
            'customer_name': 'Cut Roll Customer',
            'customer_phone': '4445556666',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch_with_cuts['id'],
                    'item_id': hdpe_batch_with_cuts['cut_rolls'][0]['id'],
                    'quantity': 150,  # Full cut roll
                    'unit_price': 100.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_dispatch_with_cut_operation(self, client, auth_token, hdpe_batch):
        """Test dispatch that creates a cut roll"""
        data = {
            'customer_name': 'Cut Operation Customer',
            'customer_phone': '7778889999',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],
                    'quantity': 350,  # Cut from 500m roll
                    'unit_price': 100.00,
                    'is_cut_operation': True,
                    'cut_roll_length': 150  # Remaining 150m becomes cut roll
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    # ==================== SPRINKLER PIPE DISPATCH TESTS ====================

    def test_dispatch_complete_bundle(self, client, auth_token, sprinkler_batch):
        """Test dispatching complete sprinkler bundle"""
        data = {
            'customer_name': 'Bundle Customer',
            'customer_phone': '1231231234',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': sprinkler_batch['id'],
                    'item_id': sprinkler_batch['bundles'][0]['id'],
                    'quantity': 10,  # 10 pieces (full bundle)
                    'unit_price': 50.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_dispatch_partial_bundle(self, client, auth_token, sprinkler_batch):
        """Test dispatching partial quantity from bundle"""
        data = {
            'customer_name': 'Partial Bundle Customer',
            'customer_phone': '4564564567',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': sprinkler_batch['id'],
                    'item_id': sprinkler_batch['bundles'][0]['id'],
                    'quantity': 6,  # 6 out of 10 pieces
                    'unit_price': 50.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_dispatch_spare_pieces(self, client, auth_token, sprinkler_batch):
        """Test dispatching sprinkler spare pieces"""
        data = {
            'customer_name': 'Spare Pieces Customer',
            'customer_phone': '7897897890',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': sprinkler_batch['id'],
                    'item_id': sprinkler_batch['spare_pieces'][0]['id'],
                    'quantity': 3,  # 3 pieces from spare group
                    'unit_price': 50.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_dispatch_mixed_bundles_and_spares(self, client, auth_token, sprinkler_batch):
        """Test dispatching both bundles and spare pieces"""
        data = {
            'customer_name': 'Mixed Sprinkler Customer',
            'customer_phone': '3213213210',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': sprinkler_batch['id'],
                    'item_id': sprinkler_batch['bundles'][0]['id'],
                    'quantity': 10,
                    'unit_price': 50.00
                },
                {
                    'batch_id': sprinkler_batch['id'],
                    'item_id': sprinkler_batch['spare_pieces'][0]['id'],
                    'quantity': 5,
                    'unit_price': 50.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    # ==================== EDGE CASES & VALIDATION ====================

    def test_dispatch_exceeds_stock(self, client, auth_token, hdpe_batch):
        """Test dispatch quantity exceeding available stock"""
        data = {
            'customer_name': 'Over Stock Customer',
            'customer_phone': '6546546540',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],
                    'quantity': 9999,  # More than available
                    'unit_price': 100.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400
        assert 'insufficient stock' in response.json()['error'].lower()

    def test_dispatch_zero_quantity(self, client, auth_token, hdpe_batch):
        """Test dispatch with zero quantity"""
        data = {
            'customer_name': 'Zero Qty Customer',
            'customer_phone': '9879879870',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],
                    'quantity': 0,
                    'unit_price': 100.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_dispatch_negative_quantity(self, client, auth_token, hdpe_batch):
        """Test dispatch with negative quantity"""
        data = {
            'customer_name': 'Negative Qty Customer',
            'customer_phone': '1472583690',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],
                    'quantity': -100,
                    'unit_price': 100.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_dispatch_missing_required_fields(self, client, auth_token):
        """Test dispatch with missing required fields"""
        data = {
            'customer_name': 'Incomplete Customer'
            # Missing customer_phone, items, etc.
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_dispatch_nonexistent_batch(self, client, auth_token):
        """Test dispatch from non-existent batch"""
        fake_id = '00000000-0000-0000-0000-000000000000'
        data = {
            'customer_name': 'Ghost Batch Customer',
            'customer_phone': '0000000000',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': fake_id,
                    'item_id': fake_id,
                    'quantity': 100,
                    'unit_price': 100.00
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 404

    def test_dispatch_with_zero_price(self, client, auth_token, hdpe_batch):
        """Test dispatch with zero unit price (free goods)"""
        data = {
            'customer_name': 'Free Goods Customer',
            'customer_phone': '5551234567',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],
                    'quantity': 100,
                    'unit_price': 0.00  # Free
                }
            ]
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_dispatch_with_discount(self, client, auth_token, hdpe_batch):
        """Test dispatch with discount applied"""
        data = {
            'customer_name': 'Discount Customer',
            'customer_phone': '5559876543',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],
                    'quantity': 500,
                    'unit_price': 100.00
                }
            ],
            'discount_percentage': 10,  # 10% discount
            'discount_amount': 5000  # Or fixed discount
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_dispatch_empty_items_array(self, client, auth_token):
        """Test dispatch with empty items array"""
        data = {
            'customer_name': 'Empty Items Customer',
            'customer_phone': '5554443333',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': []
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_dispatch_very_long_notes(self, client, auth_token, hdpe_batch):
        """Test dispatch with very long notes field"""
        long_notes = 'A' * 10000  # 10k characters
        data = {
            'customer_name': 'Long Notes Customer',
            'customer_phone': '5552221111',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [
                {
                    'batch_id': hdpe_batch['id'],
                    'item_id': hdpe_batch['rolls'][0]['id'],
                    'quantity': 100,
                    'unit_price': 100.00
                }
            ],
            'notes': long_notes
        }
        response = client.post('/api/dispatch',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [201, 400]  # Either accept or reject based on DB limit


class TestDispatchHistory:
    """Test dispatch history and retrieval"""

    def test_get_all_dispatches(self, client, auth_token):
        """Test retrieving all dispatches"""
        response = client.get('/api/dispatch/history',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200
        result = response.json()
        assert 'dispatches' in result

    def test_get_dispatch_details(self, client, auth_token, sample_dispatch):
        """Test retrieving specific dispatch details"""
        response = client.get(f'/api/dispatch/{sample_dispatch["id"]}',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200
        result = response.json()
        assert 'customer_name' in result
        assert 'items' in result

    def test_filter_dispatches_by_customer(self, client, auth_token):
        """Test filtering dispatches by customer name"""
        response = client.get('/api/dispatch/history?customer=Test Customer',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200

    def test_filter_dispatches_by_date_range(self, client, auth_token):
        """Test filtering dispatches by date range"""
        start_date = '2025-11-01'
        end_date = '2025-12-31'
        response = client.get(f'/api/dispatch/history?start_date={start_date}&end_date={end_date}',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200


class TestDispatchStatusTransitions:
    """Test dispatch status changes and state management"""

    def test_cancel_dispatch(self, client, auth_token, sample_dispatch):
        """Test canceling a dispatch"""
        response = client.post(f'/api/dispatch/{sample_dispatch["id"]}/cancel',
                              json={'reason': 'Customer requested cancellation'},
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200

    def test_cancel_already_cancelled(self, client, auth_token, cancelled_dispatch):
        """Test canceling an already cancelled dispatch"""
        response = client.post(f'/api/dispatch/{cancelled_dispatch["id"]}/cancel',
                              json={'reason': 'Already cancelled'},
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_dispatch_after_cancel_restores_stock(self, client, auth_token, hdpe_batch):
        """Test that canceling dispatch restores inventory"""
        # Create dispatch
        dispatch_data = {
            'customer_name': 'Cancel Test Customer',
            'customer_phone': '1111111111',
            'dispatch_date': '2025-12-01T14:00:00',
            'items': [{
                'batch_id': hdpe_batch['id'],
                'item_id': hdpe_batch['rolls'][0]['id'],
                'quantity': 200,
                'unit_price': 100.00
            }]
        }
        dispatch_resp = client.post('/api/dispatch',
                                    json=dispatch_data,
                                    headers={'Authorization': f'Bearer {auth_token}'})
        dispatch_id = dispatch_resp.json()['dispatch_id']

        # Check stock after dispatch
        stock_after_dispatch = client.get(f'/api/inventory/item/{hdpe_batch["rolls"][0]["id"]}',
                                          headers={'Authorization': f'Bearer {auth_token}'})
        quantity_after_dispatch = stock_after_dispatch.json()['quantity']

        # Cancel dispatch
        client.post(f'/api/dispatch/{dispatch_id}/cancel',
                   json={'reason': 'Test'},
                   headers={'Authorization': f'Bearer {auth_token}'})

        # Check stock restored
        stock_after_cancel = client.get(f'/api/inventory/item/{hdpe_batch["rolls"][0]["id"]}',
                                        headers={'Authorization': f'Bearer {auth_token}'})
        quantity_after_cancel = stock_after_cancel.json()['quantity']

        assert quantity_after_cancel == quantity_after_dispatch + 200
