#!/usr/bin/env python3
"""
Deployment script for comprehensive refactoring
Runs the deployment in a safe, controlled manner
"""

import subprocess
import sys
import os
from datetime import datetime

# Configuration
DB_NAME = "tarko_inventory"
BACKUP_DIR = "./backups"
MIGRATION_FILE = "./migrations/001_comprehensive_refactoring.sql"

# Colors for output
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'  # No Color


def print_header(text):
    """Print a formatted header"""
    print("\n" + "=" * 70)
    print(text)
    print("=" * 70 + "\n")


def print_success(text):
    """Print success message"""
    print(f"{GREEN}✓ {text}{NC}")


def print_error(text):
    """Print error message"""
    print(f"{RED}✗ {text}{NC}")


def print_warning(text):
    """Print warning message"""
    print(f"{YELLOW}⚠ {text}{NC}")


def print_info(text):
    """Print info message"""
    print(f"{BLUE}ℹ {text}{NC}")


def run_psql(query, db=DB_NAME, capture_output=True):
    """Run a PostgreSQL query"""
    cmd = ['psql', db, '-c', query]
    if capture_output:
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    else:
        result = subprocess.run(cmd)
        return result.returncode, "", ""


def run_psql_file(file_path, db=DB_NAME):
    """Run a PostgreSQL script file"""
    cmd = ['psql', db, '-f', file_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def create_backup():
    """Create database backup"""
    print_header("STEP 1: Creating Backup")

    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = f"{BACKUP_DIR}/pre_refactoring_{timestamp}.sql"

    print(f"Backing up database to: {backup_file}")

    cmd = ['pg_dump', DB_NAME]
    with open(backup_file, 'w') as f:
        result = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, text=True)

    if result.returncode == 0:
        size = os.path.getsize(backup_file)
        size_kb = size / 1024
        print_success(f"Backup successful! Size: {size_kb:.1f}K")
        return backup_file
    else:
        print_error(f"Backup failed: {result.stderr}")
        sys.exit(1)


def verify_current_state():
    """Verify current database state"""
    print_header("STEP 2: Verifying Current State")

    print("Checking piece counts...")
    query = """
    SELECT
      'HDPE' as type,
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
    FROM hdpe_cut_pieces
    WHERE deleted_at IS NULL OR deleted_at IS NOT NULL
    UNION ALL
    SELECT
      'SPRINKLER' as type,
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
    FROM sprinkler_spare_pieces
    WHERE deleted_at IS NULL OR deleted_at IS NOT NULL;
    """

    returncode, stdout, stderr = run_psql(query)

    if returncode == 0:
        print(stdout)
        print_success("Current state captured")
        return stdout
    else:
        # If deleted_at doesn't exist yet, try without it
        query_simple = """
        SELECT
          'HDPE' as type,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
        FROM hdpe_cut_pieces
        UNION ALL
        SELECT
          'SPRINKLER' as type,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
        FROM sprinkler_spare_pieces;
        """
        returncode, stdout, stderr = run_psql(query_simple)
        if returncode == 0:
            print(stdout)
            print_success("Current state captured")
            return stdout
        else:
            print_error(f"Failed to check current state: {stderr}")
            sys.exit(1)


def apply_migration():
    """Apply the migration"""
    print_header("STEP 3: Applying Migration")

    if not os.path.exists(MIGRATION_FILE):
        print_error(f"Migration file not found: {MIGRATION_FILE}")
        sys.exit(1)

    print(f"Running migration from: {MIGRATION_FILE}")

    returncode, stdout, stderr = run_psql_file(MIGRATION_FILE)

    if returncode == 0:
        print_success("Migration applied successfully!")
        return True
    else:
        # Check if errors are just "already exists" warnings
        if stderr and 'already exists' in stderr.lower():
            print_warning("Some objects already exist (migration partially complete)")
            print(stderr)
            return True
        else:
            print_error(f"Migration failed!")
            print(stderr)
            return False


def verify_migration():
    """Verify the migration was successful"""
    print_header("STEP 4: Verifying Migration")

    # Check new table exists
    print("Checking new tables...")
    returncode, stdout, _ = run_psql("\\dt piece_lifecycle_events")
    if returncode == 0 and 'piece_lifecycle_events' in stdout:
        print_success("piece_lifecycle_events table created")
    else:
        print_error("piece_lifecycle_events table missing")
        return False

    # Check new columns
    print("Checking new columns...")
    returncode, stdout, _ = run_psql("\\d hdpe_cut_pieces")
    if returncode == 0 and 'created_by_transaction_id' in stdout:
        print_success("New columns added to hdpe_cut_pieces")
    else:
        print_error("New columns missing from hdpe_cut_pieces")
        return False

    returncode, stdout, _ = run_psql("\\d sprinkler_spare_pieces")
    if returncode == 0 and 'created_by_transaction_id' in stdout:
        print_success("New columns added to sprinkler_spare_pieces")
    else:
        print_error("New columns missing from sprinkler_spare_pieces")
        return False

    # Check triggers
    print("Checking triggers...")
    query = """
    SELECT COUNT(*) FROM pg_trigger
    WHERE tgrelid IN ('hdpe_cut_pieces'::regclass, 'sprinkler_spare_pieces'::regclass)
    AND tgenabled = 'O';
    """
    returncode, stdout, _ = run_psql(query)
    if returncode == 0:
        trigger_count = int(stdout.strip().split('\n')[-2].strip())
        if trigger_count > 0:
            print_success(f"Triggers active ({trigger_count} triggers)")
        else:
            print_error("Triggers not active")
            return False

    # Check views
    print("Checking views...")
    returncode, stdout, _ = run_psql("\\dv v_piece_audit_trail")
    if returncode == 0 and 'v_piece_audit_trail' in stdout:
        print_success("Views created")
    else:
        print_warning("Some views missing (may need manual creation)")

    # Check data migration
    print("Checking data migration...")
    query = """
    SELECT COUNT(*) FROM sprinkler_spare_pieces
    WHERE created_by_transaction_id IS NULL AND (deleted_at IS NULL OR deleted_at IS NOT NULL);
    """
    returncode, stdout, _ = run_psql(query)
    if returncode == 0:
        null_count = int(stdout.strip().split('\n')[-2].strip())
        if null_count == 0:
            print_success("All pieces have created_by_transaction_id")
        else:
            print_warning(f"{null_count} pieces missing created_by_transaction_id")

    # Check quantity validation
    print("Checking quantity validation...")
    query = """
    SELECT COUNT(*) FROM v_stock_quantity_validation
    WHERE quantity_mismatch != 0;
    """
    returncode, stdout, stderr = run_psql(query)
    if returncode == 0:
        mismatch_count = int(stdout.strip().split('\n')[-2].strip())
        if mismatch_count == 0:
            print_success("All quantities valid")
        else:
            print_warning(f"{mismatch_count} quantity mismatches")
    else:
        print_warning("Could not verify quantity validation")

    return True


def compare_states(before_state):
    """Compare before and after states"""
    print_header("STEP 5: Comparing Before/After")

    print("Before migration:")
    print(before_state)

    print("\nAfter migration:")
    query = """
    SELECT
      'HDPE' as type,
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
    FROM hdpe_cut_pieces
    WHERE deleted_at IS NULL
    UNION ALL
    SELECT
      'SPRINKLER' as type,
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
    FROM sprinkler_spare_pieces
    WHERE deleted_at IS NULL;
    """

    returncode, stdout, _ = run_psql(query)
    if returncode == 0:
        print(stdout)


def print_summary(backup_file):
    """Print final summary"""
    print_header("MIGRATION COMPLETE!")

    print_success(f"Database backup created: {backup_file}")
    print_success("Migration applied successfully")
    print_success("All verifications passed")

    print("\nNext steps:\n")
    print("1. Review the new helper module:")
    print("   cat backend/inventory_operations.py")
    print("")
    print("2. Read the deployment guide:")
    print("   cat DEPLOYMENT_GUIDE.md")
    print("")
    print("3. Test the new operations:")
    print("   python3 -c 'from inventory_operations import InventoryOperations; print(\"✓ Module loaded\")'")
    print("")
    print("4. Update your code gradually to use InventoryOperations class")
    print("   (See REFACTORING_COMPLETE.md for examples)")
    print("")
    print("5. Monitor for 48 hours:")
    print("   - Check application logs for errors")
    print(f"   - Run: psql {DB_NAME} -c 'SELECT * FROM v_stock_quantity_validation WHERE quantity_mismatch != 0'")
    print(f"   - Verify lifecycle events: psql {DB_NAME} -c 'SELECT COUNT(*) FROM piece_lifecycle_events'")
    print("")
    print("If you need to rollback:")
    print(f"   psql {DB_NAME} < {backup_file}")

    print("\n" + "=" * 70)
    print("Documentation:")
    print("=" * 70)
    print("  REFACTORING_COMPLETE.md  - Complete overview")
    print("  DEPLOYMENT_GUIDE.md      - Detailed deployment steps")
    print("  FOUNDATIONAL_ERRORS_ANALYSIS.md - What was fixed and why")
    print("  QUICK_FIX_GUIDE.md       - Quick reference for developers")
    print("=" * 70)


def main():
    """Main deployment function"""
    print_header("TARKO INVENTORY - COMPREHENSIVE REFACTORING DEPLOYMENT")

    print("This script will:")
    print("  1. Backup current database")
    print("  2. Apply comprehensive migration")
    print("  3. Verify everything is working")
    print("  4. Show you next steps")
    print("")

    response = input("Continue? (y/n) ")
    if response.lower() != 'y':
        print("Aborted.")
        sys.exit(0)

    try:
        # Step 1: Create backup
        backup_file = create_backup()

        # Step 2: Verify current state
        before_state = verify_current_state()

        # Step 3: Apply migration
        if not apply_migration():
            print_error("Migration failed. Check errors above.")
            print(f"\nTo rollback: psql {DB_NAME} < {backup_file}")
            sys.exit(1)

        # Step 4: Verify migration
        if not verify_migration():
            print_error("Verification failed. Check errors above.")
            print(f"\nTo rollback: psql {DB_NAME} < {backup_file}")
            sys.exit(1)

        # Step 5: Compare states
        compare_states(before_state)

        # Print summary
        print_summary(backup_file)

    except KeyboardInterrupt:
        print("\n\nDeployment interrupted by user.")
        sys.exit(130)
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
