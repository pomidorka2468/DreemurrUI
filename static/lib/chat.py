from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import json

LM_URL = "http://127.0.0.1:1234/v1/chat/completions"
DEFAULT_MODEL = "dolphin3.0-llama3.1-8b"
from .character import fetch_character
from .archive import save_chat_archive
from .world_info import list_enabled_world_entries

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    prompt: str
    model: str | None = None
    character_id: int | None = 1
    mode: str | None = None
    language: str | None = None
    history: list[ChatMessage] | None = None
    archive_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    archive_id: str | None = None


def build_system_prompt(character: dict | None) -> str | None:
    if not character:
        return None
    mode = (character.get("mode") or "chat").lower()
    name = character.get("name") or "Assistant"
    greeting = character.get("greeting") or ""
    persona = character.get("personality") or ""
    gender = character.get("gender") or ""

    if mode == "roleplay":
        return (
            "You are roleplaying as {name}. Stay fully in character using their voice, goals, and mannerisms.\n"
            "Greeting: {greeting}\n"
            "Persona: {persona}\n"
            "Gender: {gender}\n"
            "Keep replies as immersive dialogue with light action cues, using present tense and emotion-rich tone. "
            "Use *italics* for actions and stage directions, and **bold** for strongly voiced text; do not escape or alter these markers. "
            "Do not break character or explain that you are an assistant."
        ).format(name=name, greeting=greeting, persona=persona, gender=gender)
    elif mode == "chat":
        return (
            "You are {name}, a helpful conversational assistant.\n"
            "Greeting: {greeting}\n"
            "Persona: {persona}\n"
            "Gender: {gender}\n"
            "Respond clearly and concisely, stay on topic, and adapt tone to match the persona. "
            "If the user provides a goal, focus on accomplishing it with numbered steps when useful. "
            "Do not roleplay; be direct and practical."
        ).format(name=name, greeting=greeting, persona=persona, gender=gender)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    character = fetch_character(request.character_id or 1) or {}
    if request.mode:
        character["mode"] = request.mode
    entry_type = "roleplay" if (character.get("mode") == "roleplay") else "chat"
    world_entries = list_enabled_world_entries()
    world_context = ""
    if world_entries:
        joined = "\n\n".join(
            f"- {item.get('name')}: {item.get('description') or ''}" for item in world_entries
        )
        world_context = "World context:\n" + joined
    system_prompt = build_system_prompt(character)

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
    if world_context:
        messages.append({"role": "system", "content": world_context})
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

    # Persist archive entry (chat) after reply
    full_history = history_messages + [
        {"role": "user", "content": request.prompt},
        {"role": "assistant", "content": reply_text},
    ]
    archive_id = save_chat_archive(
        request.archive_id,
        full_history,
        request.model or DEFAULT_MODEL,
        request.character_id,
        entry_type,
    )

    return ChatResponse(reply=reply_text, archive_id=archive_id)


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    character = fetch_character(request.character_id or 1) or {}
    if request.mode:
        character["mode"] = request.mode
    entry_type = "roleplay" if (character.get("mode") == "roleplay") else "chat"
    world_entries = list_enabled_world_entries()
    world_context = ""
    if world_entries:
        joined = "\n\n".join(
            f"- {item.get('name')}: {item.get('description') or ''}" for item in world_entries
        )
        world_context = "World context:\n" + joined
    system_prompt = build_system_prompt(character)

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
    if world_context:
        messages.append({"role": "system", "content": world_context})
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
        assistant_buffer = ""
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
                        try:
                            data = json.loads(chunk)
                            delta = data.get("choices", [{}])[0].get("delta", {}).get("content")
                            if delta:
                                assistant_buffer += delta
                        except Exception:
                            pass
                        # send raw JSON chunk to frontend
                        yield chunk + "\n"

        # after stream finishes, save archive entry
        full_history = history_messages + [
            {"role": "user", "content": request.prompt},
            {"role": "assistant", "content": assistant_buffer},
        ]
        save_chat_archive(
            request.archive_id,
            full_history,
            request.model or DEFAULT_MODEL,
            request.character_id,
            entry_type,
        )

    return StreamingResponse(event_generator(), media_type="text/event-stream")
