import json
import base64
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from config import Config
from llm_client import llm_client, BASE_SYSTEM_PROMPT
from tts_engine import tts_engine
from memory_engine import memory_engine

from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI(title="Alice AI Backend")

class NormalizePathMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if "//" in path:
            new_path = path.replace("//", "/")
            request.scope["path"] = new_path
        return await call_next(request)

# Middlewares
app.add_middleware(NormalizePathMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    text: str
    history: List[dict] = []
    user_name: Optional[str] = "Unknown"
    user_id: Optional[str] = ""

async def stream_typhoon_and_tts(user_input: str, history: List[dict], user_name: str, long_term_memory: str, user_id: str):
    display_name = user_name if user_name and user_name != 'Unknown' else 'เธอ'
    rag_prompt = (
        f"{BASE_SYSTEM_PROMPT}\n\n"
        f"=== ข้อมูลผู้ใช้ปัจจุบัน ===\n"
        f"คู่สนทนาของคุณชื่อ: '{display_name}'\n"
        f"========================\n\n"
        f"=== ความทรงจำ (Context) ===\n"
        f"{long_term_memory if long_term_memory else '- ไม่มีข้อมูล'}\n"
        f"===========================\n\n"
        f"=== กฎเหล็ก ===\n"
        f"1. ตอบโดยอ้างอิงความทรงจำ\n"
        f"2. ห้ามเดาหรือแต่งเรื่องเอง\n"
        f"3. ถ้าจำไม่ได้ให้บอกตามตรง\n"
    )
    
    messages = [{"role": "system", "content": rag_prompt}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_input})

    # Sequence of TTS tasks to ensure correct order
    tts_tasks = []
    full_response_text = []

    try:
        stream = await llm_client.get_streaming_completion(messages)
        if not stream:
            yield json.dumps({"error": "LLM Client Error"}) + "\n"
            return

        buffer_text = ""
        
        async for chunk in stream:
            token = chunk.choices[0].delta.content
            if token:
                buffer_text += token
                full_response_text.append(token)

                # 1. Yield text token IMMEDIATELY (with slight pacing to prevent text outrunning audio)
                yield json.dumps({"text": token, "audio": None, "done": False}) + "\n"
                await asyncio.sleep(0.01) # Small delay to make it feel more natural

                # 2. Check for sentence boundaries
                # Thresholds: split on punctuation if buffer is long enough, OR if buffer is very long
                if (token in ["\n", "!", "?", "ๆ", " "] and len(buffer_text) > 30) or len(buffer_text) > 100:
                    clean_text = buffer_text.strip()
                    if clean_text:
                        # Create TTS task but DO NOT await it yet
                        task = asyncio.create_task(asyncio.to_thread(tts_engine.generate_audio, clean_text))
                        tts_tasks.append(task)
                    buffer_text = ""

                # 3. Check if the oldest TTS task is done and yield its audio
                # This ensures Sentence 1 audio ALWAYS comes before Sentence 2
                while tts_tasks and tts_tasks[0].done():
                    completed_task = tts_tasks.pop(0)
                    audio_data = completed_task.result()
                    if audio_data:
                        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                        yield json.dumps({"text": "", "audio": audio_base64, "done": False}) + "\n"

        # Final cleanup for remaining buffer
        if buffer_text.strip():
            task = asyncio.create_task(asyncio.to_thread(tts_engine.generate_audio, buffer_text.strip()))
            tts_tasks.append(task)

        # Wait for all remaining TTS tasks in ORDER
        for task in tts_tasks:
            audio_data = await task
            if audio_data:
                audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                yield json.dumps({"text": "", "audio": audio_base64, "done": False}) + "\n"

        # Final signal
        yield json.dumps({"text": "", "audio": None, "done": True}) + "\n"

        # Background memory save
        final_response = "".join(full_response_text)
        if user_id:
            asyncio.create_task(memory_engine.save_message(user_id, 'user', user_input))
            asyncio.create_task(memory_engine.save_message(user_id, 'assistant', final_response))

    except Exception as e:
        print(f"❌ Stream Error: {e}")
        yield json.dumps({"error": str(e)}) + "\n"

@app.post("/api/chat/stream")
async def chat_stream_endpoint(request: ChatRequest):
    user_input = request.text
    history = request.history
    user_name = request.user_name
    user_id = request.user_id
    limited_history = history[-6:] if history else []

    print(f"🌊 Ordered Parallel Chat for User ID: {user_id}")
    
    long_term_memory = ""
    if user_id:
        long_term_memory = await memory_engine.get_relevant_memory(user_input, user_id)

    return StreamingResponse(
        stream_typhoon_and_tts(user_input, limited_history, user_name, long_term_memory, user_id),
        media_type="application/x-ndjson"
    )

@app.post("/api/summarize")
async def summarize_endpoint(request: Request):
    data = await request.json()
    user_id = data.get('user_id')
    if not user_id:
        return {"error": "User ID is required"}
    result = await memory_engine.process_summarization(user_id, llm_client.summarize)
    return {"message": result}

if __name__ == "__main__":
    import uvicorn
    if Config.validate():
        print(f"🚀 Starting Stabilized FastAPI Server at http://127.0.0.1:{Config.PORT}")
        uvicorn.run(app, host="0.0.0.0", port=Config.PORT)
    else:
        print("❌ Server failed to start due to missing configuration.")
