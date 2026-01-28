let words = [];
let currentStudyIndex = 0;
let testQueue = [];
let currentTestIndex = 0;
let testResults = { correct: [], incorrect: [], hinted: [] };

// --- 画面切り替え ---
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
}

// --- ログイン・アカウント管理 ---
function toggleAccountMenu() {
    const menu = document.getElementById('account-dropdown');
    menu.classList.toggle('hidden');
}

async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    try {
        await window.createUser(window.firebaseAuth, email, pass);
        alert("新規登録に成功しました！");
    } catch (error) { alert("登録エラー: " + error.message); }
}

async function handleSignIn() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    if (!window.firebaseAuth) return alert("Firebaseが準備中です");
    try {
        await window.signIn(window.firebaseAuth, email, pass);
    } catch (error) { alert("ログイン失敗: " + error.message); }
}

function handleSignOut() {
    window.logOut(window.firebaseAuth).then(() => {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('main-nav').classList.add('hidden');
        document.getElementById('account-menu-container').classList.add('hidden');
        showView('auth-section');
    }).catch(error => alert("エラー: " + error.message));
}

// --- ログイン状態監視 ---
if (window.firebaseAuth) {
    window.firebaseAuth.onAuthStateChanged(user => {
        if (user) {
            document.getElementById('auth-section').classList.add('hidden');
            document.getElementById('main-nav').classList.remove('hidden');
            document.getElementById('account-menu-container').classList.remove('hidden');
            document.getElementById('user-email-display').innerText = user.email;
            showView('input-view');
            updateWordList();
        } else {
            showView('auth-section');
        }
    });
}

// --- 単語の読み上げ ---
function speakWord(text) {
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    uttr.rate = 0.9;
    window.speechSynthesis.speak(uttr);
}

// --- 単語の削除 ---
async function deleteWord(docId) {
    if (!confirm("この単語を削除しますか？")) return;
    try {
        const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        await deleteDoc(doc(window.db, "words", docId));
        updateWordList();
    } catch (e) { alert("削除エラー: " + e.message); }
}

// --- 単語追加 ---
async function addWord() {
    const eng = document.getElementById('eng-input').value.trim();
    const jpn = document.getElementById('jpn-input').value.trim();
    const user = window.firebaseAuth.currentUser;
    if (!eng || !jpn || !user) return alert('入力内容を確認してください');
    try {
        await window.fs.addDoc(window.fs.collection(window.db, "words"), {
            eng: eng, jpn: jpn, uid: user.uid, createdAt: window.fs.serverTimestamp()
        });
        document.getElementById('eng-input').value = '';
        document.getElementById('jpn-input').value = '';
        updateWordList();
    } catch (e) { alert("保存エラー"); }
}

// --- リスト表示（ここが重要！） ---
async function updateWordList() {
    const user = window.firebaseAuth.currentUser;
    if (!user) return;
    const q = window.fs.query(window.fs.collection(window.db, "words"), window.fs.where("uid", "==", user.uid));
    const snap = await window.fs.getDocs(q);
    
    words = [];
    const container = document.getElementById('word-list-container');
    container.innerHTML = '';

    snap.forEach(doc => {
        const data = doc.data();
        const id = doc.id; // 削除に使うID
        words.push(data);

        const wordItem = document.createElement('div');
        wordItem.style = "background:white; margin:10px; padding:15px; border-radius:20px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center;";
        
        wordItem.innerHTML = `
            <div style="text-align:left;">
                <strong style="font-size:1.1rem;">${data.eng}</strong><br>
                <small style="color:#666;">${data.jpn}</small>
            </div>
            <div style="display:flex; gap:10px;">
                <button onclick="speakWord('${data.eng}')" style="background:none; box-shadow:none; padding:5px; width:auto; color:#9d85e0;">
                    <i class="fas fa-volume-up"></i>
                </button>
                <button onclick="deleteWord('${id}')" style="background:none; box-shadow:none; padding:5px; width:auto; color:#ff9da7;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(wordItem);
    });
}

// --- 暗記・テスト機能 ---
function startStudy() {
    if (words.length === 0) return alert('単語がありません');
    currentStudyIndex = 0;
    if(document.getElementById('study-order').value === 'random') words.sort(() => Math.random() - 0.5);
    document.getElementById('study-container').classList.remove('hidden');
    updateCard();
}

function updateCard() {
    const mode = document.getElementById('study-mode').value;
    const word = words[currentStudyIndex];
    document.getElementById('flashcard').classList.remove('flipped');
    document.getElementById('card-front').innerText = (mode === 'en-jp') ? word.eng : word.jpn;
    document.getElementById('card-back').innerText = (mode === 'en-jp') ? word.jpn : word.eng;
}

function flipCard() { document.getElementById('flashcard').classList.toggle('flipped'); }

function gradeWord(level) {
    currentStudyIndex++;
    if(currentStudyIndex < words.length) updateCard();
    else { alert('終了しました！'); showView('input-view'); }
}

function startTest() {
    if (words.length === 0) return alert('単語がありません');
    testQueue = [...words].sort(() => Math.random() - 0.5);
    currentTestIndex = 0;
    testResults = { correct: [], incorrect: [] };
    document.getElementById('test-container').classList.remove('hidden');
    document.getElementById('test-result').classList.add('hidden');
    nextTestQuestion();
}

function nextTestQuestion() {
    if(currentTestIndex < testQueue.length) {
        document.getElementById('test-question').innerText = `意味：${testQueue[currentTestIndex].jpn}`;
        document.getElementById('test-answer').value = '';
    } else { showTestResult(); }
}

function checkTestAnswer() {
    const ans = document.getElementById('test-answer').value.trim().toLowerCase();
    const correct = testQueue[currentTestIndex].eng.toLowerCase();
    if(ans === correct) testResults.correct.push(testQueue[currentTestIndex]);
    else testResults.incorrect.push(testQueue[currentTestIndex]);
    currentTestIndex++;
    nextTestQuestion();
}

function showTestResult() {
    document.getElementById('test-container').classList.add('hidden');
    document.getElementById('test-result').classList.remove('hidden');
    document.getElementById('result-lists').innerHTML = `正解: ${testResults.correct.length} / 不正解: ${testResults.incorrect.length}`;
}