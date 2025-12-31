export type GameType = "button" | "typing";

export interface Minigame {
    type: GameType;
    title: string;
    description: string;
    answer: string;
    options?: string[]; // For buttons
    time: number; // Seconds
    previewTime?: number; // Time to show preview before hiding
    previewText?: string; // Text to show during preview
    data?: any; // Extra data for game state
}

// ... existing code ...

function generateMemoryGame(): Minigame {
    // Phase 1: Show 3-5 emojis
    // Phase 2: Hide and ask user to type them
    const count = Math.floor(Math.random() * 3) + 3; // 3 to 5
    const pattern: string[] = [];
    for (let i = 0; i < count; i++) {
        pattern.push(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
    }
    const sequence = pattern.join(" ");

    return {
        type: "typing",
        title: "🧠 Memory Test",
        previewText: `Memorize this pattern:\n\n# ${sequence}`,
        description: "Type the pattern exactly (separated by spaces or just symbols)!",
        answer: sequence,
        time: 20, // Time to answer
        previewTime: 5 // Time to memorize
    };
}

const WORDS = ["Deadline", "Meeting", "Project", "Salary", "Bonus", "Manager", "Client", "Report", "Spreadsheet", "Interface", "Database", "Server"];
const SENTENCES = [
    "The customer is always right.",
    "Please fix the bug before production.",
    "Did you submit your timesheet?",
    "Lets circle back to this offline.",
    "Synergy is key to our success.",
    "Deploying to production in 5 minutes."
];

const EMOJIS = ["🍎", "🍌", "🍇", "🍊", "🍓", "🍉", "🍒", "🥝"];

const TRIVIA_QUESTIONS = [
    { q: "What does HTML stand for?", a: "HyperText Markup Language", o: ["HyperText Making Language", "HighText Markup Language", "HyperTool Multi Language"] },
    { q: "Which language is known as the backbone of the web?", a: "JavaScript", o: ["Python", "Java", "C++"] },
    { q: "What is the capital of France?", a: "Paris", o: ["London", "Berlin", "Madrid"] },
    { q: "Which company owns GitHub?", a: "Microsoft", o: ["Google", "Apple", "Amazon"] },
    { q: "What is 2^10?", a: "1024", o: ["512", "2048", "1000"] },
    { q: "What is the boiling point of water?", a: "100°C", o: ["90°C", "110°C", "120°C"] }
];

export function getWorkGame(): Minigame {
    const rand = Math.random();
    if (rand < 0.15) return generateScrambleGame();
    if (rand < 0.30) return generateMemoryGame();
    if (rand < 0.45) return generateTypingGame();
    if (rand < 0.60) return generateTriviaGame();
    if (rand < 0.75) return generateReverseTypingGame();
    return generateEmojiMathGame();
}

export function getStudyGame(): Minigame {
    const rand = Math.random();
    if (rand < 0.20) return generateMathGame();
    if (rand < 0.40) return generateScrambleGame();
    if (rand < 0.60) return generateReactionGame();
    if (rand < 0.80) return generateTriviaGame();
    return generateTypingGame();
}

function generateTriviaGame(): Minigame {
    const t = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
    const options = [t.a, ...t.o].sort(() => Math.random() - 0.5);

    return {
        type: "button",
        title: "❓ Trivia Time",
        description: t.q,
        answer: t.a,
        options: options,
        time: 15
    };
}

function generateReverseTypingGame(): Minigame {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const reversed = word.split('').reverse().join('');

    return {
        type: "typing",
        title: "🔄 Reverse Typing",
        description: `Type this word **backwards**:\n\nWord: **${word}**\n(Type: \`${reversed}\`)`,
        answer: reversed,
        time: 30
    };
}

function generateEmojiMathGame(): Minigame {
    const fruitA = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    let fruitB = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    while (fruitB === fruitA) fruitB = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

    const valA = Math.floor(Math.random() * 5) + 1; // 1-5
    const valB = Math.floor(Math.random() * 5) + 1; // 1-5
    const ans = valA + valB;

    const options = new Set<string>();
    options.add(ans.toString());
    while (options.size < 4) {
        const offset = Math.floor(Math.random() * 6) - 3;
        const val = ans + (offset === 0 ? 1 : offset);
        if (val > 0) options.add(val.toString());
    }

    return {
        type: "button",
        title: "🍎 Emoji Math",
        description: `If ${fruitA} = **${valA}** and ${fruitB} = **${valB}**...\n\nWhat is ${fruitA} + ${fruitB}?`,
        answer: ans.toString(),
        options: Array.from(options).sort(() => Math.random() - 0.5),
        time: 25
    };
}

function generateMathGame(): Minigame {
    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    const ans = a + b;

    const options = new Set<string>();
    options.add(ans.toString());
    while (options.size < 4) {
        const offset = Math.floor(Math.random() * 10) - 5;
        const val = ans + (offset === 0 ? 1 : offset);
        options.add(val.toString());
    }

    return {
        type: "button",
        title: "🧮 Quick Math",
        description: `Solve: ${a} + ${b} = ?`,
        answer: ans.toString(),
        options: Array.from(options).sort(() => Math.random() - 0.5),
        time: 25
    };
}

function generateScrambleGame(): Minigame {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');

    const options = new Set<string>();
    options.add(word);
    while (options.size < 4) {
        const other = WORDS[Math.floor(Math.random() * WORDS.length)];
        if (other !== word) options.add(other);
    }

    return {
        type: "button",
        title: "🧩 Unscramble",
        description: `Unscramble this word: **${scrambled}**`,
        answer: word,
        options: Array.from(options).sort(() => Math.random() - 0.5),
        time: 20
    };
}

function generateReactionGame(): Minigame {
    const colors = ["Red", "Blue", "Green", "Yellow"];
    const target = colors[Math.floor(Math.random() * colors.length)];

    return {
        type: "button",
        title: "⚡ Reaction Test",
        description: `Quick! Click the **${target}** button!`,
        answer: target,
        options: colors.sort(() => Math.random() - 0.5),
        time: 5
    };
}

function generateTypingGame(): Minigame {
    const sentence = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];

    return {
        type: "typing",
        title: "⌨️ Typing Test",
        description: `Type the following sentence exactly:\n\n\`${sentence}\``,
        answer: sentence,
        time: 45
    };
}


