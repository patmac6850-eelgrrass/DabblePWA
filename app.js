// Game State
const diceConfigs = [
    "MMLLBY", "VFGKPP", "HHNNRR", "DFRLLW", "RRDLGG", "XKBSZN",
    "WHHTTP", "AEIOUU", "CCMTTS", "OIINNY", "AEIOUU", "AAEEOO"
];

//const diceConfigs = [
//    "MMLLBY", "VFGKPP", "HHNNRR", "DFRLLW", "RRDLGG", "XKBSZN",
//    "WHHTTP", "CCBTJD", "CCMTTS", "OIINNY", "AEIOUU", "AAEEOO"
//];

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

    // Create Dice
    const rolledDice = diceConfigs.map((config, id) => ({
        id: id,
        letter: config[Math.floor(Math.random() * config.length)]
    }));

    // Shuffle and display in tray
    displayDice(rolledDice.sort(() => Math.random() - 0.5));
    createBoard();
    startTimer();
}

function displayDice(dice) {
    trayElement.innerHTML = '';
    dice.forEach(die => {
        const dieEl = document.createElement('div');
        dieEl.className = 'die';
        dieEl.textContent = die.letter;
        dieEl.id = `die-${die.id}`;
        dieEl.style.position = 'static'; // Start in the tray

        dieEl.onpointerdown = (e) => {
            dieEl.setPointerCapture(e.pointerId); // Keeps touch locked to the die
            draggedElement = dieEl;

            // Move die to absolute for dragging
            dieEl.style.position = 'fixed';
            dieEl.style.zIndex = 1000;

            const onPointerMove = (ev) => {
                dieEl.style.left = ev.clientX - dieEl.offsetWidth / 2 + 'px';
                dieEl.style.top = ev.clientY - dieEl.offsetHeight / 2 + 'px';
            };

            const onPointerUp = (ev) => {
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
                let tray = elemBelow ? elemBelow.closest('#dice-tray') : null;

                if (cell && !cell.hasChildNodes()) {
                    cell.appendChild(dieEl);
                    dieEl.style.position = 'static';
                    boardState[cell.dataset.index] = dieEl.textContent;
                } else {
                    trayElement.appendChild(dieEl);
                    dieEl.style.position = 'static';
                }
                refreshHighlights();
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

// 4. Timer Logic
function startTimer() {
    timerInterval = setInterval(() => {
        secondsElapsed++;
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (secondsElapsed % 60).toString().padStart(2, '0');
        timerText.textContent = `Time: ${mins}:${secs}`;
    }, 1000);
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


function refreshHighlights() {
    const allDiceElements = document.querySelectorAll('.die');
    allDiceElements.forEach(d => d.classList.remove('valid'));

    // Sets to track which cells are part of a valid horizontal/vertical word
    const validHorizontal = new Set();
    const validVertical = new Set();

    // Sets to track which cells HAVE a neighbor (to detect multi-letter sequences)
    const hasHorizontalNeighbor = new Set();
    const hasVerticalNeighbor = new Set();

    // Helper to scan lines
    const scan = (indices, isHorizontal) => {
        let text = indices.map(i => boardState[i] || ' ').join('');
        if (text.trim().length < minWordLength) return;

        // Use the current minWordLength for the regex
        const regexStr = `([A-Z]{${minWordLength},})`;
        const wordRegex = new RegExp(regexStr, 'g');
        let match;

        while ((match = wordRegex.exec(text)) !== null) {
            const word = match[0];
            const startIdx = match.index;
            const isWordValid = dictionary.has(word);

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


    // Scan all rows and columns
    for (let i = 0; i < 10; i++) {
        scan(Array.from({ length: 10 }, (_, j) => i * 10 + j), true);  // Rows
        scan(Array.from({ length: 10 }, (_, j) => j * 10 + i), false); // Cols
    }

    // APPLY COLORS: A tile is only valid if it's not part of an INVALID sequence
    boardState.forEach((letter, i) => {
        if (!letter) return;

        const hInvalid = hasHorizontalNeighbor.has(i) && !validHorizontal.has(i);
        const vInvalid = hasVerticalNeighbor.has(i) && !validVertical.has(i);

        // If it's part of a sequence in EITHER direction, 
        // it must be valid in ALL directions it participates in.
        if (!hInvalid && !vInvalid && (validHorizontal.has(i) || validVertical.has(i))) {
            const cell = boardElement.children[i];
            if (cell && cell.firstChild) cell.firstChild.classList.add('valid');
        }
    });

    checkWinCondition();
}

function checkWinCondition() {
    const diceOnBoard = boardState.filter(x => x !== null).length;
    const greenDice = document.querySelectorAll('.die.valid').length;
    const connected = isEverythingConnected(); // NEW CHECK

    if (diceOnBoard === 12 && greenDice === 12 && connected) {
        clearInterval(timerInterval);
        timerText.classList.add('win-flash');

        const modal = document.getElementById('victory-modal');
        const scoreText = document.getElementById('final-score');

        scoreText.textContent = `Final Time: ${timerText.textContent}`;
        modal.classList.remove('hidden');
    }
}

function closeModal() {
    document.getElementById('victory-modal').classList.add('hidden');
    setupGame(); // Starts a new game automatically
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

