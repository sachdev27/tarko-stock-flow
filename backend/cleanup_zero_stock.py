#!/usr/bin/env python3
"""Cleanup script to remove zero-quantity stock entries"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_db_cursor

def cleanup_zero_quantity_stock():
    """Soft delete inventory_stock entries with quantity = 0"""
    try:
        with get_db_cursor(commit=True) as cursor:
            # Soft delete zero-quantity entries
            cursor.execute("""
                UPDATE inventory_stock
                SET deleted_at = NOW(), updated_at = NOW()
                WHERE quantity = 0
                AND deleted_at IS NULL
                AND status != 'SOLD_OUT'
            """)

            deleted_count = cursor.rowcount

            print(f"✅ Successfully cleaned up {deleted_count} zero-quantity stock entries")

            # Show remaining zero-quantity entries (if any)
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM inventory_stock
                WHERE quantity = 0
                AND deleted_at IS NULL
            """)

            remaining = cursor.fetchone()['count']
            if remaining > 0:
                print(f"⚠️  {remaining} zero-quantity entries remaining (status = SOLD_OUT)")
            else:
                print("✨ All zero-quantity entries cleaned up!")

    except Exception as e:
        print(f"❌ Error during cleanup: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    print("🧹 Starting zero-quantity stock cleanup...")
    cleanup_zero_quantity_stock()
