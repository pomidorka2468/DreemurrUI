from pathlib import Path
from typing import Any, Dict
import json

from fastapi import APIRouter
from pydantic import BaseModel

CONFIG_PATH = Path("static/userdata/config.json")

router = APIRouter()


class Preferences(BaseModel):
    theme: str | None = None
    language: str | None = None
    character_id: int | None = None


def _load_config() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {}


def _save_config(data: Dict[str, Any]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


@router.get("/preferences", response_model=Preferences)
def get_preferences():
    cfg = _load_config()
    return Preferences(
        theme=cfg.get("theme"),
        language=cfg.get("language"),
        character_id=cfg.get("character_id"),
    )


@router.post("/preferences", response_model=Preferences)
def update_preferences(update: Preferences):
    cfg = _load_config()
    if update.theme is not None:
        cfg["theme"] = update.theme
    if update.language is not None:
        cfg["language"] = update.language
    if update.character_id is not None:
        cfg["character_id"] = int(update.character_id)
    _save_config(cfg)
    return Preferences(
        theme=cfg.get("theme"),
        language=cfg.get("language"),
        character_id=cfg.get("character_id"),
    )
