#!/bin/bash

# Tarko Stock Flow - Quick Deploy Script
# This script simplifies the deployment process

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Tarko Stock Flow Deployment Script${NC}"
echo ""

# Check if ansible is installed
if ! command -v ansible-playbook &> /dev/null; then
    echo -e "${RED}❌ Ansible is not installed${NC}"
    echo "Install with: pip install ansible"
    exit 1
fi

# Check if inventory exists
if [ ! -f "$SCRIPT_DIR/inventory.ini" ]; then
    echo -e "${RED}❌ Inventory file not found: $SCRIPT_DIR/inventory.ini${NC}"
    exit 1
fi

# Parse command line arguments
ENVIRONMENT="production"
USE_VAULT="no"
VAULT_PASS_FILE=""
EXTRA_ARGS=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -v|--vault)
            USE_VAULT="yes"
            shift
            ;;
        --vault-password-file)
            VAULT_PASS_FILE="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -e, --environment ENV      Target environment (default: production)"
            echo "  -v, --vault                Use vault password (will prompt)"
            echo "  --vault-password-file FILE Use vault password file"
            echo "  -h, --help                 Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                    # Deploy to production"
            echo "  $0 -e staging                         # Deploy to staging"
            echo "  $0 -v                                 # Deploy with vault password prompt"
            echo "  $0 --vault-password-file .vault_pass  # Deploy with vault password file"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Build ansible-playbook command
CMD="ansible-playbook -i $SCRIPT_DIR/inventory.ini $SCRIPT_DIR/deploy.yml --limit $ENVIRONMENT"

if [ "$USE_VAULT" = "yes" ]; then
    CMD="$CMD --ask-vault-pass"
elif [ -n "$VAULT_PASS_FILE" ]; then
    if [ ! -f "$VAULT_PASS_FILE" ]; then
        echo -e "${RED}❌ Vault password file not found: $VAULT_PASS_FILE${NC}"
        exit 1
    fi
    CMD="$CMD --vault-password-file $VAULT_PASS_FILE"
fi

# Test connection first
echo -e "${YELLOW}📡 Testing connection to $ENVIRONMENT...${NC}"
TEST_CMD="ansible -i $SCRIPT_DIR/inventory.ini $ENVIRONMENT -m ping"
if [ "$USE_VAULT" = "yes" ]; then
    TEST_CMD="$TEST_CMD --ask-vault-pass"
elif [ -n "$VAULT_PASS_FILE" ]; then
    TEST_CMD="$TEST_CMD --vault-password-file $VAULT_PASS_FILE"
fi

if ! eval $TEST_CMD; then
    echo -e "${RED}❌ Connection test failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Connection successful${NC}"
echo ""

# Confirm deployment
echo -e "${YELLOW}⚠️  About to deploy to: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Command: $CMD${NC}"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Run deployment
echo ""
echo -e "${GREEN}🚀 Starting deployment...${NC}"
echo ""

if eval $CMD; then
    echo ""
    echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
    echo ""
    echo "Services should be available at:"
    echo "  Backend:  http://YOUR_SERVER:5500"
    echo "  Frontend: http://YOUR_SERVER:80"
else
    echo ""
    echo -e "${RED}❌ Deployment failed${NC}"
    echo "Check the output above for errors"
    exit 1
fi
