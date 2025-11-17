import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from config import Config

@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    conn = psycopg2.connect(Config.DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

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
