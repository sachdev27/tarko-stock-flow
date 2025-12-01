import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from config import Config
import atexit

# Initialize connection pool with 2 minimum and 10 maximum connections
connection_pool = None

def init_connection_pool():
    """Initialize the database connection pool"""
    global connection_pool
    if connection_pool is None:
        try:
            connection_pool = pool.SimpleConnectionPool(
                2,  # minconn
                10,  # maxconn
                Config.DATABASE_URL
            )
            print("Connection pool created successfully")
        except Exception as e:
            print(f"Error creating connection pool: {e}")
            raise

def close_connection_pool():
    """Close all connections in the pool"""
    global connection_pool
    if connection_pool:
        connection_pool.closeall()
        print("Connection pool closed")

# Register cleanup on exit
atexit.register(close_connection_pool)

@contextmanager
def get_db_connection():
    """Context manager for database connections from pool"""
    global connection_pool
    if connection_pool is None:
        init_connection_pool()

    conn = connection_pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        connection_pool.putconn(conn)

@contextmanager
def get_db_cursor(commit=True):
    """Context manager for database cursor with dict results"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        try:
            yield cursor
            if commit:
                conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()

def execute_query(query, params=None, fetch_one=False, fetch_all=True):
    """Execute a query and return results"""
    with get_db_cursor() as cursor:
        cursor.execute(query, params or ())

        if fetch_one:
            return cursor.fetchone()
        elif fetch_all:
            return cursor.fetchall()
        return None

def execute_insert(query, params=None, returning=True):
    """Execute an insert query and optionally return the inserted row"""
    with get_db_cursor() as cursor:
        cursor.execute(query, params or ())
        if returning:
            return cursor.fetchone()
        return None
