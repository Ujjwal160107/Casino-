import type { ModuleDoc } from "../types";

const jobsAndCareers: ModuleDoc = {
  slug: "jobs-and-careers",
  title: "Jobs & Careers",
  tagline: "Twenty-one jobs, seven ladders — pass the interview, survive the shift, keep the streak.",
  icon: "Briefcase",
  forBeginners: {
    what: "Work is a loop: pass a 5-question interview to get hired, buy your sector's gear, then clock shifts every hour — each one a quick minigame or a workplace-event choice. Pay scales from a Waiter's 32,000 to the Chief of Medicine's 450,000 per shift, and your career tier is half of every credit card application.",
    firstCommands: ["!jobs", "!apply waiter", "!work"],
    tip: "Waiter, Freelance Writer, Delivery Driver, and Streamer need no degree and no gear beyond the cheapest — !apply waiter is a paycheck within five minutes of starting the game.",
  },
  sections: [
    {
      heading: "Getting hired: the interview",
      body: [
        "!apply <job> starts a real interview: five workplace scenarios, 35 seconds each, four answers per question with hidden success odds and point values. Score 60 out of 100 and you're hired. Fail and nothing is lost — there's no cooldown on re-applying, so walk straight back in.",
        "A Lucky Tie (400,000) adds +10% to every answer's success chance for 24 hours. And one structural rule: once employed, you can only apply upward within your own promotion chain — switching sectors means resigning first.",
      ],
    },
    {
      heading: "The full roster",
      body: [
        "Every job, its pay per shift, and what the posting demands. Lifetime Shifts is your permanent count of successful shifts worked — it never resets, survives resignations and job changes, and gates the higher rungs; degrees come from the Education module; ladder jobs also require the previous rung.",
      ],
      table: {
        title: "All 21 jobs",
        columns: ["Job", "Sector", "Tier", "Pay/shift", "Lifetime Shifts", "Degree", "Previous job"],
        rows: [
          ["Waiter", "Service", "0", "32,000", "—", "—", "—"],
          ["Sous Chef", "Service", "0", "45,000", "20", "—", "Waiter"],
          ["Delivery Driver", "Freelance", "0", "30,000", "—", "—", "—"],
          ["Freelance Writer", "Freelance", "0", "35,000", "—", "—", "—"],
          ["Streamer", "Freelance", "0", "35,000", "—", "—", "—"],
          ["Sales Intern", "Business", "1", "35,000", "—", "High School Diploma", "—"],
          ["IT Intern", "Tech", "1", "45,000", "—", "High School Diploma", "—"],
          ["Apprentice Mechanic", "Trade", "1", "50,000", "—", "Trade License", "—"],
          ["Master Mechanic", "Trade", "2", "90,000", "30", "Trade License", "Apprentice Mechanic"],
          ["Financial Analyst", "Business", "2", "120,000", "10", "BA Fine Arts", "—"],
          ["Junior Developer", "Tech", "2", "130,000", "10", "BS Computer Science", "—"],
          ["Paralegal", "Legal", "2", "140,000", "5", "LLB", "—"],
          ["Medical Resident", "Medical", "2", "150,000", "—", "MBBS", "—"],
          ["Sales Manager", "Business", "3", "180,000", "30", "BA Fine Arts", "Financial Analyst"],
          ["Senior Developer", "Tech", "3", "210,000", "30", "BS Computer Science", "Junior Developer"],
          ["General Practitioner", "Medical", "3", "220,000", "10", "MBBS", "Medical Resident"],
          ["Associate Attorney", "Legal", "3", "260,000", "30", "LLB", "Paralegal"],
          ["Surgeon", "Medical", "3", "320,000", "30", "MBBS + MD/PhD", "General Practitioner"],
          ["Lead Engineer", "Tech", "4", "280,000", "60", "BS Computer Science", "Senior Developer"],
          ["Partner", "Legal", "4", "400,000", "100", "LLM", "Associate Attorney"],
          ["Chief of Medicine", "Medical", "4", "450,000", "100", "MBBS + MD/PhD", "Surgeon"],
        ],
      },
      note: "Chief of Medicine has a hidden perk: it's the one job immune to burnout. Every other job risks losing shifts at high stress.",
    },
    {
      heading: "Gear: no tools, no shift",
      body: [
        "Every sector requires its equipment from !shop job before you can work: Service Uniform 250,000, Freelance Starter Pack 350,000, Business Briefcase 600,000, Legal Case File 700,000, Work Laptop 800,000 (tech), Mechanic Toolkit 950,000, Medical Kit 1,200,000.",
        "Gear wears 5–12 durability per successful shift (more on event failures and overtime); at zero it breaks and blocks work until a Repair Coupon (300,000) restores it. Premium Tools Oil halves wear for 5 shifts, and a Warranty Card blocks the next break outright.",
      ],
    },
    {
      heading: "The shift: minigame or event",
      body: [
        "!work → Start Shift, once per hour. About 70% of shifts are a quick minigame — word scrambles, memory, typing, trivia, emoji math. Win: full pay, +1 lifetime shift, +5 stress. Lose (or time out): no pay, no shift credit, +10 stress, and the cooldown is spent either way.",
        "The other 30% are workplace events: a scenario with choices, each carrying hidden odds, a pay multiplier from 0.3× to 3×, and stress. A successful event counts as a shift (+1 lifetime); a failed one doesn't. Some choices are marked critical — failing those hurts, unless an Emergency Pager (600,000) softens the blow. An Overtime Contract raises the event chance to 60% and clears your cooldown to boot.",
        "One more gate: above 80 job stress, every shift has a 50% chance of being lost to burnout — cooldown spent, +5 stress, zero pay. Stress management isn't optional at the top of the ladder.",
      ],
    },
    {
      heading: "What a shift actually pays",
      body: [
        "Base pay is only the start. In order, the pipeline multiplies: daily streak +5% per consecutive day (cap +50%, resets after 48h idle) → Counterfeit Kit ×1.25 → Crown of Greed ×1.25 → sector reputation up to ×1.10 → Lucky Tie +10% → Corporate Blessing's 40% shot at 2–3×. Then the 8% income tax comes off (unless a Tax Shield is running), and a delinquent credit card garnishes 25% of what's left.",
        "Sector reputation is the slow multiplier: +5 per successful shift, +8 per successful event. Tiers: Reliable at 100 rep (+2% pay), Trusted 250 (+4%), Specialist 500 (+6%), Elite 900 (+8%), Legendary 1500 (+10%) — with growing stress and gear-wear discounts along the way.",
      ],
      note: "A maxed pipeline is dramatic: Chief of Medicine at +50% streak, ×1.10 rep, with Counterfeit Kit running clears well over 900,000 on a single shift before tax.",
    },
    {
      heading: "Promotion & demotion",
      body: [
        "Promotions are automatic eligibility: hit the next rung's lifetime-shift requirement and a Promote button appears on !work. Your shift count never resets — it carries through promotions, resignations, and job changes — and stress carries over too. !career tracks your shift success rate (S rating at 95%+), earnings, and reputation tier.",
        "The ladder runs both ways: three consecutive failed shifts demote you to the previous rung. Entry-level jobs can't be demoted, and any success — or an Emergency Pager save — resets the failure streak. A Black Market Resume (900,000) gambles on the climb: 65% to credit +3–8 lifetime shifts, 35% to backfire into 10–25 stress.",
      ],
    },
    {
      heading: "Career tier: the credit card key",
      body: [
        "Every job carries a career tier, 0–4, and card tiers demand it alongside credit score: GOLD needs tier 2, PLATINUM tier 3, BLACK tier 4. Tier 2 is the cheapest gate to reach — Paralegal (LLB, 5 lifetime shifts) or Master Mechanic (Trade License) — while tier 4 means topping the Tech, Legal, or Medical ladder.",
      ],
    },
    {
      heading: "Getting better at working",
      body: [
        "Protect the streak above all. +5% per day up to +50% outpaces every purchasable buff, and it costs nothing but showing up daily. A missed 48 hours resets it to zero.",
        "Match stress spending to your ladder. At 45,000 a shift, burnout is an annoyance; at 450,000 it's a disaster. From tier 3 up, a 75,000 Gym Session (−20 stress) pays for itself the first burnout it prevents — never work past 80 stress at the top.",
        "Front-load education. The shift walls (30 lifetime shifts for tier 3, 60–100 for the top rungs) take days of steady work; the degree takes an afternoon of studying. Get the degree first so a promotion is waiting the day you clear the shifts, not a semester later.",
        "Consumables beat idle time: Energy Flask (−2h cooldown) and Overtime Contract effectively add shifts to your day, and Focus Headphones double sector-rep gain (+10 instead of +5) for 3 shifts — the fastest route to the pay-bonus tiers. On event shifts, take the safe option when a multiplier is 1×–1.5× and gamble only when the downside isn't marked critical.",
      ],
    },
  ],
  commandIds: ["jobs", "apply", "work", "career", "relax", "education"],
  proTips: [
    "There's no penalty for failing an interview and no cooldown to retry — attempt the best job you qualify for, always.",
    "Medical Resident needs zero lifetime shifts — with an MBBS you jump straight to 150,000 a shift and career tier 2, skipping the intern grind entirely.",
    "The 8% tax and 25% garnishment stack. A delinquent card holder keeps barely two-thirds of every paycheck — settle the card before grinding.",
    "Three failed shifts is a demotion. If you've failed twice, wait out your stress or pop an Emergency Pager before the next clock-in.",
    "Reputation only moves upward — +5 per shift, +8 per event. The Legendary tier's +10% pay is 1,500 rep away from day one; every shift counts toward it.",
  ],
};

export default jobsAndCareers;
