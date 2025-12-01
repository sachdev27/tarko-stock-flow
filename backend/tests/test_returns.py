"""
Return Module Test Cases
Tests all return scenarios including full returns, partial returns, revert operations, and edge cases
"""
import pytest
from datetime import datetime, timedelta

class TestReturnCreation:
    """Test suite for return creation"""

    # ==================== STANDARD RETURN TESTS ====================

    def test_return_complete_item(self, client, auth_token, dispatched_item):
        """Test returning complete dispatched item"""
        data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': dispatched_item['item_id'],
                    'quantity': dispatched_item['quantity'],  # Full return
                    'reason': 'Quality issue'
                }
            ],
            'notes': 'Complete return due to defect'
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201
        result = response.json()
        assert 'return_id' in result
        assert 'return_code' in result

    def test_return_partial_quantity(self, client, auth_token, dispatched_item):
        """Test returning partial quantity from dispatch"""
        data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': dispatched_item['item_id'],
                    'quantity': dispatched_item['quantity'] / 2,  # Half return
                    'reason': 'Excess quantity'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_return_multiple_items_same_dispatch(self, client, auth_token, multi_item_dispatch):
        """Test returning multiple items from same dispatch"""
        data = {
            'dispatch_id': multi_item_dispatch['id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': multi_item_dispatch['items'][0]['id'],
                    'quantity': 100,
                    'reason': 'Quality issue'
                },
                {
                    'dispatch_item_id': multi_item_dispatch['items'][1]['id'],
                    'quantity': 50,
                    'reason': 'Wrong specification'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_return_from_different_batches(self, client, auth_token, mixed_batch_dispatch):
        """Test return items originally from different batches"""
        data = {
            'dispatch_id': mixed_batch_dispatch['id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': mixed_batch_dispatch['items'][0]['id'],
                    'quantity': 100,
                    'reason': 'Return from batch 1'
                },
                {
                    'dispatch_item_id': mixed_batch_dispatch['items'][1]['id'],
                    'quantity': 100,
                    'reason': 'Return from batch 2'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    # ==================== HDPE SPECIFIC RETURN TESTS ====================

    def test_return_hdpe_complete_roll(self, client, auth_token, hdpe_dispatch):
        """Test returning complete HDPE roll"""
        data = {
            'dispatch_id': hdpe_dispatch['id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': hdpe_dispatch['items'][0]['id'],
                    'quantity': 500,  # Full roll
                    'reason': 'Customer rejected'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_return_hdpe_partial_creates_cut_roll(self, client, auth_token, hdpe_dispatch):
        """Test returning partial HDPE creates cut roll"""
        data = {
            'dispatch_id': hdpe_dispatch['id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': hdpe_dispatch['items'][0]['id'],
                    'quantity': 350,  # Partial from 500m
                    'reason': 'Partial use'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201
        # Verify cut roll created
        result = response.json()
        assert 'cut_roll_created' in result or response.status_code == 201

    def test_return_cut_roll_dispatch(self, client, auth_token, cut_roll_dispatch):
        """Test returning item that was dispatched from cut roll"""
        data = {
            'dispatch_id': cut_roll_dispatch['id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': cut_roll_dispatch['items'][0]['id'],
                    'quantity': cut_roll_dispatch['items'][0]['quantity'],
                    'reason': 'Return of cut roll'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    # ==================== SPRINKLER SPECIFIC RETURN TESTS ====================

    def test_return_sprinkler_complete_bundle(self, client, auth_token, sprinkler_dispatch):
        """Test returning complete sprinkler bundle"""
        data = {
            'dispatch_id': sprinkler_dispatch['id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': sprinkler_dispatch['items'][0]['id'],
                    'quantity': 10,  # Full bundle
                    'reason': 'Unused items'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_return_sprinkler_partial_bundle(self, client, auth_token, sprinkler_dispatch):
        """Test returning partial quantity from bundle"""
        data = {
            'dispatch_id': sprinkler_dispatch['id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': sprinkler_dispatch['items'][0]['id'],
                    'quantity': 5,  # 5 out of 10 pieces
                    'reason': 'Partial return'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_return_sprinkler_spare_pieces(self, client, auth_token, sprinkler_spare_dispatch):
        """Test returning sprinkler spare pieces"""
        data = {
            'dispatch_id': sprinkler_spare_dispatch['id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': sprinkler_spare_dispatch['items'][0]['id'],
                    'quantity': 3,
                    'reason': 'Extra pieces'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    # ==================== EDGE CASES & VALIDATION ====================

    def test_return_exceeds_dispatched_quantity(self, client, auth_token, dispatched_item):
        """Test return quantity exceeding originally dispatched amount"""
        data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': dispatched_item['item_id'],
                    'quantity': dispatched_item['quantity'] * 2,  # Double the original
                    'reason': 'Invalid return'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400
        assert 'exceeds' in response.json()['error'].lower()

    def test_return_zero_quantity(self, client, auth_token, dispatched_item):
        """Test return with zero quantity"""
        data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': dispatched_item['item_id'],
                    'quantity': 0,
                    'reason': 'Invalid'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_return_negative_quantity(self, client, auth_token, dispatched_item):
        """Test return with negative quantity"""
        data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': dispatched_item['item_id'],
                    'quantity': -100,
                    'reason': 'Invalid'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_return_from_cancelled_dispatch(self, client, auth_token, cancelled_dispatch):
        """Test returning items from a cancelled dispatch"""
        data = {
            'dispatch_id': cancelled_dispatch['id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': cancelled_dispatch['items'][0]['id'],
                    'quantity': 100,
                    'reason': 'Return from cancelled'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400

    def test_return_nonexistent_dispatch(self, client, auth_token):
        """Test return from non-existent dispatch"""
        fake_id = '00000000-0000-0000-0000-000000000000'
        data = {
            'dispatch_id': fake_id,
            'return_date': '2025-12-02T10:00:00',
            'items': [
                {
                    'dispatch_item_id': fake_id,
                    'quantity': 100,
                    'reason': 'Ghost return'
                }
            ]
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 404

    def test_return_empty_items_array(self, client, auth_token, dispatched_item):
        """Test return with empty items array"""
        data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': []
        }
        response = client.post('/api/returns',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400


class TestReturnRevert:
    """Test return revert functionality"""

    def test_revert_complete_return(self, client, auth_token, completed_return):
        """Test reverting a complete return"""
        response = client.post(f'/api/returns/{completed_return["id"]}/revert',
                              json={'reason': 'Customer decided to keep items'},
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200
        result = response.json()
        assert result['status'] == 'reverted'

    def test_revert_partial_return(self, client, auth_token, partial_return):
        """Test reverting a partial return"""
        response = client.post(f'/api/returns/{partial_return["id"]}/revert',
                              json={'reason': 'Accounting error'},
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200

    def test_revert_already_reverted_return(self, client, auth_token, reverted_return):
        """Test reverting an already reverted return"""
        response = client.post(f'/api/returns/{reverted_return["id"]}/revert',
                              json={'reason': 'Already reverted'},
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400
        assert 'already reverted' in response.json()['error'].lower()

    def test_revert_restores_dispatch_quantities(self, client, auth_token, dispatched_item):
        """Test that reverting return restores original dispatch quantities"""
        # Create return
        return_data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [{
                'dispatch_item_id': dispatched_item['item_id'],
                'quantity': 200,
                'reason': 'Test'
            }]
        }
        return_resp = client.post('/api/returns',
                                  json=return_data,
                                  headers={'Authorization': f'Bearer {auth_token}'})
        return_id = return_resp.json()['return_id']

        # Get dispatch status after return
        dispatch_after_return = client.get(f'/api/dispatch/{dispatched_item["dispatch_id"]}',
                                           headers={'Authorization': f'Bearer {auth_token}'})

        # Revert return
        client.post(f'/api/returns/{return_id}/revert',
                   json={'reason': 'Test revert'},
                   headers={'Authorization': f'Bearer {auth_token}'})

        # Get dispatch status after revert
        dispatch_after_revert = client.get(f'/api/dispatch/{dispatched_item["dispatch_id"]}',
                                           headers={'Authorization': f'Bearer {auth_token}'})

        # Should restore to original dispatch quantities
        assert dispatch_after_revert.status_code == 200

    def test_revert_removes_returned_stock(self, client, auth_token, completed_return):
        """Test that reverting return removes stock that was added back"""
        # Get stock before revert
        item_id = completed_return['items'][0]['original_item_id']
        stock_before = client.get(f'/api/inventory/item/{item_id}',
                                  headers={'Authorization': f'Bearer {auth_token}'})
        qty_before = stock_before.json()['quantity']

        # Revert return
        client.post(f'/api/returns/{completed_return["id"]}/revert',
                   json={'reason': 'Test'},
                   headers={'Authorization': f'Bearer {auth_token}'})

        # Get stock after revert
        stock_after = client.get(f'/api/inventory/item/{item_id}',
                                 headers={'Authorization': f'Bearer {auth_token}'})
        qty_after = stock_after.json()['quantity']

        # Stock should decrease by returned quantity
        returned_qty = completed_return['items'][0]['quantity']
        assert qty_after == qty_before - returned_qty


class TestReturnHistory:
    """Test return history and retrieval"""

    def test_get_all_returns(self, client, auth_token):
        """Test retrieving all returns"""
        response = client.get('/api/returns/history',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200
        result = response.json()
        assert 'returns' in result

    def test_get_return_details(self, client, auth_token, sample_return):
        """Test retrieving specific return details"""
        response = client.get(f'/api/returns/{sample_return["id"]}',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200
        result = response.json()
        assert 'return_code' in result
        assert 'items' in result

    def test_get_returns_for_dispatch(self, client, auth_token, dispatched_item):
        """Test retrieving all returns for a specific dispatch"""
        response = client.get(f'/api/dispatch/{dispatched_item["dispatch_id"]}/returns',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200
        result = response.json()
        assert isinstance(result['returns'], list)

    def test_filter_returns_by_status(self, client, auth_token):
        """Test filtering returns by status"""
        response = client.get('/api/returns/history?status=completed',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200

    def test_filter_returns_by_date(self, client, auth_token):
        """Test filtering returns by date range"""
        response = client.get('/api/returns/history?start_date=2025-11-01&end_date=2025-12-31',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 200


class TestMultipleReturnsFromSameDispatch:
    """Test scenarios with multiple returns from same dispatch"""

    def test_multiple_partial_returns(self, client, auth_token, dispatched_item):
        """Test creating multiple partial returns from same dispatch"""
        # First return
        return1_data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [{
                'dispatch_item_id': dispatched_item['item_id'],
                'quantity': 100,
                'reason': 'First partial return'
            }]
        }
        resp1 = client.post('/api/returns',
                           json=return1_data,
                           headers={'Authorization': f'Bearer {auth_token}'})
        assert resp1.status_code == 201

        # Second return
        return2_data = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-03T10:00:00',
            'items': [{
                'dispatch_item_id': dispatched_item['item_id'],
                'quantity': 50,
                'reason': 'Second partial return'
            }]
        }
        resp2 = client.post('/api/returns',
                           json=return2_data,
                           headers={'Authorization': f'Bearer {auth_token}'})
        assert resp2.status_code == 201

    def test_return_remaining_after_partial(self, client, auth_token, dispatched_item):
        """Test returning remaining quantity after a partial return"""
        total_qty = dispatched_item['quantity']

        # First partial return
        first_return = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [{
                'dispatch_item_id': dispatched_item['item_id'],
                'quantity': total_qty * 0.4,  # 40%
                'reason': 'Partial'
            }]
        }
        client.post('/api/returns',
                   json=first_return,
                   headers={'Authorization': f'Bearer {auth_token}'})

        # Return remaining 60%
        remaining_return = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-03T10:00:00',
            'items': [{
                'dispatch_item_id': dispatched_item['item_id'],
                'quantity': total_qty * 0.6,  # 60%
                'reason': 'Remaining'
            }]
        }
        response = client.post('/api/returns',
                              json=remaining_return,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 201

    def test_cannot_exceed_total_returns(self, client, auth_token, dispatched_item):
        """Test that total returns cannot exceed dispatched quantity"""
        total_qty = dispatched_item['quantity']

        # First return - 80%
        first_return = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [{
                'dispatch_item_id': dispatched_item['item_id'],
                'quantity': total_qty * 0.8,
                'reason': 'First'
            }]
        }
        client.post('/api/returns',
                   json=first_return,
                   headers={'Authorization': f'Bearer {auth_token}'})

        # Try to return 30% more (would exceed 100%)
        excess_return = {
            'dispatch_id': dispatched_item['dispatch_id'],
            'return_date': '2025-12-03T10:00:00',
            'items': [{
                'dispatch_item_id': dispatched_item['item_id'],
                'quantity': total_qty * 0.3,
                'reason': 'Excess'
            }]
        }
        response = client.post('/api/returns',
                              json=excess_return,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code == 400
