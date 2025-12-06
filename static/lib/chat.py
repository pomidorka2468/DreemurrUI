from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx

LM_URL = "http://127.0.0.1:1234/v1/chat/completions"
DEFAULT_MODEL = "dolphin3.0-llama3.1-8b"
from .character import fetch_character

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    prompt: str
    model: str | None = None
    character_id: int | None = 1
    language: str | None = None
    history: list[ChatMessage] | None = None


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    character = fetch_character(request.character_id or 1)
    system_prompt = (
        f"You are {character['name']}."
        f" Greeting: {character.get('greeting') or ''}."
        f" Persona: {character.get('personality') or ''}."
        if character
        else None
    )

    # include recent history before the new user turn
    history_messages = []
    if request.history:
        for msg in request.history:
            role = msg.role if msg.role in ("user", "assistant") else None
            if not role or not msg.content:
                continue
            history_messages.append({"role": role, "content": msg.content})

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append(
        {"role": "system", "content": "Respond in the same language the user used."}
    )
    messages.extend(history_messages)
    messages.append({"role": "user", "content": request.prompt})

    payload = {
        "model": request.model or DEFAULT_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 513,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(LM_URL, json=payload)
        response.raise_for_status()
        data = response.json()

    reply_text = data["choices"][0]["message"]["content"]
    return ChatResponse(reply=reply_text)


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    character = fetch_character(request.character_id or 1)
    system_prompt = (
        f"You are {character['name']}."
        f" Greeting: {character.get('greeting') or ''}."
        f" Persona: {character.get('personality') or ''}."
        if character
        else None
    )

    # include recent history before the new user turn
    history_messages = []
    if request.history:
        for msg in request.history:
            role = msg.role if msg.role in ("user", "assistant") else None
            if not role or not msg.content:
                continue
            history_messages.append({"role": role, "content": msg.content})

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append(
        {"role": "system", "content": "Respond in the same language the user used."}
    )
    messages.extend(history_messages)
    messages.append({"role": "user", "content": request.prompt})

    payload = {
        "model": request.model or DEFAULT_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 513,
        "stream": True,
    }

    async def event_generator():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", LM_URL, json=payload) as response:
                async for line in response.aiter_lines():
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
