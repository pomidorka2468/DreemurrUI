from pathlib import Path
from typing import Any, Dict, Optional, Callable, List
import json
import re
import time

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from io import BytesIO
import secrets
from PIL import Image, ImageDraw

router = APIRouter()

CHAR_DIR = Path("static/userdata/characters")
ICON_DIR = Path("static/userdata/character_icons")


class CharacterFile(BaseModel):
    id: int | None = None
    name: str
    icon: str | None = None
    greeting: str | None = None
    personality: str | None = None
    icon_path: str | None = None


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_-]+", "_", name.strip()) or "character"
    return base.lower()


def _safe_id(raw: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", raw.strip()) or "character"


def delete_character_file(char_id: str) -> bool:
    target = CHAR_DIR / f"{_safe_id(str(char_id))}.json"
    if target.exists():
        target.unlink()
        return True
    return False

def _list_character_files() -> List[Path]:
    if not CHAR_DIR.exists():
        return []
    return [p for p in CHAR_DIR.glob("*.json") if p.is_file()]

def fetch_character_file(char_id: int) -> Optional[Dict[str, Any]]:
    for path in _list_character_files():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if int(data.get("id", -1)) == int(char_id):
                return data
        except Exception:
            continue
    return None


def fetch_character(char_id: int, db_provider: Optional[Callable[[], Any]] = None) -> Optional[Dict[str, Any]]:
    return fetch_character_file(char_id)


def list_characters(db_provider: Optional[Callable[[], Any]] = None) -> list[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for path in _list_character_files():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                items.append(data)
        except Exception:
            continue
    return items


@router.post("/characters/file", response_model=CharacterFile)
def save_character_file(payload: CharacterFile):
    # keep filename stable by id so renaming does not create new files
    if payload.id is None:
        payload.id = int(time.time() * 1000)
    CHAR_DIR.mkdir(parents=True, exist_ok=True)
    target = CHAR_DIR / f"{_safe_id(str(payload.id))}.json"
    data = payload.model_dump()
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


@router.delete("/characters/file/{char_id}")
def remove_character_file(char_id: str):
    deleted = delete_character_file(char_id)
    return {"deleted": deleted}


@router.post("/characters/file/upload_icon")
async def upload_icon(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    # always store as PNG and round-mask the avatar
    safe_stem = re.sub(r"[^a-zA-Z0-9_-]+", "_", Path(file.filename).stem) or "icon"
    unique_suffix = secrets.token_hex(4)
    filename = f"{safe_stem}_{unique_suffix}.png"
    target = ICON_DIR / filename
    content = await file.read()

    try:
        image = Image.open(BytesIO(content)).convert("RGBA")
    except Exception:
        raise HTTPException(status_code=400, detail="Unsupported image file")

    size = min(image.width, image.height)
    # center-crop to square
    left = (image.width - size) // 2
    top = (image.height - size) // 2
    right = left + size
    bottom = top + size
    square = image.crop((left, top, right, bottom))

    # apply circular mask
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    square.putalpha(mask)

    buffer = BytesIO()
    square.save(buffer, format="PNG")
    target.write_bytes(buffer.getvalue())

    rel_path = f"/static/userdata/character_icons/{filename}"
    return {"path": rel_path}
