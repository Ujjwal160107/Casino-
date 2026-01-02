"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInterview = getInterview;
const GENERAL_QUESTIONS = [
    { q: "A coworker is struggling with a task. What do you do?", options: ["Help them out", "Ignore them", "Report them", "Laugh"], correctIndex: 0 },
    { q: "You made a mistake in production. Value $10,000 lost. Action?", options: ["Hide it", "Blame intern", "Admit & Fix", "Quit job"], correctIndex: 2 },
    { q: "Your boss asks you to work overtime without pay.", options: ["Refuse rudimentary", "Agree happily", "Negotiate / Check labor laws", "Scream"], correctIndex: 2 },
    { q: "What is your greatest weakness?", options: ["Kryptonite", "I work too hard", "Chocolate", "Bad time management"], correctIndex: 1 },
    { q: "Why do you want this job?", options: ["Money", "Passion for the field", "My parents forced me", "Boredom"], correctIndex: 1 },
    { q: "Client is angry/yelling. You...", options: ["Yell back", "Hang up", "Listen & De-escalate", "Cry"], correctIndex: 2 },
    { q: "You find a wallet in the office lobby.", options: ["Keep cash", "Bin it", "Turn it to reception", "Buy lunch"], correctIndex: 2 },
    { q: "Deadline is in 1 hour, you aren't done.", options: ["Panic", "Communicate delay", "Submit garbage", "Fake illness"], correctIndex: 1 }
];
const DEGREE_QUESTIONS = {
    "Computer Science": [
        { q: "What does HTML stand for?", options: ["High Text Make Language", "Hyper Text Markup Language", "Hyper Tool Multi Level", "Home Tool Mark Link"], correctIndex: 1 },
        { q: "Which is 0(1) complexity?", options: ["Array Access", "Bubble Sort", "Linear Search", "Recursion"], correctIndex: 0 }
    ],
    "Medicine": [
        { q: "Normal human body temperature (C)?", options: ["35.0", "39.5", "37.0", "40.0"], correctIndex: 2 },
        { q: "CPR ratio (Compressions:Breaths)?", options: ["10:1", "30:2", "50:5", "100:0"], correctIndex: 1 }
    ],
    "Business": [
        { q: "What is ROI?", options: ["Rate of Interest", "Return on Investment", "Risk of Inflation", "Royal Official Inc"], correctIndex: 1 },
        { q: "Bull market means?", options: ["Prices rising", "Prices falling", "Cows everywhere", "Stable economy"], correctIndex: 0 }
    ],
    "Law": [
        { q: "What is a Plaintiff?", options: ["The Judge", "Person being sued", "Person suing", "The Jury"], correctIndex: 2 },
        { q: "NDA stands for?", options: ["No Drama Allowed", "National Defense Act", "Non-Disclosure Agreement", "New Deal Act"], correctIndex: 2 }
    ],
    "Culinary Arts": [
        { q: "What is a Roux?", options: ["Sauce", "Fat & Flour mix", "Type of Knife", "French dessert"], correctIndex: 1 },
        { q: "Temp for safe Chicken?", options: ["100F", "165F", "130F", "200F"], correctIndex: 1 }
    ],
    "Trade": [
        { q: "Measure twice...", options: ["Cut once", "Cut twice", "Hammer once", "Drill deep"], correctIndex: 0 },
        { q: "Righty tighty...", options: ["Lefty loosey", "Lefty locky", "Lefty tighty", "Lefty lucky"], correctIndex: 0 }
    ]
};
function getInterview(sector) {
    // 4 Random General
    const shuffledGen = [...GENERAL_QUESTIONS].sort(() => 0.5 - Math.random());
    const selected = shuffledGen.slice(0, 4);
    // 1 Degree Specific (if available for sector, else another General)
    // Mapping Sector -> Key loosely
    let degreeKey = "";
    if (sector === "tech")
        degreeKey = "Computer Science";
    else if (sector === "medical")
        degreeKey = "Medicine";
    else if (sector === "business")
        degreeKey = "Business";
    else if (sector === "legal")
        degreeKey = "Law";
    else if (sector === "service")
        degreeKey = "Culinary Arts";
    else if (sector === "trade")
        degreeKey = "Trade";
    if (degreeKey && DEGREE_QUESTIONS[degreeKey]) {
        const dQs = DEGREE_QUESTIONS[degreeKey];
        const q = dQs[Math.floor(Math.random() * dQs.length)];
        selected.push(q);
    }
    else {
        selected.push(shuffledGen[4]); // Fallback 5th general
    }
    return { questions: selected };
}
//# sourceMappingURL=interviewService.js.map