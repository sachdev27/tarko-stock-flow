#!/usr/bin/env python3
"""
Comprehensive verification script for refactoring
Tests all critical functionality without breaking the terminal
"""

import sys
import psycopg2
from psycopg2.extras import RealDictCursor
import traceback

DB_NAME = "tarko_inventory"

def get_connection():
    """Get database connection"""
    return psycopg2.connect(
        dbname=DB_NAME,
        cursor_factory=RealDictCursor
    )

def test_immutability_trigger():
    """Test that created_by_transaction_id cannot be modified"""
    print("\n" + "="*70)
    print("TEST 1: Immutability Trigger")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Get a valid batch_id
        cur.execute("SELECT id FROM batches LIMIT 1")
        batch = cur.fetchone()
        if not batch:
            print("⚠ SKIP: No batches found in database")
            return None

        # Create test stock
        cur.execute("""
            INSERT INTO inventory_stock (id, batch_id, quantity, unit_of_measurement, status)
            VALUES (gen_random_uuid(), %s, 10, 'PCS', 'IN_STOCK')
            RETURNING id
        """, (batch['id'],))
        test_stock_id = cur.fetchone()['id']

        # Create test transaction
        cur.execute("""
            INSERT INTO inventory_transactions (id, transaction_type, notes, created_at)
            VALUES (gen_random_uuid(), 'PRODUCTION', 'Test transaction', NOW())
            RETURNING id
        """)
        test_trans_id = cur.fetchone()['id']

        # Create test piece with created_by_transaction_id
        cur.execute("""
            INSERT INTO sprinkler_spare_pieces (id, stock_id, piece_count, status, created_by_transaction_id)
            VALUES (gen_random_uuid(), %s, 5, 'IN_STOCK', %s)
            RETURNING id
        """, (test_stock_id, test_trans_id))
        test_piece_id = cur.fetchone()['id']

        print(f"   Created test piece: {test_piece_id}")

        # Try to modify created_by_transaction_id (SHOULD FAIL)
        try:
            cur.execute("""
                UPDATE sprinkler_spare_pieces
                SET created_by_transaction_id = gen_random_uuid()
                WHERE id = %s
            """, (test_piece_id,))
            conn.commit()

            # If we get here, the trigger didn't work
            print("✗ FAIL: Trigger did NOT prevent mutation!")

            # Cleanup
            cur.execute("DELETE FROM sprinkler_spare_pieces WHERE id = %s", (test_piece_id,))
            cur.execute("DELETE FROM inventory_transactions WHERE id = %s", (test_trans_id,))
            cur.execute("DELETE FROM inventory_stock WHERE id = %s", (test_stock_id,))
            conn.commit()

            return False

        except psycopg2.Error as e:
            # This is expected - the trigger should prevent the update
            if "cannot be modified" in str(e) or "immutable" in str(e).lower():
                print("✓ PASS: Trigger successfully prevented mutation")
                print(f"   Error message: {str(e).split('CONTEXT')[0].strip()}")

                # Rollback the failed transaction
                conn.rollback()

                # Cleanup in a new transaction
                cur.execute("DELETE FROM sprinkler_spare_pieces WHERE id = %s", (test_piece_id,))
                cur.execute("DELETE FROM inventory_transactions WHERE id = %s", (test_trans_id,))
                cur.execute("DELETE FROM inventory_stock WHERE id = %s", (test_stock_id,))
                conn.commit()

                return True
            else:
                print(f"✗ FAIL: Unexpected error: {e}")
                conn.rollback()
                return False

    except Exception as e:
        print(f"✗ ERROR: {e}")
        traceback.print_exc()
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def test_lifecycle_events():
    """Test that lifecycle events table exists and is functional"""
    print("\n" + "="*70)
    print("TEST 2: Lifecycle Event Logging")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check if table exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'piece_lifecycle_events'
            )
        """)
        exists = cur.fetchone()['exists']

        if not exists:
            print("✗ FAIL: piece_lifecycle_events table does not exist")
            return False

        # Get event count
        cur.execute("SELECT COUNT(*) as count FROM piece_lifecycle_events")
        count = cur.fetchone()['count']

        print("✓ PASS: Lifecycle events table exists")
        print(f"   Current event count: {count}")

        # Check recent events
        cur.execute("""
            SELECT event_type, piece_type, COUNT(*) as count
            FROM piece_lifecycle_events
            GROUP BY event_type, piece_type
            ORDER BY count DESC
            LIMIT 5
        """)
        events = cur.fetchall()

        if events:
            print("   Recent event breakdown:")
            for event in events:
                print(f"     - {event['piece_type']} {event['event_type']}: {event['count']} events")

        return True

    except Exception as e:
        print(f"✗ ERROR: {e}")
        traceback.print_exc()
        return False
    finally:
        if conn:
            conn.close()

def test_new_columns():
    """Test that new columns exist on piece tables"""
    print("\n" + "="*70)
    print("TEST 3: New Columns")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        required_columns = [
            'created_by_transaction_id',
            'original_stock_id',
            'version',
            'deleted_at',
            'deleted_by_transaction_id',
            'reserved_by_transaction_id',
            'reserved_at'
        ]

        all_pass = True

        for table in ['hdpe_cut_pieces', 'sprinkler_spare_pieces']:
            print(f"\n   Checking {table}...")

            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = %s
            """, (table,))

            existing_columns = {row['column_name'] for row in cur.fetchall()}

            for col in required_columns:
                if col in existing_columns:
                    print(f"     ✓ {col}")
                else:
                    print(f"     ✗ {col} MISSING")
                    all_pass = False

        if all_pass:
            print("\n✓ PASS: All required columns exist")
        else:
            print("\n✗ FAIL: Some columns are missing")

        return all_pass

    except Exception as e:
        print(f"✗ ERROR: {e}")
        traceback.print_exc()
        return False
    finally:
        if conn:
            conn.close()

def test_triggers():
    """Test that triggers are active"""
    print("\n" + "="*70)
    print("TEST 4: Triggers")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                t.tgname as trigger_name,
                c.relname as table_name
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            WHERE c.relname IN ('hdpe_cut_pieces', 'sprinkler_spare_pieces')
            AND t.tgenabled = 'O'
            ORDER BY c.relname, t.tgname
        """)

        triggers = cur.fetchall()

        if not triggers:
            print("✗ FAIL: No triggers found")
            return False

        print(f"✓ PASS: Found {len(triggers)} active triggers")
        for trigger in triggers:
            print(f"   - {trigger['table_name']}.{trigger['trigger_name']}")

        return True

    except Exception as e:
        print(f"✗ ERROR: {e}")
        traceback.print_exc()
        return False
    finally:
        if conn:
            conn.close()

def test_views():
    """Test that views exist"""
    print("\n" + "="*70)
    print("TEST 5: Views")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        required_views = [
            'v_piece_audit_trail',
            'v_available_pieces',
            'v_stock_quantity_validation'
        ]

        all_pass = True

        for view in required_views:
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.views
                    WHERE table_name = %s
                )
            """, (view,))
            exists = cur.fetchone()['exists']

            if exists:
                print(f"   ✓ {view}")
            else:
                print(f"   ✗ {view} MISSING")
                all_pass = False

        if all_pass:
            print("\n✓ PASS: All views exist")
        else:
            print("\n✗ FAIL: Some views are missing")

        return all_pass

    except Exception as e:
        print(f"✗ ERROR: {e}")
        traceback.print_exc()
        return False
    finally:
        if conn:
            conn.close()

def test_quantity_validation():
    """Test quantity validation"""
    print("\n" + "="*70)
    print("TEST 6: Quantity Validation")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT COUNT(*) as count
            FROM v_stock_quantity_validation
            WHERE quantity_mismatch != 0
        """)
        mismatches = cur.fetchone()['count']

        if mismatches == 0:
            print("✓ PASS: All quantities are valid (no mismatches)")
        else:
            print(f"⚠ WARNING: Found {mismatches} quantity mismatches")

            # Show details
            cur.execute("""
                SELECT stock_id, stock_quantity, calculated_quantity, quantity_mismatch
                FROM v_stock_quantity_validation
                WHERE quantity_mismatch != 0
                LIMIT 5
            """)
            details = cur.fetchall()

            print("   First few mismatches:")
            for detail in details:
                print(f"     Stock {detail['stock_id']}: {detail['stock_quantity']} vs {detail['calculated_quantity']} (diff: {detail['quantity_mismatch']})")

        return mismatches == 0

    except Exception as e:
        print(f"✗ ERROR: {e}")
        traceback.print_exc()
        return False
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    print("="*70)
    print("COMPREHENSIVE REFACTORING VERIFICATION")
    print("="*70)

    results = {}

    # Run tests
    results['immutability'] = test_immutability_trigger()
    results['lifecycle'] = test_lifecycle_events()
    results['columns'] = test_new_columns()
    results['triggers'] = test_triggers()
    results['views'] = test_views()
    results['quantities'] = test_quantity_validation()

    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)

    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    skipped = sum(1 for v in results.values() if v is None)
    total = len(results)

    print(f"\nTests passed: {passed}/{total}")
    if failed > 0:
        print(f"Tests failed: {failed}/{total}")
    if skipped > 0:
        print(f"Tests skipped: {skipped}/{total}")

    print("\nDetailed results:")
    for test_name, result in results.items():
        status = "✓ PASS" if result is True else ("✗ FAIL" if result is False else "⚠ SKIP")
        print(f"  {status}: {test_name}")

    if passed == total:
        print("\n✓ All tests passed! Migration is working correctly.")
        sys.exit(0)
    elif failed == 0 and skipped > 0:
        print("\n⚠ Some tests were skipped, but no failures detected.")
        sys.exit(0)
    else:
        print("\n✗ Some tests failed. Please review the output above.")
        sys.exit(1)
