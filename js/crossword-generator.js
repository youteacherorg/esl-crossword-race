/**
 * CrosswordGenerator - Auto-generates crossword layouts from word lists
 */
const CrosswordGenerator = (function() {
    const MAX_RETRIES = 50;
    const VIRTUAL_GRID_SIZE = 100;
    const GRID_CENTER = Math.floor(VIRTUAL_GRID_SIZE / 2);

    /**
     * Generate a crossword layout from a list of words
     * @param {Array} wordList - Array of {word, clue} objects
     * @returns {Object|null} - Layout object or null if generation failed
     */
    function generate(wordList) {
        if (!wordList || wordList.length === 0) {
            return { gridSize: { rows: 0, cols: 0 }, placements: [] };
        }

        // Prepare words: remove spaces for grid, keep original for display
        const words = wordList.map((item, index) => ({
            original: item.word,
            gridWord: item.word.toUpperCase().replace(/\s+/g, ''),
            clue: item.clue,
            index: index
        }));

        // Try multiple times with different orderings
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const result = tryGenerate(words, attempt);
            if (result) {
                return result;
            }
        }

        return null; // Generation failed
    }

    function tryGenerate(words, attempt) {
        // Sort strategy varies by attempt for diversity
        const sorted = [...words].sort((a, b) => {
            if (attempt % 3 === 0) {
                return b.gridWord.length - a.gridWord.length; // Longest first
            } else if (attempt % 3 === 1) {
                return a.gridWord.length - b.gridWord.length; // Shortest first
            } else {
                return 0.5 - Math.random(); // Random
            }
        });

        const grid = createEmptyGrid();
        const placements = [];

        // Place first word horizontally at center
        const firstWord = sorted[0];
        const firstPlacement = {
            word: firstWord.original,
            gridWord: firstWord.gridWord,
            clue: firstWord.clue,
            row: GRID_CENTER,
            col: GRID_CENTER - Math.floor(firstWord.gridWord.length / 2),
            direction: 'across'
        };
        placeWord(grid, firstPlacement);
        placements.push(firstPlacement);

        // Try to place remaining words
        for (let i = 1; i < sorted.length; i++) {
            const wordObj = sorted[i];
            const placement = findBestPlacement(grid, wordObj, placements);

            if (placement) {
                placeWord(grid, placement);
                placements.push(placement);
            } else {
                // Could not place this word
                return null;
            }
        }

        // Calculate bounds and normalize positions
        return normalizeLayout(placements);
    }

    function createEmptyGrid() {
        const grid = [];
        for (let r = 0; r < VIRTUAL_GRID_SIZE; r++) {
            grid[r] = [];
            for (let c = 0; c < VIRTUAL_GRID_SIZE; c++) {
                grid[r][c] = null;
            }
        }
        return grid;
    }

    function placeWord(grid, placement) {
        const { gridWord, row, col, direction } = placement;
        for (let i = 0; i < gridWord.length; i++) {
            const r = direction === 'across' ? row : row + i;
            const c = direction === 'across' ? col + i : col;
            grid[r][c] = gridWord[i];
        }
    }

    function findBestPlacement(grid, wordObj, existingPlacements) {
        const candidates = [];
        const gridWord = wordObj.gridWord;

        // Find all intersections with existing placements
        for (const existing of existingPlacements) {
            const intersections = findIntersections(gridWord, existing.gridWord);

            for (const intersection of intersections) {
                // Calculate position for new word
                const newDirection = existing.direction === 'across' ? 'down' : 'across';
                let newRow, newCol;

                if (newDirection === 'across') {
                    // New word is horizontal, existing is vertical
                    newRow = existing.row + intersection.existingIndex;
                    newCol = existing.col - intersection.newIndex;
                } else {
                    // New word is vertical, existing is horizontal
                    newRow = existing.row - intersection.newIndex;
                    newCol = existing.col + intersection.existingIndex;
                }

                const candidate = {
                    word: wordObj.original,
                    gridWord: gridWord,
                    clue: wordObj.clue,
                    row: newRow,
                    col: newCol,
                    direction: newDirection
                };

                if (isValidPlacement(grid, candidate)) {
                    candidates.push(candidate);
                }
            }
        }

        if (candidates.length === 0) {
            // Every word after the first must intersect at least one existing word.
            // If no valid intersection exists, the word cannot be placed.
            return null;
        }

        // Score candidates and pick best
        candidates.sort((a, b) => scorePlacement(b) - scorePlacement(a));
        return candidates[0];
    }

    function findIntersections(word1, word2) {
        const intersections = [];
        for (let i = 0; i < word1.length; i++) {
            for (let j = 0; j < word2.length; j++) {
                if (word1[i] === word2[j]) {
                    intersections.push({ newIndex: i, existingIndex: j });
                }
            }
        }
        return intersections;
    }

    function isValidPlacement(grid, placement) {
        const { gridWord, row, col, direction } = placement;

        // Check bounds
        if (row < 1 || col < 1) return false;
        if (direction === 'across' && col + gridWord.length >= VIRTUAL_GRID_SIZE - 1) return false;
        if (direction === 'down' && row + gridWord.length >= VIRTUAL_GRID_SIZE - 1) return false;

        // Check each cell
        for (let i = 0; i < gridWord.length; i++) {
            const r = direction === 'across' ? row : row + i;
            const c = direction === 'across' ? col + i : col;
            const letter = gridWord[i];
            const existing = grid[r][c];

            if (existing !== null && existing !== letter) {
                return false; // Conflict
            }

            // Check adjacent cells (no parallel words touching)
            if (existing === null) {
                if (direction === 'across') {
                    // Check above and below
                    if (grid[r - 1]?.[c] !== null && grid[r - 1]?.[c] !== undefined) {
                        // Only invalid if it's not part of a crossing word
                        if (!isPartOfCrossing(grid, r, c, 'across')) return false;
                    }
                    if (grid[r + 1]?.[c] !== null && grid[r + 1]?.[c] !== undefined) {
                        if (!isPartOfCrossing(grid, r, c, 'across')) return false;
                    }
                } else {
                    // Check left and right
                    if (grid[r]?.[c - 1] !== null && grid[r]?.[c - 1] !== undefined) {
                        if (!isPartOfCrossing(grid, r, c, 'down')) return false;
                    }
                    if (grid[r]?.[c + 1] !== null && grid[r]?.[c + 1] !== undefined) {
                        if (!isPartOfCrossing(grid, r, c, 'down')) return false;
                    }
                }
            }
        }

        // Check cell before start (must be empty)
        const beforeRow = direction === 'across' ? row : row - 1;
        const beforeCol = direction === 'across' ? col - 1 : col;
        if (grid[beforeRow]?.[beforeCol] !== null && grid[beforeRow]?.[beforeCol] !== undefined) {
            return false;
        }

        // Check cell after end (must be empty)
        const afterRow = direction === 'across' ? row : row + gridWord.length;
        const afterCol = direction === 'across' ? col + gridWord.length : col;
        if (grid[afterRow]?.[afterCol] !== null && grid[afterRow]?.[afterCol] !== undefined) {
            return false;
        }

        return true;
    }

    function isPartOfCrossing(grid, row, col, direction) {
        // Simplified check - if cell will be an intersection, adjacent is okay
        return grid[row]?.[col] !== null;
    }

    function scorePlacement(placement) {
        // Prefer placements closer to center
        const distFromCenter = Math.abs(placement.row - GRID_CENTER) +
                              Math.abs(placement.col - GRID_CENTER);
        return 1000 - distFromCenter;
    }

    function normalizeLayout(placements) {
        if (placements.length === 0) {
            return { gridSize: { rows: 0, cols: 0 }, placements: [] };
        }

        // Find bounds
        let minRow = Infinity, maxRow = -Infinity;
        let minCol = Infinity, maxCol = -Infinity;

        for (const p of placements) {
            minRow = Math.min(minRow, p.row);
            minCol = Math.min(minCol, p.col);

            const endRow = p.direction === 'down' ? p.row + p.gridWord.length - 1 : p.row;
            const endCol = p.direction === 'across' ? p.col + p.gridWord.length - 1 : p.col;

            maxRow = Math.max(maxRow, endRow);
            maxCol = Math.max(maxCol, endCol);
        }

        // Normalize positions to start at 0
        const normalized = placements.map(p => ({
            word: p.word,
            gridWord: p.gridWord,
            clue: p.clue,
            row: p.row - minRow,
            col: p.col - minCol,
            direction: p.direction
        }));

        // Assign numbers based on position (top-to-bottom, left-to-right)
        normalized.sort((a, b) => {
            if (a.row !== b.row) return a.row - b.row;
            return a.col - b.col;
        });

        // Assign clue numbers (cells can share numbers if both across and down start there)
        const cellNumbers = {};
        let nextNumber = 1;

        for (const p of normalized) {
            const key = `${p.row},${p.col}`;
            if (!cellNumbers[key]) {
                cellNumbers[key] = nextNumber++;
            }
            p.number = cellNumbers[key];
        }

        return {
            gridSize: {
                rows: maxRow - minRow + 1,
                cols: maxCol - minCol + 1
            },
            placements: normalized
        };
    }

    return {
        generate
    };
})();
