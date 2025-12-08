from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx

from .chat import DEFAULT_MODEL, LM_URL

router = APIRouter()


class NotebookContinueRequest(BaseModel):
    text: str
    style: str | None = None
    model: str | None = None
    language: str | None = None


class NotebookRewriteRequest(BaseModel):
    selection: str
    style: str | None = None
    model: str | None = None
    language: str | None = None


class NotebookSummarizeRequest(BaseModel):
    text: str
    model: str | None = None
    language: str | None = None


class NotebookResponse(BaseModel):
    text: str


@router.post("/notebook/continue")
async def notebook_continue(req: NotebookContinueRequest):
    style = req.style or ""
    prompt = ( ""
        + "You are a writing assistant for long-form fiction.\n"
        + (f'Follow these style instructions: "{style}".\n' if style else "")
        + "Continue the story below in the same style. "
        + "If the text below ends with an unfinished sentence, do not start with a new sentence, but instead continue the existing one. "
        + "Answer with the same language used in the story. "
        + "Do not use '...' to show where you continue from "
        + "Do not repeat existing text, only continue from where it stops.\n\n"
        + "[STORY START]\n"
        + f"{req.text}\n"
        + "[STORY END]\n"
    )

    payload = {
        "model": req.model or DEFAULT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.8,
        "max_tokens": 513,
        "stream": True,
    }

    async def event_generator():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", LM_URL, json=payload) as response:
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        chunk = line[6:].strip()
                        if chunk == "[DONE]":
                            break
                        yield chunk + "\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/notebook/rewrite", response_model=NotebookResponse)
async def notebook_rewrite(req: NotebookRewriteRequest):
    style = req.style or ""
    prompt = (
        "You are a writing assistant for long-form fiction.\n"
        + (f'Follow these style instructions: "{style}".\n' if style else "")
        + ("Respond in " + req.language + ".\n" if req.language else "")
        + "Rewrite the following passage. Keep the meaning, but improve flow, "
        "wording, and style.\n\n"
        "[PASSAGE]\n"
        f"{req.selection}\n"
        "[END OF PASSAGE]\n"
    )

    payload = {
        "model": req.model or DEFAULT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": 513,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(LM_URL, json=payload)
        response.raise_for_status()
        data = response.json()

    reply_text = data["choices"][0]["message"]["content"]
    return NotebookResponse(text=reply_text)


@router.post("/notebook/summarize", response_model=NotebookResponse)
async def notebook_summarize(req: NotebookSummarizeRequest):
    prompt = (
        ("Respond in " + req.language + ".\n" if req.language else "")
        + "Summarize the following story in concise bullet points and then in one "
        "short paragraph:\n\n"
        f"{req.text}"
    )

    payload = {
        "model": req.model or DEFAULT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 513,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(LM_URL, json=payload)
        response.raise_for_status()
        data = response.json()

    reply_text = data["choices"][0]["message"]["content"]
    return NotebookResponse(text=reply_text)
