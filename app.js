// Game State
//const diceConfigs = [
//    "MMLLBY", "VFGKPP", "HHNNRR", "DFRLLW", "RRDLGG", "XKBSZN",
//    "WHHTTP", "AEIOUU", "CCMTTS", "OIINNY", "AEIOUU", "AAEEOO"
//];

const diceConfigs = [
    "MMLLBY", "VFGKPP", "HHNNRR", "DFRLLW", "RRDLGG", "XKBSZN",
    "WHHTTP", "CCBTJD", "CCMTTS", "OIINNY", "AEIOUU", "AAEEOO"
];

//const diceConfigs = [
//    "MMLLBY", "VFGKPP", "HHNNRR", "DFRLLW", "RRDLGG", "AEIOUU",
//    "WHHTTP", "CCBTJD", "CCMTTS", "OIINNY", "AEIOUU", "AAEEOO"
//];




const VERSION = "1.2.6";
const IS_DEBUG = false;

let minWordLength = localStorage.getItem('minWordLength') ? parseInt(localStorage.getItem('minWordLength')) : 2;
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';

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

// Inside your initialization or DOMContentLoaded function
const soundToggle = document.getElementById('sound-toggle');
if (soundToggle) {
    soundToggle.checked = soundEnabled;
    soundToggle.addEventListener('change', (e) => {
        soundEnabled = e.target.checked;
        localStorage.setItem('soundEnabled', soundEnabled);
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
let isGameOver = false;
let isRolling = false;
let rolledDice = [];

// Change this line to switch between files
const dictionaryFile = 'words.json'; 

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

function executeClearBoard() {
    const allDice = document.querySelectorAll('.die');
    allDice.forEach(die => {
        // Only move dice that are actually on the board
        if (die.parentElement.classList.contains('cell')) {
            returnToTray(die);
            die.classList.remove('valid');
        }
    });
    boardState.fill(null);
    refreshHighlights();
}

// Stats Logic
function updateStatsUI() {
    // 1. Pull FRESH data from Storage
    const played = parseInt(localStorage.getItem('dabble_played') || 0);
    const won = parseInt(localStorage.getItem('dabble_won') || 0);
    const streak = parseInt(localStorage.getItem('dabble_streak') || 0); // Added this!
    const percent = played > 0 ? Math.round((won / played) * 100) : 0;

    // 2. Update Basic Stats
    const playedEl = document.getElementById('games-played');
    const wonEl = document.getElementById('games-won');
    const percentEl = document.getElementById('win-pct');
    const streakEl = document.getElementById('streak-count'); // Make sure this ID is in your HTML


    if (playedEl) playedEl.textContent = played;
    if (wonEl) wonEl.textContent = won;
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (streakEl) streakEl.textContent = streak;
    
    // 1. Get the seconds (to check if it's our "100-hour" reset value)
    const bestSecs = parseInt(localStorage.getItem('dabble_best_seconds') || 360000);
    // 2. Get the time string
    const bestTime = localStorage.getItem('dabble_best_time') || "00:00";
    const bestTimeEl = document.getElementById('best-time-display');

    if (bestTimeEl) {
        // 3. Logic: If it's our reset placeholder (360,000s), show 00:00
        if (bestSecs >= 360000) {
            bestTimeEl.textContent = "00:00";
        } else {
            // Otherwise, show the actual personal best
            bestTimeEl.textContent = bestTime;
        }
    }

    // 3. Update Rank & Colors
    const rankEl = document.getElementById('rank-display');
    if (rankEl) {
        
        let rankName = "BRONZE";
        let rankColor = "#CD7F32";

        if (streak >= 8) { rankName = "DIAMOND"; rankColor = "#B9F2FF"; }
        else if (streak >= 6) { rankName = "EMERALD"; rankColor = "#50C878"; }
        else if (streak >= 4) { rankName = "GOLD"; rankColor = "#FFD700"; }
        else if (streak >= 2) { rankName = "SILVER"; rankColor = "#C0C0C0"; }
        else if (streak >= 0) { rankName = "BRONZE"; rankColor = "#CD7F32"; }

        rankEl.textContent = rankName;
        rankEl.style.color = rankColor;
    }

    updateLevelLadder()
}

function updateLevelLadder() {
    const ladder = document.getElementById('level-ladder');
    if (!ladder) return;
    
    // Use the streak value for the level
    const level = parseInt(localStorage.getItem('dabble_streak') || 0);
    ladder.innerHTML = ''; 

    // Always create 10 slots
    for (let i = 0; i <= 9; i++) {
        const square = document.createElement('div');
        square.className = 'ladder-square';

        if (i <= level) {
            const color = getLadderColor(i);
            square.style.backgroundColor = color;
            // Add a glow for the "active" current level
            if (i === level) {
                square.style.boxShadow = `0 0 8px ${color}`;
            }
        }
        ladder.appendChild(square);
    }
}

function getLadderColor(lv) {
    if (lv >= 8) return "#B9F2FF"; // Diamond (8, 9, 10)
    if (lv >= 6) return "#50C878"; // Emerald (6, 7)
    if (lv >= 4) return "#FFD700"; // Gold (4, 5)
    if (lv >= 2) return "#C0C0C0"; // Silver (2, 3)
    if (lv >= 0) return "#CD7F32"; // Bronze (1)
    return "transparent";
}

function recordGamePlayed() {
    let played = parseInt(localStorage.getItem('dabble_played') || 0);
    localStorage.setItem('dabble_played', played + 1);
    updateStatsUI();
}

function recordGameWon() {
    if (isGameOver) return; 
    isGameOver = true;

    let won = parseInt(localStorage.getItem('dabble_won') || 0);
    localStorage.setItem('dabble_won', won + 1);

    // 2. Update Streak
    let streak = parseInt(localStorage.getItem('dabble_streak') || 0);
    // This ensures that even if streak + 1 = 11, we only save 10.
    let cappedLevel = Math.min(10, streak + 1);
    localStorage.setItem('dabble_streak', cappedLevel);


    // 3. Check for New Personal Best
    const savedBestSeconds = parseInt(localStorage.getItem('dabble_best_seconds'));

    // Logic: If there's no saved best, OR if current time is faster (fewer seconds)
    if (!savedBestSeconds || secondsElapsed < savedBestSeconds) {
        localStorage.setItem('dabble_best_seconds', secondsElapsed);
        
        // Grab the actual text currently on the timer (e.g., "00:45")
        const currentTimeString = document.getElementById('timer').textContent;
        localStorage.setItem('dabble_best_time', currentTimeString);
    }


    // Trigger visual feedback since the banner is gone
    const statsHeader = document.getElementById('stats');
    statsHeader.classList.add('win-animation');
    
    // Remove the class after animation so it can be re-triggered next time
    setTimeout(() => {
        statsHeader.classList.remove('win-animation');
    }, 500);

   celebrateLogo()

    updateStatsUI(); 

}

function loadStats() {
    updateStatsUI();
}

async function loadDictionary() {
    dictionary.clear();
    try {
        const response = await fetch(dictionaryFile);
        if (!response.ok) throw new Error("File not found");

        if (dictionaryFile.endsWith('.json')) {
            // OPTION A: Handle JSON
            const wordsArray = await response.json();
            dictionary = new Set(wordsArray);
        } else {
            // OPTION B: Handle TXT (Original Logic)
            const text = await response.text();
            text.split(/\r?\n/).forEach(word => {
                if (word.trim()) dictionary.add(word.trim().toUpperCase());
            });
        }

        console.log(`Dictionary Loaded (${dictionaryFile}):`, dictionary.size, "words");
    } catch (err) {
        console.error("Could not load dictionary:", err);
    }
}
function setupGame() {
    // 1. IMMEDIATELY hide the banner and reset its state
    const banner = document.getElementById('victory-banner');
    if (banner) {
        banner.classList.remove('show');   // CRITICAL: Remove the win class
        banner.classList.add('hidden');    // Add the hide class
        banner.style.display = 'none';      // Force hide override
    }

if (soundEnabled) {
    const winSound = document.getElementById('win-sound');
    if (winSound) {
        winSound.volume = 0; // Keep it muted just in case
        
        // We play it, but immediately tell it to stop after 100ms
        winSound.play().then(() => {
            setTimeout(() => {
                winSound.pause();
                winSound.currentTime = 0;
                winSound.volume = 0.4; // Ready for the real win
            }, 1); 
        }).catch(e => console.log("Priming waiting for first tap"));
    }
}


    if (isRolling) return; // Exit if already rolling
    isRolling = true;
   
    const rollBtn = document.getElementById('roll-button');
    if (rollBtn) {
        rollBtn.disabled = true;
        rollBtn.classList.add('ui-disabled');
        rollBtn.style.opacity = '0.5';
        rollBtn.textContent = 'Rolling...';
    }

    // Wipe the physical board clean
    const gameBoard = document.getElementById('game-board');
    if (gameBoard) gameBoard.innerHTML = '';

    boardState = Array(100).fill(null);
    createBoard();
    secondsElapsed = 0;
    clearInterval(timerInterval);
    isGameOver = false;

    const controls = document.getElementById('controls');
    const clearBtn = document.getElementById('clear-button');
    if(gameBoard) gameBoard.classList.remove('ui-disabled');
    if(controls) controls.classList.remove('ui-disabled');
    if (clearBtn) clearBtn.classList.remove('ui-disabled');
    
    // Reset the timer visual
    if (typeof timerText !== 'undefined') {
        timerText.classList.remove('win-flash');
        timerText.textContent = "00:00";
    }


window.debugModeActive = true;

// --- INTEGRATED DEBUG LOGIC ---
    rolledDice = getStartingDice();
    console.log("Rolled Dice:", rolledDice.map(d => d.letter).join(', '));


    // Audio Fix (Your existing code)
    if (soundEnabled) {
        const sound = document.getElementById('roll-sound');
        if (sound) {
            sound.pause(); 
            sound.currentTime = 0; 
            setTimeout(() => {
                sound.play().catch(e => console.log("Audio skipped:", e));
            }, 10);
        }
    }    

    // Display the dice
    displayDice(rolledDice.sort(() => Math.random() - 0.5));
        
    // --- THIS PART RE-ACTIVATES THE GRID PLACEMENT ---
    if (IS_DEBUG && window.debugModeActive) {
        // We give displayDice 500ms to finish rendering the physical dice 
        // before we try to move them to the board.
        setTimeout(() => {
            autoPlaceDebugDice(rolledDice); 
        }, 500);
    
    window.debugModeActive = false; 
}


    // Lockout timer (Your existing code continues...)
    setTimeout(() => {
        isRolling = false;
        if (rollBtn) {
            rollBtn.disabled = false;
            rollBtn.classList.remove('ui-disabled');
            rollBtn.style.opacity = '1';
            rollBtn.textContent = 'New Game'; 
        }
    }, 3000);

    recordGamePlayed();
    startTimer();
}

function getStartingDice() {
    // 1. Check for URL Challenge (?q=...)
    const urlParams = new URLSearchParams(window.location.search);
    const challengeCode = urlParams.get('q');
    console.log("Challenge Code from URL:", challengeCode);
    if (challengeCode) {
        try {
            // Decode Base64 string back into letters
            const decoded = atob(challengeCode); 
            const letters = decoded.split('');
            if (letters.length === 12) {
                // Clean the URL so refreshing doesn't keep reloading the challenge
                window.history.replaceState({}, document.title, window.location.pathname);
                return letters.map((l, id) => ({ id: id, letter: l.toUpperCase() }));
            }
        } catch (e) {
            console.error("Invalid challenge code");
        }
    }

    // 2. Check for Debug Mode
    if (IS_DEBUG && window.debugModeActive) {
        console.log("DEBUG MODE: Generating fixed dice for testing.");
        const debugLetters = ["C","A","T","S","P","I","N","D","O","G","E","R"];
        return debugLetters.map((l, id) => ({ id: id, letter: l }));
    }

    // 3. Default: Random Roll
    console.log("No challenge code found. Generating random dice.");
    return diceConfigs.map((config, id) => ({
        id: id,
        letter: config[Math.floor(Math.random() * config.length)]
    }));
}


function returnToTray(dieEl, mouseX, mouseY) {
    const slots = document.querySelectorAll('.tray-slot');
    let closestSlot = null;
    let minDistance = Infinity;

    // If we have mouse coordinates, find the closest empty slot
    if (mouseX !== undefined && mouseY !== undefined) {
        slots.forEach(slot => {
            if (slot.children.length === 0 || slot.contains(dieEl)) {
                const rect = slot.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const distance = Math.hypot(mouseX - centerX, mouseY - centerY);

                if (distance < minDistance) {
                    minDistance = distance;
                    closestSlot = slot;
                }
            }
        });
    }

    // Fallback: If we didn't find a closest one (or no coordinates), grab the first empty
    if (!closestSlot) {
        closestSlot = Array.from(slots).find(s => s.children.length === 0);
    }

    if (closestSlot) {
        closestSlot.appendChild(dieEl);
        dieEl.style.position = 'static';
    }
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
    
    // 1. Create all 12 slots first so they exist in the DOM
    const slots = [];
    for (let i = 0; i < 12; i++) {
        const slot = document.createElement('div');
        slot.className = 'tray-slot';
        trayElement.appendChild(slot);
        slots.push(slot);
    }

    // 2. Shuffle the slots array so dice land in random positions in the tray
    const shuffledSlots = [...slots].sort(() => Math.random() - 0.5);

    dice.forEach((die, index) => {
        const dieEl = document.createElement('div');
        // Add 'die-throw' class for the animation
        dieEl.className = 'die die-throw'; 
        dieEl.textContent = die.letter;
        dieEl.id = `die-${die.id}`;
        
        // 1. Wait 0.6s (the shake time) THEN pick a random spot in the next 0.9s
        // Total window: 1.5 seconds to match your MP3 length
        const shakeTime = 0; 
        const randomDelay = shakeTime + (Math.random() * .9);
        dieEl.style.animationDelay = `${randomDelay}s`;

        // Put the die in one of the randomly chosen slots
        shuffledSlots[index].appendChild(dieEl);

        // --- Your existing Pointer Logic remains exactly the same ---
        dieEl.onpointerdown = (e) => {
            // Remove animation class so it doesn't fight with dragging
            dieEl.classList.remove('die-throw');
            dieEl.style.animationDelay = '';

            const startX = e.clientX;
            const startY = e.clientY;
            let hasMoved = false;
            dieEl.setPointerCapture(e.pointerId);
            draggedElement = dieEl;

            const onPointerMove = (ev) => {
                const moveX = Math.abs(ev.clientX - startX);
                const moveY = Math.abs(ev.clientY - startY);

                if (!hasMoved && (moveX > 7 || moveY > 7)) {
                    hasMoved = true;
                    if (!isGameOver) {
                        dieEl.classList.add('dragging');
                        dieEl.style.position = 'fixed';
                        dieEl.style.zIndex = 1000;

                        if (dieEl.parentElement && dieEl.parentElement.classList.contains('cell')) {
                            boardState[dieEl.parentElement.dataset.index] = null;
                            refreshHighlights();
                        }
                        document.body.appendChild(dieEl); 
                    }
                }

                if (hasMoved && !isGameOver) {
                    dieEl.style.left = ev.clientX - dieEl.offsetWidth / 2 + 'px';
                    dieEl.style.top = ev.clientY - dieEl.offsetHeight / 2 + 'px';
                }
            };

            const onPointerUp = (ev) => {
                dieEl.releasePointerCapture(ev.pointerId);
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);

                if (!hasMoved) {
                    const parentCell = dieEl.parentElement;
                    if (parentCell && parentCell.classList.contains('cell')) {
                        const index = parseInt(parentCell.dataset.index);
                        if (validHorizontal.has(index) || validVertical.has(index)) {
                            const word = getFullWord(index);
                            if (word) fetchDefinition(word);
                        }
                    }
                } else {
                    dieEl.classList.remove('dragging');
                    if (!isGameOver) {
                        dieEl.style.visibility = 'hidden';
                        let elemBelow = document.elementFromPoint(ev.clientX, ev.clientY);
                        dieEl.style.visibility = 'visible';

                        let cell = elemBelow ? elemBelow.closest('.cell') : null;
                        if (cell) {
                            let targetIndex = parseInt(cell.dataset.index);
                            if (cell.children.length > 0) targetIndex = findNearestEmpty(targetIndex);

                            if (targetIndex !== -1) {
                                boardState[targetIndex] = dieEl.textContent; 
                                boardElement.children[targetIndex].appendChild(dieEl);
                                dieEl.style.position = 'static';
                                refreshHighlights(targetIndex);
                            } else {
                                returnToTray(dieEl, ev.clientX, ev.clientY);
                            }
                        } else {
                            returnToTray(dieEl, ev.clientX, ev.clientY);
                        }
                        refreshHighlights();
                    } 
                }
                dieEl.style.left = '';
                dieEl.style.top = '';
                dieEl.style.zIndex = '';
                draggedElement = null;
            };

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        };
        dieEl.ondragstart = () => false;
    });
}


// 4. Word Logic & Definitions
function startTimer() {
    timerInterval = setInterval(() => {
        if (secondsElapsed < 5999) { // 99 minutes and 59 seconds
            secondsElapsed++;
            updateTimerDisplay();
        } else {
            clearInterval(timerInterval);
            timerText.textContent = "99:59";
        }
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (secondsElapsed % 60).toString().padStart(2, '0');
        timerText.textContent = `  ${mins}:${secs}`;
    }, 1000);
}

function updateTimerDisplay() {
    const mins = Math.floor(secondsElapsed / 60);
    const secs = secondsElapsed % 60;
    
    // padStart(2, '0') ensures 5 seconds looks like :05
    const displayMins = String(mins).padStart(2, '0');
    const displaySecs = String(secs).padStart(2, '0');
    
    timerText.textContent = `${displayMins}:${displaySecs}`;
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
    if (!isGameOver) {  
        const diceOnBoard = boardState.filter(x => x !== null).length;
        const greenDice = document.querySelectorAll('.die.valid').length;
        const connected = isEverythingConnected(); 

        if (diceOnBoard === 12 && greenDice === 12 && connected) {
            // 3. Play Victory Sound
            if (soundEnabled) {
                const winSound = document.getElementById('win-sound');
                if (winSound) {
                    winSound.volume = 0.4;
                    winSound.currentTime = 0;
                    setTimeout(() => {
                        winSound.play().catch(e => console.log("Win audio blocked"));
                    }, 20);
                }
            }

            // 1. Fire the actual scoring logic
            recordGameWon(); 

            // 2. Stop the clock and highlight it
            clearInterval(timerInterval);
            timerText.classList.add('win-flash');
                        
            // 4. Disable UI buttons
            document.getElementById('clear-button')?.classList.add('ui-disabled');
        }
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
        // fetchDefinition(word);
        hud.classList.add('hud-hidden');
    };
    if (window.hudTimer) clearTimeout(window.hudTimer);
    window.hudTimer = setTimeout(() => hud.classList.add('hud-hidden'), 5000);
}


async function fetchDefinition(word) {
    const modal = document.getElementById('def-modal');
    const title = document.getElementById('def-title');
    const body = document.getElementById('def-body');

    title.innerText = word;
    body.innerText = "Loading definition...";
    modal.classList.remove('hidden');

    try {
        // --- ATTEMPT 1: Primary API ---
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data[0]?.meanings[0]?.definitions[0]) {
                const definition = data[0].meanings[0].definitions[0].definition;
                // Subtle indicator: (D) for DictionaryAPI
                body.innerHTML = `${definition} <br><small style="opacity: 0.5; float: right;">(D)</small>`;
                return;
            }
        }

        // --- ATTEMPT 2: Fallback API (Datamuse) ---
        const fallbackRes = await fetch(`https://api.datamuse.com/words?sp=${word}&md=d&max=1`);
        
        if (fallbackRes.ok) {
            const data = await fallbackRes.json();
            if (data.length > 0 && data[0].defs && data[0].defs.length > 0) {
                const cleanDef = data[0].defs[0].split('\t')[1] || data[0].defs[0];
                // Subtle indicator: (M) for Datamuse/Muse
                body.innerHTML = `${cleanDef} <br><small style="opacity: 0.5; float: right;">(M)</small>`;
                return;
            }
        }

        // --- IF BOTH FAIL ---
        body.innerText = "Definition not found, but it's a valid play!";

    } catch (err) {
        console.error("Fetch error:", err);
        body.innerText = "Error fetching definition.";
    }
}

function celebrateLogo() {
    const logoDice = document.querySelectorAll('.logo-die');
    
    logoDice.forEach((die, index) => {
        // Stagger the start of each letter (0ms, 100ms, 200ms, etc.)
        setTimeout(() => {
            die.classList.add('logo-victory-hop');
            
            // Remove the class after the animation ends so it can play again next win
            setTimeout(() => {
                die.classList.remove('logo-victory-hop');
            }, 600);
            
        }, index * 100);
    });
}


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
  // Inside openConfirmModal for 'new-game'
confirmBtn.onclick = () => {
    if (!isGameOver) {
        // Instead of setting to 0, apply the ladder penalty
        applyLadderPenalty();
    }
    modal.classList.add('hidden');
    setupGame();
    updateStatsUI();
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
            // 1. Wipe everything
            localStorage.removeItem('dabble_played');
            localStorage.removeItem('dabble_won');
            localStorage.removeItem('dabble_streak');

            // RESET THE RECORD: Set it back to our 100-hour "ceiling"
            localStorage.setItem('dabble_best_seconds', 360000); 
            localStorage.setItem('dabble_best_time', "00:00");


            // 2. The "Active Game" Check
            // If the timer has started, this counts as the first game of the new era
            if (secondsElapsed > 0) {
                localStorage.setItem('dabble_played', 1);
            }   
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







loadDictionary();
createBoard();
loadStats();
document.getElementById('app-version').textContent = VERSION;



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

function isRollFair(roll) {
    const counts = {};
    roll.forEach(l => counts[l] = (counts[l] || 0) + 1);

    const vowels = roll.filter(l => "AEIOU".includes(l)).length;
    const tough = roll.filter(l => "JXZK".includes(l)).length; // Hard consonants
    
    // RULE 1: The "Vowel Subsidy"
    // If we only have 2 vowels (because the 3rd die landed on Y or N), 
    // we cannot afford more than 1 tough letter.
    if (vowels <= 2 && tough > 1) return false;

    // RULE 2: The "Triple Threat"
    // Rolling 3 of the same consonant (e.g., three C's) makes a 12-letter board 
    // too repetitive and difficult to connect.
    const hasTripleConsonant = Object.entries(counts).some(([letter, count]) => {
        return !"AEIOU".includes(letter) && count >= 3;
    });
    if (hasTripleConsonant) return false;

    // RULE 3: The "Consonant Jam"
    // If more than half the board (7+ letters) are "Clunky" consonants 
    // (B, C, D, F, G, P, V, W), it's a "clunky" hand.
    const clunky = roll.filter(l => "BCDFGPVW".includes(l)).length;
    if (clunky > 6) return false;

    return true; // The roll is approved!
}

// Test if the button is even 'alive'
const closeBtn = document.getElementById('def-close');
if (closeBtn) {
    console.log("Debug: Close button found in DOM");
    closeBtn.onclick = () => {
        console.log("Debug: Close button clicked!");
        document.getElementById('def-modal').classList.add('hidden');
    };
} else {
    console.error("Debug: Close button NOT found! Check your HTML ID.");
}


//document.getElementById('def-close').onclick = () => {
//        document.getElementById('def-modal').classList.add('hidden');
 //   };

function getValidConnectedCount() {
    const activeIndices = [];
    boardState.forEach((letter, i) => {
        // Only consider the index if the die exists and has the 'valid' class
        const cell = boardElement.children[i];
        if (letter !== null && cell && cell.firstChild && cell.firstChild.classList.contains('valid')) {
            activeIndices.push(i);
        }
    });

    if (activeIndices.length === 0) return 0;

    let maxClumpSize = 0;
    const globalVisited = new Set();

    activeIndices.forEach(startIndex => {
        if (!globalVisited.has(startIndex)) {
            const currentClump = new Set();
            const queue = [startIndex];
            while (queue.length > 0) {
                const current = queue.shift();
                if (!currentClump.has(current)) {
                    currentClump.add(current);
                    globalVisited.add(current);
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
            if (currentClump.size > maxClumpSize) maxClumpSize = currentClump.size;
        }
    });
    return maxClumpSize;
}

function applyLadderPenalty() {
    // 1. Get count of dice that are BOTH green and connected
    const validConnected = getValidConnectedCount();
    
    // 2. Penalty = 12 total - valid ones (max cap of 3)
    const penalty = Math.min(12 - validConnected, 3);

    // 3. Update 'streak' (Level)
    let currentLevel = parseInt(localStorage.getItem('dabble_streak') || 0);
    let newLevel = Math.max(0, currentLevel - penalty);
    
    localStorage.setItem('dabble_streak', newLevel);
    updateStatsUI();
}

// Helper to create a die element manually for debug
function createDebugDie(letter, id) {
    const dieEl = document.createElement('div');
    dieEl.className = 'die';
    dieEl.textContent = letter;
    dieEl.id = `debug-die-${id}`;
    // Attach your existing pointer logic here or just call displayDice logic
    return dieEl;
}

function autoPlaceDebugDice() {
    // We define 11 letters to place. "E" stays in the tray.
    const layout = [
        // CATS (Vertical) - Row 2-5, Col 2
        {idx: 22, l: "C"}, {idx: 32, l: "A"}, {idx: 42, l: "T"}, {idx: 52, l: "S"},
        
        // SPRING (Horizontal) - Row 5, Col 3-7 (R is now at 54)
        {idx: 53, l: "P"}, {idx: 54, l: "R"}, {idx: 55, l: "I"}, {idx: 56, l: "N"}, {idx: 57, l: "G"},
        
        // DO (Vertical) - Row 3-4, Col 7 (G is already at 57)
        {idx: 37, l: "D"}, {idx: 47, l: "O"}
    ];

    layout.forEach(item => {
        // Find a die in the tray with the letter
        const dieEl = Array.from(document.querySelectorAll('.die')).find(d => 
            d.textContent === item.l && d.parentElement.classList.contains('tray-slot')
        );

        if (dieEl) {
            boardState[item.idx] = item.l;
            const cell = boardElement.children[item.idx];
            if (cell) {
                cell.appendChild(dieEl);
                dieEl.style.position = 'relative';
                dieEl.style.left = '0';
                dieEl.style.top = '0';
            }
        }
    });

    refreshHighlights();
    console.log("Debug: 11 dice placed. Only 'E' remains in tray.");
}
function handleShare() {
    if (!rolledDice || rolledDice.length !== 12) {
        alert("Start a game first to share a challenge!");
        return;
    }

    const letterString = rolledDice.map(d => d.letter).join('');
    const code = btoa(letterString);
    const shareUrl = `${window.location.origin}${window.location.pathname}?q=${code}`;
    const shareText = ` Can you solve this board?`;

    // 1. Try Native Share (Requires HTTPS)
    if (navigator.share) {
        navigator.share({
            title: 'Dabble Challenge!',
            text: shareText,
            url: shareUrl
        }).catch(err => console.log("Share cancelled or failed:", err));
    } 
    // 2. Try Modern Clipboard API (Requires HTTPS)
    else if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl)
            .then(() => alert("Link copied to clipboard!"))
            .catch(() => alert("Failed to copy. Try HTTPS."));
    } 
    // 3. Final Fallback (The textarea trick)
    else {
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert("Link copied to clipboard (Legacy Fallback)!");
    }
}

const shareBtn = document.getElementById('share-button');
if (shareBtn) {
    shareBtn.addEventListener('click', handleShare);
}