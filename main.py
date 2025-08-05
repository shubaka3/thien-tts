import os
import uuid
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import edge_tts

# --- Map giọng đọc ---
VOICE_MAP = {
    # --- English (US) ---
    "guy": "en-US-GuyNeural",
    "aria": "en-US-AriaNeural",
    "jenny": "en-US-JennyNeural",
    "michelle": "en-US-MichelleNeural",
    "davis": "en-US-DavisNeural",
    "brandon": "en-US-BrandonNeural",
    "christopher": "en-US-ChristopherNeural",
    "cora": "en-US-CoraNeural",
    "elizabeth": "en-US-ElizabethNeural",
    "jacob": "en-US-JacobNeural",
    "jane": "en-US-JaneNeural",
    "narrator": "en-US-NarratorNeural",
    "rodney": "en-US-RodneyNeural",
    
    # --- English (UK) ---
    "ryan": "en-GB-RyanNeural",
    "libby": "en-GB-LibbyNeural",
    "sonia": "en-GB-SoniaNeural",
    "maisie": "en-GB-MaisieNeural",
    "abbi": "en-GB-AbbiNeural",
    "alfie": "en-GB-AlfieNeural",
    "bella": "en-GB-BellaNeural",
    "hollie": "en-GB-HollieNeural",
    "maisie": "en-GB-MaisieNeural",
    "noah": "en-GB-NoahNeural",
    "oliver": "en-GB-OliverNeural",
    "olivia": "en-GB-OliviaNeural",
    "sophie": "en-GB-SophieNeural",
    "thomas": "en-GB-ThomasNeural",

    # --- English (Australia) ---
    "william": "en-AU-WilliamNeural",
    "natasha": "en-AU-NatashaNeural",
    "annette": "en-AU-AnnetteNeural",
    "carly": "en-AU-CarlyNeural",

    # --- English (India) ---
    "prabhat": "en-IN-PrabhatNeural",
    "neerja": "en-IN-NeerjaNeural",

    # --- English (New Zealand) ---
    "mitchell": "en-NZ-MitchellNeural",
    "molly": "en-NZ-MollyNeural",

    # --- English (South Africa) ---
    "leon": "en-ZA-LeonNeural",
    "tessa": "en-ZA-TessaNeural",

    # --- Tiếng Việt ---
    "nam": "vi-VN-NamNeural",
    "hoai_my": "vi-VN-HoaiMyNeural",

    # --- Tiếng Nhật ---
    "nanami": "ja-JP-NanamiNeural",
    "keita": "ja-JP-KeitaNeural",

    # --- Tiếng Trung (Phổ thông) ---
    "xiaoxiao": "zh-CN-XiaoxiaoNeural",
    "yunxi": "zh-CN-YunxiNeural",
    "yunyang": "zh-CN-YunyangNeural",
    "xiaoyi": "zh-CN-XiaoyiNeural",

    # --- Tiếng Hàn ---
    "sunhi": "ko-KR-SunHiNeural",
    "inho": "ko-KR-InHoNeural",

    # --- Tiếng Pháp ---
    "remy": "fr-FR-RemyNeural",
    "denise": "fr-FR-DeniseNeural",

    # --- Tiếng Đức ---
    "katrin": "de-DE-KatrinNeural",
    "conrad": "de-DE-ConradNeural",

    # --- Tiếng Tây Ban Nha ---
    "elvira": "es-ES-ElviraNeural",
    "alvaro": "es-ES-AlvaroNeural",
    "laura": "es-MX-LauraNeural",
    "jorge": "es-MX-JorgeNeural"
}


# --- FastAPI init ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
os.makedirs("output", exist_ok=True)

# --- Schema ---
class SynthesisRequest(BaseModel):
    text: str
    voice: str = "guy"

def resolve_voice(voice_name: str) -> str:
    """Chuyển voice ngắn thành voice đầy đủ EdgeTTS"""
    voice_name = voice_name.strip().lower()
    return VOICE_MAP.get(voice_name, "en-US-GuyNeural")  # default nếu sai

# --- API chính ---
@app.post("/synthesize/")
async def synthesize(data: SynthesisRequest):
    resolved_voice = resolve_voice(data.voice)
    uid = str(uuid.uuid4())
    mp3_path = f"output/{uid}.mp3"

    communicate = edge_tts.Communicate(data.text, resolved_voice)
    await communicate.save(mp3_path)

    return {
        "text": data.text,
        "voice": resolved_voice,
        "audio_file": f"http://192.168.1.143:8005/download/{uid}.mp3"
    }

# --- API demo ---
@app.get("/demo/{voice}")
async def demo(voice: str):
    resolved_voice = resolve_voice(voice)
    uid = str(uuid.uuid4())
    mp3_path = f"output/{uid}.mp3"

    demo_text = "Hello, how are you? I am an AI agent created to help you with your tasks efficiently and effectively."
    communicate = edge_tts.Communicate(demo_text, resolved_voice)
    await communicate.save(mp3_path)

    return {
        "text": demo_text,
        "voice": resolved_voice,
        "audio_file": f"http://192.168.1.143:8005/download/{uid}.mp3"
    }

# --- Download & Delete ---
@app.get("/download/{filename}")
async def download_file(filename: str):
    file_path = os.path.join("output", filename)
    if os.path.exists(file_path):
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "GET",
            "Cross-Origin-Resource-Policy": "cross-origin",
        }
        return FileResponse(file_path, media_type="audio/mpeg", filename=filename, headers=headers)
    return JSONResponse({"error": "File not found"}, status_code=404)

@app.delete("/delete/{filename}")
async def delete_file(filename: str):
    file_path = os.path.join("output", filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"message": f"{filename} deleted"}
    raise HTTPException(status_code=404, detail="File not found")
