"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudyGame = getStudyGame;
const WORDS = ["Biology", "Physics", "Chemistry", "History", "Algebra", "Calculus", "Grammar", "Degree", "Campus", "Laptop", "Thesis", "Exam"];
const SENTENCES = [
    "The mitochondria is the powerhouse of the cell.",
    "E equals mc squared.",
    "I love studying for my degree.",
    "Hard work pays off in the end.",
    "Knowledge is power.",
    "Focus properly to pass the exam."
];
function getStudyGame() {
    const rand = Math.random();
    if (rand < 0.25)
        return generateMathGame();
    if (rand < 0.5)
        return generateScrambleGame();
    if (rand < 0.75)
        return generateReactionGame();
    return generateTypingGame();
}
function generateMathGame() {
    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    const ans = a + b;
    // Generate distractors
    const options = new Set();
    options.add(ans.toString());
    while (options.size < 4) {
        const offset = Math.floor(Math.random() * 10) - 5; // -5 to +5
        const val = ans + (offset === 0 ? 1 : offset);
        options.add(val.toString());
    }
    return {
        type: "button",
        question: `Solve: ${a} + ${b} = ?`,
        answer: ans.toString(),
        options: Array.from(options).sort(() => Math.random() - 0.5),
        time: 15
    };
}
function generateScrambleGame() {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
    // Generate distractors (other random words)
    const options = new Set();
    options.add(word);
    while (options.size < 4) {
        const other = WORDS[Math.floor(Math.random() * WORDS.length)];
        if (other !== word)
            options.add(other);
    }
    return {
        type: "button",
        question: `Unscramble: **${scrambled}**`,
        answer: word,
        options: Array.from(options).sort(() => Math.random() - 0.5),
        time: 15
    };
}
// Simple Color Reaction
function generateReactionGame() {
    const colors = ["Red", "Blue", "Green", "Yellow"];
    const target = colors[Math.floor(Math.random() * colors.length)];
    return {
        type: "button",
        question: `Quick! Click the **${target}** button!`,
        answer: target,
        options: colors, // Fixed order or shuffled? Shuffled is better.
        time: 10
    };
}
function generateTypingGame() {
    const sentence = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
    return {
        type: "typing",
        question: `Type the following sentence exactly:\n\n\`${sentence}\``,
        answer: sentence,
        time: 30
    };
}
//# sourceMappingURL=studyMinigames.js.map