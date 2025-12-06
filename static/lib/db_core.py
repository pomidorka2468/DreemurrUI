import sqlite3
from contextlib import contextmanager

DB_PATH = "app.db"


@contextmanager
def get_db(path: str = DB_PATH):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
