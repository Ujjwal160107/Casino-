import { CRIME_CATALOG, CrimeTier } from "./crimeCatalog";

export interface CrimeMinigameStage {
  id: string;
  crimeKey: string;
  stageIndex: number;
  title: string;
  prompt: string;
  options: { label: string; correct: boolean }[];
  timeSeconds: number;
}

export const STAGE_COUNT_BY_TIER: Record<CrimeTier, number> = {
  petty: 1,
  medium: 2,
  high: 2,
  elite: 3,
  legendary: 3,
};

export const DEFAULT_TIMER_BY_TIER: Record<CrimeTier, number> = {
  petty: 15,
  medium: 15,
  high: 18,
  elite: 18,
  legendary: 20,
};

export function getStageCountForTier(tier: CrimeTier): number {
  return STAGE_COUNT_BY_TIER[tier];
}

export const CRIME_MINIGAME_CATALOG: Record<string, CrimeMinigameStage[]> = {};

export function getStagesForCrime(crimeKey: string): CrimeMinigameStage[] | undefined {
  return CRIME_MINIGAME_CATALOG[crimeKey];
}

export function hasMinigameCatalog(crimeKey: string): boolean {
  const stages = CRIME_MINIGAME_CATALOG[crimeKey];
  return !!stages && stages.length > 0;
}

export function stage(
  crimeKey: string,
  stageIndex: number,
  title: string,
  prompt: string,
  options: { label: string; correct: boolean }[],
  timeSeconds: number,
): CrimeMinigameStage {
  return {
    id: `${crimeKey}_s${stageIndex + 1}`,
    crimeKey,
    stageIndex,
    title,
    prompt,
    options,
    timeSeconds,
  };
}

function registerCrimeStages(crimeKey: string, stages: CrimeMinigameStage[]) {
  CRIME_MINIGAME_CATALOG[crimeKey] = stages;
}

function validateStage(stageDef: CrimeMinigameStage, expectedCount: number): string[] {
  const errors: string[] = [];
  const correctCount = stageDef.options.filter((o) => o.correct).length;
  if (correctCount !== 1) {
    errors.push(`${stageDef.id}: must have exactly one correct option (found ${correctCount})`);
  }
  if (stageDef.options.length < 3 || stageDef.options.length > 4) {
    errors.push(`${stageDef.id}: must have 3–4 options (found ${stageDef.options.length})`);
  }
  if (stageDef.stageIndex < 0 || stageDef.stageIndex >= expectedCount) {
    errors.push(`${stageDef.id}: stageIndex ${stageDef.stageIndex} out of range 0..${expectedCount - 1}`);
  }
  return errors;
}

export function validateCrimeMinigameCatalog(): string[] {
  const errors: string[] = [];
  for (const crime of CRIME_CATALOG) {
    const expected = getStageCountForTier(crime.tier);
    const stages = CRIME_MINIGAME_CATALOG[crime.key];
    if (!stages || stages.length === 0) {
      errors.push(`Missing stages for crime: ${crime.key}`);
      continue;
    }
    if (stages.length !== expected) {
      errors.push(`${crime.key}: expected ${expected} stages, got ${stages.length}`);
    }
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].stageIndex !== i) {
        errors.push(`${crime.key}: stage at index ${i} has stageIndex ${stages[i].stageIndex}`);
      }
      errors.push(...validateStage(stages[i], expected));
    }
  }
  return errors;
}

// --- Catalog content registered below ---

// ── GENERAL ──────────────────────────────────────────────────────────────────

registerCrimeStages("pickpocket_alley", [
  stage(
    "pickpocket_alley",
    0,
    "Target selection",
    "A merchant is distracted haggling in Pickpocket Alley. Where do you strike?",
    [
      { label: "Outer coat pocket", correct: true },
      { label: "Hand him a flyer", correct: false },
      { label: "Bump him hard", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.petty,
  ),
]);

registerCrimeStages("counterfeit_stamps", [
  stage(
    "counterfeit_stamps",
    0,
    "Ink match",
    "The postal clerk squints at your Counterfeit Stamps. How do you sell the batch?",
    [
      { label: "Mix them with real stamps in the stack", correct: true },
      { label: "Offer a bulk discount upfront", correct: false },
      { label: "Argue the watermark is vintage", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.petty,
  ),
]);

registerCrimeStages("atm_skim", [
  stage(
    "atm_skim",
    0,
    "Skimmer placement",
    "You need to attach the skimmer to the ATM without the camera catching you. You:",
    [
      { label: "Wait for the blind spot in the sweep", correct: true },
      { label: "Cover the lens with your jacket", correct: false },
      { label: "Ask a passerby to block the view", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "atm_skim",
    1,
    "Data retrieval",
    "The skim ran for six hours. Security is doing rounds. You:",
    [
      { label: "Pull the device during the shift change gap", correct: true },
      { label: "Leave it and come back tomorrow", correct: false },
      { label: "Pry the whole ATM panel off", correct: false },
      { label: "Wait until closing and smash the machine", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("tax_dodge", [
  stage(
    "tax_dodge",
    0,
    "Ledger shuffle",
    "Auditors flagged your cash deposits for the Tax Dodge scheme. You:",
    [
      { label: "Route receipts through the shell ledger", correct: true },
      { label: "Claim it was a personal loan", correct: false },
      { label: "Delete the spreadsheet tabs", correct: false },
      { label: "Pay the full bill and walk away", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "tax_dodge",
    1,
    "Audit meeting",
    "The auditor wants supporting documents tomorrow. Your move:",
    [
      { label: "Deliver forged vendor invoices from the kit", correct: true },
      { label: "No-show the appointment", correct: false },
      { label: "Blame your accountant's software", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("parking_meter_shake", [
  stage(
    "parking_meter_shake",
    0,
    "Meter shake",
    "The Parking Meter Shake block is quiet. Which meter do you hit first?",
    [
      { label: "The jammed one with a loose coin trap", correct: true },
      { label: "The brand-new smart meter", correct: false },
      { label: "The meter under the street camera", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.petty,
  ),
]);

registerCrimeStages("vip_briefcase_lift", [
  stage(
    "vip_briefcase_lift",
    0,
    "VIP approach",
    "A VIP steps out of the limo, briefcase in hand. How do you close distance?",
    [
      { label: "Blend in as hotel valet staff", correct: true },
      { label: "Sprint across the lobby", correct: false },
      { label: "Shout their name to distract them", correct: false },
      { label: "Trip the doorman for chaos", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "vip_briefcase_lift",
    1,
    "Briefcase swap",
    "You're shoulder-to-shoulder at the elevator. The lift goes:",
    [
      { label: "Swap in an empty decoy case", correct: true },
      { label: "Snatch it and run for the stairs", correct: false },
      { label: "Pick the lock in plain sight", correct: false },
      { label: "Ask the VIP to hold your coffee", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("lottery_scam", [
  stage(
    "lottery_scam",
    0,
    "Mark selection",
    "Running the Lottery Scam, you need a believable winner story. You target:",
    [
      { label: "A retiree who trusts lucky charms", correct: true },
      { label: "The lottery commission office", correct: false },
      { label: "A news crew filming nearby", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "lottery_scam",
    1,
    "Payoff pitch",
    "The mark wants proof before wiring the 'processing fee.' You:",
    [
      { label: "Show a doctored winning ticket scan", correct: true },
      { label: "Offer to split the jackpot 50/50 on the spot", correct: false },
      { label: "Demand cash only, no questions", correct: false },
      { label: "Invite them to meet at the police station", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("stamp_forgery", [
  stage(
    "stamp_forgery",
    0,
    "Plate alignment",
    "Your Stamp Forgery run needs perfect perforation. The press is slightly off. You:",
    [
      { label: "Recalibrate using the reference sheet", correct: true },
      { label: "Ship the batch anyway", correct: false },
      { label: "Switch to hand-drawn copies", correct: false },
      { label: "Bribe the inspector before testing", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "stamp_forgery",
    1,
    "Distribution",
    "A collector wants a rare series by Friday. You:",
    [
      { label: "Age the forgeries with tea and heat", correct: true },
      { label: "Sell them as obvious replicas", correct: false },
      { label: "Steal originals from the archive", correct: false },
      { label: "Cancel the deal and burn the plates", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("back_alley_dice", [
  stage(
    "back_alley_dice",
    0,
    "Loaded roll",
    "Back Alley Dice — the house boss watches every throw. Your opening move:",
    [
      { label: "Palmed loaded dice on the come-out", correct: true },
      { label: "Accuse the dealer of cheating first", correct: false },
      { label: "Bet the table minimum and leave", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.petty,
  ),
]);

registerCrimeStages("eclipse_night_rob", [
  stage(
    "eclipse_night_rob",
    0,
    "Eclipse window",
    "During the Eclipse Night Robbery, streetlights fail for ninety seconds. You:",
    [
      { label: "Cut the jewelry store alarm feed first", correct: true },
      { label: "Rob the ATM across the street", correct: false },
      { label: "Wait for police to leave the block", correct: false },
      { label: "Set off fireworks as cover", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "eclipse_night_rob",
    1,
    "Showcase breach",
    "Inside, motion sensors still active. You:",
    [
      { label: "Crawl below the beam grid with the mask", correct: true },
      { label: "Smash every case at once", correct: false },
      { label: "Disable sprinklers with a fire axe", correct: false },
      { label: "Turn on the display lights", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "eclipse_night_rob",
    2,
    "Dark exit",
    "Power returns in thirty seconds. Extraction route:",
    [
      { label: "Roof hatch to the waiting moped", correct: true },
      { label: "Front door waving at cameras", correct: false },
      { label: "Hide in the store until morning", correct: false },
      { label: "Blend into the crowd on main street", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

// ── JOB ──────────────────────────────────────────────────────────────────────

registerCrimeStages("office_expense_fraud", [
  stage(
    "office_expense_fraud",
    0,
    "Receipt forgery",
    "Accounting flagged your lunch receipt on the Office Expense Fraud claim. You:",
    [
      { label: "Submit a matching vendor receipt", correct: true },
      { label: "Claim the charge was a mistake", correct: false },
      { label: "Blame the intern", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "office_expense_fraud",
    1,
    "Audit dodge",
    "Finance wants the original invoice for your expense report. You:",
    [
      { label: "Produce the forged copy from your briefcase", correct: true },
      { label: "Admit the expense and repay", correct: false },
      { label: "Delete the email thread", correct: false },
      { label: "Offer to pay cash under the table", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("resume_forge", [
  stage(
    "resume_forge",
    0,
    "Credential check",
    "HR is verifying your Resume Forge background. Which detail do you fix first?",
    [
      { label: "Match the fake degree to the job posting", correct: true },
      { label: "Add more buzzwords to the summary", correct: false },
      { label: "List your real high school address", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.petty,
  ),
]);

registerCrimeStages("overtime_skim", [
  stage(
    "overtime_skim",
    0,
    "Timesheet padding",
    "Your Overtime Skim needs extra hours without triggering payroll alerts. You:",
    [
      { label: "Split padded hours across two pay periods", correct: true },
      { label: "Claim 80 hours in one week", correct: false },
      { label: "Edit the CEO's timesheet instead", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "overtime_skim",
    1,
    "Manager review",
    "Your manager wants badge swipe logs to match. You:",
    [
      { label: "Backdate entries on the shared terminal", correct: true },
      { label: "Say the badge reader was broken", correct: false },
      { label: "Refuse to submit timesheets", correct: false },
      { label: "CC legal on the email thread", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("gear_resale", [
  stage(
    "gear_resale",
    0,
    "Inventory lift",
    "The Gear Resale Racket needs company laptops off the loading dock. You:",
    [
      { label: "Sign them out as test units for repair", correct: true },
      { label: "Break the cage lock in daylight", correct: false },
      { label: "Report them stolen to insurance first", correct: false },
      { label: "Auction them on the company Slack", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "gear_resale",
    1,
    "Fence handoff",
    "The buyer wants serial numbers scrubbed before pickup. You:",
    [
      { label: "Flash firmware and swap asset tags", correct: true },
      { label: "Sell them with company stickers on", correct: false },
      { label: "Ship through the office mailroom", correct: false },
      { label: "Donate them for a tax write-off", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("contract_breach_scam", [
  stage(
    "contract_breach_scam",
    0,
    "Clause exploit",
    "Running the Contract Breach Scam, you need the client to miss a deadline. You:",
    [
      { label: "Bury the penalty clause on page forty-seven", correct: true },
      { label: "Verbally promise unlimited revisions", correct: false },
      { label: "Sign with an illegible signature", correct: false },
      { label: "Refuse to send a contract at all", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "contract_breach_scam",
    1,
    "Demand letter",
    "They missed delivery — time to collect. Your leverage:",
    [
      { label: "File for liquidated damages per the fine print", correct: true },
      { label: "Threaten to leak their trade secrets", correct: false },
      { label: "Ask for a friendly extension", correct: false },
      { label: "Publicly review them one star", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("shell_company_flip", [
  stage(
    "shell_company_flip",
    0,
    "Entity spin-up",
    "The Shell Company Flip needs a clean buyer on paper. You:",
    [
      { label: "Register a dormant LLC with nominee directors", correct: true },
      { label: "Use your personal checking account", correct: false },
      { label: "Buy the target company outright in cash", correct: false },
      { label: "Announce the deal on LinkedIn", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "shell_company_flip",
    1,
    "Asset transfer",
    "Regulators flagged the sudden ownership change. You:",
    [
      { label: "Route funds through three offshore shells", correct: true },
      { label: "Reverse the transaction publicly", correct: false },
      { label: "Blame a spreadsheet typo", correct: false },
      { label: "Merge with a charity foundation", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "shell_company_flip",
    2,
    "Exit clean",
    "Auditors arrive Monday. Final move:",
    [
      { label: "Dissolve the shell after the wire clears", correct: true },
      { label: "Hold a shareholder meeting in the lobby", correct: false },
      { label: "Transfer assets back at a loss", correct: false },
      { label: "Publish full financials online", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

registerCrimeStages("payroll_redirect", [
  stage(
    "payroll_redirect",
    0,
    "Direct deposit swap",
    "Payroll Redirect — you need HR to update bank details. You:",
    [
      { label: "Submit a forged direct-deposit form", correct: true },
      { label: "Call payroll from the cafeteria phone", correct: false },
      { label: "Ask your coworker to share their account", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "payroll_redirect",
    1,
    "Verification call",
    "Payroll calls to confirm the account change. You:",
    [
      { label: "Impersonate the employee with the resume details", correct: true },
      { label: "Hang up and retry next month", correct: false },
      { label: "Admit it was a prank", correct: false },
      { label: "Transfer them to your manager", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("client_kickback", [
  stage(
    "client_kickback",
    0,
    "Vendor selection",
    "The Client Kickback deal hinges on picking your partner's firm. You:",
    [
      { label: "Rig the RFP scoring rubric in their favor", correct: true },
      { label: "Pick the cheapest bid regardless", correct: false },
      { label: "Award the contract via public lottery", correct: false },
      { label: "Delay procurement until next fiscal year", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "client_kickback",
    1,
    "Kickback routing",
    "The vendor wants their cut without a paper trail. You:",
    [
      { label: "Invoice through a consulting retainer line", correct: true },
      { label: "Take cash in the parking garage", correct: false },
      { label: "Deposit to the company petty cash", correct: false },
      { label: "Split it as employee bonuses on record", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("audit_bribe", [
  stage(
    "audit_bribe",
    0,
    "Auditor contact",
    "The external audit starts tomorrow. Your Audit Bribe opener:",
    [
      { label: "Schedule a 'working dinner' with the lead auditor", correct: true },
      { label: "Send anonymous flowers to the firm", correct: false },
      { label: "Hide the server room keys", correct: false },
      { label: "Reschedule the audit indefinitely", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "audit_bribe",
    1,
    "Finding suppression",
    "They found a material discrepancy. You:",
    [
      { label: "Offer a consulting contract to their brother's firm", correct: true },
      { label: "Threaten to switch audit firms mid-review", correct: false },
      { label: "Publish the findings yourself", correct: false },
      { label: "Shut down the subsidiary entirely", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "audit_bribe",
    2,
    "Sign-off",
    "The partner wants a clean opinion letter. You:",
    [
      { label: "Fund their offshore seminar via the case file", correct: true },
      { label: "Demand a qualified opinion instead", correct: false },
      { label: "Leak the draft to the press", correct: false },
      { label: "Fire the entire finance team", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

registerCrimeStages("executive_embezzle", [
  stage(
    "executive_embezzle",
    0,
    "Wire authorization",
    "Executive Embezzle — the board trusts your signature. First transfer:",
    [
      { label: "Route a 'consulting fee' to your shell account", correct: true },
      { label: "Wire the full treasury to charity", correct: false },
      { label: "Withdraw cash from the lobby ATM", correct: false },
      { label: "Email the CFO for permission", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "executive_embezzle",
    1,
    "Ledger masking",
    "Internal review notices recurring odd entries. You:",
    [
      { label: "Reclassify transfers as intercompany loans", correct: true },
      { label: "Delete the general ledger", correct: false },
      { label: "Confess at the town hall", correct: false },
      { label: "Blame a vendor overcharge", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "executive_embezzle",
    2,
    "Board meeting",
    "Directors ask about the missing eight figures. You:",
    [
      { label: "Present forged subsidiary acquisition docs", correct: true },
      { label: "Offer to resign without explanation", correct: false },
      { label: "Call for an external investigation", correct: false },
      { label: "Transfer the remainder to payroll", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

// ── UNI ──────────────────────────────────────────────────────────────────────

registerCrimeStages("exam_swap", [
  stage(
    "exam_swap",
    0,
    "Seat switch",
    "Exam Swap night — proctors are pacing. How do you pass the answer key?",
    [
      { label: "Slide the cheat sheet under the desk partition", correct: true },
      { label: "Whisper answers across the aisle", correct: false },
      { label: "Photograph the exam with flash on", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "exam_swap",
    1,
    "Proctor pass-by",
    "The proctor stops at your row. You:",
    [
      { label: "Cover the sheet with your official exam booklet", correct: true },
      { label: "Hand over the cheat sheet openly", correct: false },
      { label: "Fake a bathroom emergency", correct: false },
      { label: "Accuse the proctor of bias", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("scholarship_forgery", [
  stage(
    "scholarship_forgery",
    0,
    "Transcript edit",
    "Scholarship Forgery requires a perfect GPA line. You:",
    [
      { label: "Match the registrar's font and seal template", correct: true },
      { label: "Round your GPA up two full points", correct: false },
      { label: "Submit a handwritten transcript", correct: false },
      { label: "Use last semester's unedited copy", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "scholarship_forgery",
    1,
    "Committee call",
    "The scholarship committee verifies with the registrar. You:",
    [
      { label: "Intercept the verification fax with a forged reply", correct: true },
      { label: "Tell them your records were lost in a fire", correct: false },
      { label: "Withdraw the application", correct: false },
      { label: "Bribe the committee chair in the hallway", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("lab_chemical_theft", [
  stage(
    "lab_chemical_theft",
    0,
    "Inventory log",
    "Lab Chemical Theft — the reagent cabinet is logged nightly. You:",
    [
      { label: "Swap labels on two similar bottles", correct: true },
      { label: "Carry the whole cabinet out the window", correct: false },
      { label: "Sign out ethanol instead", correct: false },
      { label: "Ask the TA for the key", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "lab_chemical_theft",
    1,
    "Security scan",
    "The exit scanner beeps on your bag. You:",
    [
      { label: "Pocket the vial in the lab coat lining", correct: true },
      { label: "Run for the parking lot", correct: false },
      { label: "Dump the chemicals in the sink", correct: false },
      { label: "Show the guard your student ID only", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("tuition_launder", [
  stage(
    "tuition_launder",
    0,
    "Grant funnel",
    "Tuition Launder — you need dirty cash to look like financial aid. You:",
    [
      { label: "Deposit through the international student fund", correct: true },
      { label: "Pay tuition with unmarked bills at the counter", correct: false },
      { label: "Apply for a legitimate Pell grant", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "tuition_launder",
    1,
    "Bursar audit",
    "The bursar flags a large anonymous wire. You:",
    [
      { label: "Back it with a forged family trust letter", correct: true },
      { label: "Claim it was a sports booster donation", correct: false },
      { label: "Refund the wire immediately", correct: false },
      { label: "Transfer the money to another student", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("thesis_plagiarism", [
  stage(
    "thesis_plagiarism",
    0,
    "Source scrub",
    "Thesis Plagiarism — Turnitin is running tonight. Your first pass:",
    [
      { label: "Paraphrase and reorder the flagged paragraphs", correct: true },
      { label: "Submit the original PDF unchanged", correct: false },
      { label: "Add your name to someone else's cover page", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.petty,
  ),
]);

registerCrimeStages("grade_broker", [
  stage(
    "grade_broker",
    0,
    "Registrar access",
    "Grade Broker — a student paid for a B to an A. You need portal access. You:",
    [
      { label: "Phish the adjunct's grading login", correct: true },
      { label: "Break into the registrar's office at noon", correct: false },
      { label: "Email the dean to change it officially", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "grade_broker",
    1,
    "Grade edit",
    "The portal shows edit history. You:",
    [
      { label: "Change the grade during the system backup window", correct: true },
      { label: "Set every student in the class to an A", correct: false },
      { label: "Leave a comment explaining the curve", correct: false },
      { label: "Screenshot and post proof online", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("dean_bribe", [
  stage(
    "dean_bribe",
    0,
    "Meeting setup",
    "The Dean Bribe requires a private audience. You:",
    [
      { label: "Donate to the dean's gala under a shell name", correct: true },
      { label: "Slip cash in the faculty mailbox", correct: false },
      { label: "Protest outside the office", correct: false },
      { label: "Send a Venmo request", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "dean_bribe",
    1,
    "Expulsion dodge",
    "You're one vote from expulsion. The dean wants proof of remorse. You:",
    [
      { label: "Offer a endowed chair gift via offshore wire", correct: true },
      { label: "Threaten to sue the university", correct: false },
      { label: "Publish the committee minutes", correct: false },
      { label: "Drop out before the hearing", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "dean_bribe",
    2,
    "Record seal",
    "Student conduct wants the incident sealed. Final ask:",
    [
      { label: "Fund the new ethics center naming rights", correct: true },
      { label: "Write a public apology letter", correct: false },
      { label: "Accept academic probation", correct: false },
      { label: "Transfer to another campus", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

registerCrimeStages("lab_equipment_fence", [
  stage(
    "lab_equipment_fence",
    0,
    "Microscope lift",
    "Lab Equipment Fence — the centrifuge is tagged. You:",
    [
      { label: "Check it out as 'calibration loan' to your lab", correct: true },
      { label: "Wheel it out the loading bay openly", correct: false },
      { label: "Disassemble it in the hallway", correct: false },
      { label: "Report it missing before taking it", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "lab_equipment_fence",
    1,
    "Buyer pickup",
    "The fence wants serial plates removed. You:",
    [
      { label: "Swap asset stickers with retired units", correct: true },
      { label: "Ship it with university logos visible", correct: false },
      { label: "List it on the campus marketplace", correct: false },
      { label: "Return it before the inventory audit", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("campus_pill_lab", [
  stage(
    "campus_pill_lab",
    0,
    "Ventilation",
    "Campus Pill Lab — fumes will trip the dorm sensors. You:",
    [
      { label: "Run the exhaust through the shower vent", correct: true },
      { label: "Cook with windows wide open at noon", correct: false },
      { label: "Disable the building fire panel", correct: false },
      { label: "Work in the cafeteria kitchen", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "campus_pill_lab",
    1,
    "RA knock",
    "The RA smells acetone outside your door. You:",
    [
      { label: "Hide the batch in sealed dry-ice containers", correct: true },
      { label: "Invite them in for a tour", correct: false },
      { label: "Blame the art majors next door", correct: false },
      { label: "Flush everything down the toilet", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "campus_pill_lab",
    2,
    "Distribution",
    "Finals week demand spikes. Delivery method:",
    [
      { label: "Dead-drop in library reserve textbooks", correct: true },
      { label: "Sell from the quad megaphone", correct: false },
      { label: "Mail pills through campus post", correct: false },
      { label: "Hand out samples at the dean's mixer", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

registerCrimeStages("fake_transcript_ring", [
  stage(
    "fake_transcript_ring",
    0,
    "Template match",
    "Fake Transcript Ring order — client needs a 2019 graduation date. You:",
    [
      { label: "Pull the correct year watermark from the archive", correct: true },
      { label: "Use this year's template for every order", correct: false },
      { label: "Handwrite the transcript on notebook paper", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "fake_transcript_ring",
    1,
    "Employer verify",
    "The client's employer calls to verify the degree. You:",
    [
      { label: "Answer as the registrar verification line", correct: true },
      { label: "Tell them the university burned down", correct: false },
      { label: "Refer them to the real registrar", correct: false },
      { label: "Hang up and delete the client's file", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

// ── HUNT ─────────────────────────────────────────────────────────────────────

registerCrimeStages("poacher_run", [
  stage(
    "poacher_run",
    0,
    "Trail entry",
    "Poacher Run — rangers patrol the north ridge hourly. You:",
    [
      { label: "Cut in through the dry creek bed", correct: true },
      { label: "Drive the truck up the main fire road", correct: false },
      { label: "Camp openly near the checkpoint", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "poacher_run",
    1,
    "Shot window",
    "A trophy buck steps into the clearing. You:",
    [
      { label: "Take the shot with a silenced round", correct: true },
      { label: "Use a spotlight to freeze it", correct: false },
      { label: "Fire a warning shot at the sky", correct: false },
      { label: "Whistle to scare it toward the road", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("permit_forgery", [
  stage(
    "permit_forgery",
    0,
    "Stamp copy",
    "Permit Forgery — the warden's signature must match exactly. You:",
    [
      { label: "Trace the hologram from a expired sample", correct: true },
      { label: "Draw the seal freehand", correct: false },
      { label: "Use a photocopy without editing", correct: false },
      { label: "Borrow a friend's legitimate permit", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "permit_forgery",
    1,
    "Checkpoint",
    "A ranger scans your tag at the gate. You:",
    [
      { label: "Laminate the forgery to match worn edges", correct: true },
      { label: "Claim the printer smudged the barcode", correct: false },
      { label: "Reverse and leave", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("bait_warehouse_heist", [
  stage(
    "bait_warehouse_heist",
    0,
    "Loading dock",
    "Bait Warehouse Heist — night shift ends in ten minutes. Entry:",
    [
      { label: "Tailgate the supplier truck through the gate", correct: true },
      { label: "Break the padlock with bolt cutters", correct: false },
      { label: "Pose as health inspectors", correct: false },
      { label: "Climb the roof and enter through skylights", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "bait_warehouse_heist",
    1,
    "Freezer haul",
    "You need premium salmon bait crates out unseen. You:",
    [
      { label: "Load them into a fake pest-control van", correct: true },
      { label: "Wheel them through the front office", correct: false },
      { label: "Set off the fire alarm as cover", correct: false },
      { label: "Hide inside a crate until morning", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("trophy_black_market", [
  stage(
    "trophy_black_market",
    0,
    "Mount prep",
    "Trophy Black Market — the buyer wants intact antlers. You:",
    [
      { label: "Cap the skull plate cleanly in the field", correct: true },
      { label: "Saw through the rack mid-beam", correct: false },
      { label: "Leave the hide on for shipping", correct: false },
      { label: "Tag it with your hunting license number", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "trophy_black_market",
    1,
    "Handoff",
    "Customs scans trucks at the county line. You:",
    [
      { label: "Vacuum-seal and hide in a decoy cooler", correct: true },
      { label: "Mount it on the truck hood", correct: false },
      { label: "Ship via registered mail", correct: false },
      { label: "Donate it to a museum first", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("ranger_bribe", [
  stage(
    "ranger_bribe",
    0,
    "Checkpoint approach",
    "Ranger Bribe — the officer knows your face from last season. You:",
    [
      { label: "Offer a 'trail maintenance donation' envelope", correct: true },
      { label: "Speed past the checkpoint", correct: false },
      { label: "Fake a flat tire and wait", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "ranger_bribe",
    1,
    "Citation dodge",
    "They start writing a poaching citation. You:",
    [
      { label: "Slide hunting permit cash with the paperwork", correct: true },
      { label: "Argue jurisdiction in a loud voice", correct: false },
      { label: "Sign and accept the fine", correct: false },
      { label: "Call the regional supervisor on speaker", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("wildlife_smuggle", [
  stage(
    "wildlife_smuggle",
    0,
    "Crate build",
    "Wildlife Smuggle — exotic reptiles overheat fast. You:",
    [
      { label: "Line crates with climate gel packs", correct: true },
      { label: "Punch air holes through the logo side", correct: false },
      { label: "Stack them in the truck bed uncovered", correct: false },
      { label: "Label the crates as live poultry", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "wildlife_smuggle",
    1,
    "Border stop",
    "Inspectors want to open crate three. You:",
    [
      { label: "Show paperwork for legal species only", correct: true },
      { label: "Release the animals and run", correct: false },
      { label: "Bribe the inspector with the rifle", correct: false },
      { label: "Claim crates are empty decoys", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("night_vision_poach", [
  stage(
    "night_vision_poach",
    0,
    "Thermal dodge",
    "Night Vision Poach — drone thermal sweep in five minutes. You:",
    [
      { label: "Use the tree canopy and mud face paint", correct: true },
      { label: "Set a campfire for warmth", correct: false },
      { label: "Drive the ATV with headlights on", correct: false },
      { label: "Walk the open meadow shortcut", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "night_vision_poach",
    1,
    "Long shot",
    "The target bull is four hundred yards out. You:",
    [
      { label: "Stabilize the scope on the bipod for one shot", correct: true },
      { label: "Close distance through the floodplain", correct: false },
      { label: "Spray the herd to scatter one", correct: false },
      { label: "Wait until sunrise for visibility", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "night_vision_poach",
    2,
    "Extraction",
    "Helicopter patrol hears the shot echo. Route out:",
    [
      { label: "Drag the harvest through the culvert tunnel", correct: true },
      { label: "Hike out on the ranger service road", correct: false },
      { label: "Signal your partner with a flare", correct: false },
      { label: "Hide in the poacher camp until dawn", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

registerCrimeStages("reserve_trespass", [
  stage(
    "reserve_trespass",
    0,
    "Fence breach",
    "Reserve Trespass — the electrified fence hums ahead. You:",
    [
      { label: "Short the wire with insulated clamps", correct: true },
      { label: "Climb over at the posted sign", correct: false },
      { label: "Honk until a ranger opens the gate", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "reserve_trespass",
    1,
    "Camera blind",
    "A trail cam swivels toward your boot print. You:",
    [
      { label: "Backtrack and cross via the stream bed", correct: true },
      { label: "Smash the camera with your rifle butt", correct: false },
      { label: "Wave at the lens and continue", correct: false },
      { label: "Camp under the camera pole", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("stealth_trail_lift", [
  stage(
    "stealth_trail_lift",
    0,
    "Camp approach",
    "Stealth Trail Lift — hunters leave gear at the trailhead overnight. You:",
    [
      { label: "Move in during the 3 AM shift change", correct: true },
      { label: "Pick locks at sunset with a headlamp", correct: false },
      { label: "Ask the outfitter for spare keys", correct: false },
      { label: "Take gear in broad daylight", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "stealth_trail_lift",
    1,
    "Silent exit",
    "Motion lights flicker on the lodge porch. You:",
    [
      { label: "Crawl the tree line with the cloak", correct: true },
      { label: "Sprint through the parking lot", correct: false },
      { label: "Return the gear and apologize", correct: false },
      { label: "Honk the stolen truck horn", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("sniper_escape_route", [
  stage(
    "sniper_escape_route",
    0,
    "Overwatch position",
    "Sniper Escape Route — your crew hits the lodge in ten. Position:",
    [
      { label: "Ridge line with clean exfil sightlines", correct: true },
      { label: "Inside the lodge bar", correct: false },
      { label: "Parking lot behind the generators", correct: false },
      { label: "On the ranger radio tower", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "sniper_escape_route",
    1,
    "Convoy stop",
    "Security SUVs chase the getaway truck. You:",
    [
      { label: "Disable lead vehicle tires at the switchback", correct: true },
      { label: "Fire warning shots into the sky", correct: false },
      { label: "Abandon the rifle and walk down", correct: false },
      { label: "Call off the heist over radio", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "sniper_escape_route",
    2,
    "Exfil",
    "Helicopter searchlight sweeps the valley. You:",
    [
      { label: "Rappel to the river cache and float out", correct: true },
      { label: "Signal with a mirror from the ridge", correct: false },
      { label: "Hide in the lodge until checkout", correct: false },
      { label: "Hike back through the checkpoint", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

// ── COCK ─────────────────────────────────────────────────────────────────────

registerCrimeStages("fight_fix", [
  stage(
    "fight_fix",
    0,
    "Bird prep",
    "Fight Fix — the favorite has better odds. Your angle:",
    [
      { label: "Dull the favorite's spurs before weigh-in", correct: true },
      { label: "Bet everything on the underdog publicly", correct: false },
      { label: "Cancel the match with a fake injury", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "fight_fix",
    1,
    "Payout collect",
    "Your bird wins — the bookie suspects foul play. You:",
    [
      { label: "Collect through a proxy bettor at the window", correct: true },
      { label: "Demand cash from the promoter directly", correct: false },
      { label: "Brag about the fix in the pit", correct: false },
      { label: "Release the bird as proof of innocence", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("spurs_smuggling", [
  stage(
    "spurs_smuggling",
    0,
    "Customs hide",
    "Spurs Smuggling — illegal steel spurs in your kit. Border search incoming. You:",
    [
      { label: "Conceal them inside legal training gear", correct: true },
      { label: "Tape them to the truck undercarriage", correct: false },
      { label: "Wear them through the checkpoint", correct: false },
      { label: "Declare them as farm tools", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "spurs_smuggling",
    1,
    "Arena delivery",
    "The buyer wants the shipment before weigh-in. Handoff:",
    [
      { label: "Pass the crate through the vendor loading bay", correct: true },
      { label: "Toss the bag over the arena wall", correct: false },
      { label: "Ship via the ticket office mail", correct: false },
      { label: "Sell them at the concession stand", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("feed_racket", [
  stage(
    "feed_racket",
    0,
    "Grain swap",
    "Feed Racket — trainers pay premium for your 'boosted' mix. You:",
    [
      { label: "Cut standard grain with cheap filler quietly", correct: true },
      { label: "Label sand as protein powder", correct: false },
      { label: "Steal the champion's feed in public", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.petty,
  ),
]);

registerCrimeStages("arena_gate_crash", [
  stage(
    "arena_gate_crash",
    0,
    "Gate timing",
    "Arena Gate Crash — prize birds roll out at dawn. You:",
    [
      { label: "Tail the transport van through the staff gate", correct: true },
      { label: "Ram the main entrance barrier", correct: false },
      { label: "Buy tickets and sneak backstage", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "arena_gate_crash",
    1,
    "Cage grab",
    "Handlers are loading the champion rooster. You:",
    [
      { label: "Swap cages during the headcount distraction", correct: true },
      { label: "Grab a random bird and run", correct: false },
      { label: "Release every cage to cause chaos", correct: false },
      { label: "Pose as a veterinarian inspector", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("champion_doping", [
  stage(
    "champion_doping",
    0,
    "Dose timing",
    "Champion Doping Scandal — the vet tests after round two. You:",
    [
      { label: "Micro-dose between weigh-in and fight", correct: true },
      { label: "Inject the bird in the winner's circle", correct: false },
      { label: "Spike the opponent's water instead", correct: false },
      { label: "Skip dosing to play it safe", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "champion_doping",
    1,
    "Sample swap",
    "The inspector draws blood from your bird. You:",
    [
      { label: "Switch the vial with a clean bird sample", correct: true },
      { label: "Refuse the test and forfeit", correct: false },
      { label: "Bribe the inspector with the vest", correct: false },
      { label: "Publish the lab results online", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("betting_ring_skim", [
  stage(
    "betting_ring_skim",
    0,
    "Odds board",
    "Betting Ring Skim — you control the chalk board. First move:",
    [
      { label: "Shift lines after heavy public money lands", correct: true },
      { label: "Erase the board mid-match", correct: false },
      { label: "Pay winners from your pocket", correct: false },
      { label: "Close betting before the first round", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "betting_ring_skim",
    1,
    "Payout desk",
    "Winners queue at the cage with sharp eyes. You:",
    [
      { label: "Short payouts on fixed decimal 'fees'", correct: true },
      { label: "Refuse all cash outs", correct: false },
      { label: "Accuse winners of counting cards", correct: false },
      { label: "Double every payout publicly", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "betting_ring_skim",
    2,
    "Ledger burn",
    "Tax inspectors raid tomorrow. You:",
    [
      { label: "Route skim through arena laundry accounts", correct: true },
      { label: "Hand them the full honest ledger", correct: false },
      { label: "Burn the arena down for insurance", correct: false },
      { label: "Declare bankruptcy at press conference", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

registerCrimeStages("cockfight_heist", [
  stage(
    "cockfight_heist",
    0,
    "Vault room",
    "Cockfight Heist — tonight's gate cash is in the office safe. You:",
    [
      { label: "Enter during the main event noise cover", correct: true },
      { label: "Rob the ticket booth at opening", correct: false },
      { label: "Pick the lock during the national anthem", correct: false },
      { label: "Ask the promoter for a loan", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
  stage(
    "cockfight_heist",
    1,
    "Pit exit",
    "Armed guards block the service hall. You:",
    [
      { label: "Blend with catering through the kitchen", correct: true },
      { label: "Run across the fighting pit", correct: false },
      { label: "Hide in the champion's cage", correct: false },
      { label: "Surrender the bag at the gate", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.high,
  ),
]);

registerCrimeStages("underground_title_fraud", [
  stage(
    "underground_title_fraud",
    0,
    "Paperwork forge",
    "Underground Title Fraud — the bird needs a fake pedigree. You:",
    [
      { label: "Clone the lineage stamp from a retired champion", correct: true },
      { label: "Register a stray from the parking lot", correct: false },
      { label: "List the bird as a turkey hybrid", correct: false },
      { label: "Skip paperwork and fight anyway", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "underground_title_fraud",
    1,
    "Registry check",
    "The commission verifies bloodlines online. You:",
    [
      { label: "Spoof the registry callback with forged docs", correct: true },
      { label: "Bribe the clerk with spurs at the desk", correct: false },
      { label: "Withdraw from the title match", correct: false },
      { label: "Admit the bird is a barnyard mix", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "underground_title_fraud",
    2,
    "Title fight",
    "The champion's owner demands a DNA test. You:",
    [
      { label: "Switch the sample vial with a registered bird", correct: true },
      { label: "Forfeit the belt before testing", correct: false },
      { label: "Release a decoy bird into the crowd", correct: false },
      { label: "Sue the commission for defamation", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

registerCrimeStages("arena_security_bribe", [
  stage(
    "arena_security_bribe",
    0,
    "Guard contact",
    "Arena Security Bribe — you need backstage access. You:",
    [
      { label: "Slip the shift lead a cash envelope", correct: true },
      { label: "Flash a fake FBI badge", correct: false },
      { label: "Climb the fence in full view", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
  stage(
    "arena_security_bribe",
    1,
    "Camera loop",
    "They want you to disable a camera for the fixer. You:",
    [
      { label: "Loop the feed during the guard's smoke break", correct: true },
      { label: "Smash every camera on the wall", correct: false },
      { label: "Report the fixer to management", correct: false },
      { label: "Livestream the bribe on TikTok", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.medium,
  ),
]);

registerCrimeStages("blood_sport_launder", [
  stage(
    "blood_sport_launder",
    0,
    "Cash intake",
    "Blood Sport Launder — bagmen deliver dirty cash after the main. You:",
    [
      { label: "Log it as VIP hospitality revenue", correct: true },
      { label: "Deposit cash at the municipal bank", correct: false },
      { label: "Burn the receipts in the pit", correct: false },
      { label: "Split it among the crowd", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "blood_sport_launder",
    1,
    "Vendor shell",
    "Auditors trace spikes in concession sales. You:",
    [
      { label: "Invoice through shell catering vendors", correct: true },
      { label: "Close the arena for renovations", correct: false },
      { label: "Refund every ticket sold", correct: false },
      { label: "Publish audited financials online", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
  stage(
    "blood_sport_launder",
    2,
    "Offshore wire",
    "The promoter wants clean money by Monday. You:",
    [
      { label: "Wire through arena sponsor accounts abroad", correct: true },
      { label: "Pay fighters in uncut diamonds", correct: false },
      { label: "Store cash in the champion's coop", correct: false },
      { label: "Donate the surplus to charity publicly", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.elite,
  ),
]);

// ── LEGENDARY ────────────────────────────────────────────────────────────────

registerCrimeStages("bank_vault_heist", [
  stage(
    "bank_vault_heist",
    0,
    "Camera cycle",
    "The vault camera sweeps every 8 seconds. How do you enter the service corridor?",
    [
      { label: "Use maintenance keycard", correct: true },
      { label: "Kick the service door", correct: false },
      { label: "Ask the guard for directions", correct: false },
      { label: "Wait in the lobby", correct: false },
    ],
    20,
  ),
  stage(
    "bank_vault_heist",
    1,
    "Alarm panel",
    "The alarm panel is blinking amber. You:",
    [
      { label: "Bypass with corporate codes", correct: true },
      { label: "Cut power to the whole block", correct: false },
      { label: "Smash the panel", correct: false },
      { label: "Call the security desk", correct: false },
    ],
    20,
  ),
  stage(
    "bank_vault_heist",
    2,
    "Extraction",
    "Sirens in the distance. Exit plan:",
    [
      { label: "Rooftop sniper cover to the van", correct: true },
      { label: "Front door with mask off", correct: false },
      { label: "Hide in the vault overnight", correct: false },
      { label: "Split up and walk", correct: false },
    ],
    20,
  ),
]);

registerCrimeStages("drug_pipeline_deal", [
  stage(
    "drug_pipeline_deal",
    0,
    "Lab handoff",
    "Drug Pipeline Deal — the cartel rep waits at the dock lab. Verification:",
    [
      { label: "Show purity test from your sealed lab kit", correct: true },
      { label: "Let them taste the raw batch", correct: false },
      { label: "Ship a decoy barrel of saline", correct: false },
      { label: "Skip testing to save time", correct: false },
    ],
    20,
  ),
  stage(
    "drug_pipeline_deal",
    1,
    "Route swap",
    "Coast Guard shifted patrol lanes. You:",
    [
      { label: "Run the komodo venom flask through the pill drop", correct: true },
      { label: "Sail straight through the checkpoint", correct: false },
      { label: "Scuttle the shipment and flee", correct: false },
      { label: "Radio your position to authorities", correct: false },
    ],
    20,
  ),
  stage(
    "drug_pipeline_deal",
    2,
    "Payment",
    "They demand escrow before the final ton moves. You:",
    [
      { label: "Release partial shipment after verified wire", correct: true },
      { label: "Front the entire load on trust", correct: false },
      { label: "Ambush the courier at the exchange", correct: false },
      { label: "Walk away from the deal", correct: false },
    ],
    20,
  ),
]);

registerCrimeStages("armored_truck_hit", [
  stage(
    "armored_truck_hit",
    0,
    "Route intel",
    "Armored Truck Hit — the truck leaves the mint at 6:04 AM. You:",
    [
      { label: "Disable the lead GPS tracker with the toolkit", correct: true },
      { label: "Ram the truck on the highway", correct: false },
      { label: "Rob the mint loading bay instead", correct: false },
      { label: "Follow in a marked police car", correct: false },
    ],
    20,
  ),
  stage(
    "armored_truck_hit",
    1,
    "Convoy stop",
    "Guards exit to check a staged flat tire. You:",
    [
      { label: "Hit the rear door hinges with the wolf fang charge", correct: true },
      { label: "Negotiate through the driver's window", correct: false },
      { label: "Wait for them to drive to the depot", correct: false },
      { label: "Spray paint the windshield", correct: false },
    ],
    20,
  ),
  stage(
    "armored_truck_hit",
    2,
    "Getaway",
    "City cameras track the van. Extraction:",
    [
      { label: "Switch to the decoy truck in the tunnel", correct: true },
      { label: "Drive the loot truck to your garage", correct: false },
      { label: "Abandon cash and keep the van", correct: false },
      { label: "Split up on foot with duffels", correct: false },
    ],
    20,
  ),
]);

registerCrimeStages("money_laundering_ring", [
  stage(
    "money_laundering_ring",
    0,
    "Front business",
    "Money Laundering Ring — investigators traced a wire. First scrub:",
    [
      { label: "Invoice through three shell consultancies", correct: true },
      { label: "Deposit cash at the central bank", correct: false },
      { label: "Buy lottery tickets in bulk", correct: false },
      { label: "Publish the ledger on Twitter", correct: false },
    ],
    20,
  ),
  stage(
    "money_laundering_ring",
    1,
    "Layering pass",
    "The calculator shows a rounding flag on layer two. You:",
    [
      { label: "Split transfers across midnight UTC batches", correct: true },
      { label: "Merge all accounts into one", correct: false },
      { label: "Reverse every transaction", correct: false },
      { label: "Call the compliance hotline", correct: false },
    ],
    20,
  ),
  stage(
    "money_laundering_ring",
    2,
    "Clean exit",
    "Federal task force serves warrants tomorrow. You:",
    [
      { label: "Dissolve fronts after offshore repatriation", correct: true },
      { label: "Hold a press conference denying charges", correct: false },
      { label: "Transfer everything to charity", correct: false },
      { label: "Flee without moving the money", correct: false },
    ],
    20,
  ),
]);

registerCrimeStages("casino_backroom_skim", [
  stage(
    "casino_backroom_skim",
    0,
    "Pit access",
    "Casino Backroom Skim — the count room door is guarded. You:",
    [
      { label: "Tail the shift manager with a lucky coin distraction", correct: true },
      { label: "Kick in the count room door", correct: false },
      { label: "Apply for a dealer job first", correct: false },
      { label: "Pull the fire alarm on the floor", correct: false },
    ],
    20,
  ),
  stage(
    "casino_backroom_skim",
    1,
    "Chip float",
    "Surveillance watches the cage variance. You:",
    [
      { label: "Skim during the approved float adjustment window", correct: true },
      { label: "Empty the entire chip vault", correct: false },
      { label: "Pay winners from your pocket", correct: false },
      { label: "Livestream the backroom on CCTV", correct: false },
    ],
    20,
  ),
  stage(
    "casino_backroom_skim",
    2,
    "Fixer cover",
    "Gaming commission audits the pit logs. You:",
    [
      { label: "Backdate fixes via the legal case file", correct: true },
      { label: "Confess at the high-roller lounge", correct: false },
      { label: "Close the casino for 'maintenance'", correct: false },
      { label: "Refund every patron on the floor", correct: false },
    ],
    20,
  ),
]);

registerCrimeStages("port_smuggling_run", [
  stage(
    "port_smuggling_run",
    0,
    "Container switch",
    "Port Smuggling Run — your container sits in row G. You:",
    [
      { label: "Swap RFID tags with an empty decoy unit", correct: true },
      { label: "Open the crate on the dock apron", correct: false },
      { label: "Bribe the crane operator with the rifle", correct: false },
      { label: "Sail without clearing customs", correct: false },
    ],
    20,
  ),
  stage(
    "port_smuggling_run",
    1,
    "Scanner pass",
    "Customs selects your container for X-ray. You:",
    [
      { label: "Route through the mechanic's masked panel compartment", correct: true },
      { label: "Abandon the shipment and run", correct: false },
      { label: "Label the crate as humanitarian aid", correct: false },
      { label: "Demand a manual inspection on camera", correct: false },
    ],
    20,
  ),
  stage(
    "port_smuggling_run",
    2,
    "Night exfil",
    "Coast patrol tightens the harbor mouth. You:",
    [
      { label: "Use camouflage nets on the skiff exit channel", correct: true },
      { label: "Speed out with running lights off", correct: false },
      { label: "Hide inside a shipping container at sea", correct: false },
      { label: "Dock at the main passenger terminal", correct: false },
    ],
    20,
  ),
]);

registerCrimeStages("hostage_ransom_plot", [
  stage(
    "hostage_ransom_plot",
    0,
    "Snatch timing",
    "Hostage Ransom Plot — target leaves the gala in five minutes. You:",
    [
      { label: "Cut power to the parking garage lifts", correct: true },
      { label: "Grab them on the red carpet", correct: false },
      { label: "Send a fake rideshare driver", correct: false },
      { label: "Announce the kidnapping over PA", correct: false },
    ],
    20,
  ),
  stage(
    "hostage_ransom_plot",
    1,
    "Ransom drop",
    "Family lawyers demand proof of life. You:",
    [
      { label: "Send coded proof via the legal case channel", correct: true },
      { label: "Stream the hostage on social media", correct: false },
      { label: "Release them for good publicity", correct: false },
      { label: "Ask for payment in gift cards", correct: false },
    ],
    20,
  ),
  stage(
    "hostage_ransom_plot",
    2,
    "Extraction",
    "SWAT tracks the ransom wire. Exit:",
    [
      { label: "Exfil through the python cloak service tunnel", correct: true },
      { label: "Collect cash at the police station", correct: false },
      { label: "Surrender with the hostage unharmed", correct: false },
      { label: "Split the ransom with the victim", correct: false },
    ],
    20,
  ),
]);

registerCrimeStages("black_market_auction_raid", [
  stage(
    "black_market_auction_raid",
    0,
    "Auction entry",
    "Black Market Auction Raid — bidders wear masks and carry permits. You:",
    [
      { label: "Flash a forged hunting permit at the door", correct: true },
      { label: "Bid openly without credentials", correct: false },
      { label: "Call the police before entering", correct: false },
      { label: "Crash through the loading bay", correct: false },
    ],
    20,
  ),
  stage(
    "black_market_auction_raid",
    1,
    "Lot grab",
    "The prize lot moves to the vault — guards rotate. You:",
    [
      { label: "Lift the item during the guard vest swap", correct: true },
      { label: "Win the lot legitimately at auction", correct: false },
      { label: "Set off the sprinkler system", correct: false },
      { label: "Photograph lots for insurance", correct: false },
    ],
    20,
  ),
  stage(
    "black_market_auction_raid",
    2,
    "Silent exit",
    "Buyers notice the vault is short one lot. You:",
    [
      { label: "Slip out with thief gloves through the service hall", correct: true },
      { label: "Return the item for a reward", correct: false },
      { label: "Challenge the auctioneer to a duel", correct: false },
      { label: "Hide in the bidder crowd until dawn", correct: false },
    ],
    20,
  ),
]);
