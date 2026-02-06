// Game State
//const diceConfigs = [
//    "MMLLBY", "VFGKPP", "HHNNRR", "DFRLLW", "RRDLGG", "XKBSZN",
//    "WHHTTP", "AEIOUU", "CCMTTS", "OIINNY", "AEIOUU", "AAEEOO"
//];

const diceConfigs = [
    "MMLLBY", "VFGKPP", "HHNNRR", "DFRLLW", "RRDLGG", "XKBSZN",
    "WHHTTP", "CCBTJD", "CCMTTS", "OIINNY", "AEIOUU", "AAEEOO"
];



let minWordLength = localStorage.getItem('minWordLength') ? parseInt(localStorage.getItem('minWordLength')) : 2;

// Set the checkbox state on load
const toggleEl = document.getElementById('min-three-toggle');
if (toggleEl) {
    toggleEl.checked = (minWordLength === 3);
    toggleEl.addEventListener('change', (e) => {
        minWordLength = e.target.checked ? 3 : 2;
        localStorage.setItem('minWordLength', minWordLength);
        refreshHighlights(); 
    });
}

let dictionary = new Set();
let boardState = Array(100).fill(null); 
let timerInterval;
let secondsElapsed = 0;
let draggedElement = null;
let lastDiscoveredWord = "";
let validHorizontal = new Set(); 
let validVertical = new Set();   

// Elements
const boardElement = document.getElementById('game-board');
const trayElement = document.getElementById('dice-tray');
const timerText = document.getElementById('timer');
const rollButton = document.getElementById('roll-button');





// 1. Initialize the Board
function createBoard() {
    boardElement.innerHTML = '';
    for (let i = 0; i < 100; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        boardElement.appendChild(cell);
    }
}



const clearButton = document.getElementById('clear-button');

// Change your old listener to this:
clearButton.onclick = () => {
    // Only show modal if there is actually something on the board to clear
    const isBoardDirty = boardState.some(cell => cell !== null);
    if (isBoardDirty) {
        openConfirmModal('clear-board');
    }
};

// Move your actual clearing logic into its own function so we can call it:
function executeClearBoard() {
    const allDice = document.querySelectorAll('.die');
    allDice.forEach(die => {
        trayElement.appendChild(die);
        die.style.position = 'static';
        die.classList.remove('valid');
    });
    boardState.fill(null);
    refreshHighlights();
}

// Stats Logic
function updateStatsUI() {
    const played = parseInt(localStorage.getItem('dabble_played') || 0);
    const won = parseInt(localStorage.getItem('dabble_won') || 0);
    let percent = played > 0 ? Math.round((won / played) * 100) : 0;
    document.getElementById('games-played').textContent = played;
    document.getElementById('games-won').textContent = won;
    document.getElementById('win-percent').textContent = percent;
}

function recordGamePlayed() {
    let played = parseInt(localStorage.getItem('dabble_played') || 0);
    localStorage.setItem('dabble_played', played + 1);
    updateStatsUI();
}

function recordGameWon() {
    let won = parseInt(localStorage.getItem('dabble_won') || 0);
    localStorage.setItem('dabble_won', won + 1);
    updateStatsUI(); 
}

function loadStats() {
    updateStatsUI();
}

// 2. Load Dictionary
async function loadDictionary() {
    try {
        const response = await fetch('words.txt');
        const text = await response.text();
        text.split(/\r?\n/).forEach(word => {
            if (word.trim()) dictionary.add(word.trim().toUpperCase());
        });
        console.log("Dictionary Loaded:", dictionary.size, "words");
    } catch (err) {
        console.error("Could not load dictionary:", err);
    }
}

// 3. Roll Dice & Setup Game
function setupGame() {
    boardState = Array(100).fill(null);
    secondsElapsed = 0;
    clearInterval(timerInterval);

    const gameBoard = document.getElementById('game-board');
    const controls = document.getElementById('controls');
    if(gameBoard) gameBoard.classList.remove('ui-disabled');
    if(controls) controls.classList.remove('ui-disabled');
    document.getElementById('victory-banner').classList.add('hidden');
    timerText.classList.remove('win-flash');

    const rolledDice = diceConfigs.map((config, id) => ({
        id: id,
        letter: config[Math.floor(Math.random() * config.length)]
    }));

    displayDice(rolledDice.sort(() => Math.random() - 0.5));
    recordGamePlayed();
    createBoard();
    startTimer();

    document.getElementById('def-close').onclick = () => {
        document.getElementById('def-modal').classList.add('hidden');
    };
}

function returnToTray(dieEl) {
    trayElement.appendChild(dieEl);
    dieEl.style.position = 'static';
}

function findNearestEmpty(startIndex) {
    let bestDist = Infinity;
    let bestIdx = -1;
    boardState.forEach((val, i) => {
        if (val === null) {
            const x1 = startIndex % 10, y1 = Math.floor(startIndex / 10);
            const x2 = i % 10, y2 = Math.floor(i / 10);
            const dist = Math.abs(x1 - x2) + Math.abs(y1 - y2);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
    });
    return bestIdx;
}

function displayDice(dice) {
    trayElement.innerHTML = '';
    dice.forEach(die => {
        const dieEl = document.createElement('div');
        dieEl.className = 'die';
        dieEl.textContent = die.letter;
        dieEl.id = `die-${die.id}`;
        dieEl.style.position = 'static';

        dieEl.addEventListener('click', (e) => {
            const timeSinceDrop = Date.now() - (dieEl.lastDropTime || 0);
            if (timeSinceDrop < 300) return; 
            const parentCell = dieEl.parentElement;
            if (parentCell && parentCell.classList.contains('cell')) {
                const index = parseInt(parentCell.dataset.index);
                if (validHorizontal.has(index) || validVertical.has(index)) {
                    const word = getFullWord(index);
                    if (word) fetchDefinition(word);
                }
            }
        });
        dieEl.onpointerdown = (e) => {
            const startX = e.clientX;
            const startY = e.clientY;
            let hasMoved = false;
            dieEl.setPointerCapture(e.pointerId);
            draggedElement = dieEl;

            const onPointerMove = (ev) => {
                const moveX = Math.abs(ev.clientX - startX);
                const moveY = Math.abs(ev.clientY - startY);

                // Only start the "Drag" if they move more than 7 pixels
                if (!hasMoved && (moveX > 7 || moveY > 7)) {
                    hasMoved = true;
                    
                    // Now make it look and act like a dragged item
                    dieEl.classList.add('dragging');
                    dieEl.style.position = 'fixed';
                    dieEl.style.zIndex = 1000;

                    if (dieEl.parentElement && dieEl.parentElement.classList.contains('cell')) {
                        boardState[dieEl.parentElement.dataset.index] = null;
                        refreshHighlights();
                    }
                    document.body.appendChild(dieEl); 
                }

                if (hasMoved) {
                    dieEl.style.left = ev.clientX - dieEl.offsetWidth / 2 + 'px';
                    dieEl.style.top = ev.clientY - dieEl.offsetHeight / 2 + 'px';
                }
            };

            const onPointerUp = (ev) => {
                dieEl.releasePointerCapture(ev.pointerId);
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);

                if (!hasMoved) {
                    // --- IT WAS A TAP ---
                    dieEl.classList.remove('dragging');
                    
                    const parentCell = dieEl.parentElement;
                    if (parentCell && parentCell.classList.contains('cell')) {
                        const index = parseInt(parentCell.dataset.index);
                        // If it's part of a valid word, show definition immediately
                        if (validHorizontal.has(index) || validVertical.has(index)) {
                            const word = getFullWord(index);
                            if (word) fetchDefinition(word);
                        }
                    }
                } else {
                    // --- IT WAS A DRAG ---
                    dieEl.classList.remove('dragging');
                    dieEl.style.visibility = 'hidden';
                    let elemBelow = document.elementFromPoint(ev.clientX, ev.clientY);
                    dieEl.style.visibility = 'visible';

                    let cell = elemBelow ? elemBelow.closest('.cell') : null;

                    if (cell) {
                        let targetIndex = parseInt(cell.dataset.index);
                        if (cell.children.length > 0) {
                            targetIndex = findNearestEmpty(targetIndex);
                        }

                        if (targetIndex !== -1) {
                            boardState[targetIndex] = dieEl.textContent; 
                            boardElement.children[targetIndex].appendChild(dieEl);
                            dieEl.style.position = 'static';
                            refreshHighlights(targetIndex); 
                        } else {
                            returnToTray(dieEl);
                            refreshHighlights();
                        }
                    } else {
                        returnToTray(dieEl);
                        refreshHighlights();
                    }
                }

                dieEl.style.left = '';
                dieEl.style.top = '';
                dieEl.style.zIndex = '';
                dieEl.lastDropTime = Date.now();
                draggedElement = null;
            };

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        };

        dieEl.ondragstart = () => false;
        trayElement.appendChild(dieEl);
    });
}

// 4. Word Logic & Definitions
function startTimer() {
    timerInterval = setInterval(() => {
        secondsElapsed++;
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (secondsElapsed % 60).toString().padStart(2, '0');
        timerText.textContent = `  ${mins}:${secs}`;
    }, 1000);
}

function getFullWord(index) {
    if (validHorizontal.has(index)) return findSequence(index, 1);
    if (validVertical.has(index)) return findSequence(index, 10);
    return null;
}

function findSequence(index, step) {
    let start = index;
    let end = index;
    while (boardState[start - step] && (step === 10 || Math.floor((start - step) / 10) === Math.floor(start / 10))) {
        start -= step;
    }
    while (boardState[end + step] && (step === 10 || Math.floor((end + step) / 10) === Math.floor(end / 10))) {
        end += step;
    }
    let word = "";
    for (let i = start; i <= end; i += step) {
        word += boardState[i];
    }
    return word;
}

function refreshHighlights(droppedIndex = null) {
    const allDiceElements = document.querySelectorAll('.die');
    allDiceElements.forEach(d => d.classList.remove('valid'));

    validHorizontal = new Set();
    validVertical = new Set();
    const hasHorizontalNeighbor = new Set();
    const hasVerticalNeighbor = new Set();

    const scan = (indices, isHorizontal) => {
        let text = indices.map(i => boardState[i] || ' ').join('');
        const wordRegex = /([A-Z]{2,})/g; 
        let match;

        while ((match = wordRegex.exec(text)) !== null) {
            const word = match[0];
            const startIdx = match.index;
            const isWordValid = dictionary.has(word) && (word.length >= minWordLength);

            for (let i = 0; i < word.length; i++) {
                const boardIdx = indices[startIdx + i];
                if (isHorizontal) {
                    hasHorizontalNeighbor.add(boardIdx);
                    if (isWordValid) validHorizontal.add(boardIdx);
                } else {
                    hasVerticalNeighbor.add(boardIdx);
                    if (isWordValid) validVertical.add(boardIdx);
                }
            }
        }
    };

    for (let i = 0; i < 10; i++) {
        scan(Array.from({ length: 10 }, (_, j) => i * 10 + j), true);  
        scan(Array.from({ length: 10 }, (_, j) => j * 10 + i), false); 
    }

    boardState.forEach((letter, i) => {
        if (!letter) return;
        const hInvalid = hasHorizontalNeighbor.has(i) && !validHorizontal.has(i);
        const vInvalid = hasVerticalNeighbor.has(i) && !validVertical.has(i);
        if (!hInvalid && !vInvalid && (validHorizontal.has(i) || validVertical.has(i))) {
            const cell = boardElement.children[i];
            if (cell && cell.firstChild) cell.firstChild.classList.add('valid');
        }
    });

    if (droppedIndex !== null) {
        const newWord = getFullWord(droppedIndex);
        if (newWord && newWord !== lastDiscoveredWord) {
            showHUD(newWord);
            lastDiscoveredWord = newWord;
        }
    }
    checkWinCondition();
}

function checkWinCondition() {
    const diceOnBoard = boardState.filter(x => x !== null).length;
    const greenDice = document.querySelectorAll('.die.valid').length;
    const connected = isEverythingConnected(); 

    if (diceOnBoard === 3 && greenDice === 3 && connected) {
        recordGameWon(); 
        clearInterval(timerInterval);
        timerText.classList.add('win-flash');
        const banner = document.getElementById('victory-banner');
        const scoreText = document.getElementById('final-score');
        if (banner) {
            scoreText.textContent = ` ${timerText.textContent}`;
            banner.classList.remove('hidden');
        }
        document.getElementById('game-board')?.classList.add('ui-disabled');
       // document.getElementById('controls')?.classList.add('ui-disabled');
    }
}

function isEverythingConnected() {
    const activeIndices = [];
    boardState.forEach((letter, i) => {
        if (letter !== null) activeIndices.push(i);
    });
    if (activeIndices.length === 0) return false;
    const visited = new Set();
    const queue = [activeIndices[0]];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!visited.has(current)) {
            visited.add(current);
            const neighbors = [current - 10, current + 10, current - 1, current + 1];
            neighbors.forEach(n => {
                if (n >= 0 && n < 100 && activeIndices.includes(n)) {
                    const isSameRow = Math.floor(current / 10) === Math.floor(n / 10);
                    const isVertical = Math.abs(current - n) === 10;
                    if (isVertical || isSameRow) queue.push(n);
                }
            });
        }
    }
    return visited.size === activeIndices.length;
}

function showHUD(word) {
    const hud = document.getElementById('word-hud');
    const msg = document.getElementById('hud-message');
    if (!hud || !msg) return;
    msg.innerText = `Word Found: ${word}`;
    hud.classList.remove('hud-hidden');
    hud.onclick = () => {
        fetchDefinition(word);
        hud.classList.add('hud-hidden');
    };
    if (window.hudTimer) clearTimeout(window.hudTimer);
    window.hudTimer = setTimeout(() => hud.classList.add('hud-hidden'), 4000);
}

async function fetchDefinition(word) {
    const modal = document.getElementById('def-modal');
    const title = document.getElementById('def-title');
    const body = document.getElementById('def-body');
    title.innerText = word;
    body.innerText = "Loading definition...";
    modal.classList.remove('hidden');
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        const data = await response.json();
        if (data[0]?.meanings[0]) {
            body.innerText = data[0].meanings[0].definitions[0].definition;
        } else {
            body.innerText = "Definition not found.";
        }
    } catch (err) {
        body.innerText = "Error fetching definition.";
    }
}


// window.confirmReset = function() {
//     const modal = document.getElementById('custom-confirm-modal');
//     modal.classList.remove('hidden');
//     document.getElementById('confirm-cancel').onclick = () => modal.classList.add('hidden');
//     document.getElementById('confirm-delete').onclick = () => {
//         localStorage.removeItem('dabble_played');
//         localStorage.removeItem('dabble_won');
//         updateStatsUI();
//         modal.classList.add('hidden');
//     };
// };



// rollButton.addEventListener('click', () => {
//     console.log("1. Roll Button Clicked");

//     const isBoardDirty = boardState.some(cell => cell !== null);
//     const isTimerRunning = secondsElapsed > 0;

//     if (isBoardDirty || isTimerRunning) {
//         console.log("2. Game in progress, seeking modal...");
//         const modal = document.getElementById('custom-confirm-modal');
//         const confirmBtn = document.getElementById('confirm-delete');
//         const cancelBtn = document.getElementById('confirm-cancel');
        
//         // Safety Check
//         if (!modal || !confirmBtn) {
//             console.error("3. Error: Modal elements missing from HTML!");
//             setupGame(); 
//             return;
//         }

//         // Update text safely
//         const title = modal.querySelector('h2');
//         const text = modal.querySelector('p');
//         if (title) title.innerText = "Start New Game?";
//         if (text) text.innerText = "This will clear your board and roll new letters.";
//         confirmBtn.innerText = "Yes, New Game";

//         modal.classList.remove('hidden');
//         console.log("4. Modal should be visible now");

//         // Use a fresh click listener
//         confirmBtn.onclick = () => {
//             console.log("5. Confirm 'Yes' Clicked");
//             modal.classList.add('hidden');
//             setupGame(); 
//         };
        
//         cancelBtn.onclick = () => modal.classList.add('hidden');
//     } else {
//         console.log("2. Board empty, starting setupGame immediately");
//         setupGame();
//     }
// });

// --- UNIFIED CONFIRMATION LOGIC ---
function openConfirmModal(type) {
    const modal = document.getElementById('custom-confirm-modal');
    const title = modal.querySelector('h3'); // Using h3 as per your HTML
    const message = modal.querySelector('p');
    const confirmBtn = document.getElementById('confirm-yes-btn');
    const cancelBtn = document.getElementById('confirm-cancel');

    if (type === 'new-game') {
        title.innerText = "Start New Game?";
        message.innerText = "This will clear your board and roll new letters. Are you sure?";
        confirmBtn.innerText = "Yes, New Game";
        confirmBtn.onclick = () => {
            modal.classList.add('hidden');
            setupGame();
        };
    } 
    // Change 'clear-button' to 'clear-board'
    else if (type === 'clear-board') { 
    title.innerText = "Clear Board?";
    message.innerText = "This will move all dice back to the tray, but keep your current letters.";
    confirmBtn.innerText = "Clear It";
    confirmBtn.onclick = () => {
        modal.classList.add('hidden');
        executeClearBoard(); 
    };
}
    else if (type === 'reset-stats') {
        title.innerText = "Reset All Stats?";
        message.innerText = "This will permanently delete your win history and best times.";
        confirmBtn.innerText = "Delete Everything";
        confirmBtn.onclick = () => {
            localStorage.removeItem('dabble_played');
            localStorage.removeItem('dabble_won');
            updateStatsUI();
            modal.classList.add('hidden');
        };
    }

    modal.classList.remove('hidden');
    cancelBtn.onclick = () => modal.classList.add('hidden');
}

// --- BUTTON LISTENERS ---

// Updated New Game logic
rollButton.addEventListener('click', () => {
    const isBoardDirty = boardState.some(cell => cell !== null);
    const isTimerRunning = secondsElapsed > 0;

    if (isBoardDirty || isTimerRunning) {
        openConfirmModal('new-game');
    } else {
        setupGame();
    }
});

// Updated Settings Reset logic
window.confirmReset = function() {
    openConfirmModal('reset-stats');
};






// Initialize
// rollButton.addEventListener('click', setupGame);




loadDictionary();
createBoard();
loadStats();

// Settings Modal Logic
const settingsModal = document.getElementById('settings-modal');
const menuBtn = document.getElementById('menu-btn');
const settingsClose = document.getElementById('settings-close');

menuBtn.onclick = () => settingsModal.classList.remove('hidden');
settingsClose.onclick = () => settingsModal.classList.add('hidden');

// Close modal if they click the dark background
window.onclick = (event) => {
    if (event.target == settingsModal) {
        settingsModal.classList.add('hidden');
    }
}


//const settingsTrigger = document.getElementById('settings-trigger');
//const settingsModal = document.getElementById('settings-modal'); // Adjust to your actual ID

//settingsTrigger.onclick = () => {
//    settingsModal.classList.remove('hidden');
//};