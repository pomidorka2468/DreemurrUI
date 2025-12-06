from typing import Any, Dict, Optional, Callable

from .db_core import get_db


DBProvider = Callable[[], Any]


def fetch_character(char_id: int, db_provider: DBProvider = get_db) -> Optional[Dict[str, Any]]:
    with db_provider() as conn:
        cur = conn.execute(
            "SELECT id, name, icon, greeting, personality FROM characters WHERE id = ?",
            (char_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "icon": row["icon"],
            "greeting": row["greeting"],
            "personality": row["personality"],
        }


def list_characters(db_provider: DBProvider = get_db) -> list[Dict[str, Any]]:
    with db_provider() as conn:
        cur = conn.execute(
            "SELECT id, name, icon, greeting, personality FROM characters ORDER BY id"
        )
        rows = cur.fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "icon": row["icon"],
                "greeting": row["greeting"],
                "personality": row["personality"],
            }
            for row in rows
        ]
