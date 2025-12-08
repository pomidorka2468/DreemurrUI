from pathlib import Path
import json
import re
import time
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

ARCHIVE_DIR = Path("static/userdata/archive")


def _safe_id(raw: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", raw.strip()) or f"arch_{int(time.time())}"


class ArchiveEntry(BaseModel):
    id: Optional[str] = None
    type: str
    name: str
    preview: Optional[str] = None
    model: Optional[str] = None
    updated_at: Optional[int] = None
    created_at: Optional[int] = None
    messages: Optional[list[dict]] = None
    character_id: Optional[int] = None


def _entry_path(entry_id: str) -> Path:
    return ARCHIVE_DIR / f"{_safe_id(entry_id)}.json"


def _ensure_dir():
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)


def _load_entry(path: Path) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("id", path.stem)
            data.setdefault("type", "chat")
            data.setdefault("preview", "")
            data.setdefault("model", "")
            data.setdefault("updated_at", int(path.stat().st_mtime))
            data.setdefault("created_at", data.get("updated_at"))
            return data
    except Exception:
        return None
    return None


def list_archive_entries() -> List[Dict[str, Any]]:
    _ensure_dir()
    items: List[Dict[str, Any]] = []
    for path in ARCHIVE_DIR.glob("*.json"):
        if not path.is_file():
            continue
        entry = _load_entry(path)
        if entry:
            items.append(entry)
    items.sort(key=lambda x: x.get("updated_at") or 0, reverse=True)
    return items


def load_archive_entry(entry_id: str) -> Optional[Dict[str, Any]]:
    path = _entry_path(entry_id)
    if not path.exists():
        return None
    return _load_entry(path)


def _generate_chat_name(messages: list[dict], model: Optional[str]) -> str:
    first_user = next((m.get("content") for m in messages if m.get("role") == "user"), "")
    clean = (first_user or "").strip()
    if not clean:
        return "Chat"
    snippet = clean[:64].strip()
    if len(clean) > 64:
        snippet += "…"
    return snippet


def save_chat_archive(
    archive_id: Optional[str], messages: list[dict], model: Optional[str], character_id: Optional[int]
) -> str:
    """Create or update a chat archive entry."""
    _ensure_dir()
    entry_id = archive_id or f"chat_{int(time.time()*1000)}"
    path = _entry_path(entry_id)
    existing = load_archive_entry(entry_id) or {}

    created_at = existing.get("created_at") or int(time.time())
    preview = messages[-1]["content"] if messages else existing.get("preview", "")
    name = existing.get("name") or _generate_chat_name(messages, model)

    data = {
        "id": _safe_id(entry_id),
        "type": "chat",
        "name": name,
        "preview": preview,
        "model": model or existing.get("model") or "",
        "updated_at": int(time.time()),
        "created_at": created_at,
        "messages": messages,
        "character_id": character_id or existing.get("character_id"),
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data["id"]


@router.get("/archive")
def api_list_archive():
    return list_archive_entries()


@router.get("/archive/{entry_id}")
def api_get_archive(entry_id: str):
    data = load_archive_entry(entry_id)
    if not data:
        raise HTTPException(status_code=404, detail="Archive entry not found")
    return data


@router.post("/archive", response_model=ArchiveEntry)
def api_save_archive(entry: ArchiveEntry):
    _ensure_dir()
    entry_id = entry.id or f"arch_{int(time.time()*1000)}"
    path = _entry_path(entry_id)
    existing = load_archive_entry(entry_id) or {}
    created_at = existing.get("created_at") or entry.created_at or int(time.time())
    data = {
        "id": _safe_id(entry_id),
        "type": entry.type or "chat",
        "name": entry.name or existing.get("name") or "Untitled",
        "preview": entry.preview or existing.get("preview") or "",
        "model": entry.model or existing.get("model") or "",
        "updated_at": int(time.time()),
        "created_at": created_at,
        "messages": entry.messages or existing.get("messages") or [],
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


@router.delete("/archive/{entry_id}")
def api_delete_archive(entry_id: str):
    path = _entry_path(entry_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archive entry not found")
    try:
        path.unlink()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete archive: {exc}") from exc
    return {"status": "deleted", "id": _safe_id(entry_id)}
