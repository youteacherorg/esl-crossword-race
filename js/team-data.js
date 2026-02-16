/**
 * Team Name Data - Adjectives and Animals for team name generation
 */
const TeamData = {
    adjectives: [
        'Flying',
        'Clever',
        'Brave',
        'Lucky',
        'Sneaky',
        'Relentless',
        'Electric',
        'Mighty',
        'Swift',
        'Fearless'
    ],

    animals: [
        'Panda',
        'Rabbit',
        'Tiger',
        'Wolf',
        'Snake',
        'Falcon',
        'Octopus',
        'Gorilla',
        'Shark',
        'Fox'
    ],

    // Emoji fallbacks for animals without SVGs
    animalEmojis: {
        'Panda': '🐼',
        'Rabbit': '🐰',
        'Tiger': '🐯',
        'Wolf': '🐺',
        'Snake': '🐍',
        'Falcon': '🦅',
        'Octopus': '🐙',
        'Gorilla': '🦍',
        'Shark': '🦈',
        'Fox': '🦊'
    },

    // Get icon path for animal (SVG if exists)
    getIconPath: function(animal) {
        return 'img/animals/' + animal.toLowerCase() + '.svg';
    },

    // Get emoji for animal
    getEmoji: function(animal) {
        return this.animalEmojis[animal] || '🐾';
    },

    // Pluralize animal name
    pluralize: function(word) {
        if (word === 'Octopus') return 'Octopuses';
        if (word === 'Wolf') return 'Wolves';
        if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es';
        if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(word)) return word.replace(/y$/i, 'ies');
        return word + 's';
    },

    // Generate full team name
    generateName: function(adjective, animal) {
        return adjective + ' ' + this.pluralize(animal);
    },

    // Get random adjective
    randomAdjective: function() {
        return this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
    },

    // Get random animal
    randomAnimal: function() {
        return this.animals[Math.floor(Math.random() * this.animals.length)];
    }
};
