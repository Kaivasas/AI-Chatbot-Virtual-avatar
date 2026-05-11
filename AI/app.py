from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import json
import base64
from config import Config
from llm_client import llm_client, BASE_SYSTEM_PROMPT
from tts_engine import tts_engine
from memory_engine import memory_engine

app = Flask(__name__)
CORS(app)

def stream_typhoon_and_tts(user_input, history, user_name, long_term_memory, user_id):
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

    try:
        stream = llm_client.get_streaming_completion(messages)
        if not stream:
            yield json.dumps({"error": "LLM Client Error"}) + "\n"
            return

        full_response_text = ""
        buffer_text = ""
        
        for chunk in stream:
            token = chunk.choices[0].delta.content
            if token:
                buffer_text += token
                full_response_text += token

                if token in [" ", "\n", "!", "?", "ๆ"] or len(buffer_text) > 50:
                    clean_text = buffer_text.strip()
                    audio_base64 = None
                    if clean_text:
                        audio_data = tts_engine.generate_audio(clean_text)
                        if audio_data:
                            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                    
                    yield json.dumps({
                        "text": buffer_text,
                        "audio": audio_base64,
                        "done": False
                    }) + "\n"
                    buffer_text = ""

        if buffer_text.strip():
            audio_data = tts_engine.generate_audio(buffer_text.strip())
            audio_base64 = base64.b64encode(audio_data).decode('utf-8') if audio_data else None
            yield json.dumps({"text": buffer_text, "audio": audio_base64, "done": False}) + "\n"

        yield json.dumps({"text": "", "audio": None, "done": True}) + "\n"

        if user_id:
            memory_engine.save_message(user_id, 'user', user_input)
            memory_engine.save_message(user_id, 'assistant', full_response_text)

    except Exception as e:
        print(f"❌ Stream Error: {e}")
        yield json.dumps({"error": str(e)}) + "\n"

@app.route('/api/chat/stream', methods=['POST'])
def chat_stream_endpoint():
    data = request.json
    user_input = data.get('text', '')
    history = data.get('history', [])
    user_name = data.get('user_name', 'Unknown')
    user_id = data.get('user_id', '')
    limited_history = history[-6:] if history else []

    print(f"🌊 Streaming Chat for User ID: {user_id}")
    
    long_term_memory = ""
    if user_id:
        long_term_memory = memory_engine.get_relevant_memory(user_input, user_id)

    return Response(
        stream_with_context(stream_typhoon_and_tts(user_input, limited_history, user_name, long_term_memory, user_id)),
        content_type='application/x-ndjson'
    )

@app.route('/api/summarize', methods=['POST'])
def summarize_endpoint():
    data = request.json
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400

    result = memory_engine.process_summarization(user_id, llm_client.summarize)
    return jsonify({"message": result})

if __name__ == '__main__':
    if Config.validate():
        print(f"🚀 Starting Flask Server at http://127.0.0.1:{Config.PORT}")
        app.run(debug=Config.DEBUG, port=Config.PORT)
    else:
        print("❌ Server failed to start due to missing configuration.")
