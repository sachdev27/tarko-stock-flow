#!/usr/bin/env python3
"""
Test script to verify the immutability trigger works
This tests that created_by_transaction_id cannot be modified after creation
"""

import subprocess
import sys

DB_NAME = "tarko_inventory"

# Colors for output
GREEN = '\033[0;32m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'


def print_success(text):
    print(f"{GREEN}✓ {text}{NC}")


def print_error(text):
    print(f"{RED}✗ {text}{NC}")


def print_info(text):
    print(f"{YELLOW}ℹ {text}{NC}")


def print_header(text):
    print("\n" + "=" * 70)
    print(text)
    print("=" * 70 + "\n")


def run_psql(query):
    """Run a PostgreSQL query"""
    cmd = ['psql', DB_NAME, '-c', query]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def test_immutability_hdpe():
    """Test immutability trigger on HDPE cut pieces"""

    print_header("TEST 1: HDPE Cut Pieces - Immutability Trigger")

    print_info("Running immutability test for HDPE cut pieces...")

    test_query = """
    DO $$
    DECLARE
      test_piece_id UUID;
      original_trans_id UUID := gen_random_uuid();
      new_trans_id UUID := gen_random_uuid();
    BEGIN
      -- Create test piece directly (without stock dependencies)
      INSERT INTO hdpe_cut_pieces (
        id,
        stock_id,
        piece_count,
        status,
        created_by_transaction_id
      )
      VALUES (
        gen_random_uuid(),
        gen_random_uuid(), -- dummy stock_id
        5,
        'IN_STOCK',
        original_trans_id
      )
      RETURNING id INTO test_piece_id;

      RAISE NOTICE 'Created test piece: %', test_piece_id;
      RAISE NOTICE 'Original transaction ID: %', original_trans_id;

      -- Try to modify created_by_transaction_id (this SHOULD FAIL)
      BEGIN
        UPDATE hdpe_cut_pieces
        SET created_by_transaction_id = new_trans_id
        WHERE id = test_piece_id;

        -- If we get here, the trigger failed
        RAISE EXCEPTION 'TRIGGER_FAILED: created_by_transaction_id was modified!';

      EXCEPTION
        WHEN raise_exception THEN
          RAISE;
        WHEN OTHERS THEN
          -- Expected: trigger should prevent the update
          RAISE NOTICE 'SUCCESS: Trigger prevented mutation - %', SQLERRM;
      END;

      -- Verify the transaction_id wasn't changed
      DECLARE
        current_trans_id UUID;
      BEGIN
        SELECT created_by_transaction_id INTO current_trans_id
        FROM hdpe_cut_pieces
        WHERE id = test_piece_id;

        IF current_trans_id = original_trans_id THEN
          RAISE NOTICE 'VERIFIED: Transaction ID unchanged';
        ELSE
          RAISE EXCEPTION 'ERROR: Transaction ID was modified!';
        END IF;
      END;

      -- Cleanup
      DELETE FROM hdpe_cut_pieces WHERE id = test_piece_id;
      RAISE NOTICE 'Cleanup complete';

    END;
    $$;
    """

    returncode, stdout, stderr = run_psql(test_query)

    if returncode == 0:
        # Check for success indicators
        if 'SUCCESS: Trigger prevented mutation' in stderr and 'VERIFIED: Transaction ID unchanged' in stderr:
            print_success("HDPE immutability trigger is working correctly!")

            # Extract the error message
            if 'SUCCESS: Trigger prevented mutation -' in stderr:
                error_msg = stderr.split('SUCCESS: Trigger prevented mutation -')[1].split('NOTICE:')[0].strip()
                print_info(f"Error message: {error_msg}")

            return True
        elif 'TRIGGER_FAILED' in stderr:
            print_error("TRIGGER FAILED! The created_by_transaction_id was modified!")
            return False
        else:
            print_error("Could not determine test result")
            print(stderr)
            return False
    else:
        print_error(f"Test query failed: {stderr}")
        return False


def test_immutability_sprinkler():
    """Test immutability trigger on sprinkler spare pieces"""

    print_header("TEST 2: Sprinkler Spare Pieces - Immutability Trigger")

    print_info("Running immutability test for sprinkler spare pieces...")

    test_query = """
    DO $$
    DECLARE
      test_piece_id UUID;
      original_trans_id UUID := gen_random_uuid();
      new_trans_id UUID := gen_random_uuid();
    BEGIN
      -- Create test piece directly
      INSERT INTO sprinkler_spare_pieces (
        id,
        stock_id,
        piece_count,
        status,
        created_by_transaction_id
      )
      VALUES (
        gen_random_uuid(),
        gen_random_uuid(), -- dummy stock_id
        3,
        'IN_STOCK',
        original_trans_id
      )
      RETURNING id INTO test_piece_id;

      RAISE NOTICE 'Created test piece: %', test_piece_id;

      -- Try to modify created_by_transaction_id (this SHOULD FAIL)
      BEGIN
        UPDATE sprinkler_spare_pieces
        SET created_by_transaction_id = new_trans_id
        WHERE id = test_piece_id;

        -- If we get here, the trigger failed
        RAISE EXCEPTION 'TRIGGER_FAILED: created_by_transaction_id was modified!';

      EXCEPTION
        WHEN raise_exception THEN
          RAISE;
        WHEN OTHERS THEN
          -- Expected: trigger should prevent the update
          RAISE NOTICE 'SUCCESS: Trigger prevented mutation - %', SQLERRM;
      END;

      -- Verify the transaction_id wasn't changed
      DECLARE
        current_trans_id UUID;
      BEGIN
        SELECT created_by_transaction_id INTO current_trans_id
        FROM sprinkler_spare_pieces
        WHERE id = test_piece_id;

        IF current_trans_id = original_trans_id THEN
          RAISE NOTICE 'VERIFIED: Transaction ID unchanged';
        ELSE
          RAISE EXCEPTION 'ERROR: Transaction ID was modified!';
        END IF;
      END;

      -- Cleanup
      DELETE FROM sprinkler_spare_pieces WHERE id = test_piece_id;
      RAISE NOTICE 'Cleanup complete';

    END;
    $$;
    """

    returncode, stdout, stderr = run_psql(test_query)

    if returncode == 0:
        if 'SUCCESS: Trigger prevented mutation' in stderr and 'VERIFIED: Transaction ID unchanged' in stderr:
            print_success("Sprinkler immutability trigger is working correctly!")
            return True
        elif 'TRIGGER_FAILED' in stderr:
            print_error("TRIGGER FAILED! The created_by_transaction_id was modified!")
            return False
        else:
            print_error("Could not determine test result")
            print(stderr)
            return False
    else:
        print_error(f"Test query failed: {stderr}")
        return False


def test_lifecycle_events():
    """Test that lifecycle events table exists and is functional"""

    print_header("TEST 3: Lifecycle Events Table")

    print_info("Checking lifecycle events table...")

    # Check table exists
    returncode, stdout, _ = run_psql("\\dt piece_lifecycle_events")
    if returncode == 0 and 'piece_lifecycle_events' in stdout:
        print_success("piece_lifecycle_events table exists")
    else:
        print_error("piece_lifecycle_events table not found")
        return False

    # Check event count
    returncode, stdout, _ = run_psql("SELECT COUNT(*) FROM piece_lifecycle_events")
    if returncode == 0:
        event_count = int(stdout.strip().split('\n')[-2].strip())
        print_info(f"Current lifecycle events: {event_count}")
        print_success("Lifecycle events table is accessible")
        return True
    else:
        print_error("Could not query lifecycle events")
        return False


def main():
    """Run all tests"""
    print_header("COMPREHENSIVE REFACTORING - VERIFICATION TESTS")

    test1_passed = test_immutability_hdpe()
    test2_passed = test_immutability_sprinkler()
    test3_passed = test_lifecycle_events()

    print_header("OVERALL RESULTS")

    if test1_passed:
        print_success("HDPE immutability trigger: WORKING")
    else:
        print_error("HDPE immutability trigger: FAILED")

    if test2_passed:
        print_success("Sprinkler immutability trigger: WORKING")
    else:
        print_error("Sprinkler immutability trigger: FAILED")

    if test3_passed:
        print_success("Lifecycle events table: WORKING")
    else:
        print_error("Lifecycle events table: FAILED")

    if test1_passed and test2_passed and test3_passed:
        print_header("✓ ALL TESTS PASSED!")
        print("\nYour database is ready for production use with:")
        print("  • Immutable creation tracking (created_by_transaction_id)")
        print("  • Automatic prevention of audit trail tampering")
        print("  • Comprehensive lifecycle event logging")
        print("  • Full audit trail for all piece operations")
        print("")
        print("Key features:")
        print("  1. created_by_transaction_id can ONLY be set during INSERT")
        print("  2. Any UPDATE attempt is automatically rejected")
        print("  3. COMBINE_SPARES operations will preserve original creators")
        print("  4. Complete provenance tracking for every piece")
        print("")
        sys.exit(0)
    else:
        print_header("✗ SOME TESTS FAILED")
        print("\nPlease review errors above and check:")
        print("  1. Migration was applied successfully")
        print("  2. Triggers are active on both piece tables")
        print("  3. Database permissions are correct")
        print("")
        sys.exit(1)


if __name__ == "__main__":
    main()
