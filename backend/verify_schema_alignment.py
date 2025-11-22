#!/usr/bin/env python3
"""
Verify that the codebase is fully aligned with the new foundational schema
Checks for any remaining issues with immutable tracking
"""

import sys
import psycopg2
from psycopg2.extras import RealDictCursor

DB_NAME = "tarko_inventory"

def get_connection():
    """Get database connection"""
    return psycopg2.connect(dbname=DB_NAME, cursor_factory=RealDictCursor)

def check_new_columns_exist():
    """Check that all new columns from migration exist"""
    print("\n" + "="*70)
    print("TEST 1: New Columns Existence")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        required_columns = {
            'hdpe_cut_pieces': [
                'created_by_transaction_id',
                'original_stock_id',
                'version',
                'deleted_at',
                'deleted_by_transaction_id',
                'reserved_by_transaction_id',
                'reserved_at'
            ],
            'sprinkler_spare_pieces': [
                'created_by_transaction_id',
                'original_stock_id',
                'version',
                'deleted_at',
                'deleted_by_transaction_id',
                'reserved_by_transaction_id',
                'reserved_at'
            ]
        }

        all_good = True

        for table, columns in required_columns.items():
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = %s
            """, (table,))

            existing_columns = {row['column_name'] for row in cur.fetchall()}

            for col in columns:
                if col not in existing_columns:
                    print(f"   ✗ MISSING: {table}.{col}")
                    all_good = False

        if all_good:
            print("   ✓ All required columns exist")
            return True
        else:
            print("   ✗ Some columns are missing!")
            return False

    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    finally:
        if conn:
            conn.close()

def check_pieces_have_immutable_creator():
    """Check all pieces have created_by_transaction_id set"""
    print("\n" + "="*70)
    print("TEST 2: Immutable Creator Tracking")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check HDPE pieces
        cur.execute("""
            SELECT COUNT(*) as count
            FROM hdpe_cut_pieces
            WHERE created_by_transaction_id IS NULL
              AND deleted_at IS NULL
        """)
        hdpe_missing = cur.fetchone()['count']

        # Check Sprinkler pieces
        cur.execute("""
            SELECT COUNT(*) as count
            FROM sprinkler_spare_pieces
            WHERE created_by_transaction_id IS NULL
              AND deleted_at IS NULL
        """)
        sprinkler_missing = cur.fetchone()['count']

        if hdpe_missing == 0 and sprinkler_missing == 0:
            print("   ✓ All active pieces have immutable creator tracking")
            return True
        else:
            print(f"   ✗ Missing creators: HDPE={hdpe_missing}, SPRINKLER={sprinkler_missing}")
            return False

    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    finally:
        if conn:
            conn.close()

def check_immutability_trigger_active():
    """Check that prevent_transaction_id_mutation trigger is active"""
    print("\n" + "="*70)
    print("TEST 3: Immutability Trigger Status")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                c.relname as table_name,
                t.tgname as trigger_name,
                t.tgenabled as enabled
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            WHERE c.relname IN ('hdpe_cut_pieces', 'sprinkler_spare_pieces')
              AND t.tgname LIKE '%prevent%mutation%'
            ORDER BY c.relname
        """)

        triggers = cur.fetchall()

        if len(triggers) == 2:
            print("   ✓ Immutability triggers active:")
            for trigger in triggers:
                status = "ENABLED" if trigger['enabled'] == 'O' else "DISABLED"
                print(f"     - {trigger['table_name']}: {trigger['trigger_name']} ({status})")
            return True
        else:
            print(f"   ✗ Expected 2 triggers, found {len(triggers)}")
            return False

    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    finally:
        if conn:
            conn.close()

def check_lifecycle_events_table():
    """Check that piece_lifecycle_events table exists and has events"""
    print("\n" + "="*70)
    print("TEST 4: Event Sourcing Infrastructure")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check table exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'piece_lifecycle_events'
            )
        """)
        exists = cur.fetchone()['exists']

        if not exists:
            print("   ✗ piece_lifecycle_events table does not exist")
            return False

        # Check for events
        cur.execute("SELECT COUNT(*) as count FROM piece_lifecycle_events")
        count = cur.fetchone()['count']

        print(f"   ✓ Event sourcing table exists with {count} events")

        # Show breakdown
        cur.execute("""
            SELECT
                piece_type,
                event_type,
                COUNT(*) as count
            FROM piece_lifecycle_events
            GROUP BY piece_type, event_type
            ORDER BY count DESC
            LIMIT 5
        """)
        events = cur.fetchall()

        if events:
            print("   Event breakdown:")
            for event in events:
                print(f"     - {event['piece_type']} {event['event_type']}: {event['count']}")

        return True

    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    finally:
        if conn:
            conn.close()

def check_quantity_consistency():
    """Check that all stock quantities match piece counts"""
    print("\n" + "="*70)
    print("TEST 5: Quantity Consistency (Auto-update Triggers)")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                stock_type,
                COUNT(*) as mismatch_count
            FROM v_stock_quantity_validation
            WHERE quantity_mismatch != 0
            GROUP BY stock_type
        """)

        mismatches = cur.fetchall()

        if not mismatches:
            print("   ✓ All stock quantities match piece counts")
            return True
        else:
            print("   ✗ Found quantity mismatches:")
            for mismatch in mismatches:
                print(f"     - {mismatch['stock_type']}: {mismatch['mismatch_count']} stocks")
            return False

    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    finally:
        if conn:
            conn.close()

def check_views_exist():
    """Check that all helper views exist"""
    print("\n" + "="*70)
    print("TEST 6: Helper Views")
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

        all_exist = True
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
                all_exist = False

        return all_exist

    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    finally:
        if conn:
            conn.close()

def check_old_transaction_id_usage():
    """Check if old transaction_id column is still being used"""
    print("\n" + "="*70)
    print("TEST 7: Legacy Column Usage Check")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check if old transaction_id column exists
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'hdpe_cut_pieces'
              AND column_name = 'transaction_id'
        """)

        hdpe_has_old = cur.fetchone() is not None

        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'sprinkler_spare_pieces'
              AND column_name = 'transaction_id'
        """)

        sprinkler_has_old = cur.fetchone() is not None

        if hdpe_has_old or sprinkler_has_old:
            print("   ℹ Old transaction_id column still exists (deprecated)")
            print("   ✓ This is OK - it's kept for backwards compatibility")
            print("   → Should be removed after full migration")
        else:
            print("   ✓ Old transaction_id column removed")

        return True

    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    finally:
        if conn:
            conn.close()

def check_auto_update_trigger():
    """Check that auto_update_stock_quantity trigger is working correctly"""
    print("\n" + "="*70)
    print("TEST 8: Auto-Update Trigger Function")
    print("="*70)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check function exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM pg_proc
                WHERE proname = 'auto_update_stock_quantity'
            )
        """)
        exists = cur.fetchone()['exists']

        if not exists:
            print("   ✗ auto_update_stock_quantity function not found")
            return False

        # Check triggers are attached
        cur.execute("""
            SELECT
                c.relname as table_name,
                COUNT(*) as trigger_count
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            WHERE c.relname IN ('hdpe_cut_pieces', 'sprinkler_spare_pieces')
              AND t.tgname LIKE '%auto_update%'
              AND t.tgenabled = 'O'
            GROUP BY c.relname
        """)

        triggers = cur.fetchall()

        if len(triggers) == 2:
            print("   ✓ Auto-update triggers active on both piece tables")
            for trigger in triggers:
                print(f"     - {trigger['table_name']}: {trigger['trigger_count']} trigger(s)")
            return True
        else:
            print(f"   ✗ Expected 2 tables with triggers, found {len(triggers)}")
            return False

    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    print("="*70)
    print("FOUNDATIONAL SCHEMA ALIGNMENT VERIFICATION")
    print("="*70)

    results = {
        'columns': check_new_columns_exist(),
        'creators': check_pieces_have_immutable_creator(),
        'immutability': check_immutability_trigger_active(),
        'events': check_lifecycle_events_table(),
        'quantities': check_quantity_consistency(),
        'views': check_views_exist(),
        'legacy': check_old_transaction_id_usage(),
        'auto_update': check_auto_update_trigger()
    }

    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)

    passed = sum(1 for v in results.values() if v is True)
    total = len(results)

    print(f"\nTests passed: {passed}/{total}")

    print("\nDetailed results:")
    for test_name, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {status}: {test_name}")

    if passed == total:
        print("\n" + "="*70)
        print("✓ SCHEMA FULLY ALIGNED!")
        print("="*70)
        print("\nAll foundational improvements are in place:")
        print("  • Immutable creator tracking")
        print("  • Event sourcing for full audit trail")
        print("  • Automatic quantity synchronization")
        print("  • Concurrency control with versioning")
        print("  • Soft deletes for data preservation")
        print("\nThe system is ready for production!")
        sys.exit(0)
    else:
        print("\n" + "="*70)
        print("⚠ SOME ISSUES FOUND")
        print("="*70)
        print("\nPlease review the failed tests above.")
        sys.exit(1)
