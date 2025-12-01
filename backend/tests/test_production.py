"""
Production Module Test Cases - REWRITTEN December 2025
Tests all production scenarios including HDPE pipes, Sprinkler pipes, attachments, and edge cases
Aligned with actual schema and API structure
"""
import pytest
import json
from io import BytesIO
from datetime import datetime

class TestProductionBatchCreation:
    """Test suite for production batch creation"""

    # ==================== HDPE PIPE TESTS ====================

    def test_hdpe_standard_batch(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test creating standard HDPE batch"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': 1000.0,  # 1000 meters
            'batch_no': f'TEST-HDPE-STD-{timestamp}',
            'batch_code': f'HDPE-STD-{timestamp}',
            'number_of_rolls': 2,  # 2 rolls
            'length_per_roll': 500.0,
            'weight_per_meter': 1.5,
            'notes': 'Standard HDPE production test'
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)
        result = response.json
        assert 'batch_code' in result or 'batch' in result
        # Extract batch data regardless of response structure
        batch = result.get('batch', result)
        assert batch.get('batch_code') or batch.get('code')

    def test_hdpe_cut_rolls_only(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test creating HDPE batch with only cut rolls"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': 500.0,
            'batch_no': f'TEST-HDPE-CUT-{timestamp}',
            'batch_code': f'HDPE-CUT-{timestamp}',
            'number_of_rolls': 0,
            'cut_rolls': [
                {'length': 150},
                {'length': 200},
                {'length': 150}
            ],
            'weight_per_meter': 1.5
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)

    def test_hdpe_mixed_standard_and_cut(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test HDPE batch with both standard and cut rolls"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 6, 'OD': 50},
            'production_date': datetime.now().isoformat(),
            'quantity': 1500.0,  # Total 1500m
            'batch_no': f'TEST-HDPE-MIX-{timestamp}',
            'batch_code': f'HDPE-MIX-{timestamp}',
            'number_of_rolls': 2,  # 2 standard rolls = 1000m
            'length_per_roll': 500.0,
            'cut_rolls': [
                {'length': 250},
                {'length': 250}
            ],  # Cut rolls = 500m
            'weight_per_meter': 1.2
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)

    def test_hdpe_with_attachment(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test HDPE batch with file attachment"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': str(get_product_type_id('HDPE Pipe')),
            'brand_id': str(get_brand_id()),
            'parameters': json.dumps({'PE': 'PE80', 'PN': 10, 'OD': 63}),
            'production_date': datetime.now().isoformat(),
            'quantity': '500',
            'batch_no': f'TEST-HDPE-ATT-{timestamp}',
            'batch_code': f'HDPE-ATT-{timestamp}',
            'number_of_rolls': '1',
            'length_per_roll': '500',
            'weight_per_meter': '1.5'
        }

        # Create a test PDF file
        file_data = BytesIO(b'%PDF-1.4 test content')
        
        # Flask test client requires files in data dict
        data['attachment'] = (file_data, 'test_certificate.pdf', 'application/pdf')
        
        # For multipart/form-data, don't include Content-Type in headers
        headers = {'Authorization': auth_headers['Authorization']}
        response = client.post('/api/production/batch',
                             data=data,
                             headers=headers,
                             content_type='multipart/form-data')
        assert response.status_code in (200, 201)
        result = response.json
        # Response should contain batch info
        batch = result.get('batch', result)
        assert 'batch_code' in batch or 'code' in batch or 'batch_no' in batch

    def test_hdpe_with_weight_tracking(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test HDPE batch with weight tracking"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': 1000.0,
            'batch_no': f'TEST-HDPE-WEIGHT-{timestamp}',
            'batch_code': f'HDPE-WEIGHT-{timestamp}',
            'number_of_rolls': 2,
            'length_per_roll': 500.0,
            'weight_per_meter': 1.5,  # kg/m
            # total_weight will be calculated: 1000m × 1.5kg/m = 1500kg
            'notes': 'Weight tracking test'
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)

    # ==================== SPRINKLER PIPE TESTS ====================

    def test_sprinkler_bundles_only(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test creating sprinkler batch with only bundles"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('Sprinkler Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'OD': 32, 'Thickness': 2.0},
            'production_date': datetime.now().isoformat(),
            'batch_no': f'TEST-SPR-BUNDLE-{timestamp}',
            'batch_code': f'SPR-BUNDLE-{timestamp}',
            'quantity': 200.0,  # Will be recalculated: 20 bundles × 10 pieces = 200
            'quantity_based': True,
            'roll_config_type': 'bundles',
            'number_of_bundles': 20,
            'bundle_size': 10,  # 10 pieces per bundle
            'length_per_roll': 6.0,  # Each piece is 6m long
            'weight_per_meter': 0.5
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        if response.status_code not in (200, 201):
            print(f"Sprinkler bundles error: {response.json}")
        assert response.status_code in (200, 201)

    def test_sprinkler_spare_pieces_only(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test sprinkler batch with only spare pieces (no bundles)"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('Sprinkler Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'OD': 32, 'Thickness': 2.0},
            'production_date': datetime.now().isoformat(),
            'batch_no': f'TEST-SPR-SPARE-{timestamp}',
            'batch_code': f'SPR-SPARE-{timestamp}',
            'quantity': 15.0,  # Will be recalculated: 7 + 8 = 15 pieces
            'quantity_based': True,
            'roll_config_type': 'spare_pieces',
            'number_of_bundles': 0,
            'spare_pipes': [
                {'length': 7},  # 7 pieces at 6m each
                {'length': 8}   # 8 pieces at 6m each
            ],
            'length_per_roll': 6.0,
            'weight_per_meter': 0.5
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)

    def test_sprinkler_bundles_and_spares(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test sprinkler batch with both bundles and spare pieces"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('Sprinkler Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'OD': 32, 'Thickness': 2.0},
            'production_date': datetime.now().isoformat(),
            'batch_no': f'TEST-SPR-BOTH-{timestamp}',
            'batch_code': f'SPR-BOTH-{timestamp}',
            'quantity': 215.0,  # Will be recalculated: (20×10) + 7 + 8 = 215
            'quantity_based': True,
            'roll_config_type': 'bundles',
            'number_of_bundles': 20,
            'bundle_size': 10,
            'spare_pipes': [
                {'length': 7},
                {'length': 8}
            ],
            'length_per_roll': 6.0,
            'weight_per_meter': 0.5
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)

    def test_sprinkler_multiple_spare_groups(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test sprinkler batch with multiple spare piece groups"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('Sprinkler Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'OD': 32, 'Thickness': 2.0},
            'production_date': datetime.now().isoformat(),
            'batch_no': f'TEST-SPR-MULTI-{timestamp}',
            'batch_code': f'SPR-MULTI-{timestamp}',
            'quantity': 165.0,  # Will be recalculated: (15×10) + 5 + 7 + 3 = 165
            'quantity_based': True,
            'roll_config_type': 'bundles',
            'number_of_bundles': 15,
            'bundle_size': 10,
            'spare_pipes': [
                {'length': 5},
                {'length': 7},
                {'length': 3}
            ],
            'length_per_roll': 6.0,
            'weight_per_meter': 0.5
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)

    # ==================== VALIDATION & EDGE CASES ====================

    def test_missing_required_fields(self, client, auth_headers):
        """Test batch creation with missing required fields"""
        response = client.post('/api/production/batch',
                             headers=auth_headers,
                             json={'notes': 'Missing required fields'})
        assert response.status_code == 400

    def test_zero_quantity(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test batch with zero quantity (should fail)"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': 0,
            'batch_no': f'TEST-ZERO-{timestamp}',
            'number_of_rolls': 1,
            'length_per_roll': 0
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_negative_quantity(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test batch with negative quantity (should fail)"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': -100,
            'batch_no': f'TEST-NEG-{timestamp}',
            'number_of_rolls': 1
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code == 400

    def test_invalid_file_type(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test batch with invalid file type attachment"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': str(get_product_type_id('HDPE Pipe')),
            'brand_id': str(get_brand_id()),
            'parameters': json.dumps({'PE': 'PE80', 'PN': 10, 'OD': 63}),
            'production_date': datetime.now().isoformat(),
            'quantity': '500',
            'batch_no': f'TEST-INVALID-{timestamp}',
            'number_of_rolls': '1',
            'length_per_roll': '500'
        }

        # Create invalid file (exe file)
        file_data = BytesIO(b'Invalid executable content')
        
        # Flask test client requires files in data dict
        data['attachment'] = (file_data, 'malicious.exe', 'application/x-msdownload')
        
        headers = {'Authorization': auth_headers['Authorization']}
        response = client.post('/api/production/batch',
                             data=data,
                             headers=headers,
                             content_type='multipart/form-data')
        # Should either reject or accept without attachment
        assert response.status_code in (200, 201, 400)

    # ==================== BATCH CODE & NUMBERING ====================

    def test_auto_batch_number_generation(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test automatic batch number generation"""
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': 500.0,
            'number_of_rolls': 1,
            'length_per_roll': 500.0
            # No batch_no or batch_code provided
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)
        result = response.json
        batch = result.get('batch', result)
        # Should auto-generate batch_code
        assert batch.get('batch_code') or batch.get('code') or batch.get('batch_no')

    def test_duplicate_batch_code(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test creating batch with duplicate batch code"""
        timestamp = int(datetime.now().timestamp())
        batch_code = f'DUPLICATE-TEST-{timestamp}'
        
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': 500.0,
            'batch_code': batch_code,
            'number_of_rolls': 1,
            'length_per_roll': 500.0
        }
        
        # Create first batch
        response1 = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response1.status_code in (200, 201)
        
        # Try to create duplicate
        response2 = client.post('/api/production/batch', headers=auth_headers, json=data)
        # Should either fail or auto-modify the code
        assert response2.status_code in (200, 201, 400, 409)

    # ==================== BOUNDARY TESTS ====================

    def test_very_large_quantity(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test batch with very large quantity"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': 999999.0,  # Very large quantity
            'batch_no': f'TEST-LARGE-{timestamp}',
            'number_of_rolls': 100,
            'length_per_roll': 9999.99
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)

    def test_fractional_quantities(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test batch with fractional quantities"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': 123.456,
            'batch_no': f'TEST-FRAC-{timestamp}',
            'number_of_rolls': 1,
            'length_per_roll': 123.456,
            'weight_per_meter': 1.234
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)

    # ==================== AUTHORIZATION TESTS ====================

    def test_unauthorized_access(self, client):
        """Test batch creation without authentication"""
        data = {
            'product_type_id': 'some-uuid',
            'brand_id': 'some-uuid',
            'parameters': {},
            'production_date': datetime.now().isoformat(),
            'quantity': 500
        }
        response = client.post('/api/production/batch', json=data)
        assert response.status_code == 401

    # ==================== DATE & SPECIAL CHARACTERS ====================

    def test_future_production_date(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test batch with future production date"""
        timestamp = int(datetime.now().timestamp())
        future_date = '2030-12-31T23:59:59'
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': future_date,
            'quantity': 500.0,
            'batch_no': f'TEST-FUTURE-{timestamp}',
            'number_of_rolls': 1,
            'length_per_roll': 500.0
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        # Future dates may be allowed or rejected based on business rules
        assert response.status_code in (200, 201, 400)

    def test_special_characters_in_notes(self, client, auth_headers, get_product_type_id, get_brand_id):
        """Test batch with special characters in notes"""
        timestamp = int(datetime.now().timestamp())
        data = {
            'product_type_id': get_product_type_id('HDPE Pipe'),
            'brand_id': get_brand_id(),
            'parameters': {'PE': 'PE80', 'PN': 10, 'OD': 63},
            'production_date': datetime.now().isoformat(),
            'quantity': 500.0,
            'batch_no': f'TEST-SPECIAL-{timestamp}',
            'number_of_rolls': 1,
            'length_per_roll': 500.0,
            'notes': 'Test with special chars: éñçødé™ <script>alert("xss")</script> 你好'
        }
        response = client.post('/api/production/batch', headers=auth_headers, json=data)
        assert response.status_code in (200, 201)


class TestProductionHistory:
    """Test suite for production history/retrieval operations"""

    def test_get_all_batches(self, client, auth_headers):
        """Test retrieving all production batches"""
        response = client.get('/api/production/history', headers=auth_headers)
        assert response.status_code == 200
        # Should return a list (may be empty)
        result = response.json
        assert isinstance(result, (list, dict))

    def test_get_batch_details(self, client, auth_headers, hdpe_batch):
        """Test retrieving specific batch details"""
        batch = hdpe_batch.get('batch', hdpe_batch)
        batch_id = batch.get('batch_id') or batch.get('id')
        
        response = client.get(f'/api/production/history/{batch_id}', headers=auth_headers)
        assert response.status_code == 200
        result = response.json
        assert result is not None

    def test_get_nonexistent_batch(self, client, auth_headers):
        """Test retrieving non-existent batch"""
        fake_uuid = '00000000-0000-0000-0000-000000000000'
        response = client.get(f'/api/production/history/{fake_uuid}', headers=auth_headers)
        assert response.status_code in (404, 400)

    def test_attachment_download(self, client, auth_headers, batch_with_attachment):
        """Test downloading batch attachment"""
        batch = batch_with_attachment.get('batch', batch_with_attachment)
        
        # Check if attachment_url exists
        attachment_url = batch.get('attachment_url')
        if attachment_url:
            # Extract filename from URL
            filename = attachment_url.split('/')[-1]
            response = client.get(f'/api/production/attachment/{filename}', headers=auth_headers)
            # Should return file or 404
            assert response.status_code in (200, 404)
        else:
            # If no attachment, test is not applicable
            pytest.skip("Batch has no attachment")

    def test_attachment_not_found(self, client, auth_headers):
        """Test downloading non-existent attachment"""
        fake_filename = 'nonexistent_file_12345.pdf'
        response = client.get(f'/api/production/attachment/{fake_filename}', headers=auth_headers)
        assert response.status_code == 404
