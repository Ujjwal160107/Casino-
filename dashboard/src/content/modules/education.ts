import type { ModuleDoc } from "../types";

const education: ModuleDoc = {
  slug: "education",
  title: "Education",
  tagline: "Eight degrees, one XP bar at a time — none of it mandatory, all of it useful.",
  icon: "GraduationCap",
  forBeginners: {
    what: "Degrees unlock better jobs, and better jobs unlock better credit cards. Nothing about school is required to play Fortuna, but the ceiling on your career and your Fortuna Card both run through the degrees you've earned.",
    firstCommands: ["!education", "!enroll high school diploma", "!study"],
    tip: "!study runs on a 5-minute cooldown minigame — pop it while you're waiting on other cooldowns anyway.",
  },
  screenshot: {
    src: "/screenshots/docs-education.png",
    alt: "Education in Discord",
  },
  sections: [
    {
      heading: "How school works",
      body: [
        "!enroll <degree> signs you up for a program by name and charges tuition up front — no refunds if you change your mind. Once you're in, !study runs a short minigame that chips away at your XP bar, and it's ready again every 5 minutes.",
        "Fill the bar and !exam lets you sit the final — pass it and the degree is yours. Decide the program isn't for you and !dropout walks away clean, though the tuition you already paid doesn't come back.",
      ],
    },
    {
      heading: "Degree catalog",
      body: [
        "Eight degrees exist, and tuition climbs steeply from entry-level to the terminal ones. Nothing here is required to play Fortuna — only specific jobs and career tiers gate on holding one.",
      ],
      table: {
        title: "Degree prices",
        columns: ["Degree", "Tuition"],
        rows: [
          ["High School Diploma", "150,000"],
          ["Trade License", "300,000"],
          ["BA Fine Arts", "900,000"],
          ["BS Computer Science", "1,200,000"],
          ["LLB", "2,500,000"],
          ["MBBS", "4,000,000"],
          ["LLM", "6,000,000"],
          ["MD/PhD", "10,000,000"],
        ],
      },
    },
    {
      heading: "Paying for it",
      body: [
        "Tuition comes straight out of your wallet by default when you !enroll. If you'd rather not front the cash, the same purchase can go on a Fortuna Card instead — see Bank & Credit for how card spending works.",
        "!education also surfaces scholarship milestones on your dashboard — small breaks toward tuition that show up as you progress, not something you apply for separately.",
      ],
    },
    {
      heading: "Education stress",
      body: [
        "Studying isn't free on your head either — every session adds to your education stress, tracked the same 0–100 way as job stress. !relax brings both meters down at once, so a single session pays off twice.",
        "!degrees lists every diploma you've actually earned, separate from whatever program you're mid-enrollment in. Keep it open next to !jobs to see exactly what doors are unlocked.",
      ],
    },
  ],
  commandIds: ["education", "enroll", "study", "exam", "dropout", "degrees", "relax"],
  proTips: [
    "!study's 5-minute cooldown fits between almost anything else on your rotation — run it while a casino cooldown ticks down.",
    "Enroll on credit if your wallet's tied up elsewhere; a Fortuna Card treats tuition like any other purchase.",
    "Check !degrees before you !apply for a job — the requirement is the diploma itself, not the tuition you paid for it.",
  ],
};

export default education;
