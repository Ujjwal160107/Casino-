import type { ModuleDoc } from "../types";

const education: ModuleDoc = {
  slug: "education",
  title: "Education",
  tagline: "Eight degrees, an XP bar, and a scholarship system that pays back double if you finish.",
  icon: "GraduationCap",
  forBeginners: {
    what: "Degrees unlock jobs, which unlock career tiers, which unlock credit cards — school is the bottom of that whole pyramid. You enroll, grind !study minigames every 5 minutes for XP, sit the exam, and graduate with a permanent intelligence boost. Hit the milestones and the scholarships refund double your tuition.",
    firstCommands: ["!education", "!study", "!exam"],
    tip: "Scholarships pay 1.5× your tuition at 75% progress and 2× at 100% — finish any degree and school literally paid you to attend.",
  },
  sections: [
    {
      heading: "The degree catalog",
      body: [
        "Eight degrees, each with a tuition, an XP bar to fill, a minimum intelligence to enroll, and prerequisites — everything past high school requires the diploma first, and the two terminal degrees chain off LLB and MBBS. Graduating grants a permanent intelligence boost that gates the higher degrees.",
      ],
      table: {
        title: "All 8 degrees",
        columns: ["Degree", "Tuition", "XP required", "Min INT", "INT boost", "Prerequisite", "Unlocks (jobs)"],
        rows: [
          ["High School Diploma", "150,000", "600", "0", "+1", "—", "IT Intern, Sales Intern"],
          ["Trade License", "300,000", "900", "2", "+1", "High School", "Mechanic ladder"],
          ["BA Fine Arts (Business)", "900,000", "1,400", "4", "+2", "High School", "Analyst → Sales Manager"],
          ["BS Computer Science", "1,200,000", "1,600", "5", "+2", "High School", "Developer ladder → Lead Engineer"],
          ["LLB", "2,500,000", "2,200", "6", "+3", "High School", "Paralegal → Associate Attorney"],
          ["MBBS", "4,000,000", "2,800", "6", "+3", "High School", "Medical ladder"],
          ["LLM", "6,000,000", "3,600", "8", "+5", "LLB", "Partner (tier 4)"],
          ["MD/PhD", "10,000,000", "5,000", "8", "+5", "MBBS", "Surgeon, Chief of Medicine"],
        ],
      },
      note: "Tuition can go on your Fortuna Card — !education's enroll flow offers wallet or credit. Enrollment blocks: already enrolled elsewhere, insufficient intelligence, or missing prerequisite.",
    },
    {
      heading: "Studying: the 5-minute loop",
      body: [
        "!study runs one of five minigames — math, word scramble, reaction test, trivia, typing — on a 5-minute cooldown. A win banks 50 XP base; a loss banks nothing. UNI shop items stack onto wins: the best owned study book adds ~+20 XP, multipliers like Study Laptop (1.25×) or Tutor Pass (1.6×) amplify further (multiplier total caps at 2×), and Focus Notes drops +45 on your next success. The crafted Duck Feather Quill from hunting adds +25 once.",
        "Every session also adds stress — 20 base, reduced by your discipline stat, floored at 5. Push past 90 education stress and each study risks a 25% chance of burnout that wipes 100 XP. !relax is the release valve (Meditation Retreat: −35 education stress for 150,000).",
        "One session in four triggers a study event: Flow State (+40 XP), a stolen bag (−70 XP, +30 stress), a Pop Quiz you might ace — 35 events, some degree-specific, a few of which even pay coins. They're the variance in an otherwise steady grind.",
      ],
    },
    {
      heading: "Scholarships: the refund machine",
      body: [
        "Two milestones per degree, auto-detected while you study and claimed with a button on !education: reach 75% of the XP bar for a payout of 1.5× your tuition, and 100% for another 2× tuition. Claim both and every degree in the game is net-positive before you even count the jobs it unlocks.",
        "A BS Computer Science costs 1,200,000 — its scholarships return 4,200,000. The MD/PhD's 10,000,000 sticker price hides a 35,000,000 payback. Tuition is not a cost; it's a deposit.",
      ],
    },
    {
      heading: "The exam",
      body: [
        "!exam checks one thing: is your education XP at or above the requirement? If yes, you graduate — enrollment closes, the degree and intelligence boost are permanent. If not, nothing bad happens; you're told how far you are and go back to studying. There is no exam-day RNG to fear.",
        "Unless you invite it: a Cheat Sheet (250,000) gambles the clean run — 70% chance it adds +25% of the required XP, 30% chance you're caught: −15% of your XP, +15 stress, and a 10% wallet fine.",
        "!dropout abandons the enrollment after a confirmation — tuition is not refunded, so it's almost always worth pushing to 75% for the first scholarship before quitting a degree you regret.",
      ],
    },
    {
      heading: "UNI shop cheat sheet",
      body: [
        "Every study accelerant, ranked by what it does: Coffee Thermos (80,000) skips one 5-minute cooldown; Textbook Bundle (120,000) 1.35× for 3 sessions; Calculator Pro (150,000) 1.15× + 8% fail rescue ×3; Focus Notes (160,000) +45 next win; Study Laptop (180,000) 1.25× ×5; Cheat Sheet (250,000) the exam gamble; Lab Kit (300,000) 1.15× and −12% fail ×3; Tutor Pass (400,000) 1.6× + 15% rescue ×1; Scholarship Letter (750,000) an instant roll — 45% for 50k–200k coins, 35% for 25–150 XP, 20% nothing.",
      ],
    },
    {
      heading: "Getting better at school",
      body: [
        "Study between everything. The 5-minute cooldown nests inside every other timer in Fortuna — casino cooldowns, the work hour, hunt timers. A degree is ~12–100 successful sessions depending on tier; the players who finish fast are the ones studying while waiting on something else anyway.",
        "Enroll on credit, repay with scholarships. Tuition on the Fortuna Card + the 75% milestone paying 1.5× tuition means the degree finances itself mid-way through — just clear the card before Monday's statement bites.",
        "Stack multipliers on burst days: Study Laptop + Focus Notes + a Duck Feather Quill turns a 50-XP session into 130+. With the 2× multiplier cap, don't run Tutor Pass and Textbook Bundle simultaneously — sequence them.",
        "Order matters: High School → BS Computer Science is the best early ROI (cheap, unlocks the smooth Tech ladder). LLB → LLM is the cheapest path to career tier 4. MBBS → MD/PhD costs the most and pays the most — endgame, funded by your scholarship refunds along the way.",
      ],
    },
  ],
  commandIds: ["education", "enroll", "study", "exam", "dropout", "degrees", "relax"],
  proTips: [
    "Claim scholarships the moment they unlock — 75% pays 1.5× tuition and 100% pays 2× more. Forgetting them is leaving triple tuition on the table.",
    "The exam has no RNG — it's just an XP check. The Cheat Sheet is the only way to fail dramatically; skip it unless you enjoy 30% odds of a wallet fine.",
    "Watch education stress separately from job stress: past 90, one in four study sessions torches 100 XP. Meditation Retreat covers both meters at −35.",
    "Intelligence gates enrollment (LLM and MD/PhD need 8) and only degrees raise it — the ladder is self-locking, so plan the sequence, not just the next degree.",
    "!degrees is your proof sheet — check it against a job posting's requirements before applying; the requirement is the diploma, not the enrollment.",
  ],
};

export default education;
