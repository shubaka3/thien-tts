
    // --- STATE MANAGEMENT & CONSTANTS ---
    const state = {
        userId: null, isLoggedIn: false, currentCourseId: null,
        currentProgress: 1, courses: [], topics: [], sessionFlagSent: false,
    };
    const API_BASE_URL = "https://workflow.emg.edu.vn:5678/webhook";
    const CHAT_API_URL = "https://workflow.emg.edu.vn:5678/webhook/VTV4-Chat";
    const DEFAULT_BG = 'https://i.pinimg.com/originals/6e/1a/c9/6e1ac970530da29e7f5d4c50/14ecb983.jpg?nii=t';

    // --- DOM Elements ---
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const appScreen = document.getElementById('app-screen');

    // --- INITIALIZATION ---
    window.onload = function() {
        const storedUser = sessionStorage.getItem('vmentorUser');
        if (storedUser) {
            const userData = JSON.parse(storedUser);
            Object.assign(state, userData);
        }

        applyBackground(localStorage.getItem('vmentorBg') || DEFAULT_BG);

        if (state.isLoggedIn) {
            postLoginSetup();
        }
        gameController.init(); // Initialize the game controller
    };
    
    // --- API & AUTH ---
    async function apiCall(endpoint, body, method = 'POST', customUrl = null) {
        const url = customUrl || `${API_BASE_URL}/${endpoint}`;
        try {
            const response = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            return await response.json();
        } catch (error) { console.error(`Error calling ${endpoint}:`, error); return null; }
    }

    async function handleLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const loginError = document.getElementById('login-error');
        loginError.textContent = '';
        
        const response = await apiCall('VTV4-Login', { email, password });
        
        if (response && response.State) {
            state.userId = response.UserId;
            state.isLoggedIn = true;
            sessionStorage.setItem('vmentorUser', JSON.stringify({ userId: state.userId, isLoggedIn: true }));
            await postLoginSetup();
        } else {
            loginError.textContent = 'Đăng nhập thất bại. Vui lòng thử lại.';
        }
    }

    function handleLogout() {
        sessionStorage.clear();
        localStorage.clear();
        window.location.reload();
    }
    
    async function postLoginSetup() {
        document.getElementById('user-info').textContent = `User: ${state.userId}`;
        try {
            const courseResponse = await apiCall("VTV4-course-list", { userId: state.userId });
            state.courses = (courseResponse && Array.isArray(courseResponse.courses)) ? courseResponse.courses : [];
        } catch (error) {
            console.error("Failed to fetch course list:", error);
        }
        
        showDashboard();
    }


    
    // --- SCREEN NAVIGATION & UI ---
    function showDashboard() {
        loginScreen.style.display = 'none';
        appScreen.style.display = 'none';
        dashboardScreen.style.display = 'flex';
        renderCourseDashboard();
    }
    
    async function handleCourseSelection(courseId) {
        if (!courseId) return;

        const isNewSelection = state.currentCourseId !== courseId;
        localStorage.setItem('vmentorCourseId', courseId);
        state.currentCourseId = courseId;

        if (isNewSelection) {
            document.getElementById('messages').innerHTML = '';
            state.sessionFlagSent = false;
            // Reset progress state before loading new data
            state.currentProgress = 1;
            state.topics = [];
        }

        dashboardScreen.style.display = 'none';
        appScreen.style.display = 'block';

        // Show a loading indicator while fetching data
        const pathContainer = document.getElementById('learning-path-container');
        pathContainer.innerHTML = `<div class="d-flex justify-content-center align-items-center h-100 text-white">
                                       <div class="spinner-border" role="status">
                                           <span class="visually-hidden">Loading...</span>
                                       </div>
                                   </div>`;
        document.getElementById('course-title').textContent = 'Đang tải lộ trình...';


        await loadCourseData(courseId);

        addMessage('assistant', `Bạn đang bắt đầu bài học "${courseId}". hãy cùng học nhé!`);

        if (!state.sessionFlagSent) {
            sendHiddenReviewMessage();
        }
    }

    function renderCourseDashboard() {
        const grid = document.getElementById('course-grid');
        grid.innerHTML = '';
        const savedCourseId = localStorage.getItem('vmentorCourseId');

        if (savedCourseId) {
            const currentCourse = state.courses.find(c => c.id === savedCourseId);
            if (currentCourse) {
                 grid.appendChild(createCourseCard(currentCourse, true));
            }
        }

        state.courses.forEach(course => {
            if(course.id !== savedCourseId) {
                grid.appendChild(createCourseCard(course, false));
            }
        });
    }

    function createCourseCard(course, isCurrent) {
        const card = document.createElement('div');
        card.className = 'course-card';
        if (isCurrent) card.classList.add('current');

        // Xác định progress
        let progress = Number(course.progress) || 0;
        
        // Tính % tiến trình
        let progressPercent = 0;
        if (!progress || progress < 1) {
            progressPercent = 0;
        } else if (progress <= course.topic) {
            progressPercent = ((progress - 1) / course.topic) * 100;
        } else {
            progressPercent = 100;
        }

        // Logic nút bấm
        let buttons = '';
        if (!progress || progress < 1) {
            buttons = `<button class="btn btn-success" onclick="handleCourseSelection('${course.id}')"><i class="fas fa-play"></i> Bắt đầu học</button>`;
        } else if (progress <= course.topic) {
            buttons = `<button class="btn btn-primary" onclick="handleCourseSelection('${course.id}')"><i class="fas fa-play"></i> Tiếp tục</button>`;
        } else {
            buttons = `<button class="btn btn-warning" onclick="resetCourse('${course.id}')"><i class="fas fa-undo"></i> Học lại từ đầu</button>`;
        }

        // Progress bar HTML
        const progressBar = `
            <div class="progress-container">
                <div class="progress-bar" style="width:${progressPercent}%">
                    <span class="progress-text">${progressPercent.toFixed(0)}%</span>
                </div>
            </div>
        `;

        card.innerHTML = `
            ${isCurrent ? '<p class="current-tag"><i class="fas fa-star"></i> Đang học</p>' : ''}
            <div class="course-info">
                <h4 class="course-title">${course.id}</h4>
                <p class="course-topic">Topics: ${course.topic}</p>
            </div>
            <div class="spacer"></div> <!-- đẩy progress xuống -->

            ${progressBar}
            <div class="button-container">${buttons}</div>
        `;


        return card;
    }



    
    // --- COURSE & LEARNING PATH (Chat View) ---
    async function loadCourseData(courseId) {
        document.getElementById('learning-path-container').innerHTML = '<svg id="path-svg"></svg>';
        const topicData = await apiCall('VTV4-TopicInCourse', { courseId });
        state.topics = topicData ? topicData.AllTopic : [];
        
        const progressData = await apiCall('VTV4-CurrenProgress', { Userid: state.userId, CoursId: courseId });
        state.currentProgress = progressData ? progressData.progress : 1;
        
        renderLearningPath();
        document.getElementById('course-title').textContent = `Lộ trình học: ${courseId}`;
    }

    async function updateProgressVisuals() {
        const progressData = await apiCall('VTV4-CurrenProgress', { Userid: state.userId, CoursId: state.currentCourseId });
        if (!progressData) return;

        const oldProgress = state.currentProgress;
        const newProgress = progressData.progress;
        
        if (newProgress <= oldProgress) return; // No change or regression

        state.currentProgress = newProgress;
        
        for (let i = oldProgress + 1; i <= newProgress; i++) {
            const prevNode = document.querySelector(`.path-node[data-progress='${i-1}']`);
            const currNode = document.querySelector(`.path-node[data-progress='${i}']`);
            const pathSegment = document.getElementById(`path-${i-1}-${i}`);

            setTimeout(() => {
                if (prevNode) {
                    prevNode.classList.remove('current', 'pulse');
                    prevNode.classList.add('completed');
                }
                if (currNode) {
                    currNode.classList.remove('locked');
                    currNode.classList.add('current');
                }
                if (pathSegment) {
                    pathSegment.classList.add('animated');
                    pathSegment.addEventListener('animationend', () => {
                         pathSegment.classList.remove('animated');
                         pathSegment.classList.add('lit');
                    }, { once: true });
                }
            }, (i - oldProgress - 1) * 800);
        }

        const wave = document.getElementById('progress-wave');
        const totalTopics = state.topics.length;
        if (wave && totalTopics > 0) {
            const newHeight = (newProgress / totalTopics) * 100;
            wave.style.height = `${newHeight}%`;
        }
        renderLearningPath();

    }


    function renderLearningPath() {
        const container = document.getElementById('learning-path-container');
        const svg = document.getElementById('path-svg');
        container.innerHTML = ''; // Clear previous nodes
        container.appendChild(svg);
        svg.innerHTML = '';
        
        if (!state.topics || state.topics.length === 0) return;

        const pathCoords = [];
        state.topics.forEach((topic, index) => {
            const node = document.createElement('div');
            node.className = 'path-node';
            node.dataset.progress = topic.progress;
            
            // const status = topic.progress < state.currentProgress ? 'completed' : (topic.progress === state.currentProgress ? 'current' : 'locked');
            // node.classList.add(status);


            // // Nếu là node đầu tiên và đang active, thêm class vàng đặc biệt
            // if (index === 0 && status === 'current') {
            //     node.classList.add('first-active');
            // }
            let status;
            if (!state.currentProgress || state.currentProgress < 1) {
                status = (index === 0) ? 'current' : 'locked';
            } else {
                status = topic.progress < state.currentProgress ? 'completed' : (topic.progress === state.currentProgress ? 'current' : 'locked');
            }
            node.classList.add(status);

            // Node đầu tiên luôn vàng nếu là current hoặc chưa có progress
            if (index === 0 && status === 'current') {
                node.classList.add('first-active');
            }

            // --- START: MODIFIED to add tooltip ---
            // Create a span for the truncated title visible in the node
            const titleSpan = document.createElement('span');
            titleSpan.className = 'path-node-title';
            titleSpan.textContent = topic.title;

            // Create a separate span for the full tooltip text (hidden by default)
            const tooltipSpan = document.createElement('span');
            tooltipSpan.className = 'tooltip-text';
            tooltipSpan.textContent = topic.title;

            node.appendChild(titleSpan);
            node.appendChild(tooltipSpan);
            // --- END: MODIFIED to add tooltip ---
            
            const x = 25 + (index % 2 === 0 ? 0 : 50) + (Math.random() - 0.5) * 10;
            const y = 5 + index * 13;
            node.style.left = `${x}%`;
            node.style.top = `${y}%`;
            
            // --- START: MODIFIED to position tooltip ---
            // If the node is on the right side of the screen (x > 45%), show tooltip on the left. Otherwise, on the right.
            if (x > 45) { 
                node.classList.add('tooltip-left');
            } else {
                node.classList.add('tooltip-right');
            }
            // --- END: MODIFIED to position tooltip ---

            container.appendChild(node);
            pathCoords.push({ x: x + 5.5, y: y + 5.5});
        });

        for(let i = 1; i < pathCoords.length; i++) {
             const p1 = pathCoords[i-1];
             const p2 = pathCoords[i];
             const cx = (p1.x + p2.x)/2 + (p2.x > p1.x ? -10:10);
             const cy = (p1.y + p2.y)/2;
             const pathD = `M ${p1.x}% ${p1.y}% S ${cx}% ${cy}% ${p2.x}% ${p2.y}%`;
             
             const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
             path.setAttribute('d', pathD);
             path.id = `path-${i}-${i+1}`;
             path.classList.add('path-line');
             
             if (i < state.currentProgress) {
                 path.classList.add('lit');
             }
             
             svg.appendChild(path);
             
             const length = path.getTotalLength();
             path.style.strokeDasharray = length;
             path.style.strokeDashoffset = length;
        }

        const wave = document.getElementById('progress-wave');
        const totalTopics = state.topics.length;
        if (wave && totalTopics > 0) {
            const initialHeight = (state.currentProgress / totalTopics) * 100;
            wave.style.height = `${initialHeight}%`;
        }
    }
    
    // --- CHAT LOGIC ---
    async function handleSend() {
        const input = document.getElementById("chatInput");
        const msg = input.value.trim();
        if (!msg) return;
        addMessage("user", msg);
        input.value = "";
        
        const payload = {
            messages: [{ role: "user", content: msg }],
            sessionId: state.userId, course_id: state.currentCourseId,
            user_course_Id: state.userId + "-" + state.currentCourseId
        };

        const chatResponse = await apiCall(null, payload, 'POST', CHAT_API_URL);
        
        if (!chatResponse) {
            addMessage("assistant", "Có vẻ chúng ta đã học xong hết rồi! em làm tốt lắm! 🎉 giờ chúng ta có thể qua Lesson khác nhé");
            return;
        }

        const responseData = (Array.isArray(chatResponse) && chatResponse.length > 0) ? chatResponse[0] : chatResponse;
        
        const outputText = responseData.output || "Có vẻ chúng ta đã học xong hết rồi! em làm tốt lắm! 🎉 giờ chúng ta có thể qua Lesson khác";
        addMessage("assistant", outputText);

        if (responseData.isgame && responseData.GameData) {
            setTimeout(() => {
                gameController.showPrompt(responseData.GameData, responseData.isgame);
            }, 1000);
        }
        
        await updateProgressVisuals();
    }
    
    async function sendHiddenReviewMessage() {
        if (state.sessionFlagSent) return;
        const payload = {
            messages: [{ role: "user", content: "Bắt đầu" }],
            sessionId: state.userId, course_id: state.currentCourseId, SessionFlag: "1",
            user_course_Id: state.userId + "-" + state.currentCourseId
        };
        const reviewResponse = await apiCall('VTV4-Chat', payload);
        if(reviewResponse?.output) addMessage("assistant", reviewResponse.output);
        state.sessionFlagSent = true;
    }

    function formatSimpleMarkdown(str) {
        return str
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code>$1</code>');
    }

    function addMessage(role, text) {
        const messagesBox = document.getElementById("messages");
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${role}`;
        msgDiv.innerHTML = `
            <div class="avatar">
                <i class="fas ${role === 'user' ? 'fa-user' : 'fa-robot'}"></i>
            </div>
            <div class="bubble">${formatSimpleMarkdown(text).replace(/\n/g, '<br>')}</div>
        `;
        messagesBox.appendChild(msgDiv);
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    // --- UI CONTROLS ---
    function toggleSidePanel() { document.getElementById('side-panel').classList.toggle('open'); }
    
    function applyBackground(url) {
        if(!url) return;
        document.getElementById('learning-path-panel').style.backgroundImage = `url('${url}')`;
        localStorage.setItem('vmentorBg', url);
    }
    
    // --- GAME CONTROLLER ---
    const gameController = {
        gameData: [],
        gameType: null,
        currentIndex: 0,
        score: 0,

        // DOM elements
        promptOverlay: null,
        mainOverlay: null,
        fillBlankContainer: null,
        mcContainer: null,
        finalScoreContainer: null,

        init() {
            this.promptOverlay = document.getElementById('game-prompt-overlay');
            this.mainOverlay = document.getElementById('game-main-overlay');
            this.fillBlankContainer = document.getElementById('edu-game-container-fillblank');
            this.mcContainer = document.getElementById('edu-game-container-multiplechoice');
            this.finalScoreContainer = document.getElementById('edu-game-final-score-container');

            document.getElementById('accept-game-btn').onclick = () => this.start();
            document.getElementById('decline-game-btn').onclick = () => this.hidePrompt();
            document.getElementById('close-game-btn').onclick = () => this.end();
            document.getElementById('edu-game-fillblank-check-btn').onclick = () => this.checkFillBlank();
            document.getElementById('edu-game-fillblank-input').onkeydown = (e) => {
                if(e.key === 'Enter') this.checkFillBlank();
            };
            document.getElementById('edu-game-multiplechoice-next-btn').onclick = () => this.nextMC();
            document.getElementById('edu-game-restart-btn').onclick = () => this.start();
        },

        showPrompt(gameDataString, gameType) {
            try {
                this.gameData = JSON.parse(gameDataString);
                this.gameType = parseInt(gameType, 10);
                if (!this.gameData || this.gameData.length === 0) return;
                this.promptOverlay.style.display = 'flex';
            } catch (e) {
                console.error("Failed to parse GameData:", e);
            }
        },

        hidePrompt() {
            this.promptOverlay.style.display = 'none';
        },

        start() {
            this.hidePrompt();
            this.currentIndex = 0;
            this.score = 0;
            
            this.fillBlankContainer.style.display = 'none';
            this.mcContainer.style.display = 'none';
            this.finalScoreContainer.style.display = 'none';

            if (this.gameType === 1) { // Fill in the blank
                this.fillBlankContainer.style.display = 'flex';
                this.loadFillBlank();
            } else if (this.gameType === 2) { // Multiple choice
                this.mcContainer.style.display = 'flex';
                this.loadMultipleChoice();
            }
            this.mainOverlay.style.display = 'flex';
        },

        end() {
            this.mainOverlay.style.display = 'none';
        },

        checkCompletion() {
            if (this.currentIndex >= this.gameData.length) {
                this.showResult();
                return true;
            }
            return false;
        },

        showResult() {
            document.getElementById('edu-game-final-score').textContent = `${this.score}/${this.gameData.length}`;
            document.getElementById('edu-game-final-feedback').textContent = this.score === this.gameData.length ? "Xuất sắc!" : "Cố gắng hơn nhé!";
            this.fillBlankContainer.style.display = 'none';
            this.mcContainer.style.display = 'none';
            this.finalScoreContainer.style.display = 'flex';
        },

        // --- Fill in the Blank Logic ---
        loadFillBlank() {
            if (this.checkCompletion()) return;
            const item = this.gameData[this.currentIndex];
            const sentenceEl = document.getElementById('edu-game-fillblank-sentence');
            const inputEl = document.getElementById('edu-game-fillblank-input');
            const feedbackEl = document.getElementById('edu-game-fillblank-feedback');
            const checkBtn = document.getElementById('edu-game-fillblank-check-btn');

            sentenceEl.textContent = item.sentence || '';
            inputEl.value = '';
            feedbackEl.textContent = '';
            inputEl.disabled = false;
            checkBtn.style.display = 'inline-block';
            inputEl.focus();
        },

        checkFillBlank() {
            const item = this.gameData[this.currentIndex];
            const inputEl = document.getElementById('edu-game-fillblank-input');
            const feedbackEl = document.getElementById('edu-game-fillblank-feedback');
            const checkBtn = document.getElementById('edu-game-fillblank-check-btn');
            
            const userAnswer = inputEl.value.trim();
            const isCorrect = userAnswer.toLowerCase() === item.answer.toLowerCase();

            if (isCorrect) {
                this.score++;
                feedbackEl.textContent = 'Chính xác!';
                feedbackEl.className = 'edu-game-feedback correct';
            } else {
                feedbackEl.textContent = `Sai rồi! Đáp án là: ${item.answer}`;
                feedbackEl.className = 'edu-game-feedback incorrect';
            }
            
            checkBtn.style.display = 'none';
            inputEl.disabled = true;

            setTimeout(() => {
                this.currentIndex++;
                this.loadFillBlank();
            }, 2000);
        },

        // --- Multiple Choice Logic ---
        loadMultipleChoice() {
            if (this.checkCompletion()) return;
            const item = this.gameData[this.currentIndex];
            const questionEl = document.getElementById('edu-game-multiplechoice-question');
            const optionsEl = document.getElementById('edu-game-multiplechoice-options');
            
            questionEl.textContent = item.question || '';
            optionsEl.innerHTML = '';
            
            (item.options || []).forEach((option, index) => {
                const button = document.createElement('button');
                button.className = 'edu-game-mc-option-btn';
                button.textContent = option;
                button.onclick = () => this.selectAnswerMC(index, button);
                optionsEl.appendChild(button);
            });
            
            document.getElementById('edu-game-multiplechoice-feedback').textContent = '';
            document.getElementById('edu-game-multiplechoice-explanation').style.display = 'none';
            document.getElementById('edu-game-multiplechoice-next-btn').style.display = 'none';
        },
        
        selectAnswerMC(selectedIndex, selectedButton) {
            const item = this.gameData[this.currentIndex];
            const feedbackEl = document.getElementById('edu-game-multiplechoice-feedback');
            const optionsEl = document.getElementById('edu-game-multiplechoice-options');
            const explanationEl = document.getElementById('edu-game-multiplechoice-explanation');
            const nextBtn = document.getElementById('edu-game-multiplechoice-next-btn');

            const isCorrect = selectedIndex === item.answer;
            
            if (isCorrect) {
                this.score++;
                feedbackEl.textContent = 'Chính xác!';
                feedbackEl.className = 'edu-game-feedback correct';
                selectedButton.classList.add('correct');
            } else {
                feedbackEl.textContent = 'Sai rồi!';
                feedbackEl.className = 'edu-game-feedback incorrect';
                selectedButton.classList.add('incorrect');
                if (optionsEl.children[item.answer]) {
                    optionsEl.children[item.answer].classList.add('correct');
                }
            }
            
            if (item.explanation) {
                explanationEl.textContent = item.explanation;
                explanationEl.style.display = 'block';
            }
            
            Array.from(optionsEl.children).forEach(btn => btn.disabled = true);
            nextBtn.style.display = 'inline-block';
        },

        nextMC() {
            this.currentIndex++;
            this.loadMultipleChoice();
        }
    };

// --- STATE MANAGEMENT & CONSTANTS ---
// ... existing constants ...
const UPLOAD_API_URL = "https://workflow.emg.edu.vn:5678/webhook/VTV4-Upload";

// Add this new variable at the top with other declarations
let uploadProgressInterval = null;

// --- DOM Elements ---
// ... existing DOM element variables ...
const createCourseModal = document.getElementById('create-course-modal');
const createCourseForm = document.getElementById('create-course-form');
const courseGradeSelect = document.getElementById('courseGrade');

// --- INITIALIZATION ---
window.onload = function() {
    // ... existing initialization code ...
    populateGradeSelect();
    gameController.init(); 
    createCourseForm.addEventListener('submit', handleCourseUpload);
};

// --- COURSE UPLOAD MODAL ---
function populateGradeSelect() {
    if(courseGradeSelect.options.length > 1) return;
    for (let i = 1; i <= 12; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Lớp ${i}`;
        courseGradeSelect.appendChild(option);
    }
}

// Replace the existing showCreateCourseModal function with this
function showCreateCourseModal() {
    createCourseModal.style.display = 'flex';
    // Reset form state when showing
    const submitButton = createCourseForm.querySelector('button[type="submit"]');
    submitButton.disabled = false;
    submitButton.innerHTML = 'Tải Lên';
    document.getElementById('upload-progress-container').style.display = 'none';
    document.getElementById('upload-progress-bar').style.width = '0%';
    document.getElementById('upload-progress-bar').textContent = '0%';
    createCourseForm.reset();
}

// Replace the existing hideCreateCourseModal function with this
function hideCreateCourseModal() {
    createCourseModal.style.display = 'none';
    // Ensure interval is cleared if modal is closed manually
    if (uploadProgressInterval) {
        clearInterval(uploadProgressInterval);
    }
}

// Replace the existing handleCourseUpload function with this new version
async function handleCourseUpload(event) {
    event.preventDefault();
    const submitButton = createCourseForm.querySelector('button[type="submit"]');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    
    const courseName = document.getElementById('courseName').value;
    const courseGrade = document.getElementById('courseGrade').value;
    const courseLanguage = document.getElementById('courseLanguage').value; 
    const courseTopicNumber = document.getElementById('courseTopicNumber').value; 
    const courseFile = document.getElementById('courseFile').files[0];
    // const courseDescription = document.getElementById('courseDescription').value;

    if (!courseName || !courseGrade || !courseFile) {
        alert('Vui lòng điền đầy đủ Tên, Khối lớp và chọn một tệp.');
        return;
    }
    
    // --- Start Progress Bar ---
    submitButton.disabled = true;
    progressContainer.style.display = 'flex';
    let progress = 0;
    
    uploadProgressInterval = setInterval(() => {
        progress += Math.random() * 5; 
        if (progress > 99) {
            progress = 99; 
            clearInterval(uploadProgressInterval); // Stop at 99
        }
        let progressRounded = Math.round(progress);
        progressBar.style.width = progressRounded + '%';
        progressBar.textContent = progressRounded + '%';
    }, 200);

    const formData = new FormData();
    formData.append('id', courseName);
    formData.append('grade', courseGrade);
    formData.append('language', courseLanguage); // ✅ gửi ngôn ngữ
    formData.append('topicnumber', courseTopicNumber); // ✅ gửi ngôn ngữ
    formData.append('file', courseFile);
    // formData.append('description', courseDescription);

    try {
        const response = await fetch(UPLOAD_API_URL, {
            method: 'POST',
            body: formData 
        });

        clearInterval(uploadProgressInterval);
        progressBar.style.width = '100%';
        progressBar.textContent = '100%';

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({'error': 'Lỗi không xác định'}));
            throw new Error(`Tải lên thất bại: ${errorData.error || response.statusText}`);
        }

        const result = await response.json();
        console.log('Tải lên thành công:', result);

        setTimeout(async () => {
            alert('Tải lên khóa học thành công!');
            hideCreateCourseModal();
            await postLoginSetup(); // Reload courses
        }, 500); // Wait a bit to show 100%

    } catch (error) {
        clearInterval(uploadProgressInterval);
        // Hide progress bar and re-enable button on error to allow retry
        progressContainer.style.display = 'none'; 
        submitButton.disabled = false;
        submitButton.innerHTML = 'Tải Lên';
        console.error('Lỗi khi tải lên khóa học:', error);
        alert(error.message);
    } 
}
// --- SUGGESTION BUTTONS ---
function sendSuggestion(text) {
    document.getElementById('chatInput').value = text;
    handleSend();
}


// --- RESET COURSE PROGRESS ---
// --- RESET COURSE PROGRESS ---
async function resetCourse(courseId) {
    if (!state.userId || !courseId) return;
    
    // Xác định user_course
    let user_course = `${state.userId}-${courseId}`; // Đã rút gọn logic ở đây
    
    if (!confirm('Bạn có chắc muốn học lại từ đầu? Tiến trình sẽ bị đặt lại.')) return;

    try {
        const response = await fetch('https://workflow.emg.edu.vn:5678/webhook/VTV4-RestCourse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_course, courseId, userId: state.userId})
        });

        // 💡 BƯỚC 1: Kiểm tra phản hồi HTTP
        if (!response.ok) {
            console.error('Lỗi HTTP Status:', response.status, response.statusText);
            throw new Error(`Server responded with status: ${response.status}`);
        }

        const result = await response.json();
        
        // Ghi log kết quả để kiểm tra trong Console
        console.log('API Result:', result); 

        // 💡 BƯỚC 2: Kiểm tra logic trả về từ API
        // Kiểm tra result.success (hoặc một trường báo trạng thái thành công của server) 
        // VÀ kiểm tra xem API có trả về progress = 1 hay không
        if (result && (result.progress == 1)) { 
            alert('✅ Đã đặt lại tiến trình. Bạn sẽ học lại từ đầu.');
            
            // Reset local state và load lại course
            if (state.currentCourseId === courseId) {
                // Đặt lại state.currentProgress về 1 (số)
                state.currentProgress = 1; 
                state.sessionFlagSent = false;
                await loadCourseData(courseId);
            }
        } else {
            // Trường hợp bị lỗi logic hoặc progress không phải là 1
            console.error("Lỗi logic API:", result);
            alert('⚠️ Có lỗi khi đặt lại tiến trình! (Tiến trình không được reset về 1)');
        }
    } catch (e) {
        alert('❌ Lỗi kết nối hoặc xử lý dữ liệu!');
        console.error(e);
    }
}