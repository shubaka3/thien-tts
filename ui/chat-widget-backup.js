const urlParams = new URLSearchParams(window.location.search);
const aiType = urlParams.get('ai') || 'default';
const encryption_api = urlParams.get('encryption_api') || 'default';
const encryption_secret = urlParams.get('encryption_secret') || 'default';
const email = urlParams.get('email') || 'user@example.com';

console.log("Using AI type:", aiType);
console.log("Parameters:", { encryption_api, encryption_secret, email });

let audioUnlocked = false;

function unlockAudioPlayback() {
    if (audioUnlocked) return;

    const silentAudio = new Audio();

    // ✅ Phương án 1: dùng file local (nếu có)
    silentAudio.src = "https://vmentor.emg.edu.vn/ui/audio.mp3";

    // Nếu load file thất bại → fallback về base64
    silentAudio.onerror = () => {
        console.warn("⚠️ Failed to load external audio. Falling back to base64 silent audio.");

        // ✅ Phương án 2: dùng base64 (silent)
        silentAudio.src = "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAA==";
        silentAudio.play().then(() => {
            console.log("🔓 Audio unlocked via fallback");
            audioUnlocked = true;
        }).catch((e) => {
            console.warn("🔒 Unlock failed on fallback", e);
        });
    };

    // Cố gắng play file silent (ui/audio.mp3)
    silentAudio.play().then(() => {
        console.log("🔓 Audio unlocked");
        audioUnlocked = true;
    }).catch((e) => {
        console.warn("🔒 Unlock failed on first attempt", e);
    });
}


class ChatWidget {
    constructor() {
        this.config = window.APP_CONFIG || {};
        this.currentLanguage = "English";
        this.currentLangCode = "en-US";
        this.isRecording = false;
        this.recognition = null;
        this.finalTranscript = '';
        this.userId = null;
        this.isVoiceMode = false;
        this.audioPlayer = null;
        this.voiceStartSound = document.getElementById('voice-start-sound');
        this.voiceStopSound = document.getElementById('voice-stop-sound');
        
        // Voice visualizer
        this.canvas = document.getElementById('voice-visualizer-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.audioCtx = null;
        this.analyser = null;
        this.dataArray = null;
        this.audio = null;
        this.source = null;
        this.baseRadius = 80;
        this.points = 64;
        this.animationId = null;
        
        this.init();
        this.startText = "Hello! I am AI Assistant. Change to Voice Model to start a call."; // default
    }

    async init() {
        await this.getUserId();
        await this.getStartText();  // ✅ fetch start_text sau khi có userId
        this.renderInitialMessage(); // ✅ render ra UI
        this.bindEvents();
        // this.setupLanguageSelector();
        this.setupModeSwitcher();
        this.setupSpeechRecognition();
        this.setupVoiceVisualizer();
    }

    async getUserId() {
        try {
            const response = await fetch(`https://vmentor-service.emg.edu.vn/api/user-id?email=${encodeURIComponent(email)}`);
            if (response.ok) {
                const data = await response.json();
                this.userId = data.user_id;
                console.log('User ID retrieved:', this.userId);
            } else {
                console.error('Failed to get user ID');
            }
        } catch (error) {
            console.error('Error getting user ID:', error);
        }
    }

    
    async getStartText() {
        if (!this.userId || !encryption_secret) return;
        try {
            const response = await fetch(
                `https://vmentor-service.emg.edu.vn/api/collections/${encryption_secret}?user_id=${this.userId}`,
                { headers: { accept: "application/json" } }
            );
            if (response.ok) {
                const data = await response.json();
                if (data.start_text) {
                    this.startText = data.start_text;
                }
                console.log("Start text:", this.startText);
            } else {
                console.error("Failed to get collection start text");
            }
        } catch (error) {
            console.error("Error getting start text:", error);
        }
    }

    renderInitialMessage() {
        const chatBox = document.getElementById("chat-box");
        chatBox.innerHTML = `
            <div class="message-wrapper bot">
                <img src="https://static.vecteezy.com/system/resources/previews/007/225/199/non_2x/robot-chat-bot-concept-illustration-vector.jpg" alt="Bot" class="avatar">
                <div class="message bot">${this.startText}</div>
            </div>
        `;
    }
    
    bindEvents() {
        document.getElementById('send-button').addEventListener('click', () => this.sendMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('voice-record-btn').addEventListener('click', async () => {
            // Bắt buộc kích hoạt AudioContext (vì context chưa resume nên bị chặn autoplay)
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
                console.log('🔊 AudioContext resumed on user interaction');
            }

            unlockAudioPlayback(); 
            await this.toggleVoiceRecording();
        });

        document.getElementById('voice-stop-btn').addEventListener('click', () => {
            this.stopVoiceRecording();
        });
        document.getElementById('back-to-text-btn').addEventListener('click', () => {
            this.switchToTextMode();
        });
    }

    setupLanguageSelector() {
        const langButtons = document.querySelectorAll(".lang-btn");
        const messageInput = document.getElementById('message-input');

        langButtons.forEach(button => {
            // Xóa sự kiện cũ bằng cách replace node
            const newBtn = button.cloneNode(true);
            button.parentNode.replaceChild(newBtn, button);

            newBtn.addEventListener("click", () => {
                document.querySelectorAll(".lang-btn").forEach(btn => btn.classList.remove("active"));
                newBtn.classList.add("active");

                this.currentLanguage = newBtn.getAttribute("data-lang");
                this.currentLangCode = newBtn.getAttribute("data-lang-code");

                if (this.currentLangCode === 'vi-VN') {
                    messageInput.placeholder = "Nhập tin nhắn...";
                } else {
                    messageInput.placeholder = "Enter a message...";
                }

                if (this.recognition) {
                    this.recognition.lang = this.currentLangCode;
                }
                console.log(`Language changed to: ${this.currentLanguage} (${this.currentLangCode})`);
            });
        });
    }

    setupModeSwitcher() {
        const modeToggle = document.getElementById('mode-toggle');
        const textInputArea = document.getElementById('text-input-area');
        const voiceModeInterface = document.getElementById('voice-mode-interface');

        modeToggle.addEventListener('change', (e) => {
            this.isVoiceMode = e.target.checked;
            if (this.isVoiceMode) {
                textInputArea.style.display = 'none';
                voiceModeInterface.classList.add('active');
                this.startVoiceVisualizer();
                this.setupLanguageSelector();
            } else {
                textInputArea.style.display = 'block';
                voiceModeInterface.classList.remove('active');
                this.stopVoiceVisualizer();
            }
        });
    }

    switchToTextMode() {
        // Stop any ongoing recording
        if (this.isRecording) {
            this.stopVoiceRecording();
        }
        
        // Switch back to text mode
        this.isVoiceMode = false;
        document.getElementById('mode-toggle').checked = false;
        document.getElementById('text-input-area').style.display = 'block';
        document.getElementById('voice-mode-interface').classList.remove('active');
        this.stopVoiceVisualizer();
    }

    setupVoiceVisualizer() {
        // Initialize audio context for visualizer
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 128;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    startVoiceVisualizer() {
        if (this.animationId) return;
        this.animate();
    }

    stopVoiceVisualizer() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawSmoothBlob(cx, cy, radius, intensity, color, opacity, lineWidth, rotation) {
        this.ctx.beginPath();
        const len = this.points;
        for (let i = 0; i <= len; i++) {
            const angle = (Math.PI * 2 * i) / len;
            const noise = Math.sin(i * 0.7 + rotation * 2) * intensity;
            const r = radius + noise;
            const x = cx + Math.cos(angle + rotation) * r;
            const y = cy + Math.sin(angle + rotation) * r;
            i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
        }
        this.ctx.closePath();

        this.ctx.strokeStyle = `rgba(${color}, ${opacity})`;
        this.ctx.lineWidth = lineWidth;
        this.ctx.shadowColor = `rgba(${color}, ${opacity * 0.6})`;
        this.ctx.shadowBlur = 35;
        this.ctx.stroke();
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let average = 0;
            for (let i = 0; i < 16; i++) average += this.dataArray[i];
            average /= 16;
            const energy = average * 0.25 + 15;

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const t = performance.now() * 0.001;

            this.drawSmoothBlob(this.centerX, this.centerY, this.baseRadius + energy, 6, "0,255,238", 0.4, 1.5, t * 0.3);
            this.drawSmoothBlob(this.centerX, this.centerY, this.baseRadius + 25 + energy * 0.4, 10, "0,255,238", 0.25, 1.2, -t * 0.5);
            this.drawSmoothBlob(this.centerX, this.centerY, this.baseRadius + 45 + energy * 0.3, 14, "0,255,238", 0.15, 0.9, t * 0.2);
        }
    }

    typeText(text, delay = 50) {
        const textDisplay = document.getElementById('voice-text-display');
        let i = 0;
        textDisplay.textContent = "";
        const interval = setInterval(() => {
            textDisplay.textContent += text[i];
            i++;
            if (i >= text.length) clearInterval(interval);
        }, delay);
    }

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("Speech Recognition not supported in this browser.");
            document.querySelector('.mode-switcher').style.display = 'none';
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.currentLangCode;

        this.recognition.onstart = () => {
            this.isRecording = true;
            this.finalTranscript = '';
            document.getElementById('voice-text-display').textContent = 'Listening...';
            document.getElementById('voice-record-btn').classList.add('recording');
            document.getElementById('voice-stop-btn').style.display = 'inline-block';
            document.getElementById('voice-record-btn').style.display = 'none';
            
            // Play start sound
            this.voiceStartSound.play().catch(e => console.log('Sound play failed:', e));
            
            console.log("Voice recognition started. Speak now. Click stop to end.");
        };

        this.recognition.onend = () => {
            this.isRecording = false;
            document.getElementById('voice-record-btn').classList.remove('recording');
            document.getElementById('voice-stop-btn').style.display = 'none';
            document.getElementById('voice-record-btn').style.display = 'inline-block';
            console.log("Voice recognition stopped.");
        };

        this.recognition.onresult = (event) => {
            let interim_transcript = '';
            let final_transcript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final_transcript += event.results[i][0].transcript;
                } else {
                    interim_transcript += event.results[i][0].transcript;
                }
            }
            this.finalTranscript += final_transcript;
            document.getElementById('voice-text-display').textContent = this.finalTranscript + interim_transcript;
        };

        this.recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if(event.error === 'not-allowed') {
                this.typeText('Vui lòng cho phép truy cập microphone trong trình duyệt của bạn.');
            } else if(event.error !== 'no-speech'){
               this.typeText(`Lỗi nhận dạng giọng nói: ${event.error}`);
            }
        };
    }

    async toggleVoiceRecording() {
        if (!this.recognition) return;

        if (this.isRecording) {
            this.stopVoiceRecording();
        } else {
            try {
                // Try to get microphone permission first
                await navigator.mediaDevices.getUserMedia({ audio: true });
                this.recognition.start();
            } catch(e) {
                console.error("Error starting recognition:", e);
                this.isRecording = false;
                this.typeText('Không thể truy cập microphone. Vui lòng kiểm tra quyền truy cập.');
            }
        }
    }

    stopVoiceRecording() {
        if (this.recognition && this.isRecording) {
            this.recognition.stop();
            
            // Play stop sound
            this.voiceStopSound.play().catch(e => console.log('Sound play failed:', e));
            
            setTimeout(() => {
                const transcriptToSend = document.getElementById('voice-text-display').textContent.trim();
                console.log("Final transcript to send:", transcriptToSend);
                if (transcriptToSend && transcriptToSend !== 'Đang nghe...') {
                    this.sendMessage(transcriptToSend);
                }
                document.getElementById('voice-text-display').textContent = '...';
            }, 250);
        }
    }

    async sendMessage(messageOverride) {
        const input = document.getElementById('message-input');
        const message = messageOverride || input.value.trim();
        if (!message) return;
        input.disabled = true;
        document.getElementById('send-button').disabled = true;
        this.appendMessage(message, 'user');
        input.value = '';
        this.showTyping(true);
        try {
            console.log('Sending message to API:', message);
            // Always use stream: false in voice mode, true in text mode
            const streamValue = this.isVoiceMode ? false : true;
            console.log('stream param:', streamValue);
            const response = await fetch('https://vmentor-service.emg.edu.vn/api/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'user',
                            content: message
                        }
                    ],
                    ai_id: encryption_api,
                    user_id: this.userId,
                    collection_id: encryption_secret,
                    stream: streamValue
                })
            });
            this.showTyping(false);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/event-stream')) {
                await this.handleStreamingResponse(response);
            } else {
                const data = await response.json();
                await this.handleChatResponse(data);
            }
        } catch (error) {
            this.showTyping(false);
            console.error('Error:', error);
            this.appendMessage(`Lỗi kết nối: ${error.message}`, 'bot');
        } finally {
            input.disabled = false;
            document.getElementById('send-button').disabled = false;
            input.focus();
        }
    }

    async handleStreamingResponse(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let botMessageContent = '';
        let messageElement = this.appendMessage('', 'bot', true);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); 

            for (const line of lines) {
                if (line.trim().startsWith('data: ')) {
                    const data = line.trim().substring(6);
                    if (data === '[DONE]') continue;
                    
                    try {
                        // Handle different response formats
                        if (data.startsWith('{')) {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content || 
                                           parsed.answer || 
                                           parsed.content || 
                                           '';
                            if (content) {
                                botMessageContent += content;
                                this.updateMessage(messageElement, botMessageContent);
                            }
                        } else if (data.trim()) {
                            // Handle plain text responses
                            botMessageContent += data;
                            this.updateMessage(messageElement, botMessageContent);
                        }
                    } catch (err) {
                        console.error('JSON parse error:', data, err);
                        // If JSON parsing fails, treat as plain text
                        if (data.trim() && !data.includes('data:')) {
                            botMessageContent += data;
                            this.updateMessage(messageElement, botMessageContent);
                        }
                    }
                }
            }
        }

        // After streaming is complete, handle TTS if in voice mode
        if (this.isVoiceMode && botMessageContent.trim()) {
            await this.handleTTS(botMessageContent);
        }
    }

    async handleChatResponse(data) {
        const botMessage = data.answer || data.choices?.[0]?.message?.content || data.content || data.output || JSON.stringify(data);
        this.appendMessage(botMessage, 'bot');
        console.log(data.content)
        // Handle TTS if in voice mode
        if (this.isVoiceMode && botMessage.trim()) {
            console.log('Handling TTS for voice mode', botMessage);
            await this.handleTTS(botMessage);
        }
    }

    async handleTTS(text) {
        try {
            if (!text || !text.trim()) {
                console.warn('TTS called with empty text, skipping.');
                return;
            }
            console.log('Calling TTS with text:', text);
            this.typeText(text);
            const ttsResponse = await fetch('https://vmentor.emg.edu.vn/synthesize/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    voice: this.currentLangCode === 'vi-VN' ? 'nam' : 'hoai_my'
                })
            });
            if (ttsResponse.ok) {
                const ttsData = await ttsResponse.json();
                await this.playAudioWithVisualizer(ttsData.audio_file);
                await this.deleteAudioFile(ttsData.audio_file);
            } else {
                console.error('TTS API error:', ttsResponse.status);
            }
        } catch (error) {
            console.error('TTS error:', error);
        }
    }

    async playAudioWithVisualizer(audioUrl) {
        return new Promise(async (resolve, reject) => {
            if (this.audioCtx.state === 'suspended') {
                try {
                    await this.audioCtx.resume();
                    console.log('🔊 Resumed AudioContext before playing audio');
                } catch (e) {
                    console.error('Failed to resume AudioContext', e);
                }
            }

            this.audio = new Audio(audioUrl);
            this.audio.crossOrigin = "anonymous";

            this.source = this.audioCtx.createMediaElementSource(this.audio);
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);

            this.audio.onended = () => {
                resolve();
            };
            this.audio.onerror = (error) => {
                console.error('Audio playback error:', error);
                reject(error);
            };

            try {
                await this.audio.play();
            } catch (e) {
                console.error('Failed to play audio:', e);
                reject(e);
            }
        });
    }


    async deleteAudioFile(audioUrl) {
        try {
            const filename = audioUrl.split('/').pop();
            const deleteResponse = await fetch(`https://vmentor.emg.edu.vn/delete/${filename}`, {
                method: 'DELETE'
            });
            
            if (deleteResponse.ok) {
                console.log('Audio file deleted successfully');
            } else {
                console.error('Failed to delete audio file');
            }
        } catch (error) {
            console.error('Error deleting audio file:', error);
        }
    }
    
    appendMessage(text, type = "user", isStreaming = false) {
        const chatBox = document.getElementById('chat-box');
        const msgWrapper = document.createElement('div');
        msgWrapper.className = `message-wrapper ${type}`;

        const avatar = document.createElement('img');
        avatar.className = 'avatar';
         avatar.src = type === "bot" 
            ? (this.config.AVATAR_BOT_URL || "https://static.vecteezy.com/system/resources/previews/007/225/199/non_2x/robot-chat-bot-concept-illustration-vector.jpg") 
            : (this.config.AVATAR_USER_URL || "https://static.vecteezy.com/system/resources/thumbnails/004/607/791/small_2x/man-face-emotive-icon-smiling-male-character-in-blue-shirt-flat-illustration-isolated-on-white-happy-human-psychological-portrait-positive-emotions-user-avatar-for-app-web-design-vector.jpg");
        avatar.alt = type;

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;

        msgWrapper.appendChild(avatar);
        msgWrapper.appendChild(msgDiv);

        if (type === 'user') {
            msgWrapper.style.flexDirection = 'row-reverse';
        }

        chatBox.appendChild(msgWrapper);
        
        if (isStreaming) {
            msgDiv.innerHTML = '<em>...</em>';
        } else {
            this.updateMessage(msgWrapper, text);
        }
        
        this.scrollToBottom();
        return msgWrapper;
    }

    updateMessage(messageElement, content) {
        const messageDiv = messageElement.querySelector('.message');
        if (!messageDiv) return;

        if (!content && content !== '') {
            messageDiv.innerHTML = '<em>...</em>';
            return;
        }
        // Hàm này không thay đổi, nó chỉ gọi processContent
        messageDiv.innerHTML = this.processContent(content);
        this.scrollToBottom();
    }

    /**
     * Hàm xử lý Markdown chuyên sâu, được thiết kế lại hoàn toàn để đạt hiệu quả tối đa.
     * Hoạt động theo quy trình logic để đảm bảo định dạng chính xác.
     */
    processContent(content) {
        if (!content) return '';

        const codeBlocks = [];
        
        // Helper function to escape basic HTML characters to prevent XSS attacks
        const escapeHtml = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // --- BƯỚC 1: BẢO VỆ CÁC KHỐI MÃ (CODE BLOCKS) ---
        let processedContent = content.trim().replace(/```([\s\S]*?)```/g, (match, code) => {
            const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
            codeBlocks.push(code);
            return placeholder;
        });

        // --- BƯỚC 2: TÁCH VÀ XỬ LÝ CÁC KHỐI (BLOCKS) ---
        const blocks = processedContent.split(/\n\n+/);

        const htmlBlocks = blocks.map(block => {
            block = block.trim();
            if (block === '') return '';

            // Tiêu đề (Headers): #, ##, ###
            if (block.startsWith('### ')) return `<h3>${escapeHtml(block.substring(4))}</h3>`;
            if (block.startsWith('## ')) return `<h2>${escapeHtml(block.substring(3))}</h2>`;
            if (block.startsWith('# ')) return `<h1>${escapeHtml(block.substring(2))}</h1>`;

            // Đường kẻ ngang (Horizontal Rule)
            if (block.match(/^\s*(?:---|\*\*\*|___)\s*$/)) return '<hr>';

            // Trích dẫn (Blockquotes)
            if (block.startsWith('> ')) {
                const lines = block.split('\n').map(line => escapeHtml(line.replace(/^> ?/, ''))).join('<br>');
                return `<blockquote>${lines}</blockquote>`;
            }

            // Danh sách không có thứ tự (Unordered Lists)
            if (block.startsWith('* ') || block.startsWith('- ')) {
                const items = block.split('\n').map(line => `<li>${escapeHtml(line.substring(2))}</li>`).join('');
                return `<ul>${items}</ul>`;
            }

            // Danh sách có thứ tự (Ordered Lists)
            if (block.match(/^\d+\. /)) {
                const items = block.split('\n').map(item => `<li>${escapeHtml(item.replace(/^\d+\.\s*/, ''))}</li>`).join('');
                return `<ol>${items}</ol>`;
            }

            // Mặc định là đoạn văn (Paragraph)
            // Đây là nơi xử lý xuống dòng chính xác
            return `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`;
        });

        let finalHtml = htmlBlocks.join('');

        // --- BƯỚC 3: XỬ LÝ ĐỊNH DẠNG TRONG DÒNG (INLINE) ---
        finalHtml = finalHtml
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, (match, code) => `<code>${escapeHtml(code)}</code>`)
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(text)}</a>`);

        // --- BƯỚC 4: KHÔI PHỤC LẠI CÁC KHỐI MÃ ---
        finalHtml = finalHtml.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => {
            const code = codeBlocks[parseInt(index, 10)];
            const escapedCode = escapeHtml(code);
            const jsEscapedCode = this.escapeForJs(code);
            return `<div class="code-block"><button class="copy-btn" onclick="copyToClipboard(this, '${jsEscapedCode}')">Copy</button><pre><code>${escapedCode}</code></pre></div>`;
        });

        return finalHtml;
    }

    // Hàm escapeForJs vẫn hữu ích cho nút "Copy"
    escapeForJs(text) {
        return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    }



    showTyping(show) {
        const indicator = document.getElementById('typing-indicator');
        indicator.style.display = show ? 'block' : 'none';
        if (show) this.scrollToBottom();
    }

    scrollToBottom() {
        const chatBox = document.getElementById('chat-box');
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function copyToClipboard(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    }).catch(err => console.error('Failed to copy: ', err));
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatWidget();
});

