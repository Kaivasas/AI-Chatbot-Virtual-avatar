from supabase import create_client, Client
from sentence_transformers import SentenceTransformer
from config import Config

class MemoryEngine:
    def __init__(self):
        try:
            self.supabase: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
            print("✅ Supabase Connected Successfully!")
        except Exception as e:
            print(f"❌ Supabase Connection Error: {e}")
            self.supabase = None

        try:
            print("Loading Embedding Model...")
            self.embed_model = SentenceTransformer(Config.EMBEDDING_MODEL_NAME)
            print("✅ Embedding Model Loaded Successfully!")
        except Exception as e:
            print(f"❌ Embedding Model Load Error: {e}")
            self.embed_model = None

    def get_embedding(self, text):
        if not self.embed_model:
            return None
        return self.embed_model.encode(text).tolist()

    def save_message(self, user_id, role, content):
        if not self.supabase:
            return
        try:
            vector = self.get_embedding(content)
            data = {
                "user_id": user_id,
                "role": role,
                "content": content,
                "embedding": vector
            }
            self.supabase.table("messages").insert(data).execute()
        except Exception as e:
            print(f"❌ DB Save Error: {e}")

    def get_relevant_memory(self, user_input, user_id):
        if not self.supabase or not user_id:
            return ""
        
        try:
            query_vector = self.get_embedding(user_input)
            
            # Search Memories
            res_facts = self.supabase.rpc('match_memories', {
                'query_embedding': query_vector,
                'match_threshold': 0.35,
                'match_count': 3,
                'filter_user_id': user_id
            }).execute()
            
            # Search Logs
            res_logs = self.supabase.rpc('match_messages', {
                'query_embedding': query_vector,
                'match_threshold': 0.35,
                'match_count': 5,
                'filter_user_id': user_id
            }).execute()
            
            combined_memory = []
            if res_facts.data:
                combined_memory.append("=== ข้อเท็จจริงเกี่ยวกับ User (Long-term Facts) ===")
                for item in res_facts.data:
                    combined_memory.append(f"- {item['content']} (บันทึกเมื่อ: {item['created_at'][:10]})")
                combined_memory.append("")
                    
            if res_logs.data:
                combined_memory.append("=== บทสนทนาที่เคยคุย (Chat Logs) ===")
                for item in res_logs.data:
                    combined_memory.append(f"- {item['role']}: {item['content']}")
                
            return "\n".join(combined_memory)
        except Exception as e:
            print(f"⚠️ Memory Retrieval Error: {e}")
            return ""

    def process_summarization(self, user_id, llm_summarize_fn):
        if not self.supabase:
            return "❌ Supabase not initialized"
            
        try:
            response = self.supabase.table("messages") \
                .select("id, role, content, created_at") \
                .eq("user_id", user_id) \
                .eq("is_summarized", False) \
                .order("created_at") \
                .limit(50) \
                .execute()
                
            messages = response.data
            if not messages:
                return "ไม่มีข้อมูลใหม่ให้สรุป"

            chat_text = ""
            message_ids = []
            for msg in messages:
                date_str = msg['created_at'][:10]
                chat_text += f"[{date_str}] {msg['role']}: {msg['content']}\n"
                message_ids.append(msg['id'])

            summary_result = llm_summarize_fn(chat_text)
            
            if summary_result:
                vector = self.get_embedding(summary_result)
                data = {
                    "user_id": user_id,
                    "content": summary_result,
                    "embedding": vector
                }
                self.supabase.table("memories").insert(data).execute()
                
                self.supabase.table("messages") \
                    .update({"is_summarized": True}) \
                    .in_("id", message_ids) \
                    .execute()
                    
                return f"✅ สรุปเสร็จสิ้น: {summary_result}"
            return "❌ AI ไม่ได้ตอบกลับอะไรมา"
        except Exception as e:
            return f"❌ Summarization Error: {str(e)}"

# Global instance
memory_engine = MemoryEngine()
