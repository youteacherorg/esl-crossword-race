/**
 * Game - Crossword game logic with on-screen keyboards
 */
const Game = (function() {
    let state = null;

    // Independent timers per team
    let timerA = { startTime: null, interval: null, elapsed: 0, running: false };
    let timerB = { startTime: null, interval: null, elapsed: 0, running: false };

    // Hint system state
    let hintedCellsA = new Set(); // "row,col" strings for cells revealed by hints
    let hintedCellsB = new Set();
    let hintTimerA = null;
    let hintTimerB = null;
    const HINT_DELAY = 120; // seconds before first hint (2 minutes)
    const HINT_INTERVAL = 30; // seconds between subsequent hints

    // AbortController for event listeners — prevents stacking on repeated init()
    let evtController = null;

    function init(round, teamAName, teamBName, teamAAnimal, teamBAnimal, roundIndex) {
        state = {
            round: round,
            roundIndex: roundIndex || 1,
            teamA: createTeamState(round.teamA, teamAName || 'Team A', teamAAnimal),
            teamB: createTeamState(round.teamB, teamBName || 'Team B', teamBAnimal),
            selectedCellA: null,
            selectedCellB: null,
            currentWordA: null,  // Active placement object
            currentWordB: null,
            finishedA: false,
            finishedB: false,
            timeA: 0,
            timeB: 0
        };

        // Reset timers
        timerA = { startTime: null, interval: null, elapsed: 0, running: false };
        timerB = { startTime: null, interval: null, elapsed: 0, running: false };

        // Reset hint state
        hintedCellsA = new Set();
        hintedCellsB = new Set();
        if (hintTimerA) clearInterval(hintTimerA);
        if (hintTimerB) clearInterval(hintTimerB);
        hintTimerA = null;
        hintTimerB = null;

        render();
        bindEvents();
        startTimers();
    }

    function createTeamState(teamData, name, animal) {
        const layout = teamData.layout;
        if (!layout || layout.placements.length === 0) {
            return { name, animal, grid: [], placements: [], solvedWords: {}, totalWords: 0, gridSize: { rows: 0, cols: 0 } };
        }

        const grid = [];
        for (let r = 0; r < layout.gridSize.rows; r++) {
            grid[r] = [];
            for (let c = 0; c < layout.gridSize.cols; c++) {
                grid[r][c] = { letter: '', correctLetter: null, isCell: false, number: null };
            }
        }

        for (const p of layout.placements) {
            for (let i = 0; i < p.gridWord.length; i++) {
                const r = p.direction === 'across' ? p.row : p.row + i;
                const c = p.direction === 'across' ? p.col + i : p.col;
                grid[r][c].correctLetter = p.gridWord[i];
                grid[r][c].isCell = true;
                if (i === 0) {
                    grid[r][c].number = p.number;
                }
            }
        }

        const solvedWords = {};
        for (const p of layout.placements) {
            solvedWords[p.number + '-' + p.direction] = false;
        }

        return {
            name,
            animal,
            grid,
            placements: layout.placements,
            gridSize: layout.gridSize,
            solvedWords,
            totalWords: layout.placements.length
        };
    }

    function render() {
        const container = document.getElementById('game-container');
        const wsNum = state.round.worksheetNumber;
        const wsLabel = wsNum ? `<div class="game-header-worksheet">Worksheet ${wsNum}</div>` : '';
        const roundLabel = `<div class="game-header-round">Round ${state.roundIndex}</div>`;

        container.innerHTML = `
            <div class="game-header">
                <button id="btn-exit-game" class="btn-exit-game">← Exit</button>
                <div class="game-header-info">
                    <div class="game-header-topic">${escapeHtml(state.round.name)}</div>
                    ${wsLabel}
                    ${roundLabel}
                </div>
            </div>
            <div class="game-boards">
                ${renderTeamBoard('A', state.teamA)}
                ${renderTeamBoard('B', state.teamB)}
            </div>
        `;
    }

    function renderTeamBoard(teamId, teamState) {
        // Get animal icon HTML
        const animalIcon = teamState.animal ? getAnimalIconHtml(teamState.animal) : '';
        const sideClass = teamId === 'A' ? 'team-left' : 'team-right';

        return `
            <div class="team-board ${sideClass}" data-team="${teamId}">
                <div class="team-header">
                    <h3 class="team-name-header">${animalIcon}<span>${escapeHtml(teamState.name)}</span></h3>
                    <div class="team-timer">
                        Time: <span id="timer-${teamId}">0:00</span>
                    </div>
                    <div class="progress">
                        <span class="solved-count" data-team="${teamId}">0</span> / ${teamState.totalWords} words
                    </div>
                </div>
                <div class="board-main">
                    <div class="board-clues">
                        ${renderClues(teamState, teamId)}
                    </div>
                    <div class="board-grid" data-team="${teamId}">
                        ${renderGrid(teamState, teamId)}
                    </div>
                </div>
                <div class="board-keyboard" data-team="${teamId}">
                    ${renderKeyboard(teamId)}
                </div>
            </div>
        `;
    }

    function renderGrid(teamState, teamId) {
        if (!teamState.grid || teamState.grid.length === 0) {
            return '<p>No grid available</p>';
        }

        let html = '<table class="crossword-grid">';
        for (let r = 0; r < teamState.gridSize.rows; r++) {
            html += '<tr>';
            for (let c = 0; c < teamState.gridSize.cols; c++) {
                const cell = teamState.grid[r][c];
                if (cell.isCell) {
                    const numberHtml = cell.number ? `<span class="cell-number">${cell.number}</span>` : '';
                    const letterClass = cell.letter ? (cell.letter === cell.correctLetter ? 'correct' : 'filled') : '';
                    html += `<td class="cell active-cell ${letterClass}" data-team="${teamId}" data-row="${r}" data-col="${c}">
                        ${numberHtml}
                        <span class="cell-letter">${cell.letter}</span>
                    </td>`;
                } else {
                    html += '<td class="cell blank-cell"></td>';
                }
            }
            html += '</tr>';
        }
        html += '</table>';
        return html;
    }

    function renderClues(teamState, teamId) {
        const acrossClues = teamState.placements
            .filter(p => p.direction === 'across')
            .sort((a, b) => a.number - b.number);

        const downClues = teamState.placements
            .filter(p => p.direction === 'down')
            .sort((a, b) => a.number - b.number);

        let html = '<div class="clues-list">';

        html += '<div class="clue-section"><h4>Across</h4>';
        for (const p of acrossClues) {
            const solvedClass = teamState.solvedWords[p.number + '-across'] ? 'solved' : '';
            html += `<div class="clue ${solvedClass}" data-team="${teamId}" data-number="${p.number}" data-direction="across">
                <strong>${p.number}.</strong> ${escapeHtml(p.clue)} (${p.gridWord.length})
            </div>`;
        }
        html += '</div>';

        html += '<div class="clue-section"><h4>Down</h4>';
        for (const p of downClues) {
            const solvedClass = teamState.solvedWords[p.number + '-down'] ? 'solved' : '';
            html += `<div class="clue ${solvedClass}" data-team="${teamId}" data-number="${p.number}" data-direction="down">
                <strong>${p.number}.</strong> ${escapeHtml(p.clue)} (${p.gridWord.length})
            </div>`;
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    function renderKeyboard(teamId) {
        const rows = [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK', 'CLR']
        ];

        let html = '<div class="onscreen-keyboard">';
        for (const row of rows) {
            html += '<div class="keyboard-row">';
            for (const key of row) {
                const keyClass = key === 'BACK' || key === 'CLR' ? 'key-special' : 'key-letter';
                const label = key === 'BACK' ? '←' : key === 'CLR' ? '✕' : key;
                html += `<button class="key ${keyClass}" data-team="${teamId}" data-key="${key}">${label}</button>`;
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function bindEvents() {
        // Abort previous listeners to prevent stacking on repeated init()
        if (evtController) evtController.abort();
        evtController = new AbortController();
        const sig = { signal: evtController.signal };

        const container = document.getElementById('game-container');

        // Exit Game button
        document.getElementById('btn-exit-game')?.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (confirm('Exit game? All progress will be lost.')) {
                cleanup();
                if (typeof App !== 'undefined' && App.goHome) {
                    App.goHome();
                }
            }
        }, sig);

        // Delegated handler for all game interactions
        container.addEventListener('pointerdown', (e) => {
            // Keyboard keys
            const key = e.target.closest('.key');
            if (key) {
                e.preventDefault();
                e.stopPropagation();
                const team = key.dataset.team;
                if (!isTeamFinished(team)) {
                    handleKeyPress(team, key.dataset.key);
                }
                return;
            }

            // Grid cells
            const cell = e.target.closest('.active-cell');
            if (cell) {
                e.preventDefault();
                const team = cell.dataset.team;
                if (!isTeamFinished(team)) {
                    const row = parseInt(cell.dataset.row);
                    const col = parseInt(cell.dataset.col);
                    selectCell(team, row, col);
                }
                return;
            }

            // Clues
            const clue = e.target.closest('.clue');
            if (clue) {
                e.preventDefault();
                const team = clue.dataset.team;
                if (!isTeamFinished(team)) {
                    const number = parseInt(clue.dataset.number);
                    const direction = clue.dataset.direction;
                    selectWordByClue(team, number, direction);
                }
                return;
            }
        }, sig);
    }

    function isTeamFinished(team) {
        return team === 'A' ? state.finishedA : state.finishedB;
    }

    function getSelectedCell(team) {
        return team === 'A' ? state.selectedCellA : state.selectedCellB;
    }

    function setSelectedCell(team, cell) {
        if (team === 'A') {
            state.selectedCellA = cell;
        } else {
            state.selectedCellB = cell;
        }
    }

    function getCurrentWord(team) {
        return team === 'A' ? state.currentWordA : state.currentWordB;
    }

    function setCurrentWord(team, word) {
        if (team === 'A') {
            state.currentWordA = word;
        } else {
            state.currentWordB = word;
        }
    }

    function findWordContainingCell(teamState, row, col, preferredDirection) {
        // Find words that contain this cell
        const matches = [];
        for (const p of teamState.placements) {
            for (let i = 0; i < p.gridWord.length; i++) {
                const r = p.direction === 'across' ? p.row : p.row + i;
                const c = p.direction === 'across' ? p.col + i : p.col;
                if (r === row && c === col) {
                    matches.push(p);
                    break;
                }
            }
        }

        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];

        // Prefer the direction that matches current word, or 'across' by default
        const preferred = matches.find(m => m.direction === preferredDirection);
        return preferred || matches[0];
    }

    function selectCell(team, row, col, keepWord) {
        // Clear previous selection for this team only
        document.querySelectorAll(`.active-cell[data-team="${team}"].selected`).forEach(el => {
            el.classList.remove('selected');
        });

        setSelectedCell(team, { row, col });

        // Update current word if not keeping it
        if (!keepWord) {
            const teamState = team === 'A' ? state.teamA : state.teamB;
            const currentWord = getCurrentWord(team);
            const preferredDir = currentWord ? currentWord.direction : 'across';
            const word = findWordContainingCell(teamState, row, col, preferredDir);
            setCurrentWord(team, word);
        }

        const cell = document.querySelector(`.active-cell[data-team="${team}"][data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.add('selected');
        }
    }

    function selectWordByClue(team, number, direction) {
        const teamState = team === 'A' ? state.teamA : state.teamB;
        const placement = teamState.placements.find(p => p.number === number && p.direction === direction);

        if (placement) {
            setCurrentWord(team, placement);
            selectCell(team, placement.row, placement.col, true);
        }
    }

    function handleKeyPress(team, key) {
        const selected = getSelectedCell(team);
        if (!selected) return;

        const teamState = team === 'A' ? state.teamA : state.teamB;
        const currentWord = getCurrentWord(team);
        const { row, col } = selected;

        if (key === 'BACK') {
            // Clear current cell and move backward within word
            enterLetter(teamState, team, row, col, '');
            moveToPrevCell(team, teamState, currentWord);
        } else if (key === 'CLR') {
            // Clear entire current word and reset to first cell
            clearCurrentWord(team, teamState, currentWord);
        } else {
            // Enter letter and advance within word
            enterLetter(teamState, team, row, col, key);
            moveToNextCell(team, teamState, currentWord);
        }
    }

    function clearCurrentWord(team, teamState, word) {
        if (!word) return;

        const hintedCells = team === 'A' ? hintedCellsA : hintedCellsB;

        // Clear all cells in the word (except hinted cells)
        for (let i = 0; i < word.gridWord.length; i++) {
            const r = word.direction === 'across' ? word.row : word.row + i;
            const c = word.direction === 'across' ? word.col + i : word.col;
            // Skip hinted cells - they are locked
            if (!hintedCells.has(r + ',' + c)) {
                enterLetter(teamState, team, r, c, '');
            }
        }

        // Select first cell of word
        selectCell(team, word.row, word.col, true);
    }

    function enterLetter(teamState, team, row, col, letter) {
        const hintedCells = team === 'A' ? hintedCellsA : hintedCellsB;

        // Prevent clearing hinted cells (but allow overwriting with same or new letter)
        if (!letter && hintedCells.has(row + ',' + col)) {
            return; // Cannot erase a hinted cell
        }

        const cell = teamState.grid[row][col];
        cell.letter = letter;

        const cellEl = document.querySelector(`.active-cell[data-team="${team}"][data-row="${row}"][data-col="${col}"]`);
        if (cellEl) {
            const letterSpan = cellEl.querySelector('.cell-letter');
            letterSpan.textContent = letter;

            cellEl.classList.remove('correct', 'filled');
            if (letter) {
                if (letter === cell.correctLetter) {
                    cellEl.classList.add('correct');
                } else {
                    cellEl.classList.add('filled');
                }
            }
        }

        checkSolvedWords(teamState, team);
    }

    function checkSolvedWords(teamState, team) {
        let solvedCount = 0;

        for (const p of teamState.placements) {
            const key = p.number + '-' + p.direction;
            let isSolved = true;

            for (let i = 0; i < p.gridWord.length; i++) {
                const r = p.direction === 'across' ? p.row : p.row + i;
                const c = p.direction === 'across' ? p.col + i : p.col;
                const cell = teamState.grid[r][c];

                if (cell.letter !== cell.correctLetter) {
                    isSolved = false;
                    break;
                }
            }

            teamState.solvedWords[key] = isSolved;
            if (isSolved) solvedCount++;

            const clueEl = document.querySelector(`.clue[data-team="${team}"][data-number="${p.number}"][data-direction="${p.direction}"]`);
            if (clueEl) {
                clueEl.classList.toggle('solved', isSolved);
            }
        }

        const countEl = document.querySelector(`.solved-count[data-team="${team}"]`);
        if (countEl) {
            countEl.textContent = solvedCount;
        }

        // Check if this team finished
        if (solvedCount === teamState.totalWords && teamState.totalWords > 0) {
            teamFinished(team);
        }
    }

    function moveToNextCell(team, teamState, word) {
        if (!word) return;

        const selected = getSelectedCell(team);
        if (!selected) return;

        const { row, col } = selected;

        // Find current position within word
        const idx = getCellIndexInWord(row, col, word);
        if (idx < 0 || idx >= word.gridWord.length - 1) return; // At end of word

        // Move to next cell in word
        const nextIdx = idx + 1;
        const newRow = word.direction === 'across' ? word.row : word.row + nextIdx;
        const newCol = word.direction === 'across' ? word.col + nextIdx : word.col;

        selectCell(team, newRow, newCol, true);
    }

    function moveToPrevCell(team, teamState, word) {
        if (!word) return;

        const selected = getSelectedCell(team);
        if (!selected) return;

        const { row, col } = selected;

        // Find current position within word
        const idx = getCellIndexInWord(row, col, word);
        if (idx <= 0) return; // At start of word

        // Move to previous cell in word
        const prevIdx = idx - 1;
        const newRow = word.direction === 'across' ? word.row : word.row + prevIdx;
        const newCol = word.direction === 'across' ? word.col + prevIdx : word.col;

        selectCell(team, newRow, newCol, true);
    }

    function getCellIndexInWord(row, col, word) {
        for (let i = 0; i < word.gridWord.length; i++) {
            const r = word.direction === 'across' ? word.row : word.row + i;
            const c = word.direction === 'across' ? word.col + i : word.col;
            if (r === row && c === col) return i;
        }
        return -1;
    }

    // Timer functions
    function startTimers() {
        const now = Date.now();

        timerA.startTime = now;
        timerA.running = true;
        timerA.interval = setInterval(() => updateTimer('A'), 1000);

        timerB.startTime = now;
        timerB.running = true;
        timerB.interval = setInterval(() => updateTimer('B'), 1000);

        updateTimer('A');
        updateTimer('B');

        // Schedule hint timers - first hint after HINT_DELAY, then every HINT_INTERVAL
        setTimeout(() => {
            if (!state.finishedA) {
                revealHint('A');
                hintTimerA = setInterval(() => {
                    if (!state.finishedA) {
                        revealHint('A');
                    } else {
                        clearInterval(hintTimerA);
                        hintTimerA = null;
                    }
                }, HINT_INTERVAL * 1000);
            }
        }, HINT_DELAY * 1000);

        setTimeout(() => {
            if (!state.finishedB) {
                revealHint('B');
                hintTimerB = setInterval(() => {
                    if (!state.finishedB) {
                        revealHint('B');
                    } else {
                        clearInterval(hintTimerB);
                        hintTimerB = null;
                    }
                }, HINT_INTERVAL * 1000);
            }
        }, HINT_DELAY * 1000);
    }

    function updateTimer(team) {
        const timer = team === 'A' ? timerA : timerB;
        if (!timer.running) return;

        timer.elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
        const display = document.getElementById('timer-' + team);
        if (display) {
            display.textContent = formatTime(timer.elapsed);
        }
    }

    function stopTimer(team) {
        const timer = team === 'A' ? timerA : timerB;
        if (timer.interval) {
            clearInterval(timer.interval);
            timer.interval = null;
        }
        timer.running = false;
        return timer.elapsed;
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    // Hint system
    function revealHint(team) {
        const teamState = team === 'A' ? state.teamA : state.teamB;
        const hintedCells = team === 'A' ? hintedCellsA : hintedCellsB;

        // Find unsolved words
        const unsolvedWords = teamState.placements.filter(p => {
            const key = p.number + '-' + p.direction;
            return !teamState.solvedWords[key];
        });

        if (unsolvedWords.length === 0) return;

        // Count hints per word to distribute evenly
        const wordHintCounts = unsolvedWords.map(word => {
            let hintCount = 0;
            for (let i = 0; i < word.gridWord.length; i++) {
                const r = word.direction === 'across' ? word.row : word.row + i;
                const c = word.direction === 'across' ? word.col + i : word.col;
                if (hintedCells.has(r + ',' + c)) {
                    hintCount++;
                }
            }
            return { word, hintCount };
        });

        // Sort by hint count (fewest first), then shuffle those with same count
        wordHintCounts.sort((a, b) => a.hintCount - b.hintCount);
        const minHints = wordHintCounts[0].hintCount;
        const candidateWords = wordHintCounts.filter(w => w.hintCount === minHints);

        // Pick random word from candidates with fewest hints
        const selectedEntry = candidateWords[Math.floor(Math.random() * candidateWords.length)];
        const selectedWord = selectedEntry.word;

        // Find unrevealed letters in this word (not correct and not already hinted)
        const unrevealedPositions = [];
        for (let i = 0; i < selectedWord.gridWord.length; i++) {
            const r = selectedWord.direction === 'across' ? selectedWord.row : selectedWord.row + i;
            const c = selectedWord.direction === 'across' ? selectedWord.col + i : selectedWord.col;
            const cell = teamState.grid[r][c];

            // Skip if already correct or already hinted
            if (cell.letter === cell.correctLetter) continue;

            unrevealedPositions.push({ row: r, col: c, letter: cell.correctLetter });
        }

        if (unrevealedPositions.length === 0) return;

        // Pick random unrevealed letter
        const hint = unrevealedPositions[Math.floor(Math.random() * unrevealedPositions.length)];

        // Reveal the letter
        const cell = teamState.grid[hint.row][hint.col];
        cell.letter = hint.letter;

        // Mark as hinted (locked)
        hintedCells.add(hint.row + ',' + hint.col);

        // Update DOM
        const cellEl = document.querySelector(`.active-cell[data-team="${team}"][data-row="${hint.row}"][data-col="${hint.col}"]`);
        if (cellEl) {
            const letterSpan = cellEl.querySelector('.cell-letter');
            letterSpan.textContent = hint.letter;
            cellEl.classList.remove('filled');
            cellEl.classList.add('correct', 'hinted');
        }

        // Check if word is now solved
        checkSolvedWords(teamState, team);
    }

    function teamFinished(team) {
        const elapsed = stopTimer(team);

        // Stop hint timer for this team
        if (team === 'A') {
            state.finishedA = true;
            state.timeA = elapsed;
            if (hintTimerA) {
                clearInterval(hintTimerA);
                hintTimerA = null;
            }
        } else {
            state.finishedB = true;
            state.timeB = elapsed;
            if (hintTimerB) {
                clearInterval(hintTimerB);
                hintTimerB = null;
            }
        }

        // Lock grid visually
        const board = document.querySelector(`.team-board[data-team="${team}"]`);
        if (board) {
            board.classList.add('finished');
        }

        // Disable keyboard visually
        const keyboard = document.querySelector(`.board-keyboard[data-team="${team}"]`);
        if (keyboard) {
            keyboard.classList.add('disabled');
        }

        // Check if both teams finished
        if (state.finishedA && state.finishedB) {
            triggerGameEnd();
        }
    }

    function triggerGameEnd() {
        // Determine winner (faster time wins)
        let winnerName, winnerTeam;

        if (state.timeA <= state.timeB) {
            winnerName = state.teamA.name;
            winnerTeam = 'A';
        } else {
            winnerName = state.teamB.name;
            winnerTeam = 'B';
        }

        if (typeof App !== 'undefined' && App.showWinScreen) {
            App.showWinScreen(winnerName, winnerTeam, state.timeA, state.timeB, state.teamA.name, state.teamB.name);
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getAnimalIconHtml(animal) {
        if (!animal || typeof TeamData === 'undefined') return '';

        const iconPath = TeamData.getIconPath(animal);
        const emoji = TeamData.getEmoji(animal);

        return `<span class="game-team-icon"><img src="${iconPath}" alt="${animal}" onerror="this.parentElement.innerHTML='<span class=\\'emoji-fallback\\'>${emoji}</span>'"></span>`;
    }

    function cleanup() {
        if (!state && !evtController) return; // Already cleaned up

        // Stop all timers
        stopTimer('A');
        stopTimer('B');
        if (hintTimerA) { clearInterval(hintTimerA); hintTimerA = null; }
        if (hintTimerB) { clearInterval(hintTimerB); hintTimerB = null; }

        // Remove all event listeners
        if (evtController) { evtController.abort(); evtController = null; }

        // Clear game DOM
        const container = document.getElementById('game-container');
        if (container) container.innerHTML = '';

        state = null;
    }

    function getState() {
        return state;
    }

    return {
        init,
        cleanup,
        getState
    };
})();
