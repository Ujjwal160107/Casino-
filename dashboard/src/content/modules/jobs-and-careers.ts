import type { ModuleDoc } from "../types";

const jobsAndCareers: ModuleDoc = {
  slug: "jobs-and-careers",
  title: "Jobs & Careers",
  tagline: "Get hired, work the shift, climb the tiers — pay's real, so is the stress.",
  icon: "Briefcase",
  forBeginners: {
    what: "Every job in Fortuna sits on a ladder. Browse what's open with !jobs, apply for one with !apply, then clock in with !work to actually get paid. Climb the tiers and you unlock better pay and, eventually, a shot at your first Fortuna Card.",
    firstCommands: ["!jobs", "!apply waiter", "!work"],
    tip: "Tier-0 service jobs need no degree at all — !apply Waiter is the fastest route to your first paycheck.",
  },
  screenshot: {
    src: "/screenshots/docs-jobs-and-careers.png",
    alt: "Jobs & Careers in Discord",
  },
  sections: [
    {
      heading: "Getting hired",
      body: [
        "!jobs lists every opening you're currently eligible to see, and !apply <job> puts in for one by name — get the name exact or Fortuna won't recognize it.",
        "Every posting has requirements bolted on: a minimum XP, sometimes a degree from the Education docs, and for some roles, the previous rung on the same ladder. A Junior Engineer posting wants an Intern's worth of experience behind you first; Chief of Medicine wants a resident's. Meet all of it or the application bounces.",
      ],
    },
    {
      heading: "Career tiers",
      body: [
        "Careers run on a tier system, 0 through 4, and that tier is one half of every Fortuna Card's eligibility check — the other half is your credit score. A Chief of Medicine at tier 4 opens doors a Waiter never will.",
        "!career shows exactly where you sit on your ladder and what promotion is waiting next. The sectors below cover the shape of it, though the full roster inside !jobs runs longer.",
      ],
      table: {
        title: "Sector examples",
        columns: ["Sector", "Ladder", "Tiers", "Degree needed"],
        rows: [
          ["Service", "Waiter → Sous Chef", "0", "None"],
          ["Trade", "Apprentice → Master Mechanic", "1–2", "Trade License"],
          ["Tech", "IT Intern → Lead Engineer", "1–4", "BS Computer Science"],
          ["Business", "Sales Intern → Manager", "1–3", "None"],
          ["Legal", "Paralegal → Partner", "2–4", "LLB / LLM"],
          ["Medical", "Resident → Chief of Medicine", "2–4", "MBBS + MD/PhD"],
        ],
      },
    },
    {
      heading: "Pay & tax",
      body: [
        "!work clocks a shift at whatever job you're holding, and pay scales hard with the ladder — entry-level shifts start around 30,000, and the top job in the game, Chief of Medicine, pays 450,000 a shift.",
        "Every shift is taxed 8% before it lands in your wallet, the same rate as !weekly and !monthly. And if your Fortuna Card has gone delinquent or locked, garnishment takes another 25% off the top — see Bank & Credit for the full mechanic.",
      ],
    },
    {
      heading: "Stress",
      body: [
        "Every shift you work adds to your job stress, a 0–100 meter Fortuna tracks quietly in the background. Let it climb unchecked and it starts working against you.",
        "!relax spends money to bring it back down — options range from a cheap Quick Break to an expensive Weekend Getaway. Full pricing and the stress math live in the Life & Social docs.",
      ],
    },
  ],
  commandIds: ["jobs", "apply", "work", "career", "relax", "education"],
  proTips: [
    "Check the requirements on !jobs before you !apply — a missing degree or the wrong prior job in the chain is the most common rejection.",
    "Career tier gates your Fortuna Card as hard as credit score does. Climbing the ladder isn't optional if you want GOLD or higher.",
    "Work stress compounds while you grind shifts back to back. Book a !relax session before it starts costing you focus, not after.",
  ],
};

export default jobsAndCareers;
