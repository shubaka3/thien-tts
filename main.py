import os
import uuid
import asyncio
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import edge_tts
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
# Khởi tạo FastAPI
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Hoặc cụ thể frontend domain
    allow_methods=["*"],
    allow_headers=["*"],
)
# Đảm bảo thư mục output tồn tại
os.makedirs("output", exist_ok=True)

# Định nghĩa input schema
class SynthesisRequest(BaseModel):
    text: str
    voice: str = "vi-VN-NamMinhNeural"

# Endpoint xử lý tổng hợp TTS
@app.post("/synthesize/")
async def synthesize(data: SynthesisRequest):
    uid = str(uuid.uuid4())
    mp3_path = f"output/{uid}.mp3"

    # Tạo TTS
    communicate = edge_tts.Communicate(data.text, data.voice)
    await communicate.save(mp3_path)

    return {
        "text": data.text,
        "voice": data.voice,
        "audio_file": f"http://192.168.144.1:8005/download/{uid}.mp3"
    }

# Endpoint tải file nhị phân
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
        return FileResponse(
            file_path,
            media_type="audio/mpeg",
            filename=filename,
            headers=headers,
        )
    return JSONResponse({"error": "File not found"}, status_code=404)


@app.delete("/delete/{filename}")
async def delete_file(filename: str):
    file_path = os.path.join("output", filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"message": f"{filename} deleted"}
    raise HTTPException(status_code=404, detail="File not found")