/**
 * RoundStorage - localStorage CRUD for crossword rounds
 * Supports both editable (localStorage) and frozen (file-based) rounds
 */
const RoundStorage = (function() {
    const STORAGE_KEY = 'crossword-rounds';

    // Cache for frozen rounds (loaded from data/frozen-rounds.js)
    let frozenRounds = [];

    function initFrozenRounds() {
        // Check if frozen rounds were loaded from the external JS file
        if (window.FROZEN_ROUNDS && Array.isArray(window.FROZEN_ROUNDS)) {
            frozenRounds = window.FROZEN_ROUNDS.map(r => ({
                ...r,
                frozen: true // Mark as frozen
            }));

            // Backfill worksheetNumber for frozen rounds that lack it
            const topicCounts = {};
            for (const r of frozenRounds) {
                if (r.worksheetNumber == null) {
                    const topic = (r.name || '').trim().toLowerCase();
                    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
                    r.worksheetNumber = topicCounts[topic];
                }
            }

            console.log(`Loaded ${frozenRounds.length} frozen round(s)`);
        }
    }

    function getEditableRounds() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error('Failed to parse rounds from localStorage:', e);
            return [];
        }
    }

    function getAll() {
        // Combine frozen rounds (first) with editable rounds
        // Filter out editable rounds that have a frozen version with the same name
        const editable = getEditableRounds();
        const frozenNames = new Set(frozenRounds.map(r => r.name.trim().toLowerCase()));
        const filtered = editable.filter(r => !frozenNames.has(r.name.trim().toLowerCase()));
        return [...frozenRounds, ...filtered];
    }

    function getFrozenRounds() {
        return frozenRounds;
    }

    function saveAll(rounds) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
    }

    function getById(id) {
        const rounds = getAll();
        return rounds.find(r => r.id === id) || null;
    }

    function isFrozen(id) {
        return frozenRounds.some(r => r.id === id);
    }

    function save(round) {
        // Cannot save frozen rounds
        if (round.frozen) {
            console.warn('Cannot modify frozen round:', round.id);
            return round;
        }

        const rounds = getEditableRounds();
        const existingIndex = rounds.findIndex(r => r.id === round.id);

        if (existingIndex >= 0) {
            rounds[existingIndex] = round;
        } else {
            rounds.push(round);
        }

        saveAll(rounds);
        return round;
    }

    function freezeById(id) {
        // Cannot freeze file-based frozen rounds (already frozen)
        if (frozenRounds.some(r => r.id === id)) return false;

        const rounds = getEditableRounds();
        const idx = rounds.findIndex(r => r.id === id);
        if (idx >= 0) {
            rounds[idx].frozen = true;
            saveAll(rounds);
            return true;
        }
        return false;
    }

    function deleteById(id) {
        // Cannot delete file-based frozen rounds
        if (frozenRounds.some(r => r.id === id)) {
            console.warn('Cannot delete file-based frozen round:', id);
            return false;
        }

        const rounds = getEditableRounds();
        const originalLength = rounds.length;
        const filtered = rounds.filter(r => r.id !== id);

        // Only save if something was actually removed
        if (filtered.length < originalLength) {
            saveAll(filtered);
            return true;
        }

        console.warn('Round not found for deletion:', id);
        return false;
    }

    function getNextWorksheetNumber(topicName) {
        const topic = (topicName || '').trim().toLowerCase();
        const all = getAll();
        let max = 0;
        for (const r of all) {
            if ((r.name || '').trim().toLowerCase() === topic && r.worksheetNumber > max) {
                max = r.worksheetNumber;
            }
        }
        return max + 1;
    }

    function createNewRound(name) {
        const wsNum = getNextWorksheetNumber(name);
        return {
            id: 'round-' + Date.now(),
            name: name || 'Untitled Round',
            worksheetNumber: wsNum,
            teamA: { words: [], layout: null },
            teamB: { words: [], layout: null }
        };
    }

    return {
        initFrozenRounds,
        getAll,
        getById,
        getFrozenRounds,
        getEditableRounds,
        isFrozen,
        freezeById,
        save,
        deleteById,
        createNewRound,
        getNextWorksheetNumber
    };
})();
