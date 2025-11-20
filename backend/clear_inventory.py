#!/usr/bin/env python3
"""
Clear inventory and transactions from database.
This will delete all batches, rolls, and transactions but keep master data
(product types, brands, customers, users).
"""

import psycopg2
from config import Config

def clear_inventory_and_transactions():
    """Clear all inventory and transaction data"""
    try:
        conn = psycopg2.connect(
            dbname=Config.DB_NAME,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
            host=Config.DB_HOST,
            port=Config.DB_PORT
        )
        cursor = conn.cursor()

        print("Starting to clear inventory and transactions...")

        # Clear in correct order due to foreign keys
        print("1. Clearing transactions...")
        cursor.execute("DELETE FROM transactions;")
        deleted_transactions = cursor.rowcount
        print(f"   Deleted {deleted_transactions} transactions")

        print("2. Clearing rolls...")
        cursor.execute("DELETE FROM rolls;")
        deleted_rolls = cursor.rowcount
        print(f"   Deleted {deleted_rolls} rolls")

        print("3. Clearing batches...")
        cursor.execute("DELETE FROM batches;")
        deleted_batches = cursor.rowcount
        print(f"   Deleted {deleted_batches} batches")

        # Reset sequences
        print("4. Resetting sequences...")
        cursor.execute("ALTER SEQUENCE batches_batch_no_seq RESTART WITH 1;")

        conn.commit()
        print("\n✅ Successfully cleared all inventory and transactions!")
        print(f"\nSummary:")
        print(f"  - Batches deleted: {deleted_batches}")
        print(f"  - Rolls deleted: {deleted_rolls}")
        print(f"  - Transactions deleted: {deleted_transactions}")
        print(f"\nMaster data (product types, brands, customers, users) preserved.")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"❌ Error clearing database: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        raise

if __name__ == "__main__":
    response = input("⚠️  This will delete ALL inventory and transactions. Are you sure? (yes/no): ")
    if response.lower() == 'yes':
        clear_inventory_and_transactions()
    else:
        print("Operation cancelled.")
