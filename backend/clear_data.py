"""
Script to clear inventory, transaction, and audit data from the database.
This will preserve master data (product types, brands, customers, users, etc.)
"""
import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        database=os.getenv('DB_NAME', 'tarko_inventory'),
        user=os.getenv('DB_USER', 'postgres'),
        password=os.getenv('DB_PASSWORD', ''),
        port=os.getenv('DB_PORT', '5432')
    )

def clear_data():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    try:
        print("🗑️  Starting data cleanup...")

        # Delete in order to respect foreign key constraints

        # 1. Delete transactions (references batches and rolls)
        cursor.execute("DELETE FROM transactions")
        transactions_deleted = cursor.rowcount
        print(f"✅ Deleted {transactions_deleted} transactions")

        # 2. Delete rolls (references batches)
        cursor.execute("DELETE FROM rolls")
        rolls_deleted = cursor.rowcount
        print(f"✅ Deleted {rolls_deleted} rolls")

        # 3. Delete cut_rolls (references rolls, but rolls are already deleted)
        cursor.execute("DELETE FROM cut_rolls")
        cut_rolls_deleted = cursor.rowcount
        print(f"✅ Deleted {cut_rolls_deleted} cut rolls")

        # 4. Delete spare_pipes (references batches)
        cursor.execute("DELETE FROM spare_pipes")
        spare_pipes_deleted = cursor.rowcount
        print(f"✅ Deleted {spare_pipes_deleted} spare pipes")

        # 5. Delete batches (references product_variants)
        cursor.execute("DELETE FROM batches")
        batches_deleted = cursor.rowcount
        print(f"✅ Deleted {batches_deleted} batches")

        # 6. Delete product_variants (no longer referenced)
        cursor.execute("DELETE FROM product_variants")
        variants_deleted = cursor.rowcount
        print(f"✅ Deleted {variants_deleted} product variants")

        # 7. Delete audit logs
        cursor.execute("DELETE FROM audit_logs")
        audit_deleted = cursor.rowcount
        print(f"✅ Deleted {audit_deleted} audit logs")

        # Commit the transaction
        conn.commit()

        print("\n✅ Data cleanup completed successfully!")
        print("\n📊 Summary:")
        print(f"   - Transactions: {transactions_deleted}")
        print(f"   - Rolls: {rolls_deleted}")
        print(f"   - Cut rolls: {cut_rolls_deleted}")
        print(f"   - Spare pipes: {spare_pipes_deleted}")
        print(f"   - Batches: {batches_deleted}")
        print(f"   - Product variants: {variants_deleted}")
        print(f"   - Audit logs: {audit_deleted}")
        print(f"   - Total: {transactions_deleted + rolls_deleted + cut_rolls_deleted + spare_pipes_deleted + batches_deleted + variants_deleted + audit_deleted}")

        print("\n✅ Master data (product types, brands, customers, users) preserved")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Error during cleanup: {e}")
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    response = input("⚠️  This will delete all inventory, transactions, and audit data. Are you sure? (yes/no): ")
    if response.lower() == 'yes':
        clear_data()
    else:
        print("❌ Operation cancelled")
