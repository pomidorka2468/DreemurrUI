# ----------------------------------------
# NOTEBOOK MODE MODELS
# ----------------------------------------

class NotebookContinueRequest(BaseModel):
    text: str
    style: str | None = None
    temperature: float = 0.8
    max_tokens: int = 512


class NotebookRewriteRequest(BaseModel):
    selection: str
    style: str | None = None
    temperature: float = 0.7
    max_tokens: int = 512


class NotebookSummarizeRequest(BaseModel):
    text: str
    max_tokens: int = 512


class NotebookResponse(BaseModel):
    text: str


LM_URL = "http://127.0.0.1:1234/v1/chat/completions"
DEFAULT_MODEL = "mistralai/mistral-nemo-instruct-2407"


# Continue story
@app.post("/notebook/continue", response_model=NotebookResponse)
async def notebook_continue(req: NotebookContinueRequest):
    style = req.style or ""
    prompt = (
        "You are a writing assistant for long-form fiction.\n"
        + (f'Follow these style instructions: "{style}".\n' if style else "")
        + "Continue the story below in the same style. "
          "Do not repeat existing text, only continue from where it stops.\n\n"
        "[STORY START]\n"
        f"{req.text}\n"
        "[STORY END]\n"
    )

    payload = {
        "model": DEFAULT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(LM_URL, json=payload)
        r.raise_for_status()
        data = r.json()

    reply_text = data["choices"][0]["message"]["content"]
    return NotebookResponse(text=reply_text)


# Rewrite selection
@app.post("/notebook/rewrite", response_model=NotebookResponse)
async def notebook_rewrite(req: NotebookRewriteRequest):
    style = req.style or ""
    prompt = (
        "You are a writing assistant for long-form fiction.\n"
        + (f'Follow these style instructions: "{style}".\n' if style else "")
        + "Rewrite the following passage. Keep the meaning, but improve flow, "
          "wording, and style.\n\n"
        "[PASSAGE]\n"
        f"{req.selection}\n"
        "[END OF PASSAGE]\n"
    )

    payload = {
        "model": DEFAULT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(LM_URL, json=payload)
        r.raise_for_status()
        data = r.json()

    reply_text = data["choices"][0]["message"]["content"]
    return NotebookResponse(text=reply_text)


# Summarize notebook
@app.post("/notebook/summarize", response_model=NotebookResponse)
async def notebook_summarize(req: NotebookSummarizeRequest):
    prompt = (
        "Summarize the following story in concise bullet points and then in one "
        "short paragraph:\n\n"
        f"{req.text}"
    )

    payload = {
        "model": DEFAULT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": req.max_tokens,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(LM_URL, json=payload)
        r.raise_for_status()
        data = r.json()

    reply_text = data["choices"][0]["message"]["content"]
    return NotebookResponse(text=reply_text)
