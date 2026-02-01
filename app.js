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
document.getElementById('min-three-toggle').checked = (minWordLength === 3);

// Listener for the toggle
document.getElementById('min-three-toggle').addEventListener('change', (e) => {
    minWordLength = e.target.checked ? 3 : 2;
    localStorage.setItem('minWordLength', minWordLength);
    refreshHighlights(); // Immediately update the board
});

let dictionary = new Set();
let boardState = Array(100).fill(null); // 10x10 grid
let timerInterval;
let secondsElapsed = 0;
let draggedElement = null;
let lastDiscoveredWord = "";

let validHorizontal = new Set(); // NEW
let validVertical = new Set();   // NEW




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

function updateStatsUI() {
    const played = parseInt(localStorage.getItem('dabble_played') || 0);
    const won = parseInt(localStorage.getItem('dabble_won') || 0);
    
    // Calculate percentage: (Won / Played) * 100
    // Use Math.round() to get that clean integer
    let percent = 0;
    if (played > 0) {
        percent = Math.round((won / played) * 100);
    }

    document.getElementById('games-played').textContent = played;
    document.getElementById('games-won').textContent = won;
    document.getElementById('win-percent').textContent = percent;
}


// Call this when a New Game starts
// Update your record functions to call this UI update
function recordGamePlayed() {
    let played = parseInt(localStorage.getItem('dabble_played') || 0);
    localStorage.setItem('dabble_played', played + 1);
    updateStatsUI();
}

// Update stats
function recordGameWon() {
    let won = parseInt(localStorage.getItem('dabble_won') || 0);
    localStorage.setItem('dabble_won', won + 1);
    updateStatsUI(); // This forces the % to recalculate with the new Win
}

// Run this when the page first loads
function loadStats() {
    const played = localStorage.getItem('dabble_played') || 0;
    const won = localStorage.getItem('dabble_won') || 0;
    
    document.getElementById('games-played').textContent = played;
    document.getElementById('games-won').textContent = won;
}

// 2. Load Dictionary (The Fetch API)
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
    // Clear State
    boardState = Array(100).fill(null);
    secondsElapsed = 0;
    clearInterval(timerInterval);

    // Remove the "Lock" from the previous game
    const gameBoard = document.getElementById('game-board');
    const controls = document.getElementById('controls');
    if(gameBoard) gameBoard.classList.remove('ui-disabled');
    if(controls) controls.classList.remove('ui-disabled');

    document.getElementById('victory-banner').classList.add('hidden');

    // Create Dice
    const rolledDice = diceConfigs.map((config, id) => ({
        id: id,
        letter: config[Math.floor(Math.random() * config.length)]
    }));

    displayDice(rolledDice.sort(() => Math.random() - 0.5));
    
    // LOGIC ORDER:
    recordGamePlayed(); // This increments 'Played' AND updates the UI automatically
    
    createBoard();
    startTimer();

    document.getElementById('def-close').onclick = () => {
    document.getElementById('def-modal').classList.add('hidden');
};
}


function displayDice(dice) {
    trayElement.innerHTML = '';
    dice.forEach(die => {
        const dieEl = document.createElement('div');
        dieEl.className = 'die';
        dieEl.textContent = die.letter;
        dieEl.id = `die-${die.id}`;
        dieEl.style.position = 'static'; // Start in the tray

        // --- NEW: CLICK LISTENER FOR DEFINITIONS ---
        dieEl.addEventListener('click', (e) => {
            // NEW: Check the time buffer
            const timeSinceDrop = Date.now() - (dieEl.lastDropTime || 0);
            if (timeSinceDrop < 300) {
                console.log("Suppressed auto-click after drop");
                return; 
            }

            const parentCell = dieEl.parentElement;
            if (parentCell && parentCell.classList.contains('cell')) {
                const index = parseInt(parentCell.dataset.index);
                
                // Use global sets
                if (validHorizontal.has(index) || validVertical.has(index)) {
                    const word = getFullWord(index);
                    if (word) {
                        fetchDefinition(word);
                    }
                }
            }
        });
        // --- END NEW SECTION ---
        

        dieEl.onpointerdown = (e) => {
            const startX = e.clientX;
            const startY = e.clientY;
            let hasMoved = false;
            dieEl.setPointerCapture(e.pointerId); // Keeps touch locked to the die
            draggedElement = dieEl;

            // 1. ADD THIS: This tells CSS "I am moving now!"
            dieEl.classList.add('dragging');

            // Move die to absolute for dragging
            dieEl.style.position = 'fixed';
            dieEl.style.zIndex = 1000;

            // --- THE FIX: Move it to the body so it's not "trapped" in the tray ---
             document.body.appendChild(dieEl); 
    // ---------------------------------------------------------------------

            const onPointerMove = (ev) => {
                // If moved more than 5px, it's a real drag
                if (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5) {
                    hasMoved = true;
                }
                dieEl.style.left = ev.clientX - dieEl.offsetWidth / 2 + 'px';
                dieEl.style.top = ev.clientY - dieEl.offsetHeight / 2 + 'px';
                };

            const onPointerUp = (ev) => {
                // 2. ADD THIS: This tells CSS "I have stopped moving"
                dieEl.classList.remove('dragging');// 2. ADD THIS: This tells CSS "I have stopped moving"
    
                
                // NEW: If they just tapped it (didn't move), do nothing and stay put
                if (!hasMoved && dieEl.parentElement.classList.contains('cell')) {
                    dieEl.style.position = 'static'; // Snap back into its current cell
                    document.removeEventListener('pointermove', onPointerMove);
                    document.removeEventListener('pointerup', onPointerUp);
                return; 
        }
                dieEl.releasePointerCapture(ev.pointerId);
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);

                // Clear state if it was in a cell
                if (dieEl.parentElement.classList.contains('cell')) {
                    boardState[dieEl.parentElement.dataset.index] = null;
                }

                dieEl.style.visibility = 'hidden';
                let elemBelow = document.elementFromPoint(ev.clientX, ev.clientY);
                dieEl.style.visibility = 'visible';

                let cell = elemBelow ? elemBelow.closest('.cell') : null;
                    if (cell) {
                        // --- THE FIX: Check if the cell already has a child (a die) ---
                        if (cell.children.length > 0) {
                            console.log("Cell occupied! Returning to tray.");
                            returnToTray(dieEl);
                            refreshHighlights();
                            return; // Stop here so we don't stack
                        }

                    let targetIndex = parseInt(cell.dataset.index);
                    
                    // IMPORTANT: Update the boardState BEFORE calling refresh
                    boardState[targetIndex] = dieEl.textContent; 
                    
                    const finalCell = boardElement.children[targetIndex];
                    finalCell.appendChild(dieEl);
                    dieEl.style.position = 'static';

                    // Now refresh with the index
                    refreshHighlights(targetIndex); 
                } else {
                    returnToTray(dieEl);
                    refreshHighlights(); // No index here
                }

                // --- FINAL CLEANUP: This wipes the 776px/940px "Ghost" coordinates ---
                dieEl.style.left = '';
                dieEl.style.top = '';
                dieEl.style.zIndex = '';
                // ---------------------------------------------------------------------

                dieEl.lastDropTime = Date.now();
                draggedElement = null;
            };

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);

            // Trigger first move immediately
            onPointerMove(e);
        };

        dieEl.ondragstart = () => false;
        trayElement.appendChild(dieEl);
    });
}




function findNearestEmpty(startIndex) {
    // Check neighbors in expanding rings (Up, Down, Left, Right)
    // We search the 100-cell board for the closest null in boardState
    let bestDist = Infinity;
    let bestIdx = -1;

    boardState.forEach((val, i) => {
        if (val === null) {
            // Calculate Manhattan distance (grid distance)
            const x1 = startIndex % 10;
            const y1 = Math.floor(startIndex / 10);
            const x2 = i % 10;
            const y2 = Math.floor(i / 10);
            const dist = Math.abs(x1 - x2) + Math.abs(y1 - y2);

            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
    });
    return bestIdx;
}

function returnToTray(dieEl) {
    trayElement.appendChild(dieEl);
    dieEl.style.position = 'static';
}


// 4. Timer Logic
function startTimer() {
    timerInterval = setInterval(() => {
        secondsElapsed++;
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (secondsElapsed % 60).toString().padStart(2, '0');
        timerText.textContent = `  ${mins}:${secs}`;
    }, 1000);
}

function getFullWord(index) {
    // 1. Check Horizontal first (our tie-breaker)
    if (validHorizontal.has(index)) {
        return findSequence(index, 1); // 1 is for horizontal stepping
    }
    // 2. Check Vertical
    if (validVertical.has(index)) {
        return findSequence(index, 10); // 10 is for vertical stepping
    }
    return null;
}

function findSequence(index, step) {
    let start = index;
    let end = index;

    // Scan backwards to find the start of the word
    // (Ensure we stay on the same row if stepping by 1)
    while (boardState[start - step] && (step === 10 || Math.floor((start - step) / 10) === Math.floor(start / 10))) {
        start -= step;
    }
    // Scan forwards to find the end
    while (boardState[end + step] && (step === 10 || Math.floor((end + step) / 10) === Math.floor(end / 10))) {
        end += step;
    }

    // Extract the letters
    let word = "";
    for (let i = start; i <= end; i += step) {
        word += boardState[i];
    }
    return word;
}


// Initialize
rollButton.addEventListener('click', setupGame);
loadDictionary();
createBoard();

trayElement.addEventListener('dragover', e => e.preventDefault());
trayElement.addEventListener('drop', e => {
    e.preventDefault();
    const dieId = e.dataTransfer.getData('dieId');
    const dieEl = document.getElementById(`die-${dieId}`);

    // If it was on the board, it's already cleared by the 'dragstart' logic above
    trayElement.appendChild(dieEl);
    refreshHighlights(); // Recalculate now that a letter is gone
});


function refreshHighlights(droppedIndex = null) {
    const allDiceElements = document.querySelectorAll('.die');
    allDiceElements.forEach(d => d.classList.remove('valid'));

    validHorizontal = new Set();
    validVertical = new Set();
    const hasHorizontalNeighbor = new Set();
    const hasVerticalNeighbor = new Set();

    const scan = (indices, isHorizontal) => {
        let text = indices.map(i => boardState[i] || ' ').join('');
        
        // THE FIX: Regex now looks for ANY sequence of 2 or more letters
        // This ensures "TC" is detected even if the min length is 3
        const wordRegex = /([A-Z]{2,})/g; 
        let match;

        while ((match = wordRegex.exec(text)) !== null) {
            const word = match[0];
            const startIdx = match.index;
            
            // A sequence is ONLY valid if it's in the dictionary AND meets the min length
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

        // An "invalid" flag is true if the tile is part of a sequence 
        // but that sequence isn't in the 'valid' set.
        const hInvalid = hasHorizontalNeighbor.has(i) && !validHorizontal.has(i);
        const vInvalid = hasVerticalNeighbor.has(i) && !validVertical.has(i);

        // Logic: 
        // 1. Must not be part of any invalid horizontal sequence
        // 2. Must not be part of any invalid vertical sequence
        // 3. Must belong to at least one valid sequence
        if (!hInvalid && !vInvalid && (validHorizontal.has(i) || validVertical.has(i))) {
            const cell = boardElement.children[i];
            if (cell && cell.firstChild) cell.firstChild.classList.add('valid');
        }
    });

 // --- UPDATED HUD LOGIC ---
    try {
        if (droppedIndex !== null) {
            // Give the board a millisecond to "settle" or just run the check
            const newWord = getFullWord(droppedIndex);
            
            // Only show HUD if it's a valid word and different from the last
            if (newWord && newWord !== lastDiscoveredWord) {
                showHUD(newWord);
                lastDiscoveredWord = newWord;
            }
        }
    } catch (e) {
        console.error("HUD Logic Error:", e);
    }

    // --- 2. Check Win ---
    // Moving this outside the try/catch ensures it ALWAYS runs
    checkWinCondition();

} // <--- THIS is the final bracket for refreshHighlights


function checkWinCondition() {
    const diceOnBoard = boardState.filter(x => x !== null).length;
    const greenDice = document.querySelectorAll('.die.valid').length;
    const connected = isEverythingConnected(); 
    const dbg = 0; // set to 1 to force win for testing 

    if (diceOnBoard === 12 && greenDice === 12 && connected) {
        // 1. IMMEDIATELY record the win in data
        recordGameWon(); 

        // 2. Stop the clock
        clearInterval(timerInterval);
        timerText.classList.add('win-flash');

        // 3. Handle the UI
        const banner = document.getElementById('victory-banner');
        const scoreText = document.getElementById('final-score');

        if (banner) {
            scoreText.textContent = ` ${timerText.textContent}`;
            banner.classList.remove('hidden');
        }

        const gameBoard = document.getElementById('game-board');
        const controls = document.getElementById('controls');
        
        // Ensure these elements exist before adding class to prevent crashes
        if(gameBoard) gameBoard.classList.add('ui-disabled');
        if(controls) controls.classList.add('ui-disabled');

        // Show the new game button
        const newGameBtn = document.getElementById('new-game-button');
        if(newGameBtn) newGameBtn.style.display = 'block';
    }
}

function closeModal() {
    const banner = document.getElementById('victory-banner');
    if (banner) banner.classList.add('hidden');
    setupGame(); // Starts a new game automatically
}

window.confirmReset = function() {
    const modal = document.getElementById('custom-confirm-modal');
    modal.classList.remove('hidden');

    // Handle Cancel
    document.getElementById('confirm-cancel').onclick = () => {
        modal.classList.add('hidden');
    };

    // Handle Delete
    document.getElementById('confirm-delete').onclick = () => {
        localStorage.removeItem('dabble_played');
        localStorage.removeItem('dabble_won');
        localStorage.removeItem('dabble_best');
        updateStatsUI();
        modal.classList.add('hidden');
    };
};

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

            // Check neighbors (Up, Down, Left, Right)
            const neighbors = [
                current - 10, current + 10, // Vertical
                current - 1, current + 1    // Horizontal
            ];

            neighbors.forEach(n => {
                // Ensure neighbor is on board and has a letter
                if (n >= 0 && n < 100 && activeIndices.includes(n)) {
                    // Prevent horizontal wrapping (e.g., cell 9 to 10)
                    const isSameRow = Math.floor(current / 10) === Math.floor(n / 10);
                    const isVertical = Math.abs(current - n) === 10;

                    if (isVertical || isSameRow) {
                        queue.push(n);
                    }
                }
            });
        }
    }

    // If the number of visited tiles equals our total tiles, they are all connected!
    return visited.size === activeIndices.length;
}

// Type 'showWin()' in your browser console to test this!
function showWin() {
    const banner = document.getElementById('victory-banner');
    if (banner) {
        banner.classList.remove('hidden');
    } else {
        console.log("Error: Could not find victory-banner ID");
    }
}

function showHUD(word) {
    const hud = document.getElementById('word-hud');
    const msg = document.getElementById('hud-message');
    
    if (!hud || !msg) return;

    msg.innerText = `Word Found: ${word}`;
    hud.classList.remove('hud-hidden');

    // --- THE FIX: Click toast to see definition ---
    hud.onclick = () => {
        fetchDefinition(word);
        hud.classList.add('hud-hidden'); // Hide the toast once clicked
    };

    // Reset timer to ensure it stays visible for 4 full seconds
    if (window.hudTimer) clearTimeout(window.hudTimer);
    
    window.hudTimer = setTimeout(() => {
        hud.classList.add('hud-hidden');
    }, 4000);
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
        
        if (data[0] && data[0].meanings[0]) {
            const def = data[0].meanings[0].definitions[0].definition;
            body.innerText = def;
        } else {
            body.innerText = "Definition not found in the public dictionary.";
        }
    } catch (err) {
        body.innerText = "Error fetching definition. Check your connection.";
    }
}

// Make it accessible to the console
window.showWin = showWin;

// Initialize on load
loadStats();



