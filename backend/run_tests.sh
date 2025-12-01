#!/bin/bash
# Quick test runner script for Tarko Inventory System

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Tarko Inventory Test Suite${NC}"
echo "===================================="

# Check if virtual environment is activated
if [[ "$VIRTUAL_ENV" == "" ]]; then
    echo -e "${YELLOW}Activating virtual environment...${NC}"
    source venv/bin/activate
fi

# Get test command from argument or default to all tests
TEST_TARGET="${1:-tests/}"

case "$TEST_TARGET" in
    "production")
        echo -e "${GREEN}Running Production Tests...${NC}"
        ./venv/bin/pytest tests/test_production.py -v
        ;;
    "dispatch")
        echo -e "${GREEN}Running Dispatch Tests...${NC}"
        ./venv/bin/pytest tests/test_dispatch.py -v
        ;;
    "returns")
        echo -e "${GREEN}Running Return Tests...${NC}"
        ./venv/bin/pytest tests/test_returns.py -v
        ;;
    "scrap")
        echo -e "${GREEN}Running Scrap Tests...${NC}"
        ./venv/bin/pytest tests/test_scrap.py -v
        ;;
    "integration")
        echo -e "${GREEN}Running Integration Tests...${NC}"
        ./venv/bin/pytest tests/test_integration.py -v
        ;;
    "quick")
        echo -e "${GREEN}Running Quick Test Suite (no verbose)...${NC}"
        ./venv/bin/pytest tests/ -q
        ;;
    "coverage")
        echo -e "${GREEN}Running Tests with Coverage...${NC}"
        ./venv/bin/pytest tests/ --cov=. --cov-report=html --cov-report=term-missing
        echo -e "${YELLOW}Coverage report generated: htmlcov/index.html${NC}"
        ;;
    "parallel")
        echo -e "${GREEN}Running Tests in Parallel...${NC}"
        ./venv/bin/pytest tests/ -n auto -v
        ;;
    "failed")
        echo -e "${GREEN}Re-running Failed Tests...${NC}"
        ./venv/bin/pytest tests/ --lf -v
        ;;
    *)
        echo -e "${GREEN}Running All Tests...${NC}"
        ./venv/bin/pytest tests/ -v
        ;;
esac

# Capture exit code
EXIT_CODE=$?

# Display result
echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Tests Passed!${NC}"
else
    echo -e "${RED}✗ Tests Failed!${NC}"
fi

exit $EXIT_CODE
