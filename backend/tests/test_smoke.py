"""
Smoke tests to verify basic functionality after schema updates
"""
import pytest


class TestAuthentication:
    """Test authentication works"""
    
    def test_login_success(self, client):
        """Test successful login"""
        response = client.post('/api/auth/login', json={
            'email': 'test@test.com',
            'password': 'testpass123'
        })
        assert response.status_code == 200
        assert 'access_token' in response.json
        assert 'user' in response.json
    
    def test_login_wrong_password(self, client):
        """Test login with wrong password"""
        response = client.post('/api/auth/login', json={
            'email': 'test@test.com',
            'password': 'wrongpass'
        })
        assert response.status_code == 401


class TestBasicFixtures:
    """Test that basic fixtures work"""
    
    def test_auth_token_fixture(self, auth_token):
        """Test auth_token fixture"""
        assert auth_token is not None
        assert isinstance(auth_token, str)
        assert len(auth_token) > 10
    
    def test_auth_headers_fixture(self, auth_headers):
        """Test auth_headers fixture"""
        assert 'Authorization' in auth_headers
        assert auth_headers['Authorization'].startswith('Bearer ')
    
    def test_get_unit_id(self, get_unit_id):
        """Test get_unit_id helper"""
        unit_id = get_unit_id('m')
        assert unit_id is not None
    
    def test_get_brand_id(self, get_brand_id):
        """Test get_brand_id helper"""
        brand_id = get_brand_id()
        assert brand_id is not None
    
    def test_get_location_id(self, get_location_id):
        """Test get_location_id helper"""
        location_id = get_location_id()
        assert location_id is not None
    
    def test_get_product_type_id(self, get_product_type_id):
        """Test get_product_type_id helper"""
        product_type_id = get_product_type_id('HDPE Pipe')
        assert product_type_id is not None


class TestProductionBasic:
    """Basic production tests"""
    
    def test_create_hdpe_batch(self, hdpe_batch):
        """Test creating HDPE batch"""
        assert hdpe_batch is not None
        assert 'batch_id' in hdpe_batch or 'id' in hdpe_batch
