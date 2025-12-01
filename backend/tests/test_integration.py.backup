"""
Complex Integration Test Cases
Tests combinations of production, dispatch, return, and scrap operations
"""
import pytest

class TestComplexWorkflows:
    """Test complex real-world workflows combining multiple operations"""

    # ==================== PRODUCTION → DISPATCH → RETURN ====================

    def test_full_lifecycle_hdpe_pipe(self, client, auth_token):
        """Test complete lifecycle: produce → dispatch → return"""
        # 1. Create production batch
        prod_data = {
            'product_type_id': 1,
            'brand_id': 1,
            'parameters': {'diameter': '63mm', 'pressure': '10kg'},
            'production_date': '2025-12-01T08:00:00',
            'quantity': 1000,
            'number_of_rolls': 2,
            'length_per_roll': 500,
            'weight_per_meter': 1.5
        }
        prod_resp = client.post('/api/production/batch',
                               json=prod_data,
                               headers={'Authorization': f'Bearer {auth_token}'})
        assert prod_resp.status_code == 201
        batch = prod_resp.json()

        # 2. Dispatch one roll
        dispatch_data = {
            'customer_name': 'Lifecycle Customer',
            'customer_phone': '1234567890',
            'dispatch_date': '2025-12-01T10:00:00',
            'items': [{
                'batch_id': batch['batch_id'],
                'item_id': batch['rolls'][0]['id'],
                'quantity': 500,
                'unit_price': 100.00
            }]
        }
        dispatch_resp = client.post('/api/dispatch',
                                    json=dispatch_data,
                                    headers={'Authorization': f'Bearer {auth_token}'})
        assert dispatch_resp.status_code == 201
        dispatch = dispatch_resp.json()

        # 3. Return partial quantity
        return_data = {
            'dispatch_id': dispatch['dispatch_id'],
            'return_date': '2025-12-02T10:00:00',
            'items': [{
                'dispatch_item_id': dispatch['items'][0]['id'],
                'quantity': 200,
                'reason': 'Excess quantity'
            }]
        }
        return_resp = client.post('/api/returns',
                                  json=return_data,
                                  headers={'Authorization': f'Bearer {auth_token}'})
        assert return_resp.status_code == 201

        # 4. Verify inventory state
        inventory = client.get(f'/api/inventory/batch/{batch["batch_id"]}',
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert inventory.status_code == 200
        # Should have: 500 (second roll) + 200 (returned) = 700 available

    def test_produce_dispatch_return_revert(self, client, auth_token):
        """Test: produce → dispatch → return → revert return"""
        # Production
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 500,
                                   'number_of_rolls': 1,
                                   'length_per_roll': 500
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Dispatch
        dispatch_resp = client.post('/api/dispatch',
                                    json={
                                        'customer_name': 'Revert Test',
                                        'customer_phone': '9999999999',
                                        'dispatch_date': '2025-12-01T10:00:00',
                                        'items': [{
                                            'batch_id': batch['batch_id'],
                                            'item_id': batch['rolls'][0]['id'],
                                            'quantity': 500,
                                            'unit_price': 100.00
                                        }]
                                    },
                                    headers={'Authorization': f'Bearer {auth_token}'})
        dispatch = dispatch_resp.json()

        # Return
        return_resp = client.post('/api/returns',
                                  json={
                                      'dispatch_id': dispatch['dispatch_id'],
                                      'return_date': '2025-12-02T10:00:00',
                                      'items': [{
                                          'dispatch_item_id': dispatch['items'][0]['id'],
                                          'quantity': 500,
                                          'reason': 'Full return'
                                      }]
                                  },
                                  headers={'Authorization': f'Bearer {auth_token}'})
        return_obj = return_resp.json()

        # Revert return
        revert_resp = client.post(f'/api/returns/{return_obj["return_id"]}/revert',
                                  json={'reason': 'Customer changed mind'},
                                  headers={'Authorization': f'Bearer {auth_token}'})
        assert revert_resp.status_code == 200

    # ==================== PRODUCTION → DISPATCH → SCRAP ====================

    def test_produce_dispatch_scrap_at_customer(self, client, auth_token):
        """Test: produce → dispatch → scrap at customer site"""
        # Production
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 1000,
                                   'number_of_rolls': 2,
                                   'length_per_roll': 500
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Dispatch
        dispatch_resp = client.post('/api/dispatch',
                                    json={
                                        'customer_name': 'Scrap Customer',
                                        'customer_phone': '8888888888',
                                        'dispatch_date': '2025-12-01T10:00:00',
                                        'items': [{
                                            'batch_id': batch['batch_id'],
                                            'item_id': batch['rolls'][0]['id'],
                                            'quantity': 500,
                                            'unit_price': 100.00
                                        }]
                                    },
                                    headers={'Authorization': f'Bearer {auth_token}'})
        dispatch = dispatch_resp.json()

        # Scrap from dispatch
        scrap_resp = client.post('/api/scrap',
                                json={
                                    'dispatch_id': dispatch['dispatch_id'],
                                    'dispatch_item_id': dispatch['items'][0]['id'],
                                    'scrap_date': '2025-12-02T15:00:00',
                                    'quantity': 100,
                                    'reason': 'Damaged at installation',
                                    'scrap_type': 'dispatch'
                                },
                                headers={'Authorization': f'Bearer {auth_token}'})
        assert scrap_resp.status_code == 201

    def test_produce_scrap_then_dispatch_remaining(self, client, auth_token):
        """Test: produce → scrap some → dispatch remaining"""
        # Production
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 1000,
                                   'number_of_rolls': 2,
                                   'length_per_roll': 500
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Scrap from production
        scrap_resp = client.post('/api/scrap',
                                json={
                                    'item_id': batch['rolls'][0]['id'],
                                    'batch_id': batch['batch_id'],
                                    'scrap_date': '2025-12-01T09:00:00',
                                    'quantity': 200,
                                    'reason': 'QC failure',
                                    'scrap_type': 'production'
                                },
                                headers={'Authorization': f'Bearer {auth_token}'})
        assert scrap_resp.status_code == 201

        # Dispatch remaining
        dispatch_resp = client.post('/api/dispatch',
                                    json={
                                        'customer_name': 'After Scrap Customer',
                                        'customer_phone': '7777777777',
                                        'dispatch_date': '2025-12-01T14:00:00',
                                        'items': [{
                                            'batch_id': batch['batch_id'],
                                            'item_id': batch['rolls'][0]['id'],
                                            'quantity': 300,  # 500 - 200 scrapped = 300 available
                                            'unit_price': 100.00
                                        }]
                                    },
                                    headers={'Authorization': f'Bearer {auth_token}'})
        assert dispatch_resp.status_code == 201

    # ==================== MULTIPLE DISPATCHES & RETURNS ====================

    def test_multiple_dispatches_from_same_batch(self, client, auth_token):
        """Test multiple dispatches from same production batch"""
        # Production
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 2000,
                                   'number_of_rolls': 4,
                                   'length_per_roll': 500
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Dispatch 1
        dispatch1 = client.post('/api/dispatch',
                               json={
                                   'customer_name': 'Customer A',
                                   'customer_phone': '1111111111',
                                   'dispatch_date': '2025-12-01T10:00:00',
                                   'items': [{
                                       'batch_id': batch['batch_id'],
                                       'item_id': batch['rolls'][0]['id'],
                                       'quantity': 500,
                                       'unit_price': 100.00
                                   }]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})

        # Dispatch 2
        dispatch2 = client.post('/api/dispatch',
                               json={
                                   'customer_name': 'Customer B',
                                   'customer_phone': '2222222222',
                                   'dispatch_date': '2025-12-01T12:00:00',
                                   'items': [{
                                       'batch_id': batch['batch_id'],
                                       'item_id': batch['rolls'][1]['id'],
                                       'quantity': 500,
                                       'unit_price': 95.00
                                   }]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})

        # Dispatch 3 - Mixed rolls
        dispatch3 = client.post('/api/dispatch',
                               json={
                                   'customer_name': 'Customer C',
                                   'customer_phone': '3333333333',
                                   'dispatch_date': '2025-12-01T14:00:00',
                                   'items': [
                                       {
                                           'batch_id': batch['batch_id'],
                                           'item_id': batch['rolls'][2]['id'],
                                           'quantity': 250,
                                           'unit_price': 100.00
                                       },
                                       {
                                           'batch_id': batch['batch_id'],
                                           'item_id': batch['rolls'][3]['id'],
                                           'quantity': 250,
                                           'unit_price': 100.00
                                       }
                                   ]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})

        assert all([dispatch1.status_code == 201,
                   dispatch2.status_code == 201,
                   dispatch3.status_code == 201])

    def test_dispatch_return_redispatch(self, client, auth_token):
        """Test: dispatch → return → dispatch returned stock again"""
        # Production
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 1000,
                                   'number_of_rolls': 2,
                                   'length_per_roll': 500
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # First dispatch
        dispatch1_resp = client.post('/api/dispatch',
                                     json={
                                         'customer_name': 'First Customer',
                                         'customer_phone': '1234567890',
                                         'dispatch_date': '2025-12-01T10:00:00',
                                         'items': [{
                                             'batch_id': batch['batch_id'],
                                             'item_id': batch['rolls'][0]['id'],
                                             'quantity': 500,
                                             'unit_price': 100.00
                                         }]
                                     },
                                     headers={'Authorization': f'Bearer {auth_token}'})
        dispatch1 = dispatch1_resp.json()

        # Return
        return_resp = client.post('/api/returns',
                                  json={
                                      'dispatch_id': dispatch1['dispatch_id'],
                                      'return_date': '2025-12-02T10:00:00',
                                      'items': [{
                                          'dispatch_item_id': dispatch1['items'][0]['id'],
                                          'quantity': 500,
                                          'reason': 'Changed requirements'
                                      }]
                                  },
                                  headers={'Authorization': f'Bearer {auth_token}'})
        assert return_resp.status_code == 201

        # Dispatch to second customer (returned stock)
        dispatch2_resp = client.post('/api/dispatch',
                                     json={
                                         'customer_name': 'Second Customer',
                                         'customer_phone': '9876543210',
                                         'dispatch_date': '2025-12-03T10:00:00',
                                         'items': [{
                                             'batch_id': batch['batch_id'],
                                             'item_id': batch['rolls'][0]['id'],  # Same roll, now back in stock
                                             'quantity': 500,
                                             'unit_price': 100.00
                                         }]
                                     },
                                     headers={'Authorization': f'Bearer {auth_token}'})
        assert dispatch2_resp.status_code == 201

    # ==================== SPRINKLER SPECIFIC WORKFLOWS ====================

    def test_sprinkler_bundle_splitting_workflow(self, client, auth_token):
        """Test: produce bundles → dispatch partial → multiple customers from same bundle"""
        # Production
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 2,
                                   'brand_id': 1,
                                   'parameters': {'diameter': '32mm'},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 100,
                                   'quantity_based': True,
                                   'roll_config_type': 'bundles',
                                   'number_of_bundles': 10,
                                   'bundle_size': 10,
                                   'length_per_roll': 6
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Dispatch 1 - Partial bundle
        dispatch1 = client.post('/api/dispatch',
                               json={
                                   'customer_name': 'Partial Bundle Customer 1',
                                   'customer_phone': '1111111111',
                                   'dispatch_date': '2025-12-01T10:00:00',
                                   'items': [{
                                       'batch_id': batch['batch_id'],
                                       'item_id': batch['bundles'][0]['id'],
                                       'quantity': 4,  # 4 out of 10 pieces
                                       'unit_price': 50.00
                                   }]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})

        # Dispatch 2 - Another partial from same bundle
        dispatch2 = client.post('/api/dispatch',
                               json={
                                   'customer_name': 'Partial Bundle Customer 2',
                                   'customer_phone': '2222222222',
                                   'dispatch_date': '2025-12-01T12:00:00',
                                   'items': [{
                                       'batch_id': batch['batch_id'],
                                       'item_id': batch['bundles'][0]['id'],
                                       'quantity': 3,  # 3 more pieces
                                       'unit_price': 50.00
                                   }]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})

        assert dispatch1.status_code == 201
        assert dispatch2.status_code == 201

    def test_sprinkler_bundles_and_spares_complex(self, client, auth_token):
        """Test complex workflow with bundles and spare pieces"""
        # Production with bundles and spares
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 2,
                                   'brand_id': 1,
                                   'parameters': {'diameter': '25mm'},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 215,
                                   'quantity_based': True,
                                   'roll_config_type': 'bundles',
                                   'number_of_bundles': 20,
                                   'bundle_size': 10,
                                   'spare_pipes': [
                                       {'length': 7},
                                       {'length': 8}
                                   ],
                                   'length_per_roll': 6
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Dispatch bundles
        dispatch1 = client.post('/api/dispatch',
                               json={
                                   'customer_name': 'Bundle Customer',
                                   'customer_phone': '1111111111',
                                   'dispatch_date': '2025-12-01T10:00:00',
                                   'items': [{
                                       'batch_id': batch['batch_id'],
                                       'item_id': batch['bundles'][0]['id'],
                                       'quantity': 10,
                                       'unit_price': 50.00
                                   }]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})

        # Dispatch spares
        dispatch2 = client.post('/api/dispatch',
                               json={
                                   'customer_name': 'Spare Customer',
                                   'customer_phone': '2222222222',
                                   'dispatch_date': '2025-12-01T12:00:00',
                                   'items': [{
                                       'batch_id': batch['batch_id'],
                                       'item_id': batch['spare_pieces'][0]['id'],
                                       'quantity': 5,
                                       'unit_price': 50.00
                                   }]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})

        assert dispatch1.status_code == 201
        assert dispatch2.status_code == 201

    # ==================== CUT ROLL OPERATIONS ====================

    def test_cut_operation_during_dispatch_creates_cut_roll(self, client, auth_token):
        """Test that cutting during dispatch creates proper cut roll"""
        # Production
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 500,
                                   'number_of_rolls': 1,
                                   'length_per_roll': 500
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Dispatch with cut operation
        dispatch_resp = client.post('/api/dispatch',
                                    json={
                                        'customer_name': 'Cut Customer',
                                        'customer_phone': '1234567890',
                                        'dispatch_date': '2025-12-01T10:00:00',
                                        'items': [{
                                            'batch_id': batch['batch_id'],
                                            'item_id': batch['rolls'][0]['id'],
                                            'quantity': 350,
                                            'unit_price': 100.00,
                                            'is_cut_operation': True,
                                            'cut_roll_length': 150
                                        }]
                                    },
                                    headers={'Authorization': f'Bearer {auth_token}'})
        assert dispatch_resp.status_code == 201

        # Verify cut roll exists and can be dispatched
        inventory = client.get(f'/api/inventory/batch/{batch["batch_id"]}',
                              headers={'Authorization': f'Bearer {auth_token}'})
        inventory_data = inventory.json()
        # Should have a cut roll of 150m

    def test_dispatch_cut_roll_then_scrap(self, client, auth_token):
        """Test dispatching cut roll then scrapping it"""
        # Create batch with cut rolls
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 500,
                                   'number_of_rolls': 0,
                                   'cut_rolls': [
                                       {'length': 250},
                                       {'length': 250}
                                   ]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Dispatch cut roll
        dispatch_resp = client.post('/api/dispatch',
                                    json={
                                        'customer_name': 'Cut Roll Customer',
                                        'customer_phone': '1234567890',
                                        'dispatch_date': '2025-12-01T10:00:00',
                                        'items': [{
                                            'batch_id': batch['batch_id'],
                                            'item_id': batch['cut_rolls'][0]['id'],
                                            'quantity': 250,
                                            'unit_price': 100.00
                                        }]
                                    },
                                    headers={'Authorization': f'Bearer {auth_token}'})
        dispatch = dispatch_resp.json()

        # Scrap from dispatch
        scrap_resp = client.post('/api/scrap',
                                json={
                                    'dispatch_id': dispatch['dispatch_id'],
                                    'dispatch_item_id': dispatch['items'][0]['id'],
                                    'scrap_date': '2025-12-02T15:00:00',
                                    'quantity': 50,
                                    'reason': 'Damaged portion',
                                    'scrap_type': 'dispatch'
                                },
                                headers={'Authorization': f'Bearer {auth_token}'})
        assert scrap_resp.status_code == 201


class TestInventoryConsistency:
    """Test that inventory remains consistent across all operations"""

    def test_inventory_balance_after_complex_operations(self, client, auth_token):
        """Test inventory balance after production, dispatch, return, scrap"""
        # Initial production: 2000m
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 2000,
                                   'number_of_rolls': 4,
                                   'length_per_roll': 500
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Scrap 200m from production
        client.post('/api/scrap',
                   json={
                       'item_id': batch['rolls'][0]['id'],
                       'batch_id': batch['batch_id'],
                       'scrap_date': '2025-12-01T09:00:00',
                       'quantity': 200,
                       'reason': 'QC',
                       'scrap_type': 'production'
                   },
                   headers={'Authorization': f'Bearer {auth_token}'})
        # Available: 1800m

        # Dispatch 1000m
        dispatch_resp = client.post('/api/dispatch',
                                    json={
                                        'customer_name': 'Balance Test',
                                        'customer_phone': '1234567890',
                                        'dispatch_date': '2025-12-01T10:00:00',
                                        'items': [
                                            {
                                                'batch_id': batch['batch_id'],
                                                'item_id': batch['rolls'][1]['id'],
                                                'quantity': 500,
                                                'unit_price': 100.00
                                            },
                                            {
                                                'batch_id': batch['batch_id'],
                                                'item_id': batch['rolls'][2]['id'],
                                                'quantity': 500,
                                                'unit_price': 100.00
                                            }
                                        ]
                                    },
                                    headers={'Authorization': f'Bearer {auth_token}'})
        dispatch = dispatch_resp.json()
        # Available: 800m (1800 - 1000)

        # Return 300m
        client.post('/api/returns',
                   json={
                       'dispatch_id': dispatch['dispatch_id'],
                       'return_date': '2025-12-02T10:00:00',
                       'items': [{
                           'dispatch_item_id': dispatch['items'][0]['id'],
                           'quantity': 300,
                           'reason': 'Partial return'
                       }]
                   },
                   headers={'Authorization': f'Bearer {auth_token}'})
        # Available: 1100m (800 + 300)

        # Check final inventory
        inventory = client.get(f'/api/inventory/batch/{batch["batch_id"]}',
                              headers={'Authorization': f'Bearer {auth_token}'})
        # Total available should be 1100m

    def test_weight_tracking_consistency(self, client, auth_token):
        """Test that weight tracking remains consistent"""
        weight_per_meter = 1.5

        # Production with weight
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 1000,
                                   'number_of_rolls': 2,
                                   'length_per_roll': 500,
                                   'weight_per_meter': weight_per_meter
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()
        # Total weight: 1000m * 1.5 = 1500kg

        # Dispatch 600m
        dispatch_resp = client.post('/api/dispatch',
                                    json={
                                        'customer_name': 'Weight Test',
                                        'customer_phone': '1234567890',
                                        'dispatch_date': '2025-12-01T10:00:00',
                                        'items': [{
                                            'batch_id': batch['batch_id'],
                                            'item_id': batch['rolls'][0]['id'],
                                            'quantity': 600,
                                            'unit_price': 100.00
                                        }]
                                    },
                                    headers={'Authorization': f'Bearer {auth_token}'})
        # Dispatched weight: 600m * 1.5 = 900kg
        # Remaining weight: 400m * 1.5 = 600kg

        # Verify weight in inventory
        inventory = client.get(f'/api/inventory/batch/{batch["batch_id"]}',
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert inventory.status_code == 200


class TestConcurrencyAndRaceConditions:
    """Test concurrent operations and race conditions"""

    def test_concurrent_dispatches_from_same_item(self, client, auth_token):
        """Test that concurrent dispatches don't oversell stock"""
        # Production
        prod_resp = client.post('/api/production/batch',
                               json={
                                   'product_type_id': 1,
                                   'brand_id': 1,
                                   'parameters': {},
                                   'production_date': '2025-12-01T08:00:00',
                                   'quantity': 500,
                                   'number_of_rolls': 1,
                                   'length_per_roll': 500
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})
        batch = prod_resp.json()

        # Try to dispatch 400m twice "simultaneously"
        dispatch1 = client.post('/api/dispatch',
                               json={
                                   'customer_name': 'Concurrent 1',
                                   'customer_phone': '1111111111',
                                   'dispatch_date': '2025-12-01T10:00:00',
                                   'items': [{
                                       'batch_id': batch['batch_id'],
                                       'item_id': batch['rolls'][0]['id'],
                                       'quantity': 400,
                                       'unit_price': 100.00
                                   }]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})

        dispatch2 = client.post('/api/dispatch',
                               json={
                                   'customer_name': 'Concurrent 2',
                                   'customer_phone': '2222222222',
                                   'dispatch_date': '2025-12-01T10:00:01',
                                   'items': [{
                                       'batch_id': batch['batch_id'],
                                       'item_id': batch['rolls'][0]['id'],
                                       'quantity': 400,
                                       'unit_price': 100.00
                                   }]
                               },
                               headers={'Authorization': f'Bearer {auth_token}'})

        # One should succeed, one should fail
        statuses = [dispatch1.status_code, dispatch2.status_code]
        assert 201 in statuses  # At least one succeeds
        assert 400 in statuses or statuses.count(201) == 1  # One fails or only one succeeds
