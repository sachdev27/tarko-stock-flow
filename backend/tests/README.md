# Test Suite Quick Start Guide

## Setup

### 1. Install Test Dependencies
```bash
cd backend
pip install -r tests/requirements-test.txt
```

### 2. Setup Test Database
```bash
# Create test database
createdb tarko_test

# Apply schema
psql tarko_test < schema.sql

# Or if using migrations
python scripts/run_migrations.py --database tarko_test
```

### 3. Configure Environment
```bash
# Create test environment file
cp .env .env.test

# Edit .env.test with test database credentials
export TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/tarko_test"
```

## Running Tests

### Quick Test Commands

```bash
# Run all tests
pytest tests/

# Run with coverage report
pytest tests/ --cov=. --cov-report=html

# Run specific module
pytest tests/test_production.py -v

# Run specific test class
pytest tests/test_production.py::TestProductionBatchCreation -v

# Run specific test
pytest tests/test_production.py::TestProductionBatchCreation::test_hdpe_standard_rolls_only -v

# Run tests matching pattern
pytest tests/ -k "hdpe" -v

# Run in parallel (faster)
pytest tests/ -n auto

# Stop on first failure
pytest tests/ -x

# Show detailed output
pytest tests/ -vv

# Run with HTML report
pytest tests/ --html=test-report.html --self-contained-html
```

### Test Categories

```bash
# Edge cases
pytest tests/ -k "edge" -v

# Validation tests
pytest tests/ -k "validation" -v

# Integration tests
pytest tests/test_integration.py -v

# 🆕 Extreme workflow tests (Phase 9X)
pytest tests/test_extreme_workflows.py -v

# Production tests only
pytest tests/test_production.py -v

# Dispatch tests only
pytest tests/test_dispatch.py -v

# Return tests only
pytest tests/test_returns.py -v

# Scrap tests only
pytest tests/test_scrap.py -v
```

### 🆕 Extreme Workflow Test Phases

```bash
# Run all extreme workflow tests
pytest tests/test_extreme_workflows.py -v -s

# Phase 1: Setup inventory (4 batches)
pytest tests/test_extreme_workflows.py::TestExtremeWorkflowSetup -v

# Phase 2: Cut operations
pytest tests/test_extreme_workflows.py::TestStep1CutRolls -v

# Phase 3: Split operations
pytest tests/test_extreme_workflows.py::TestStep2SplitBundles -v

# Phase 4: Mixed dispatch (all 4 types)
pytest tests/test_extreme_workflows.py::TestStep3MixedDispatch -v

# Phase 5: Mixed return
pytest tests/test_extreme_workflows.py::TestStep4MixedReturn -v

# Phase 6: Scrap operations + validation
pytest tests/test_extreme_workflows.py::TestStep5ScrapOperations -v

# Phase 7: Revert dispatch
pytest tests/test_extreme_workflows.py::TestStep6RevertDispatch -v

# Phase 8: Final reconciliation
pytest tests/test_extreme_workflows.py::TestFinalStateReconciliation -v
```

### Coverage Reports

```bash
# Generate HTML coverage report
pytest tests/ --cov=. --cov-report=html
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux

# Terminal coverage report
pytest tests/ --cov=. --cov-report=term-missing

# Coverage for specific module
pytest tests/test_production.py --cov=routes.production_routes --cov-report=term
```

## Test Structure

```
backend/tests/
├── __init__.py                    # Test package init
├── conftest.py                    # Shared fixtures
├── test_production.py             # Production module tests
├── test_dispatch.py               # Dispatch module tests
├── test_returns.py                # Return module tests
├── test_scrap.py                  # Scrap module tests
├── test_integration.py            # Complex workflow tests
├── test_extreme_workflows.py      # 🆕 Extreme multi-step workflows (Phase 9X)
├── TEST_PLAN.md                   # Comprehensive test documentation
├── EXTREME_WORKFLOW_TESTS.md      # 🆕 Extreme workflow test documentation
└── requirements-test.txt          # Test dependencies
```

### 🆕 Extreme Workflow Tests
**New comprehensive test suite** for testing all possible combinations:
- **Mixed dispatches** with all 4 item types (rolls + cuts + bundles + spares)
- **Mixed returns** across categories (HDPE + Sprinkler)
- **Scrap validation** ensuring single category + single type rules
- **Business rule enforcement** with validation tests

See `EXTREME_WORKFLOW_TESTS.md` for detailed documentation.

## Writing New Tests

### 1. Basic Test Template
```python
def test_my_feature(client, auth_token):
    """Test description"""
    # Arrange
    data = {'key': 'value'}

    # Act
    response = client.post('/api/endpoint',
                          json=data,
                          headers={'Authorization': f'Bearer {auth_token}'})

    # Assert
    assert response.status_code == 201
    assert 'expected_key' in response.json()
```

### 2. Using Fixtures
```python
def test_with_fixtures(client, auth_token, hdpe_batch):
    """Test using pre-created batch"""
    response = client.get(f'/api/batch/{hdpe_batch["batch_id"]}',
                         headers={'Authorization': f'Bearer {auth_token}'})
    assert response.status_code == 200
```

### 3. Testing Errors
```python
def test_validation_error(client, auth_token):
    """Test that validation catches errors"""
    data = {'invalid': 'data'}
    response = client.post('/api/endpoint',
                          json=data,
                          headers={'Authorization': f'Bearer {auth_token}'})
    assert response.status_code == 400
    assert 'error' in response.json()
```

## Available Fixtures

### Authentication
- `client` - Test client
- `auth_token` - JWT token for authenticated requests
- `db_connection` - Database connection

### Production
- `hdpe_batch` - Standard HDPE batch
- `hdpe_batch_with_cuts` - HDPE batch with cut rolls
- `sprinkler_batch` - Sprinkler batch with bundles and spares
- `hdpe_batch_1`, `hdpe_batch_2` - Multiple batches
- `batch_with_attachment` - Batch with file attachment

### Dispatch
- `dispatched_item` - Simple dispatched item
- `multi_item_dispatch` - Dispatch with multiple items
- `mixed_batch_dispatch` - Dispatch from multiple batches
- `cancelled_dispatch` - Cancelled dispatch
- `hdpe_dispatch` - HDPE specific dispatch
- `sprinkler_dispatch` - Sprinkler specific dispatch
- `cut_roll_dispatch` - Dispatch from cut roll

### Returns
- `completed_return` - Full return
- `partial_return` - Partial return
- `reverted_return` - Reverted return
- `sample_return` - Generic return

### Scrap
- `sample_scrap` - Generic scrap record

## Troubleshooting

### Database Connection Issues
```bash
# Check if test database exists
psql -l | grep tarko_test

# Recreate test database
dropdb tarko_test
createdb tarko_test
psql tarko_test < schema.sql
```

### Permission Issues
```bash
# Grant permissions to test user
psql tarko_test -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO test_user;"
psql tarko_test -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO test_user;"
```

### Import Errors
```bash
# Ensure backend is in Python path
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Or add to conftest.py (already done)
```

### Test Isolation Issues
```bash
# Run tests with fresh database
pytest tests/ --create-db

# Clear test cache
pytest tests/ --cache-clear
```

### Slow Tests
```bash
# Run in parallel
pytest tests/ -n auto

# Profile slow tests
pytest tests/ --durations=10
```

## Continuous Integration

### GitHub Actions Example
```yaml
name: Run Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_DB: tarko_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -r backend/requirements.txt
          pip install -r backend/tests/requirements-test.txt

      - name: Setup database
        run: |
          psql -h localhost -U test -d tarko_test < backend/schema.sql
        env:
          PGPASSWORD: test

      - name: Run tests
        run: |
          pytest backend/tests/ --cov=backend --cov-report=xml
        env:
          TEST_DATABASE_URL: postgresql://test:test@localhost:5432/tarko_test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage.xml
```

## Best Practices

### 1. Test Naming
- Use descriptive names: `test_dispatch_exceeds_stock`
- Follow pattern: `test_<what>_<condition>_<expected>`
- Group related tests in classes

### 2. Assertions
- Use specific assertions: `assert x == 5` not `assert x`
- Check response status codes
- Verify response data structure
- Check database state when needed

### 3. Test Data
- Use fixtures for reusable data
- Don't hardcode IDs
- Clean up after tests
- Use realistic data

### 4. Error Testing
- Test both success and failure paths
- Verify error messages
- Check appropriate status codes
- Test edge cases

### 5. Performance
- Keep tests fast
- Use transactions for rollback
- Run heavy tests separately
- Use parallel execution

## Common Issues and Solutions

### Issue: Tests pass individually but fail together
**Solution**: Check for test isolation issues, ensure proper cleanup

### Issue: Intermittent failures
**Solution**: Look for race conditions, use transactions properly

### Issue: Slow test suite
**Solution**: Use parallel execution, optimize database queries, mock external services

### Issue: Database state pollution
**Solution**: Use transaction rollback, ensure fixtures clean up properly

## Getting Help

1. Check TEST_PLAN.md for comprehensive documentation
2. Review conftest.py for available fixtures
3. Look at existing tests for patterns
4. Run tests with `-vv` for detailed output
5. Use `pytest --fixtures` to see all available fixtures

## Coverage Goals

- **Overall**: > 85%
- **Critical Paths**: 100%
- **Edge Cases**: 100%
- **Integration Tests**: > 80%

## Performance Benchmarks

- Full test suite: < 5 minutes
- Unit tests: < 2 minutes
- Integration tests: < 3 minutes
- Individual module: < 30 seconds

## Next Steps

After running tests successfully:
1. Review coverage report
2. Identify untested paths
3. Add missing test cases
4. Update documentation
5. Setup CI/CD pipeline
