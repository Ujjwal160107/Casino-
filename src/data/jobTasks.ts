import type { Minigame } from "../services/minigameService";

export interface JobTask extends Minigame {
  id: string;
  sector?: string; // undefined = global
}

// Helper: pick a random element
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Button task builders ────────────────────────────────────────────────────

function buttonTask(id: string, sector: string | undefined, title: string, description: string, correctAnswer: string, wrongOptions: string[], time = 20): JobTask {
  const options = [correctAnswer, ...wrongOptions].sort(() => Math.random() - 0.5);
  return { id, sector, type: "button", title, description, answer: correctAnswer, options, time };
}

// ── Typing task builders ────────────────────────────────────────────────────

function normalizeTypingTask(task: JobTask): JobTask {
  if (task.type !== "typing" || !task.previewText) return task;

  const backtickAnswer = task.previewText.match(/`([^`]+)`/);
  const typeAnswer = task.previewText.match(/type:\s*(.+)$/i);
  const answer = backtickAnswer?.[1] ?? typeAnswer?.[1]?.trim();

  return answer ? { ...task, answer, description: `Type exactly: **${answer}**` } : task;
}

// ── Global tasks ────────────────────────────────────────────────────────────

export function buildGlobalTasks(): JobTask[] {
  return [
    buttonTask("global_email_summary", undefined,
      "Email Crisis",
      "Your manager sent a 47-word email. Which summary is correct?",
      pick(["Action required by EOD.", "Please review and respond.", "Meeting moved to Thursday."]),
      ["No action needed.", "Forward to all teams.", "Archive it immediately."]
    ),
    buttonTask("global_printer_jam", undefined,
      "Printer Chaos",
      "The printer is jammed 10 minutes before the deadline. What do you do?",
      "Send digital copies and explain",
      ["Restart the whole network", "Cancel the meeting", "Photocopy it by hand"]
    ),
    buttonTask("global_meeting_conflict", undefined,
      "Triple Booking",
      "Three meetings overlap right now. Which one actually matters?",
      pick(["The client demo", "The investor call", "The executive review"]),
      ["The team icebreaker", "The lunch n learn", "The quarterly check-in"]
    ),
    buttonTask("global_urgent_matrix", undefined,
      "Task Triage",
      "Which task is both Important AND Urgent?",
      pick(["Fix broken production login", "Respond to an angry client email", "Submit expense report before deadline"]),
      ["Update your LinkedIn profile", "Reorganise your calendar", "Order office supplies"]
    ),
    buttonTask("global_typo_catch", undefined,
      "Typo Hunt",
      "Spot the typo in this contract line before signing.",
      pick(["The client shall receive a full refudn within 30 days.", "Payment is deu within 14 calendar days.", "Contractor is responsibel for all deliverables."]),
      ["The client shall receive a full refund within 30 days.", "Payment is due within 14 calendar days.", "Contractor is responsible for all deliverables."]
    ),
    buttonTask("global_angry_response", undefined,
      "Client on Fire",
      "A client is furious. Which response de-escalates without promising anything?",
      "I hear your concern — let me look into this right now.",
      ["That's not our problem.", "Have you tried restarting?", "I'll escalate to the CEO immediately."]
    ),
    buttonTask("global_excuse_selector", undefined,
      "Least Suspicious Excuse",
      "You missed the deadline. Pick the least suspicious excuse.",
      pick(["There was a dependency issue I flagged last week.", "My internet was down for 20 minutes.", "The file corrupted during upload."]),
      ["My dog ate the file.", "I forgot.", "Time zones are confusing."]
    ),
    buttonTask("global_fire_exit", undefined,
      "Fire Drill Protocol",
      "The alarm went off. What's the correct first action?",
      "Calmly leave via the nearest designated exit",
      ["Finish your current task first", "Look for the source of smoke", "Email your team first"]
    ),
    {
      id: "global_sticky_note", sector: undefined,
      type: "typing", title: "Sticky Note Emergency",
      description: "Type the exact phrase from the sticky note before it blows off the desk!",
      previewText: pick([
        "ASAP: Call Dave re: Q3 pivot → `ASAP Call Dave Q3 pivot`",
        "Do NOT press the red button on server rack 4 → `Do NOT press the red button on server rack 4`",
        "Meeting room B is double booked — go to C → `Meeting room B is double booked go to C`",
      ]),
      answer: pick(["ASAP Call Dave Q3 pivot", "Do NOT press the red button on server rack 4", "Meeting room B is double booked go to C"]),
      previewTime: 6, time: 18,
    },
    {
      id: "global_corporate_phrase", sector: undefined,
      type: "typing", title: "Corporate Speak",
      description: "Type this phrase backwards (word by word) before the sync starts.",
      previewText: pick([
        "Synergy unlocks scalable bandwidth → type: bandwidth scalable unlocks Synergy",
        "Leverage our core competencies → type: competencies core our Leverage",
        "Pivot to a data-driven paradigm → type: paradigm data-driven a to Pivot",
      ]),
      answer: pick(["bandwidth scalable unlocks Synergy", "competencies core our Leverage", "paradigm data-driven a to Pivot"]),
      previewTime: 6, time: 20,
    },
  ];
}

// ── Tech tasks ──────────────────────────────────────────────────────────────

export function buildTechTasks(): JobTask[] {
  return [
    buttonTask("tech_kubectl", "tech",
      "Cluster Dying",
      "Which kubectl command deploys the fix before the cluster crashes?",
      "kubectl rollout restart deployment/api",
      ["kubectl delete pod --all", "kubectl exec -it api bash", "kubectl get nodes --verbose"]
    ),
    buttonTask("tech_rollback", "tech",
      "Deploy Broke Everything",
      "Build broke 3 minutes after deploy. Pick the rollback strategy.",
      "kubectl rollout undo deployment/api",
      ["Redeploy the broken version", "Restart all pods manually", "Wait and monitor"]
    ),
    buttonTask("tech_memory_kill", "tech",
      "Memory at 99%",
      "Memory usage is critical. Which service do you kill first?",
      pick(["The logging aggregator that's been leaking", "The dev-environment test runner", "The unused analytics service"]),
      ["The billing service", "The authentication service", "The database"]
    ),
    buttonTask("tech_pr_response", "tech",
      "47 PR Comments",
      "Your PR has 47 review comments. Which response style works best?",
      "Address each point with explanation, fix the valid ones",
      ["Resolve all comments without reading them", "Close the PR and reopen it fresh", "Comment 'LGTM' and merge yourself"]
    ),
    {
      id: "tech_error_code", sector: "tech",
      type: "typing", title: "Error Code Entry",
      description: "Type the exact error code from the terminal log.",
      previewText: pick([
        "Error: ECONNREFUSED 127.0.0.1:5432 → type: ECONNREFUSED 127.0.0.1:5432",
        "fatal: SIGKILL 9 pid:3847 → type: SIGKILL 9 pid:3847",
        "panic: runtime error: index out of range → type: runtime error index out of range",
      ]),
      answer: pick(["ECONNREFUSED 127.0.0.1:5432", "SIGKILL 9 pid:3847", "runtime error index out of range"]),
      previewTime: 5, time: 18,
    },
  ];
}

// ── Medical tasks ───────────────────────────────────────────────────────────

export function buildMedicalTasks(): JobTask[] {
  return [
    buttonTask("med_triage", "medical",
      "Triage Decision",
      "Three patients arrived simultaneously. Who gets seen first?",
      "Chest pain + shortness of breath",
      ["Mild headache for 3 days", "Sprained ankle from earlier today", "Non-urgent prescription refill"]
    ),
    buttonTask("med_allergy_check", "medical",
      "Allergy Alert",
      "Patient has a penicillin allergy. Which medication is safe?",
      "Azithromycin",
      ["Amoxicillin", "Ampicillin", "Dicloxacillin"]
    ),
    buttonTask("med_anxious_patient", "medical",
      "Anxious Patient",
      "Patient is extremely anxious before a procedure. Best first step?",
      "Acknowledge their fear and explain each step before doing it",
      ["Tell them to relax — it won't hurt", "Start immediately to get it over with", "Ask a colleague to deal with them"]
    ),
    buttonTask("med_priority_order", "medical",
      "Task Order",
      "Which task should you do FIRST this shift?",
      pick(["Check morning labs for admitted patients", "Review critical patient flagged overnight", "Sign off discharge paperwork"]),
      ["Answer emails", "Restock supply cabinet", "Update spreadsheets"]
    ),
    {
      id: "med_dosage_code", sector: "medical",
      type: "typing", title: "Dosage Entry",
      description: "Enter the correct dosage code exactly as shown.",
      previewText: pick([
        "500mg PO BID × 7d → type: 500mg PO BID 7d",
        "250mcg IV QD PRN → type: 250mcg IV QD PRN",
        "1g IM STAT → type: 1g IM STAT",
      ]),
      answer: pick(["500mg PO BID 7d", "250mcg IV QD PRN", "1g IM STAT"]),
      previewTime: 5, time: 18,
    },
  ];
}

// ── Business tasks ──────────────────────────────────────────────────────────

export function buildBusinessTasks(): JobTask[] {
  return [
    buttonTask("biz_kpi_meeting", "business",
      "Board Meeting Agenda",
      "Which agenda item actually belongs in the executive board meeting?",
      pick(["Q3 revenue shortfall and recovery plan", "Customer retention rate and churn analysis", "Strategic partnership proposal"]),
      ["Office microwave replacement", "Team lunch preferences", "Parking spot allocation"]
    ),
    buttonTask("biz_missed_deadline", "business",
      "Missed Deadline",
      "You missed a client deliverable. Best first action?",
      "Contact the client proactively and give a new realistic timeline",
      ["Wait to see if they notice", "Blame a team member in the email", "Send something incomplete to show effort"]
    ),
    buttonTask("biz_fake_expense", "business",
      "Suspicious Expense",
      "Spot the fake expense in this report.",
      pick(["$2,400 team offsite — no receipt, no approval", "$850 software subscription billed twice", "Client dinner at $3,200 for two people with no guest named"]),
      ["$45 taxi to client site", "$180 conference registration fee", "$60 team lunch with receipt"]
    ),
    {
      id: "biz_invoice_code", sector: "business",
      type: "typing", title: "Invoice Code",
      description: "Enter the invoice reference code exactly before the payment window closes.",
      previewText: pick([
        "INV-2024-Q3-00847-FINAL → type: INV-2024-Q3-00847-FINAL",
        "PO-REF-7733-CLIENT-B → type: PO-REF-7733-CLIENT-B",
        "ACCT-9901-RENEWAL-2025 → type: ACCT-9901-RENEWAL-2025",
      ]),
      answer: pick(["INV-2024-Q3-00847-FINAL", "PO-REF-7733-CLIENT-B", "ACCT-9901-RENEWAL-2025"]),
      previewTime: 5, time: 20,
    },
  ];
}

// ── Legal tasks ─────────────────────────────────────────────────────────────

export function buildLegalTasks(): JobTask[] {
  return [
    buttonTask("legal_clause_change", "legal",
      "Spot the Change",
      "Opposing counsel made a 'minor' change. Which clause was altered?",
      pick(["'reasonable notice' changed to '5 business days'", "'net 30' changed to 'net 60'", "'mutual' removed from confidentiality clause"]),
      ["Company name updated", "Date corrected", "Formatting adjusted"]
    ),
    buttonTask("legal_scheduling", "legal",
      "Court Conflict",
      "Two hearings were scheduled on the same day. Which gets priority?",
      pick(["The hearing with a judicial deadline", "The case closest to verdict", "The matter with the most senior judge"]),
      ["The case with the biggest retainer", "The alphabetically first case", "The one with free parking nearby"]
    ),
    buttonTask("legal_response", "legal",
      "Opposing Counsel Email",
      "Opposing counsel sent an aggressive email. What's the best response?",
      "Professional acknowledgment, request for supporting documentation",
      ["Match their tone", "Ignore it for 3 days", "CC your client immediately"]
    ),
    {
      id: "legal_case_number", sector: "legal",
      type: "typing", title: "Case Reference",
      description: "Enter the case reference number exactly as it appears on the filing.",
      previewText: pick([
        "2024-CV-00183-DISTRICT → type: 2024-CV-00183-DISTRICT",
        "CAS-44921-B-APPEAL → type: CAS-44921-B-APPEAL",
        "REF-COURT-7710-FINAL → type: REF-COURT-7710-FINAL",
      ]),
      answer: pick(["2024-CV-00183-DISTRICT", "CAS-44921-B-APPEAL", "REF-COURT-7710-FINAL"]),
      previewTime: 5, time: 20,
    },
  ];
}

// ── Service tasks ───────────────────────────────────────────────────────────

export function buildServiceTasks(): JobTask[] {
  return [
    buttonTask("service_complaint", "service",
      "Customer Complaint",
      "Customer says their food was cold. Ideal response?",
      "Apologise immediately and offer to replace or refund",
      ["Tell them to use the microwave", "Ask if they tried it sooner", "Say the kitchen was very busy tonight"]
    ),
    buttonTask("service_vip", "service",
      "VIP Table",
      "The VIP who knows the owner arrived without a reservation. You...",
      "Politely check if you can accommodate and check with manager",
      ["Turn them away — no reservation, no table", "Give them someone else's reserved table", "Pretend you don't know who they are"]
    ),
    buttonTask("service_kitchen_timing", "service",
      "Kitchen Timing",
      "Starters, mains, and desserts for three tables all need to go out at once. What do you prioritise?",
      "Hottest/most time-sensitive dishes first",
      ["Alphabetical order by table name", "The table that tipped best last time", "Whatever is nearest the pass"]
    ),
    {
      id: "service_order_code", sector: "service",
      type: "typing", title: "Order Ticket",
      description: "Type this order ticket exactly before it gets lost.",
      previewText: pick([
        "T3: 2xRisotto 1xSalad NO NUTS → type: T3 2xRisotto 1xSalad NO NUTS",
        "T7: 4xSteak MR 2xVeg GF → type: T7 4xSteak MR 2xVeg GF",
        "T1: 1xSoup 3xBurger SUB FRIES → type: T1 1xSoup 3xBurger SUB FRIES",
      ]),
      answer: pick(["T3 2xRisotto 1xSalad NO NUTS", "T7 4xSteak MR 2xVeg GF", "T1 1xSoup 3xBurger SUB FRIES"]),
      previewTime: 5, time: 18,
    },
  ];
}

// ── Trade tasks ─────────────────────────────────────────────────────────────

export function buildTradeTasks(): JobTask[] {
  return [
    buttonTask("trade_tool_select", "trade",
      "Right Tool",
      "Which tool do you use to tighten a M16 bolt to spec?",
      "Torque wrench set to spec value",
      ["Impact driver at full speed", "Adjustable pliers", "Best estimate by hand"]
    ),
    buttonTask("trade_safety_check", "trade",
      "Safety First",
      "Before starting electrical work, what is the FIRST step?",
      "Isolate the circuit and verify with a voltage tester",
      ["Start and be careful", "Check the breaker label and hope for the best", "Ask a colleague if it looks live"]
    ),
    buttonTask("trade_parts_order", "trade",
      "Parts Priority",
      "Three parts are needed. Which one do you order first?",
      pick(["The critical safety component with a 5-day lead time", "The part that's stopping the whole job", "The recalled part that needs replacing"]),
      ["The cheapest part", "The part with the longest delivery time", "The part you've ordered before"]
    ),
    {
      id: "trade_part_number", sector: "trade",
      type: "typing", title: "Part Number Entry",
      description: "Enter the part number exactly before the supplier line closes.",
      previewText: pick([
        "PT-4472-B-GALV-M16 → type: PT-4472-B-GALV-M16",
        "ELEC-3300-BREAKER-40A → type: ELEC-3300-BREAKER-40A",
        "HYD-7751-SEAL-KIT-R → type: HYD-7751-SEAL-KIT-R",
      ]),
      answer: pick(["PT-4472-B-GALV-M16", "ELEC-3300-BREAKER-40A", "HYD-7751-SEAL-KIT-R"]),
      previewTime: 5, time: 18,
    },
  ];
}

// ── Master pool builder ─────────────────────────────────────────────────────

export function buildFreelanceTasks(): JobTask[] {
  return [
    buttonTask("freelance_scope_creep", "freelance",
      "Freelance Scope Creep",
      "A client says 'just one tiny change' for the fifth time. What do you do?",
      "Send a polite change request with a new quote",
      ["Do it free forever", "Ghost the client", "Rewrite the whole project overnight"]
    ),
    buttonTask("freelance_late_payment", "freelance",
      "Freelance Payment Delay",
      "The client says payment is coming after their investor call. Best response?",
      "Pause new work until the invoice clears",
      ["Keep working and hope", "Publicly shame them", "Delete all deliverables"]
    ),
    buttonTask("freelance_portfolio_panic", "freelance",
      "Portfolio Panic",
      "A dream client asks for samples in 10 minutes. Which sample do you send?",
      pick(["The most relevant finished project", "The cleanest before/after case study", "The short reel with proven results"]),
      ["An unfinished draft", "A 90-page archive", "A project under NDA"]
    ),
    buttonTask("freelance_revision_limit", "freelance",
      "Revision Loop",
      "The client is on revision round 12. How do you keep control?",
      "Point to the included revision limit and offer paid extras",
      ["Say yes to everything", "Argue line by line", "Pretend the email went to spam"]
    ),
    {
      id: "freelance_invoice_line", sector: "freelance",
      type: "typing", title: "Invoice Line",
      description: "Type the invoice memo exactly before the client forgets again.",
      previewText: pick([
        "Milestone 2 delivery due on receipt -> type: Milestone 2 delivery due on receipt",
        "Rush fee approved in writing -> type: Rush fee approved in writing",
        "Final files released after payment -> type: Final files released after payment",
      ]),
      answer: pick(["Milestone 2 delivery due on receipt", "Rush fee approved in writing", "Final files released after payment"]),
      previewTime: 5, time: 18,
    },
  ];
}

export function getAllJobTasks(): JobTask[] {
  return [
    ...buildGlobalTasks(),
    ...buildTechTasks(),
    ...buildMedicalTasks(),
    ...buildBusinessTasks(),
    ...buildLegalTasks(),
    ...buildServiceTasks(),
    ...buildTradeTasks(),
    ...buildFreelanceTasks(),
  ].map(normalizeTypingTask);
}

export function getJobTasksForSector(sector: string): JobTask[] {
  const all = getAllJobTasks();
  return all.filter(t => !t.sector || t.sector === sector);
}
