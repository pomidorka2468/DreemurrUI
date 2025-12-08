from pathlib import Path
import json
import re
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

WORLD_DIR = Path("static/userdata/world_info")


def _slugify(name: str) -> str:
  # simple file-safe slug from entry name
  base = re.sub(r"[^a-zA-Z0-9_-]+", "_", name.strip()) or "entry"
  return base.lower()


class WorldEntry(BaseModel):
  name: str
  description: str | None = None
  enabled: bool = True
  tokens: int | None = None
  slug: str | None = None
  previous_slug: str | None = None


def _estimate_tokens(text: Optional[str]) -> int:
  if not text:
    return 0
  # rough heuristic: 1 token ~= 4 chars
  return max(0, round(len(text) / 4))


def _list_world_files() -> List[Path]:
  if not WORLD_DIR.exists():
    return []
  return [p for p in WORLD_DIR.glob("*.json") if p.is_file()]


def _load_entry(path: Path) -> Optional[dict]:
  try:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
      slug = path.stem
      data.setdefault("slug", slug)
      data.setdefault("created_at", data.get("updated_at") or int(path.stat().st_mtime))
      data.setdefault("tokens", _estimate_tokens(data.get("description") or ""))
      data.setdefault("enabled", True)
      return data
  except Exception:
    return None
  return None


@router.get("/world")
def list_world_entries():
  items = []
  for path in _list_world_files():
    entry = _load_entry(path)
    if entry:
      items.append(entry)
  return sorted(items, key=lambda x: x.get("created_at") or 0)


def list_enabled_world_entries() -> List[dict]:
  """Return only enabled world info entries."""
  return [item for item in list_world_entries() if item.get("enabled")]


@router.get("/world/{slug}")
def get_world_entry(slug: str):
  target = WORLD_DIR / f"{_slugify(slug)}.json"
  if not target.exists():
    raise HTTPException(status_code=404, detail="World entry not found")
  entry = _load_entry(target)
  if not entry:
    raise HTTPException(status_code=500, detail="Failed to parse world entry")
  return entry


@router.post("/world")
def save_world_entry(payload: WorldEntry):
  WORLD_DIR.mkdir(parents=True, exist_ok=True)
  safe_slug = _slugify(payload.name)
  # handle rename: if caller provides previous_slug and it differs from the new slug
  if payload.previous_slug:
    prev_target = WORLD_DIR / f"{_slugify(payload.previous_slug)}.json"
    if prev_target.exists() and _slugify(payload.previous_slug) != safe_slug:
      # carry over data from the previous file if present
      existing = _load_entry(prev_target) or {}
      created_at = existing.get("created_at") or existing.get("updated_at")
      prev_target.unlink()
    else:
      created_at = None
  else:
    created_at = None

  target = WORLD_DIR / f"{safe_slug}.json"
  if created_at is None and target.exists():
    existing = _load_entry(target) or {}
    created_at = existing.get("created_at") or existing.get("updated_at")
  if created_at is None:
    created_at = int(time.time())

  tokens = payload.tokens if payload.tokens is not None else _estimate_tokens(payload.description or "")
  data = {
    "name": payload.name.strip() or "Untitled entry",
    "description": payload.description or "",
    "enabled": bool(payload.enabled),
    "tokens": tokens,
    "slug": safe_slug,
    "updated_at": int(time.time()),
    "created_at": created_at,
  }
  target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
  return data


@router.delete("/world/{slug}")
def delete_world_entry(slug: str):
  target = WORLD_DIR / f"{_slugify(slug)}.json"
  if target.exists():
    target.unlink()
    return {"deleted": True}
  return {"deleted": False}
