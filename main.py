from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
import httpx

app = FastAPI()

# ----------------------------------------
# STATIC FILES
# ----------------------------------------
app.mount("/static", StaticFiles(directory="static"), name="static")

# ----------------------------------------
# MODELS
# ----------------------------------------
class ChatRequest(BaseModel):
    prompt: str
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int = 512


class ChatResponse(BaseModel):
    reply: str

# ----------------------------------------
# ROUTES
# ----------------------------------------

@app.get("/", response_class=HTMLResponse)
def root():
    index_path = Path("index.html")
    return index_path.read_text(encoding="utf-8")


# === Non-streaming endpoint used by your current frontend ===
@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    lm_url = "http://127.0.0.1:1234/v1/chat/completions"

    payload = {
        "model": request.model or "mistralai/mistral-nemo-instruct-2407",
        "messages": [{"role": "user", "content": request.prompt}],
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(lm_url, json=payload)
        r.raise_for_status()
        data = r.json()

    # Adjust if LM Studio’s JSON format differs
    reply_text = data["choices"][0]["message"]["content"]
    return ChatResponse(reply=reply_text)


# === Streaming endpoint (for later, if you want live tokens) ===
@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    lm_url = "http://127.0.0.1:1234/v1/chat/completions"

    payload = {
        "model": request.model or "mistralai/mistral-nemo-instruct-2407",
        "messages": [{"role": "user", "content": request.prompt}],
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
        "stream": True,
    }

    async def event_generator():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", lm_url, json=payload) as r:
                async for line in r.aiter_lines():
                    if not line:
                        continue

                    # LM Studio sends lines like: "data: {...}"
                    if line.startswith("data: "):
                        chunk = line[6:].strip()
                        if chunk == "[DONE]":
                            break
                        # send raw JSON chunk to frontend
                        yield chunk + "\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
