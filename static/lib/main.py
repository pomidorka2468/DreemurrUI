from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from .chat import router as chat_router
from .notebook import router as notebook_router
from .character import fetch_character, list_characters, router as character_files_router
from .preferences import router as preferences_router

app = FastAPI()

# Serve static assets (index.html expects /static)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", response_class=HTMLResponse)
def root():
    index_path = Path("index.html")
    return index_path.read_text(encoding="utf-8")


@app.get("/characters/{char_id}")
def get_character(char_id: int):
    character = fetch_character(char_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    return character


@app.get("/characters")
def get_characters():
    return list_characters()


app.include_router(chat_router)
app.include_router(notebook_router)
app.include_router(preferences_router)
app.include_router(character_files_router)
