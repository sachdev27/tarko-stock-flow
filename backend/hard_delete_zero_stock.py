#!/usr/bin/env python3
"""Hard delete zero-quantity stock entries"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_db_cursor

def hard_delete_zero_quantity():
    """Permanently delete inventory_stock entries with quantity = 0"""
    try:
        with get_db_cursor(commit=True) as cursor:
            # Check all entries
            cursor.execute('SELECT id, stock_type, quantity, deleted_at FROM inventory_stock ORDER BY quantity ASC')
            all_entries = cursor.fetchall()

            print('\n📊 Current inventory_stock entries:')
            print('=' * 80)
            print(f"{'ID (first 8)':<12} | {'Type':<12} | {'Qty':>4} | {'Deleted?':<15} | {'Status'}")
            print('-' * 80)

            for row in all_entries:
                id_short = str(row['id'])[:8]
                deleted = 'YES' if row['deleted_at'] else 'NO'
                status = '⚠️  ZERO QTY' if row['quantity'] == 0 else '✓ OK'
                print(f"{id_short:<12} | {row['stock_type']:<12} | {row['quantity']:>4} | {deleted:<15} | {status}")

            # Count zero quantity entries
            zero_entries = [r for r in all_entries if r['quantity'] == 0]

            if not zero_entries:
                print('\n✅ No zero-quantity entries found!')
                return

            print(f'\n⚠️  Found {len(zero_entries)} entries with quantity = 0')
            print('\n🗑️  Permanently deleting these entries...')

            # Hard delete
            cursor.execute('DELETE FROM inventory_stock WHERE quantity = 0')
            deleted_count = cursor.rowcount

            print(f'✅ Successfully deleted {deleted_count} zero-quantity entries')

            # Verify
            cursor.execute('SELECT COUNT(*) as count FROM inventory_stock WHERE quantity = 0')
            remaining = cursor.fetchone()['count']

            if remaining == 0:
                print('✨ Database cleaned! No zero-quantity entries remain.')
            else:
                print(f'⚠️  Warning: {remaining} zero-quantity entries still exist')

    except Exception as e:
        print(f'❌ Error during cleanup: {str(e)}')
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    print('🧹 Starting hard delete of zero-quantity stock entries...')
    hard_delete_zero_quantity()
