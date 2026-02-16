/**
 * App - Main application logic
 */
const App = (function() {
    let currentRound = null;
    let currentScreen = 'home';

    // Session times (memory only, resets on page refresh)
    let sessionTimes = { A: 0, B: 0 };
    let teamNames = { A: 'Team A', B: 'Team B' };

    // Round tracking for Play Again / Play Next Round
    let lastRoundId = null;
    let lastRoundData = null;
    let currentRoundIndex = 0; // Tournament round counter (1-based when playing)

    // Leaderboard (memory only, resets on page refresh)
    // { "Swift Pandas": { wins: 2, totalTime: 400, fastestRound: 180, roundsPlayed: 3, animal: 'Panda' }, ... }
    let leaderboard = {};

    // Track which screen the leaderboard was opened from
    let leaderboardReturnScreen = 'win';

    // Team selection state
    let teamSelection = {
        A: { adjective: '', animal: '' },
        B: { adjective: '', animal: '' }
    };

    function init() {
        // Initialize frozen rounds from external file
        RoundStorage.initFrozenRounds();

        // Always start at home screen
        showScreen('home');

        bindEvents();
        refreshRoundList();
        updateFrozenInfo();
        initTeamSetup();
    }

    // Initialize team setup dropdowns
    function initTeamSetup() {
        // Populate adjective dropdowns
        const adjOptions = TeamData.adjectives.map(adj =>
            `<option value="${adj}">${adj}</option>`
        ).join('');

        const adjA = document.getElementById('adj-a');
        const adjB = document.getElementById('adj-b');
        if (adjA) adjA.innerHTML = adjOptions;
        if (adjB) adjB.innerHTML = adjOptions;

        // Populate animal dropdowns
        const animalOptions = TeamData.animals.map(animal =>
            `<option value="${animal}">${animal}</option>`
        ).join('');

        const animalA = document.getElementById('animal-a');
        const animalB = document.getElementById('animal-b');
        if (animalA) animalA.innerHTML = animalOptions;
        if (animalB) animalB.innerHTML = animalOptions;

        // Set initial random selections (different for each team)
        randomizeTeam('A');
        randomizeTeam('B');

        // Ensure teams have different animals
        if (teamSelection.A.animal === teamSelection.B.animal) {
            randomizeTeam('B');
        }
    }

    function randomizeTeam(team) {
        const adjSelect = document.getElementById('adj-' + team.toLowerCase());
        const animalSelect = document.getElementById('animal-' + team.toLowerCase());

        const randomAdj = TeamData.randomAdjective();
        const randomAnimal = TeamData.randomAnimal();

        if (adjSelect) adjSelect.value = randomAdj;
        if (animalSelect) animalSelect.value = randomAnimal;

        teamSelection[team].adjective = randomAdj;
        teamSelection[team].animal = randomAnimal;

        updateTeamPreview(team);
    }

    function updateTeamPreview(team) {
        const adjSelect = document.getElementById('adj-' + team.toLowerCase());
        const animalSelect = document.getElementById('animal-' + team.toLowerCase());
        const nameEl = document.getElementById('name-' + team.toLowerCase());
        const iconEl = document.getElementById('icon-' + team.toLowerCase());

        if (adjSelect && animalSelect && nameEl) {
            teamSelection[team].adjective = adjSelect.value;
            teamSelection[team].animal = animalSelect.value;

            const name = TeamData.generateName(adjSelect.value, animalSelect.value);
            nameEl.textContent = name;
            teamNames[team] = name;

            // Update icon
            if (iconEl) {
                const animal = animalSelect.value;
                const iconPath = TeamData.getIconPath(animal);
                const emoji = TeamData.getEmoji(animal);

                // Try SVG first, fallback to emoji
                iconEl.innerHTML = `<img src="${iconPath}" alt="${animal}" onerror="this.parentElement.innerHTML='<span class=\\'emoji-fallback\\'>${emoji}</span>'">`;
            }
        }
    }

    function showScreen(screenName) {
        const previousScreen = currentScreen;
        currentScreen = screenName;

        // --- Cleanup when LEAVING game screen ---
        if (previousScreen === 'game' && screenName !== 'game') {
            if (typeof Game !== 'undefined' && Game.cleanup) {
                Game.cleanup();
            }
        }

        // --- Remove any lingering confetti canvas ---
        const confetti = document.getElementById('confetti-canvas');
        if (confetti) confetti.remove();

        // --- Hide all screens, show requested one ---
        document.querySelectorAll('.screen').forEach(el => {
            el.classList.remove('active');
        });
        const screen = document.getElementById('screen-' + screenName);
        if (screen) {
            screen.classList.add('active');
        }

        // Toggle body class for game screen (full-height layout)
        if (screenName === 'game') {
            document.body.classList.add('game-active');
        } else {
            document.body.classList.remove('game-active');
        }

        if (screenName === 'teacher') {
            refreshTeacherRoundList();
            updateFrozenInfo();
        }
    }

    // Bind pointerdown with preventDefault to eliminate 300ms touch delay
    function onTap(el, fn) {
        if (!el) return;
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            fn(e);
        });
    }

    function bindEvents() {
        // Home screen
        onTap(document.getElementById('btn-start-game'), startGame);

        // Team setup dropdowns (keep 'change' — these are selects, not tap targets)
        document.getElementById('adj-a')?.addEventListener('change', () => updateTeamPreview('A'));
        document.getElementById('animal-a')?.addEventListener('change', () => updateTeamPreview('A'));
        document.getElementById('adj-b')?.addEventListener('change', () => updateTeamPreview('B'));
        document.getElementById('animal-b')?.addEventListener('change', () => updateTeamPreview('B'));

        // Randomize buttons
        document.querySelectorAll('.btn-randomize').forEach(btn => {
            onTap(btn, () => {
                const team = btn.dataset.team;
                randomizeTeam(team);
            });
        });

        // Teacher mode toggle
        onTap(document.getElementById('btn-teacher-mode'), () => showScreen('teacher'));
        onTap(document.getElementById('btn-exit-teacher'), () => showScreen('home'));

        // Teacher screen
        onTap(document.getElementById('btn-new-round'), createNewRound);
        onTap(document.getElementById('btn-save-round'), saveCurrentRound);
        onTap(document.getElementById('btn-add-word-a'), () => addWordRow('a'));
        onTap(document.getElementById('btn-add-word-b'), () => addWordRow('b'));

        // Round result screen
        onTap(document.getElementById('btn-play-again'), playAgain);
        onTap(document.getElementById('btn-next-round'), playNextRound);
        onTap(document.getElementById('btn-end-tournament'), endTournament);
        onTap(document.getElementById('btn-view-leaderboard'), () => showLeaderboard('win'));
        onTap(document.getElementById('btn-choose-round'), chooseDifferentRound);

        // Tournament end screen
        onTap(document.getElementById('btn-tournament-leaderboard'), () => showLeaderboard('tournament-end'));
        onTap(document.getElementById('btn-tournament-home'), goHome);

        // Leaderboard screen
        onTap(document.getElementById('btn-back-to-results'), () => showScreen(leaderboardReturnScreen));

        // Print
        onTap(document.getElementById('btn-print-worksheets'), printWorksheets);

        // CSV Upload (keep 'change' on file input)
        document.getElementById('csv-file-input')?.addEventListener('change', handleCsvFileSelect);
        onTap(document.getElementById('btn-generate-from-csv'), generateFromCsv);

        // Frozen Rounds Export
        onTap(document.getElementById('btn-export-frozen'), exportFrozenRounds);

        // Instructions modal
        onTap(document.getElementById('btn-instructions'), () => {
            document.getElementById('modal-instructions').style.display = 'flex';
        });
        onTap(document.getElementById('btn-close-instructions'), () => {
            document.getElementById('modal-instructions').style.display = 'none';
        });
    }

    function updateFrozenInfo() {
        const allRounds = RoundStorage.getAll();
        const frozenCount = allRounds.filter(r => r.frozen).length;
        const infoEl = document.getElementById('frozen-info');
        if (infoEl) {
            if (frozenCount > 0) {
                infoEl.innerHTML = `<strong>${frozenCount} frozen round(s).</strong> These will always match printed worksheets.`;
                infoEl.classList.add('has-frozen');
            } else {
                infoEl.innerHTML = `<strong>No frozen rounds.</strong> Freeze rounds to lock worksheets for consistent classroom use.`;
            }
        }
    }

    function exportFrozenRounds() {
        const rounds = RoundStorage.getAll();

        if (rounds.length === 0) {
            alert('No rounds to export.');
            return;
        }

        // Prepare frozen rounds data (strip the frozen flag, it will be added on load)
        const frozenData = rounds.map(round => ({
            id: round.id,
            name: round.name,
            worksheetNumber: round.worksheetNumber || 1,
            teamA: {
                words: round.teamA.words,
                layout: round.teamA.layout
            },
            teamB: {
                words: round.teamB.words,
                layout: round.teamB.layout
            }
        }));

        // Create JavaScript file content
        const jsContent = `// Frozen Rounds - Generated ${new Date().toISOString()}
// Place this file in the data/ folder as frozen-rounds.js
// These rounds cannot be modified and will always match printed worksheets.
window.FROZEN_ROUNDS = ${JSON.stringify(frozenData, null, 2)};
`;

        // Download as file
        const blob = new Blob([jsContent], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'frozen-rounds.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert(`Exported ${frozenData.length} round(s).\n\nSave the downloaded file to:\n  data/frozen-rounds.js\n\nThese rounds will load automatically on any device.`);
    }

    // CSV Upload handling
    let parsedCsvWords = [];
    let generatedRounds = [];

    function cleanFilenameToTopic(filename) {
        // Remove extension
        let name = filename.replace(/\.\w+$/, '');
        // Replace underscores/hyphens with spaces
        name = name.replace(/[_-]+/g, ' ');
        // Title case each word
        name = name.replace(/\b\w/g, c => c.toUpperCase());
        // Replace common conjunctions back to & style
        name = name.replace(/\bAnd\b/g, '&');
        return name.trim();
    }

    function handleCsvFileSelect(e) {
        const file = e.target.files[0];
        if (!file) {
            document.getElementById('btn-generate-from-csv').disabled = true;
            parsedCsvWords = [];
            return;
        }

        // Auto-fill topic name from filename
        const topicInput = document.getElementById('csv-topic-name');
        if (topicInput && !topicInput.value.trim()) {
            topicInput.value = cleanFilenameToTopic(file.name);
        }

        const reader = new FileReader();
        reader.onload = function(event) {
            const text = event.target.result;
            parsedCsvWords = parseCsv(text);

            const btn = document.getElementById('btn-generate-from-csv');
            if (parsedCsvWords.length >= 4) {
                btn.disabled = false;
                document.getElementById('csv-preview').innerHTML =
                    `<p>Loaded ${parsedCsvWords.length} word/clue pairs.</p>`;
            } else {
                btn.disabled = true;
                document.getElementById('csv-preview').innerHTML =
                    `<p style="color:#c00">Need at least 4 word/clue pairs. Found ${parsedCsvWords.length}.</p>`;
            }
        };
        reader.readAsText(file);
    }

    function parseCsv(text) {
        const lines = text.split(/\r?\n/);
        const words = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Split on first comma only
            const commaIndex = trimmed.indexOf(',');
            if (commaIndex === -1) continue;

            const word = trimmed.substring(0, commaIndex).trim();
            const clue = trimmed.substring(commaIndex + 1).trim();

            if (word && clue) {
                words.push({ word, clue });
            }
        }

        return words;
    }

    function generateFromCsv() {
        const topicName = (document.getElementById('csv-topic-name').value.trim()) || 'Untitled Topic';
        const wordsPerRound = parseInt(document.getElementById('words-per-round').value) || 10;
        const numRounds = parseInt(document.getElementById('num-rounds').value) || 2;

        if (parsedCsvWords.length < wordsPerRound) {
            alert(`Not enough words. Need at least ${wordsPerRound} for one round.`);
            return;
        }

        // Score words by crossword-friendliness (common letters)
        const scoredWords = parsedCsvWords.map(w => ({
            ...w,
            score: scoreCrosswordFriendliness(w.word)
        }));

        // Sort by score (highest first)
        scoredWords.sort((a, b) => b.score - a.score);

        // Calculate starting worksheet number for this batch
        let nextWs = RoundStorage.getNextWorksheetNumber(topicName);

        // Generate rounds
        generatedRounds = [];
        let wordIndex = 0;

        for (let r = 0; r < numRounds && wordIndex < scoredWords.length; r++) {
            const roundWords = [];

            // Collect words for this round
            while (roundWords.length < wordsPerRound && wordIndex < scoredWords.length) {
                roundWords.push(scoredWords[wordIndex]);
                wordIndex++;
            }

            if (roundWords.length < 4) break; // Need at least 4 words per round

            // Split evenly between teams
            const half = Math.ceil(roundWords.length / 2);
            const teamAWords = roundWords.slice(0, half);
            const teamBWords = roundWords.slice(half);

            // Try to generate layouts
            const layoutA = CrosswordGenerator.generate(teamAWords);
            const layoutB = CrosswordGenerator.generate(teamBWords);

            generatedRounds.push({
                name: topicName,
                worksheetNumber: nextWs + r,
                teamAWords,
                teamBWords,
                layoutA,
                layoutB,
                success: layoutA !== null && layoutB !== null
            });
        }

        // Show preview
        showCsvPreview();
    }

    function scoreCrosswordFriendliness(word) {
        // Score based on common letters (ETAOINSHRDLU)
        const commonLetters = 'ETAOINSHRDLU';
        const upper = word.toUpperCase().replace(/\s+/g, '');
        let score = 0;

        for (const char of upper) {
            const idx = commonLetters.indexOf(char);
            if (idx !== -1) {
                score += (commonLetters.length - idx); // Higher score for more common letters
            }
        }

        // Bonus for medium length words (5-8 letters)
        if (upper.length >= 5 && upper.length <= 8) {
            score += 10;
        }

        return score;
    }

    function showCsvPreview() {
        const preview = document.getElementById('csv-preview');
        let html = '';

        for (const round of generatedRounds) {
            const statusClass = round.success ? 'success' : 'failure';
            const statusText = round.success ? '✓ Ready to save' : '✗ Layout failed - try different words';
            const displayName = `${round.name} — Worksheet ${round.worksheetNumber}`;

            html += `<div class="csv-round-preview ${statusClass}">`;
            html += `<h4>${escapeHtml(displayName)} - ${statusText}</h4>`;
            html += '<div class="csv-round-words">';

            html += '<div><strong>Team A:</strong><ul>';
            for (const w of round.teamAWords) {
                html += `<li>${escapeHtml(w.word)}</li>`;
            }
            html += '</ul></div>';

            html += '<div><strong>Team B:</strong><ul>';
            for (const w of round.teamBWords) {
                html += `<li>${escapeHtml(w.word)}</li>`;
            }
            html += '</ul></div>';

            html += '</div></div>';
        }

        const successCount = generatedRounds.filter(r => r.success).length;
        if (successCount > 0) {
            html += `<button id="csv-save-all">Save ${successCount} Round(s)</button>`;
        }

        preview.innerHTML = html;

        onTap(document.getElementById('csv-save-all'), saveGeneratedRounds);
    }

    function saveGeneratedRounds() {
        let saved = 0;

        for (const round of generatedRounds) {
            if (!round.success) continue;

            const newRound = {
                id: 'round-' + Date.now() + '-' + saved,
                name: round.name,
                worksheetNumber: round.worksheetNumber,
                teamA: { words: round.teamAWords, layout: round.layoutA },
                teamB: { words: round.teamBWords, layout: round.layoutB }
            };

            RoundStorage.save(newRound);
            saved++;
        }

        refreshTeacherRoundList();
        refreshRoundList();

        // Clear CSV state
        document.getElementById('csv-file-input').value = '';
        document.getElementById('csv-topic-name').value = '';
        document.getElementById('btn-generate-from-csv').disabled = true;
        document.getElementById('csv-preview').innerHTML =
            `<p style="color:#090">✓ Saved ${saved} round(s) successfully!</p>`;

        parsedCsvWords = [];
        generatedRounds = [];
    }

    function refreshRoundList() {
        const select = document.getElementById('round-select');
        if (!select) return;

        const rounds = RoundStorage.getAll();
        const frozen = rounds.filter(r => r.frozen);
        const editable = rounds.filter(r => !r.frozen);

        select.innerHTML = '<option value="">-- Select a round --</option>';

        // Frozen rounds group
        if (frozen.length > 0) {
            const frozenGroup = document.createElement('optgroup');
            frozenGroup.label = 'Frozen (Match Worksheets)';
            for (const round of frozen) {
                const opt = document.createElement('option');
                opt.value = round.id;
                const wsLabel = round.worksheetNumber ? ` — Worksheet ${round.worksheetNumber}` : '';
                opt.textContent = round.name + wsLabel;
                frozenGroup.appendChild(opt);
            }
            select.appendChild(frozenGroup);
        }

        // Editable rounds group
        if (editable.length > 0) {
            const editGroup = document.createElement('optgroup');
            editGroup.label = 'Editable (Not Frozen)';
            for (const round of editable) {
                const opt = document.createElement('option');
                opt.value = round.id;
                const wsLabel = round.worksheetNumber ? ` — Worksheet ${round.worksheetNumber}` : '';
                opt.textContent = round.name + wsLabel;
                editGroup.appendChild(opt);
            }
            select.appendChild(editGroup);
        }
    }

    function refreshTeacherRoundList() {
        const container = document.getElementById('teacher-round-list');
        if (!container) return;

        const rounds = RoundStorage.getAll();

        if (rounds.length === 0) {
            container.innerHTML = '<p>No rounds saved yet.</p>';
            return;
        }

        container.innerHTML = rounds.map(round => {
            const isFrozen = round.frozen;
            const isFileFrozen = RoundStorage.isFrozen(round.id);
            const frozenClass = isFrozen ? 'frozen' : '';
            const frozenBadge = isFrozen
                ? '<span class="frozen-badge" title="Frozen = worksheet permanently matches the game layout">FROZEN</span>'
                : '';

            let buttons = '';
            if (isFrozen) {
                buttons += `<button class="btn-print-single" data-id="${round.id}">Print</button>`;
                if (!isFileFrozen) {
                    buttons += `<button class="btn-delete" data-id="${round.id}">Delete</button>`;
                }
            } else {
                buttons += `<button class="btn-freeze" data-id="${round.id}">Freeze</button>`;
                buttons += `<button class="btn-edit" data-id="${round.id}">Edit</button>`;
                buttons += `<button class="btn-delete" data-id="${round.id}">Delete</button>`;
            }

            const wsNum = round.worksheetNumber ? ` — Worksheet ${round.worksheetNumber}` : '';

            return `
                <div class="round-item ${frozenClass}" data-id="${round.id}">
                    <span class="round-name">${escapeHtml(round.name)}${wsNum} ${frozenBadge}</span>
                    <span class="round-info">
                        Team A: ${round.teamA.words.length} words |
                        Team B: ${round.teamB.words.length} words
                    </span>
                    ${buttons}
                </div>
            `;
        }).join('');

        // Bind buttons
        container.querySelectorAll('.btn-edit').forEach(btn => {
            onTap(btn, () => editRound(btn.dataset.id));
        });
        container.querySelectorAll('.btn-delete').forEach(btn => {
            onTap(btn, () => deleteRound(btn.dataset.id));
        });
        container.querySelectorAll('.btn-print-single').forEach(btn => {
            onTap(btn, () => printSingleWorksheet(btn.dataset.id));
        });
        container.querySelectorAll('.btn-freeze').forEach(btn => {
            onTap(btn, () => freezeRound(btn.dataset.id));
        });
    }

    function createNewRound() {
        currentRound = RoundStorage.createNewRound('New Round');
        loadRoundIntoEditor(currentRound);
        document.getElementById('round-editor').style.display = 'block';
    }

    function editRound(id) {
        currentRound = RoundStorage.getById(id);
        if (currentRound) {
            loadRoundIntoEditor(currentRound);
            document.getElementById('round-editor').style.display = 'block';
        }
    }

    function deleteRound(id) {
        if (!id) {
            console.error('deleteRound called with no id');
            return;
        }

        if (confirm('Delete this round?')) {
            console.log('Attempting to delete round:', id);
            const success = RoundStorage.deleteById(id);
            if (success) {
                console.log('Round deleted successfully:', id);
                refreshTeacherRoundList();
                refreshRoundList();
            } else {
                console.error('Failed to delete round:', id);
                alert('Failed to delete round. It may be frozen or already deleted.');
            }
        }
    }

    function freezeRound(id) {
        if (!id) return;
        if (!confirm('Freezing this round locks the worksheet to match gameplay. Continue?')) return;

        const success = RoundStorage.freezeById(id);
        if (success) {
            refreshTeacherRoundList();
            refreshRoundList();
        } else {
            alert('Failed to freeze round.');
        }
    }

    function loadRoundIntoEditor(round) {
        document.getElementById('round-name').value = round.name;

        // Load Team A words
        const listA = document.getElementById('word-list-a');
        listA.innerHTML = '';
        for (const wordObj of round.teamA.words) {
            addWordRow('a', wordObj.word, wordObj.clue);
        }
        if (round.teamA.words.length === 0) {
            addWordRow('a');
        }

        // Load Team B words
        const listB = document.getElementById('word-list-b');
        listB.innerHTML = '';
        for (const wordObj of round.teamB.words) {
            addWordRow('b', wordObj.word, wordObj.clue);
        }
        if (round.teamB.words.length === 0) {
            addWordRow('b');
        }
    }

    function addWordRow(team, word = '', clue = '') {
        const list = document.getElementById('word-list-' + team);
        const row = document.createElement('div');
        row.className = 'word-row';
        row.innerHTML = `
            <input type="text" class="word-input" placeholder="Word" value="${escapeHtml(word)}">
            <input type="text" class="clue-input" placeholder="Clue" value="${escapeHtml(clue)}">
            <button class="btn-remove-word">X</button>
        `;
        onTap(row.querySelector('.btn-remove-word'), () => {
            row.remove();
        });
        list.appendChild(row);
    }

    function collectWordsFromEditor(team) {
        const list = document.getElementById('word-list-' + team);
        const rows = list.querySelectorAll('.word-row');
        const words = [];

        for (const row of rows) {
            const word = row.querySelector('.word-input').value.trim();
            const clue = row.querySelector('.clue-input').value.trim();
            if (word && clue) {
                words.push({ word, clue });
            }
        }

        return words;
    }

    function saveCurrentRound() {
        if (!currentRound) return;

        const errorDiv = document.getElementById('editor-error');
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';

        const newName = document.getElementById('round-name').value.trim() || 'Untitled Round';

        // Recalculate worksheetNumber if topic name changed
        if (newName !== currentRound.name || !currentRound.worksheetNumber) {
            currentRound.worksheetNumber = RoundStorage.getNextWorksheetNumber(newName);
        }
        currentRound.name = newName;

        // Collect words
        const wordsA = collectWordsFromEditor('a');
        const wordsB = collectWordsFromEditor('b');

        if (wordsA.length === 0 && wordsB.length === 0) {
            showEditorError('Please add at least one word for one team.');
            return;
        }

        // Generate layouts
        currentRound.teamA.words = wordsA;
        currentRound.teamB.words = wordsB;

        if (wordsA.length > 0) {
            const layoutA = CrosswordGenerator.generate(wordsA);
            if (!layoutA) {
                showEditorError('Could not generate crossword for Team A. Try different words or add more words with common letters.');
                return;
            }
            currentRound.teamA.layout = layoutA;
        } else {
            currentRound.teamA.layout = null;
        }

        if (wordsB.length > 0) {
            const layoutB = CrosswordGenerator.generate(wordsB);
            if (!layoutB) {
                showEditorError('Could not generate crossword for Team B. Try different words or add more words with common letters.');
                return;
            }
            currentRound.teamB.layout = layoutB;
        } else {
            currentRound.teamB.layout = null;
        }

        // Save to storage
        RoundStorage.save(currentRound);
        refreshTeacherRoundList();
        refreshRoundList();

        // Hide editor
        document.getElementById('round-editor').style.display = 'none';
        currentRound = null;

        alert('Round saved successfully!');
    }

    function showEditorError(message) {
        const errorDiv = document.getElementById('editor-error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    function startGame() {
        const roundId = document.getElementById('round-select').value;
        if (!roundId) {
            alert('Please select a round first.');
            return;
        }

        const round = RoundStorage.getById(roundId);
        if (!round) {
            alert('Round not found.');
            return;
        }

        // Warn if selecting a non-frozen round
        if (!round.frozen) {
            if (!confirm('This round is not frozen. Worksheets may not match the game layout.\n\nContinue anyway?')) {
                return;
            }
        }

        // If mid-tournament (leaderboard has entries), increment round counter
        if (Object.keys(leaderboard).length > 0) {
            currentRoundIndex++;
        } else {
            currentRoundIndex = 1;
        }
        launchRound(round);
    }

    function launchRound(round) {
        lastRoundId = round.id;
        lastRoundData = round;

        const teamAName = teamNames.A || 'Team A';
        const teamBName = teamNames.B || 'Team B';
        const teamAAnimal = teamSelection.A.animal || null;
        const teamBAnimal = teamSelection.B.animal || null;

        showScreen('game');
        Game.init(round, teamAName, teamBName, teamAAnimal, teamBAnimal, currentRoundIndex);
    }

    function showWinScreen(winnerName, winnerTeam, timeA, timeB, teamAName, teamBName) {
        // Update cumulative times for both teams
        sessionTimes.A += timeA;
        sessionTimes.B += timeB;

        // Store team names
        teamNames.A = teamAName;
        teamNames.B = teamBName;

        // Update leaderboard for both teams
        updateLeaderboard(teamAName, timeA, winnerTeam === 'A', 'A');
        updateLeaderboard(teamBName, timeB, winnerTeam === 'B', 'B');

        showScreen('win');

        // Winning animal icon (80px)
        const animalEl = document.getElementById('win-animal');
        if (animalEl) {
            const animal = teamSelection[winnerTeam].animal;
            if (animal) {
                const iconPath = TeamData.getIconPath(animal);
                const emoji = TeamData.getEmoji(animal);
                animalEl.innerHTML = `<img src="${iconPath}" alt="${animal}" class="win-animal-img" onerror="this.parentElement.innerHTML='<span class=\\'win-animal-emoji\\'>${emoji}</span>'">`;
            } else {
                animalEl.innerHTML = '<span class="win-animal-emoji">🏆</span>';
            }
        }

        // Title: "{Team Name} WIN!"
        const titleEl = document.getElementById('win-title');
        if (titleEl) {
            titleEl.textContent = winnerName + ' WIN!';
        }

        // Round time comparison
        const roundTimesEl = document.getElementById('win-round-times');
        if (roundTimesEl) {
            const aClass = winnerTeam === 'A' ? 'win-time-winner' : 'win-time-loser';
            const bClass = winnerTeam === 'B' ? 'win-time-winner' : 'win-time-loser';
            roundTimesEl.innerHTML = `
                <span class="${aClass}">${escapeHtml(teamAName)}: ${formatTime(timeA)}</span>
                <span class="win-time-sep">vs</span>
                <span class="${bClass}">${escapeHtml(teamBName)}: ${formatTime(timeB)}</span>
            `;
        }

        // Total time
        const totalEl = document.getElementById('win-total-time');
        if (totalEl) {
            totalEl.innerHTML = `Total &mdash; ${escapeHtml(teamNames.A)}: ${formatTime(sessionTimes.A)} | ${escapeHtml(teamNames.B)}: ${formatTime(sessionTimes.B)}`;
        }

        // Show/hide "Play Next Round" button
        const nextBtn = document.getElementById('btn-next-round');
        if (nextBtn) {
            const nextRound = getNextRound();
            nextBtn.style.display = nextRound ? '' : 'none';
        }

        startConfetti();
    }

    function getNextRound() {
        if (!lastRoundId) return null;
        const rounds = RoundStorage.getAll();
        const idx = rounds.findIndex(r => r.id === lastRoundId);
        if (idx === -1 || idx >= rounds.length - 1) return null;
        return rounds[idx + 1];
    }

    function playAgain() {
        if (!lastRoundData) return;
        launchRound(lastRoundData);
    }

    function playNextRound() {
        const nextRound = getNextRound();
        if (nextRound) {
            currentRoundIndex++;
            launchRound(nextRound);
        }
    }

    function chooseDifferentRound() {
        // Return to home screen for round selection, keeping tournament stats
        refreshRoundList();
        showScreen('home');
    }

    // --- Leaderboard ---

    function updateLeaderboard(teamName, roundTime, isWinner, teamKey) {
        if (!leaderboard[teamName]) {
            leaderboard[teamName] = { wins: 0, totalTime: 0, fastestRound: Infinity, roundsPlayed: 0, animal: null };
        }
        const entry = leaderboard[teamName];
        if (isWinner) entry.wins++;
        entry.totalTime += roundTime;
        entry.roundsPlayed++;
        if (roundTime < entry.fastestRound) entry.fastestRound = roundTime;
        if (teamKey && teamSelection[teamKey]) {
            entry.animal = teamSelection[teamKey].animal;
        }
    }

    function renderLeaderboard() {
        const el = document.getElementById('leaderboard-full');
        if (!el) return;

        // Sort: wins desc, then total time asc on tie
        const entries = Object.entries(leaderboard)
            .sort((a, b) => b[1].wins - a[1].wins || a[1].totalTime - b[1].totalTime);

        if (entries.length === 0) {
            el.innerHTML = '<p class="leaderboard-empty">No results yet.</p>';
            return;
        }

        let html = '';
        for (let i = 0; i < entries.length; i++) {
            const [name, data] = entries[i];
            const fastest = data.fastestRound === Infinity ? '--' : formatTime(data.fastestRound);
            const avg = data.roundsPlayed > 0 ? formatTime(Math.round(data.totalTime / data.roundsPlayed)) : '--';
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
            html += `<div class="leaderboard-row">
                <span class="lb-rank">${medal || (i + 1)}</span>
                <span class="lb-name">${escapeHtml(name)}</span>
                <div class="lb-detail">
                    <div class="lb-stat"><span class="lb-stat-value">${data.wins}</span><span class="lb-stat-label">Wins</span></div>
                    <div class="lb-stat"><span class="lb-stat-value">${formatTime(data.totalTime)}</span><span class="lb-stat-label">Total Time</span></div>
                    <div class="lb-stat"><span class="lb-stat-value">${fastest}</span><span class="lb-stat-label">Fastest</span></div>
                    <div class="lb-stat"><span class="lb-stat-value">${avg}</span><span class="lb-stat-label">Average</span></div>
                </div>
            </div>`;
        }
        el.innerHTML = html;
    }

    function showLeaderboard(returnTo) {
        leaderboardReturnScreen = returnTo || 'win';
        renderLeaderboard();
        showScreen('leaderboard');
    }

    function endTournament() {
        // Determine overall tournament winner: most wins, then lowest total time
        const entries = Object.entries(leaderboard)
            .sort((a, b) => b[1].wins - a[1].wins || a[1].totalTime - b[1].totalTime);

        if (entries.length === 0) {
            goHome();
            return;
        }

        const [winnerName, winnerData] = entries[0];

        showScreen('tournament-end');

        // Winning animal icon (large)
        const animalEl = document.getElementById('tournament-animal');
        if (animalEl) {
            const animal = winnerData.animal;
            if (animal) {
                const iconPath = TeamData.getIconPath(animal);
                const emoji = TeamData.getEmoji(animal);
                animalEl.innerHTML = `<img src="${iconPath}" alt="${animal}" onerror="this.parentElement.innerHTML='<span class=\\'tournament-emoji\\'>${emoji}</span>'">`;
            } else {
                animalEl.innerHTML = '<span class="tournament-emoji">🏆</span>';
            }
        }

        // Huge title
        const titleEl = document.getElementById('tournament-title');
        if (titleEl) {
            titleEl.textContent = winnerName + ' WIN!';
        }

        // Stats
        const statsEl = document.getElementById('tournament-stats');
        if (statsEl) {
            const fastest = winnerData.fastestRound === Infinity ? '--' : formatTime(winnerData.fastestRound);
            const avg = winnerData.roundsPlayed > 0 ? formatTime(Math.round(winnerData.totalTime / winnerData.roundsPlayed)) : '--';
            statsEl.innerHTML = `
                <div class="tournament-stat"><span class="tournament-stat-value">${winnerData.wins}</span><span class="tournament-stat-label">Total Wins</span></div>
                <div class="tournament-stat"><span class="tournament-stat-value">${formatTime(winnerData.totalTime)}</span><span class="tournament-stat-label">Total Time</span></div>
                <div class="tournament-stat"><span class="tournament-stat-value">${fastest}</span><span class="tournament-stat-label">Fastest Round</span></div>
                <div class="tournament-stat"><span class="tournament-stat-value">${avg}</span><span class="tournament-stat-label">Average Time</span></div>
            `;
        }

        startConfetti();
    }

    // --- Confetti ---

    function startConfetti() {
        const canvas = document.createElement('canvas');
        canvas.id = 'confetti-canvas';
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e67e22', '#1abc9c'];
        const particles = [];

        for (let i = 0; i < 70; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height * -1,
                w: Math.random() * 8 + 4,
                h: Math.random() * 6 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 3 + 2,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.2
            });
        }

        const start = Date.now();
        const duration = 3000;

        function frame() {
            const elapsed = Date.now() - start;
            if (elapsed > duration) {
                canvas.remove();
                return;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const fade = elapsed > 2000 ? 1 - (elapsed - 2000) / 1000 : 1;

            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.05;
                p.rot += p.rotSpeed;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.globalAlpha = fade;
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }

            requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    function goHome() {
        showScreen('home');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function printSingleWorksheet(roundId) {
        const round = RoundStorage.getById(roundId);
        if (!round) {
            alert('Round not found.');
            return;
        }

        const container = document.getElementById('print-container');
        const wsLabel = round.worksheetNumber ? `Worksheet ${round.worksheetNumber}` : '';

        let html = `<div class="print-round">`;
        html += `<div class="print-header">`;
        html += `<span class="print-brand">ESL Crossword Race</span>`;
        html += `<span class="print-round-label">${escapeHtml(round.name)}${wsLabel ? ' — ' + wsLabel : ''}</span>`;
        html += `</div>`;
        html += `<h2 class="print-round-title">${escapeHtml(round.name)}</h2>`;
        if (wsLabel) {
            html += `<p class="print-worksheet-label">${wsLabel}</p>`;
        }

        if (round.teamA.layout && round.teamA.layout.placements.length > 0) {
            html += renderPrintTeam('Team A', round.teamA.layout.placements);
        }
        if (round.teamB.layout && round.teamB.layout.placements.length > 0) {
            html += renderPrintTeam('Team B', round.teamB.layout.placements);
        }

        html += '</div>';
        container.innerHTML = html;
        window.print();
    }

    function printWorksheets() {
        const rounds = RoundStorage.getAll();

        if (rounds.length === 0) {
            alert('No rounds to print.');
            return;
        }

        const container = document.getElementById('print-container');
        let html = '';

        for (let i = 0; i < rounds.length; i++) {
            const round = rounds[i];
            const wsLabel = round.worksheetNumber ? `Worksheet ${round.worksheetNumber}` : '';

            html += `<div class="print-round">`;
            html += `<div class="print-header">`;
            html += `<span class="print-brand">ESL Crossword Race</span>`;
            html += `<span class="print-round-label">Round ${i + 1} of ${rounds.length}</span>`;
            html += `</div>`;
            html += `<h2 class="print-round-title">${escapeHtml(round.name)}</h2>`;
            if (wsLabel) {
                html += `<p class="print-worksheet-label">${wsLabel}</p>`;
            }

            // Team A
            if (round.teamA.layout && round.teamA.layout.placements.length > 0) {
                html += renderPrintTeam('Team A', round.teamA.layout.placements);
            }

            // Team B
            if (round.teamB.layout && round.teamB.layout.placements.length > 0) {
                html += renderPrintTeam('Team B', round.teamB.layout.placements);
            }

            html += '</div>';
        }

        container.innerHTML = html;
        window.print();
    }

    function renderPrintTeam(teamName, placements) {
        const acrossClues = placements
            .filter(p => p.direction === 'across')
            .sort((a, b) => a.number - b.number);

        const downClues = placements
            .filter(p => p.direction === 'down')
            .sort((a, b) => a.number - b.number);

        let html = `<div class="print-team">`;
        html += `<div class="print-team-header">`;
        html += `<h3 class="print-team-title">${escapeHtml(teamName)}</h3>`;
        html += `<span class="print-team-nameline">Team name: ___________________________</span>`;
        html += `</div>`;

        html += '<div class="print-columns">';

        // Across column
        html += '<div class="print-column">';
        html += '<h4>Across</h4>';
        for (const p of acrossClues) {
            html += renderPrintClue(p);
        }
        html += '</div>';

        // Down column
        html += '<div class="print-column">';
        html += '<h4>Down</h4>';
        for (const p of downClues) {
            html += renderPrintClue(p);
        }
        html += '</div>';

        html += '</div>'; // .print-columns
        html += '</div>'; // .print-team

        return html;
    }

    function renderPrintClue(placement) {
        const letterCount = placement.gridWord.length;
        const blanks = '_'.repeat(letterCount);

        return `
            <div class="print-clue">
                <span class="print-clue-number">${placement.number}.</span>
                <span class="print-clue-text">${escapeHtml(placement.clue)}</span>
                <span class="print-clue-count">(${letterCount})</span>
                <span class="print-clue-blanks">${blanks}</span>
            </div>
        `;
    }

    return {
        init,
        showScreen,
        showWinScreen,
        goHome
    };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', App.init);
