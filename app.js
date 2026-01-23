// Game State
const diceConfigs = [
    "MMLLBY", "VFGKPP", "HHNNRR", "DFRLLW", "RRDLGG", "XKBSZN",
    "WHHTTP", "AEIOUU", "CCMTTS", "OIINNY", "AEIOUU", "AAEEOO"
];

//const diceConfigs = [
//    "MMLLBY", "VFGKPP", "HHNNRR", "DFRLLW", "RRDLGG", "XKBSZN",
//    "WHHTTP", "CCBTJD", "CCMTTS", "OIINNY", "AEIOUU", "AAEEOO"
//];



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
        
        // Drag & Drop Listeners
        cell.addEventListener('dragover', e => e.preventDefault());
        cell.addEventListener('drop', handleDrop);
        
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
        
        // Use Pointer Events for both Mouse and Touch
        dieEl.onpointerdown = (e) => {
            draggedElement = dieEl;
            dieEl.style.position = 'absolute';
            dieEl.style.zIndex = 1000;
            moveAt(e.pageX, e.pageY);

            // Clear old position in state
            const parent = dieEl.parentElement;
            if (parent.classList.contains('cell')) {
                boardState[parent.dataset.index] = null;
            }

            function moveAt(pageX, pageY) {
                dieEl.style.left = pageX - dieEl.offsetWidth / 2 + 'px';
                dieEl.style.top = pageY - dieEl.offsetHeight / 2 + 'px';
            }

            function onPointerMove(event) {
                moveAt(event.pageX, event.pageY);
            }

            // Move the die on pointermove
            document.addEventListener('pointermove', onPointerMove);

            // Drop the die on pointerup
            dieEl.onpointerup = (event) => {
                document.removeEventListener('pointermove', onPointerMove);
                dieEl.onpointerup = null;
                
                // Hide the die momentarily to see what is underneath
                dieEl.style.display = 'none';
                let elemBelow = document.elementFromPoint(event.clientX, event.clientY);
                dieEl.style.display = 'flex';

                if (!elemBelow) return;
                let cell = elemBelow.closest('.cell');
                let tray = elemBelow.closest('#dice-tray');

                if (cell && !cell.hasChildNodes()) {
                    // Drop into Cell
                    cell.appendChild(dieEl);
                    dieEl.style.position = 'static';
                    boardState[cell.dataset.index] = dieEl.textContent;
                } else {
                    // Drop back to Tray
                    trayElement.appendChild(dieEl);
                    dieEl.style.position = 'static';
                }
                refreshHighlights();
                draggedElement = null;
            };
        };

        dieEl.ondragstart = () => false; // Disable default ghost drag
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
    // 1. Reset all tiles to default color
    const allDiceElements = document.querySelectorAll('.die');
    allDiceElements.forEach(d => d.classList.remove('valid'));

    const validCells = new Set();

    // Helper to check a sequence of indices (a row or a col)
    const checkLine = (indices) => {
        let text = indices.map(i => boardState[i] || ' ').join('');
        
        // Find chunks of letters (words)
        // regex /([A-Z]{2,})/g finds sequences of 2 or more letters
        let match;
        const wordRegex = /([A-Z]{2,})/g;
        
        while ((match = wordRegex.exec(text)) !== null) {
            const word = match[0];
            const startIdx = match.index;
            
            if (dictionary.has(word)) {
                // Mark these specific indices as part of a valid word
                for (let i = 0; i < word.length; i++) {
                    validCells.add(indices[startIdx + i]);
                }
            }
        }
    };

    // 2. Scan all Rows
    for (let r = 0; r < 10; r++) {
        const rowIndices = Array.from({length: 10}, (_, i) => r * 10 + i);
        checkLine(rowIndices);
    }

    // 3. Scan all Columns
    for (let c = 0; c < 10; c++) {
        const colIndices = Array.from({length: 10}, (_, i) => i * 10 + c);
        checkLine(colIndices);
    }

    // 4. Apply the 'valid' class to the dice in those cells
    validCells.forEach(index => {
        const cell = boardElement.children[index];
        if (cell.firstChild) {
            cell.firstChild.classList.add('valid');
        }
    });

    checkWinCondition();
}

function checkWinCondition() {
    const diceOnBoard = boardState.filter(x => x !== null).length;
    const greenDice = document.querySelectorAll('.die.valid').length;

    if (diceOnBoard === 12 && greenDice === 12) {
        clearInterval(timerInterval);
        timerText.classList.add('win-flash');
        
        // Show our custom modal instead of the alert
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
