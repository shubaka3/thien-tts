# thien-tts
demo với cmd 


edge-tts --voice vi-VN-NamMinhNeural --text "Một tuần đã trôi qua. Gor… Con quái vật loạng choạng rên rỉ như nồi nước đang sôi. Một King Goblin. Kẻ cầm …" --write-media chap15.mp3 --write-subtitles chap15.srt


các sử dụng: 
clone code về
tạo máy ảo python : py -m venv venv
active máy ảo: venv\Scripts\activate
tải file requirements : pip install -r requirements.txt
chạy với lệnh + chọn port :     uvicorn main:app --reload --host 0.0.0.0 --port 8005
test qua api hoặc domain của unvicorn
domain/docs = api swagger  




chạy với api:
    http://127.0.0.1:8005/synthesize/
    body - raw
    {
    "text": "Xin chào Việt Nam!",
    "voice": "vi-VN-NamMinhNeural"
    }

    uvicorn main:app --reload --host 0.0.0.0 --port 8005


thứ tự:
    clone về, cài đặt thư viện, chạy lệnh trên