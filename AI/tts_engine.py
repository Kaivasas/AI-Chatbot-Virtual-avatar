import torch
import io
import re
from transformers import VitsModel, AutoTokenizer
from scipy.io.wavfile import write as write_wav
from config import Config

class TTSEngine:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"TTS Engine using Device: {self.device}")
        
        try:
            print(f"Loading TTS Model: {Config.TTS_MODEL_NAME}...")
            self.tokenizer = AutoTokenizer.from_pretrained(Config.TTS_MODEL_NAME)
            self.model = VitsModel.from_pretrained(Config.TTS_MODEL_NAME).to(self.device)
            self.sampling_rate = self.model.config.sampling_rate
            print("✅ TTS Model Loaded Successfully!")
        except Exception as e:
            print(f"❌ Failed to load TTS Model: {e}")
            self.model = None

    def generate_audio(self, text_input):
        if not self.model or not text_input:
            return None

        # Check if text has at least one Thai or English character
        # To avoid "narrow(): length must be non-negative" error for punctuations only
        if not re.search(r'[a-zA-Z\u0e01-\u0e5b]', text_input):
            return None

        try:
            inputs = self.tokenizer(text_input, return_tensors="pt").to(self.device)
            
            with torch.no_grad():
                output_waveform = self.model(**inputs).waveform

            waveform_np = output_waveform.cpu().numpy().squeeze()
            
            buffer = io.BytesIO()
            write_wav(buffer, rate=self.sampling_rate, data=waveform_np)
            return buffer.getvalue()
        except Exception as e:
            print(f"❌ TTS Generation Error: {e}")
            return None

# Global instance
tts_engine = TTSEngine()
