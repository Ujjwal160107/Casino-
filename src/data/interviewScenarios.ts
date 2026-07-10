export type JobSector = "tech" | "medical" | "business" | "legal" | "service" | "trade" | "freelance" | "all";

export interface InterviewChoice {
  label: string;
  successChance: number; // 0.0–1.0
  scoreOnSuccess: number; // 15–25, total across 5 maxes ~100
  successMsg: string;
  failMsg: string;
}

export interface InterviewScenario {
  id: string;
  sector: JobSector;
  tier?: number; // 0=entry, 1=mid, 2=senior
  prompt: string;
  choices: InterviewChoice[];
}

export const INTERVIEW_SCENARIOS: InterviewScenario[] = [
  // ── Global scenarios ────────────────────────────────────────────────────────
  {
    id: "global_triple_priority",
    sector: "all",
    prompt: "Your manager assigned you three conflicting top-priority tasks. All are due today. You...",
    choices: [
      { label: "Pick the most public-facing one and do it well", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Solid call. The visible win impressed leadership.", failMsg: "Missed the others. Your manager noticed." },
      { label: "Do all three badly and submit everything", successChance: 0.30, scoreOnSuccess: 10, successMsg: "Somehow it worked. Not recommended.", failMsg: "Three half-finished disasters. Classic." },
      { label: "Ask your manager to clarify priority", successChance: 0.90, scoreOnSuccess: 25, successMsg: "They respected the initiative. You tackled the real priority.", failMsg: "Manager was annoyed you interrupted their meeting." },
      { label: "Call in sick and deal with it tomorrow", successChance: 0.05, scoreOnSuccess: 5, successMsg: "The tasks somehow got reassigned. Lucky.", failMsg: "HR noticed it was a suspiciously convenient sick day." },
    ],
  },
  {
    id: "global_reply_all",
    sector: "all",
    prompt: "You accidentally replied-all to the entire company with a meme about your manager. You...",
    choices: [
      { label: "Send a professional company-wide apology immediately", successChance: 0.80, scoreOnSuccess: 20, successMsg: "Quick recovery. Most people forgot by lunch.", failMsg: "The apology was worse than the meme." },
      { label: "Double down and send a funnier one", successChance: 0.10, scoreOnSuccess: 8, successMsg: "Somehow became a legend. Do NOT try this at home.", failMsg: "HR called within 4 minutes." },
      { label: "Blame it on a phishing simulation", successChance: 0.40, scoreOnSuccess: 15, successMsg: "IT confirmed there WAS a drill last week. You got away with it.", failMsg: "IT publicly confirmed there was no drill." },
      { label: "Quietly delete the email and pretend nothing happened", successChance: 0.25, scoreOnSuccess: 10, successMsg: "Email forensics are hard. People forgot.", failMsg: "Someone took a screenshot. It's on the intranet." },
    ],
  },
  {
    id: "global_coffee_machine",
    sector: "all",
    prompt: "The coffee machine broke 8 minutes before your shift starts on a Monday. You...",
    choices: [
      { label: "You came prepared — brought your own", successChance: 0.90, scoreOnSuccess: 22, successMsg: "Prepared professional. You sailed through.", failMsg: "Forgot it in the car. Very far away." },
      { label: "Spiral into chaos and warn the whole floor", successChance: 0.20, scoreOnSuccess: 8, successMsg: "Your dramatic announcement somehow boosted morale.", failMsg: "You were banned from the break room announcements." },
      { label: "Attempt to fix it with zero electrical knowledge", successChance: 0.30, scoreOnSuccess: 12, successMsg: "Miraculously fixed it. Hero of the office.", failMsg: "Triple-tripped the breaker. Lights out." },
      { label: "Organize a group coffee run and lead the team", successChance: 0.80, scoreOnSuccess: 20, successMsg: "Seamless coordination. Team bonded over the walk.", failMsg: "You lost half the orders. The wrong Starbucks." },
    ],
  },
  {
    id: "global_stolen_lunch",
    sector: "all",
    prompt: "Someone stole your clearly-labelled lunch from the fridge. You...",
    choices: [
      { label: "Send a calm, professional all-hands email about it", successChance: 0.70, scoreOnSuccess: 18, successMsg: "The culprit confessed and bought you lunch.", failMsg: "The email became a meme. Your name is now Lunch Guy." },
      { label: "Leave a passive-aggressive note", successChance: 0.50, scoreOnSuccess: 15, successMsg: "The note was legendary. Problem stopped.", failMsg: "Someone replied to the note with an even better note." },
      { label: "Confront every suspicious coworker one by one", successChance: 0.25, scoreOnSuccess: 10, successMsg: "Found the culprit. Awkward, but resolved.", failMsg: "You accused the VP. That was a mistake." },
      { label: "Let it go. It's just lunch.", successChance: 0.95, scoreOnSuccess: 22, successMsg: "You ordered delivery. It was better anyway.", failMsg: "You fumed about it for three weeks. Not ideal." },
    ],
  },
  {
    id: "global_meeting_overlap",
    sector: "all",
    prompt: "Three important meetings are scheduled at the same time. You can only attend one. You...",
    choices: [
      { label: "Attend the one where your absence would be most noticed", successChance: 0.80, scoreOnSuccess: 20, successMsg: "Right call. The other two ran fine without you.", failMsg: "Wrong meeting. Critical decision happened without you." },
      { label: "Send an assistant to one and decline two", successChance: 0.65, scoreOnSuccess: 17, successMsg: "Good delegation. Notes were adequate.", failMsg: "The assistant sent the wrong notes to everyone." },
      { label: "Ask all three organizers to reschedule", successChance: 0.40, scoreOnSuccess: 14, successMsg: "Two agreed. Rare success.", failMsg: "All three got offended. Scheduling chaos ensued." },
      { label: "Attend none and blame a system glitch", successChance: 0.15, scoreOnSuccess: 8, successMsg: "IT was down. You got a pass.", failMsg: "IT logs disproved the glitch. Very bad look." },
    ],
  },
  {
    id: "global_fire_alarm",
    sector: "all",
    prompt: "The fire alarm goes off mid-presentation. You...",
    choices: [
      { label: "Calmly lead everyone outside following protocol", successChance: 0.90, scoreOnSuccess: 22, successMsg: "Smooth evacuation. You looked like a leader.", failMsg: "Led everyone to the wrong exit. Not ideal." },
      { label: "Finish the slide you're on and then leave", successChance: 0.20, scoreOnSuccess: 10, successMsg: "It was a drill. Your dedication was noted (weirdly).", failMsg: "It was not a drill. This is the story they tell at onboarding." },
      { label: "Announce it's probably a drill and continue", successChance: 0.45, scoreOnSuccess: 14, successMsg: "Was a drill. You called it.", failMsg: "Was not a drill. You're famous now." },
      { label: "Take the opportunity to end the presentation early", successChance: 0.75, scoreOnSuccess: 18, successMsg: "Everyone was relieved. Best meeting ending ever.", failMsg: "The feedback survey noted 'unfinished'." },
    ],
  },
  {
    id: "global_angry_client",
    sector: "all",
    prompt: "A client is furious and threatening to escalate to your CEO. You...",
    choices: [
      { label: "Listen fully, empathise, then offer a concrete next step", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Client calmed down. Escalation cancelled.", failMsg: "Next step was too vague. Escalation happened anyway." },
      { label: "Immediately escalate yourself to get ahead of it", successChance: 0.60, scoreOnSuccess: 17, successMsg: "Your manager appreciated the heads-up. Managed cleanly.", failMsg: "Manager had no context. Made it worse." },
      { label: "Promise everything they asked for without checking", successChance: 0.30, scoreOnSuccess: 10, successMsg: "Happened to be deliverable. Lucky.", failMsg: "Half those things were impossible. New fire." },
      { label: "Stay completely neutral and document everything", successChance: 0.70, scoreOnSuccess: 18, successMsg: "CYA. You were protected and the issue was resolved.", failMsg: "Documentation won't matter if the client cancels." },
    ],
  },
  {
    id: "global_broken_printer",
    sector: "all",
    prompt: "The printer is broken and you need 30 copies in 15 minutes. You...",
    choices: [
      { label: "Send digital copies and explain the situation", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Everyone preferred digital anyway.", failMsg: "One person insisted on paper. You failed that person." },
      { label: "Find another printer in the building", successChance: 0.65, scoreOnSuccess: 17, successMsg: "Floor 4 had one. You made it.", failMsg: "Also broken. Floor 4 is cursed." },
      { label: "Fix the printer yourself", successChance: 0.35, scoreOnSuccess: 14, successMsg: "Paper jam, just needed a firm hand. Hero.", failMsg: "Made it worse. Now nobody can print." },
      { label: "Delay the meeting and apologise", successChance: 0.55, scoreOnSuccess: 15, successMsg: "People respected the honesty.", failMsg: "Client was already there. Awkward silence." },
    ],
  },
  {
    id: "global_expense_report",
    sector: "all",
    prompt: "Your expense report has a suspicious line item that wasn't yours. You...",
    choices: [
      { label: "Flag it immediately to finance before submitting", successChance: 0.90, scoreOnSuccess: 23, successMsg: "Finance appreciated the honesty. Problem traced and fixed.", failMsg: "Finance was confused — it was actually yours, misremembered." },
      { label: "Submit it and see if it gets approved", successChance: 0.20, scoreOnSuccess: 8, successMsg: "Slipped through. But now you owe the universe.", failMsg: "Flagged for audit. Uncomfortable questions ensued." },
      { label: "Remove it and submit without comment", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Clean report. Right call.", failMsg: "It was a legitimate company expense. Now it's missing." },
      { label: "Ask the colleague you suspect added it", successChance: 0.55, scoreOnSuccess: 15, successMsg: "They admitted it. Issue resolved.", failMsg: "Wrong colleague. Awkward accusation." },
    ],
  },
  {
    id: "global_rumour",
    sector: "all",
    prompt: "A rumour is spreading that you're about to quit. Your manager calls you in. You...",
    choices: [
      { label: "Be honest: you have been looking, but haven't decided", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Manager respected honesty and offered a raise.", failMsg: "Manager pre-emptively reassigned your projects." },
      { label: "Deny everything and look confused", successChance: 0.50, scoreOnSuccess: 15, successMsg: "Believed. Back to normal.", failMsg: "Your LinkedIn profile update was noticed. Busted." },
      { label: "Confirm you're leaving immediately to see what they offer", successChance: 0.40, scoreOnSuccess: 16, successMsg: "Counter-offer received. Bold move paid off.", failMsg: "They accepted your 'resignation'. Oops." },
      { label: "Laugh it off and redirect to your recent wins", successChance: 0.80, scoreOnSuccess: 20, successMsg: "Manager forgot about the rumour. You're safe.", failMsg: "Your recent wins were... not that impressive. Awkward." },
    ],
  },

  // ── Tech scenarios ───────────────────────────────────────────────────────
  {
    id: "tech_server_crash",
    sector: "tech",
    prompt: "Production is down. It's 2PM on a Friday. The Slack channel is on fire. You...",
    choices: [
      { label: "Roll back the last deploy immediately", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Rollback worked. Back online in 4 minutes.", failMsg: "Rollback made it worse. The logs are lying." },
      { label: "Read the logs carefully before touching anything", successChance: 0.70, scoreOnSuccess: 20, successMsg: "Root cause found. Clean fix applied.", failMsg: "Logs were misleading. Took 40 minutes." },
      { label: "Restart all the services and pray", successChance: 0.45, scoreOnSuccess: 14, successMsg: "Miracle. It's back.", failMsg: "Corrupted the database. Weekend is cancelled." },
      { label: "Escalate to senior immediately and give full context", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Right call. Fixed in minutes with senior help.", failMsg: "Senior was unavailable. You waited too long." },
    ],
  },
  {
    id: "tech_ai_output",
    sector: "tech",
    prompt: "The AI tool gave a client completely wrong output. They noticed. You...",
    choices: [
      { label: "Acknowledge the error, correct it, and explain what happened", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Client respected transparency. Trust maintained.", failMsg: "Explanation was too technical. Client escalated." },
      { label: "Blame the AI and say it's a known limitation", successChance: 0.40, scoreOnSuccess: 13, successMsg: "Client accepted it. Tool got the blame.", failMsg: "Client Googled it. No such known limitation exists." },
      { label: "Fix it quietly and deliver corrected output without comment", successChance: 0.60, scoreOnSuccess: 17, successMsg: "Client assumed it was always correct. Done.", failMsg: "Client noticed the timestamps. Now it's a bigger issue." },
      { label: "Offer a discount or credit to restore trust", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Client appreciated the gesture. Retained.", failMsg: "They took the credit AND escalated. Rough." },
    ],
  },
  {
    id: "tech_pr_review",
    sector: "tech",
    prompt: "Your PR has 47 review comments, mostly style nitpicks. Senior review is blocking merge. You...",
    choices: [
      { label: "Address each comment thoughtfully", successChance: 0.80, scoreOnSuccess: 20, successMsg: "Approved. Senior noticed your thoroughness.", failMsg: "15 new comments appeared after your changes." },
      { label: "Argue back on the ones you disagree with", successChance: 0.50, scoreOnSuccess: 16, successMsg: "Won 3 arguments. Respect gained.", failMsg: "Caused a philosophical coding debate. PR still blocked." },
      { label: "Mark all as resolved without changing anything", successChance: 0.20, scoreOnSuccess: 8, successMsg: "Senior didn't re-read carefully. Merged.", failMsg: "Senior re-read carefully. You're in a meeting now." },
      { label: "Schedule a quick sync to align on expectations", successChance: 0.85, scoreOnSuccess: 22, successMsg: "10-minute call resolved everything. Merged same day.", failMsg: "Senior couldn't make the sync for 3 days." },
    ],
  },
  {
    id: "tech_memory_spike",
    sector: "tech",
    prompt: "Memory at 99%. One more service will crash something. You...",
    choices: [
      { label: "Kill the highest-memory service that's non-critical", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Right call. Non-critical, freed memory, system stable.", failMsg: "'Non-critical' was billing. Weekend ruined." },
      { label: "Alert the team and wait for consensus", successChance: 0.55, scoreOnSuccess: 16, successMsg: "Team responded fast. Correct service killed.", failMsg: "Took 8 minutes. Something crashed during the thread." },
      { label: "Restart the whole host to clear everything", successChance: 0.35, scoreOnSuccess: 12, successMsg: "Nuclear option worked. System came back clean.", failMsg: "Persistent processes didn't restart cleanly. Big incident." },
      { label: "Add more memory to the VM without telling anyone", successChance: 0.40, scoreOnSuccess: 14, successMsg: "Bought enough time. Budget meeting later.", failMsg: "Hit cloud spend limit. Alert went to CFO." },
    ],
  },
  {
    id: "tech_worked_yesterday",
    sector: "tech",
    prompt: "Client says 'it worked yesterday.' Nothing changed on your end. You...",
    choices: [
      { label: "Check third-party APIs and external dependencies first", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Found upstream outage. Not your fault. Evidence sent.", failMsg: "All external services fine. Back to square one." },
      { label: "Ask the client what changed on their end", successChance: 0.70, scoreOnSuccess: 18, successMsg: "They updated a browser extension. Problem identified.", failMsg: "Client insisted they changed nothing. Still broken." },
      { label: "Reproduce the bug in staging immediately", successChance: 0.60, scoreOnSuccess: 18, successMsg: "Reproduced. Environment-specific bug found.", failMsg: "Cannot reproduce. 'Works on my machine' activated." },
      { label: "Roll back just in case, then investigate", successChance: 0.45, scoreOnSuccess: 14, successMsg: "Rollback resolved it. Cause identified next day.", failMsg: "Rollback broke something else. Deeper problems." },
    ],
  },

  // ── Medical scenarios ────────────────────────────────────────────────────
  {
    id: "med_google_diagnosis",
    sector: "medical",
    prompt: "A patient insists they have a rare disease they diagnosed themselves via Google. You...",
    choices: [
      { label: "Take the concern seriously, order relevant tests to rule it out", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Patient felt heard. Tests came back clean. Trust maintained.", failMsg: "Tests ordered unnecessary work. Mild budget flag." },
      { label: "Explain clearly why the symptoms don't fit", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Patient accepted the explanation. Good communication.", failMsg: "Patient left frustrated and left a one-star review." },
      { label: "Validate the diagnosis to avoid conflict", successChance: 0.20, scoreOnSuccess: 8, successMsg: "Patient was relieved. You'll address it next visit.", failMsg: "Patient told their whole family they had it. Now you have a problem." },
      { label: "Suggest a second opinion from a specialist", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Specialist confirmed original assessment. All clear.", failMsg: "Specialist also disregarded it. Patient very upset." },
    ],
  },
  {
    id: "med_supply_shortage",
    sector: "medical",
    prompt: "Critical supply is out of stock mid-shift. Three patients need it today. You...",
    choices: [
      { label: "Contact nearby facilities to borrow and arrange transfer", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Found supply two floors up. Crisis averted.", failMsg: "Nearby facilities also out. Wider shortage." },
      { label: "Use the approved substitution protocol", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Substitution worked as expected. Protocol exists for a reason.", failMsg: "One patient had a contraindication to the substitute. Escalated." },
      { label: "Prioritise the most critical patient and delay the others", successChance: 0.65, scoreOnSuccess: 17, successMsg: "Correct triage decision. Others waited safely.", failMsg: "Triage call questioned in review. Documentation saved you." },
      { label: "Escalate immediately to the charge nurse and attending physician", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Swift escalation. Supply located by leadership.", failMsg: "Leadership was handling a bigger emergency. Delayed." },
    ],
  },
  {
    id: "med_paperwork_mixup",
    sector: "medical",
    prompt: "You realise you have two patients' files mixed up. Treatment hasn't started yet. You...",
    choices: [
      { label: "Stop immediately, fix the files, flag the error in the system", successChance: 0.90, scoreOnSuccess: 24, successMsg: "Caught early. No harm. Transparency noted positively.", failMsg: "The flag triggered a mandatory incident report. Paperwork day." },
      { label: "Quietly fix it without reporting", successChance: 0.50, scoreOnSuccess: 12, successMsg: "Fixed before anyone noticed.", failMsg: "Audit trail caught the edit time discrepancy. Mandatory report anyway." },
      { label: "Double-check everything before proceeding cautiously", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Verification cleared. Proceeding correctly.", failMsg: "Double-check took too long. Charge nurse noticed." },
      { label: "Inform the patient and explain the administrative error", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Patient appreciated honesty. Trust maintained.", failMsg: "Patient was alarmed and requested a different provider." },
    ],
  },
  {
    id: "med_demanding_family",
    sector: "medical",
    prompt: "A patient's family is demanding a specialist right now. The specialist is in surgery. You...",
    choices: [
      { label: "Acknowledge their concern, give a realistic timeline, take notes", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Family calmed when given honest timeline and attention.", failMsg: "Timeline slipped. Family escalated to admin." },
      { label: "Page the specialist knowing they're unavailable", successChance: 0.30, scoreOnSuccess: 12, successMsg: "Specialist happened to be finishing up. Lucky.", failMsg: "Interrupted surgery prep. Specialist very unhappy." },
      { label: "Offer to have the charge nurse speak with them", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Charge nurse de-escalated effectively.", failMsg: "Charge nurse was also unavailable. You're on your own." },
      { label: "Explain the care plan in detail to ease their concerns", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Family felt informed and reassured.", failMsg: "One detail was outdated. Family noticed. More questions." },
    ],
  },
  {
    id: "med_inspection",
    sector: "medical",
    prompt: "A regulatory inspector walks in unannounced. You have 30 seconds to look busy. You...",
    choices: [
      { label: "Continue current tasks calmly — you have nothing to hide", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Inspector appreciated the calm professionalism.", failMsg: "One unlabelled bin nearby. Minor flag raised." },
      { label: "Quickly tidy the station and alert the charge nurse", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Station looked great. Clean bill of health.", failMsg: "Rushing looked suspicious. Inspector noted it." },
      { label: "Welcome the inspector and offer to answer any questions", successChance: 0.80, scoreOnSuccess: 20, successMsg: "Inspector liked the openness. Great report.", failMsg: "One question was about something you didn't know. Minor ding." },
      { label: "Pretend not to notice and hope they walk past", successChance: 0.25, scoreOnSuccess: 10, successMsg: "They were just looking for the bathroom.", failMsg: "They were specifically looking at your station. Noted." },
    ],
  },

  // ── Business scenarios ───────────────────────────────────────────────────
  {
    id: "biz_wrong_deck",
    sector: "business",
    prompt: "You opened the wrong presentation deck in front of the client. It's last quarter's numbers. You...",
    choices: [
      { label: "Acknowledge the error immediately and pull the right file", successChance: 0.80, scoreOnSuccess: 20, successMsg: "Client appreciated the composure. Presentation recovered.", failMsg: "Right file was corrupted. Today is not your day." },
      { label: "Smooth talk your way through the old deck and hope they don't notice", successChance: 0.25, scoreOnSuccess: 10, successMsg: "They didn't notice. Questionable ethics, good outcome.", failMsg: "They noticed immediately. Very uncomfortable." },
      { label: "Turn it into a 'compare and contrast' opportunity", successChance: 0.55, scoreOnSuccess: 16, successMsg: "Creative spin. They liked the year-over-year framing.", failMsg: "Old numbers were bad. Now they're asking about them." },
      { label: "Take a 5-minute break to sort the file situation", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Client used the break to check emails. You were ready.", failMsg: "Client was impatient. Vibe was off for the whole meeting." },
    ],
  },
  {
    id: "biz_client_ghost",
    sector: "business",
    prompt: "Your biggest client hasn't responded in 3 weeks. Contract renews in 10 days. You...",
    choices: [
      { label: "Call them directly and have a frank conversation", successChance: 0.75, scoreOnSuccess: 20, successMsg: "They'd been on holiday. Renewing. All good.", failMsg: "They'd already decided not to renew. At least you know." },
      { label: "Send a warm follow-up email with a no-pressure option to exit", successChance: 0.65, scoreOnSuccess: 17, successMsg: "Got a response. They needed time. Renewing.", failMsg: "No response. You triggered the exit clause language." },
      { label: "Escalate to your manager to send a senior outreach", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Senior relationship worked. Response within hours.", failMsg: "Senior was also ignored. Red flag confirmed." },
      { label: "Prepare for non-renewal and start diversifying", successChance: 0.80, scoreOnSuccess: 20, successMsg: "They renewed, but you also have new pipeline. Win either way.", failMsg: "They renewed and you wasted a week on diversification planning." },
    ],
  },
  {
    id: "biz_budget_freeze",
    sector: "business",
    prompt: "All discretionary spending is frozen effective immediately. You have a team lunch booked. You...",
    choices: [
      { label: "Cancel the lunch and communicate to the team transparently", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Team respected the transparency. Morale stayed fine.", failMsg: "Team was disappointed. One person took it personally." },
      { label: "Submit the receipt under an existing approved category", successChance: 0.30, scoreOnSuccess: 10, successMsg: "Finance didn't question it.", failMsg: "Finance flagged it. Awkward audit conversation." },
      { label: "Move it to next month when freeze might lift", successChance: 0.60, scoreOnSuccess: 16, successMsg: "Freeze lifted. Lunch happened. Win delayed is still a win.", failMsg: "Freeze extended indefinitely. Lunch rescheduled forever." },
      { label: "Pay for it yourself as a team gesture", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Team was touched. Loyalty points earned.", failMsg: "The restaurant charged more than expected. Expensive loyalty." },
    ],
  },
  {
    id: "biz_merger_rumour",
    sector: "business",
    prompt: "A merger rumour is spreading on LinkedIn. Your team is asking you directly. You...",
    choices: [
      { label: "Be honest that you can't confirm or deny, but will advocate for the team", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Team appreciated the candour within limits.", failMsg: "Team took 'can't confirm' as confirmation. Panic ensued." },
      { label: "Deny it confidently to keep morale up", successChance: 0.35, scoreOnSuccess: 12, successMsg: "Calmed them down. Rumour was false anyway.", failMsg: "Merger was announced next week. Your credibility: destroyed." },
      { label: "Escalate to leadership for an official statement", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Statement released. Team felt informed.", failMsg: "Leadership said nothing for 5 days. Speculation got worse." },
      { label: "Redirect to work and promise updates when available", successChance: 0.65, scoreOnSuccess: 17, successMsg: "Professionalism noted. Team focused.", failMsg: "One person quit that day. Pre-emptive self-protection." },
    ],
  },
  {
    id: "biz_expense_fake",
    sector: "business",
    prompt: "You spot what looks like a fabricated expense in a colleague's report you're approving. You...",
    choices: [
      { label: "Flag it to finance and HR with documentation", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Handled correctly. Company protected. You were thanked.", failMsg: "Turned out to be a legit edge-case receipt. Awkward." },
      { label: "Ask the colleague directly before escalating", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Was a receipt formatting issue. Cleared up with a note.", failMsg: "Colleague became defensive. Escalated to HR anyway." },
      { label: "Reject the expense without explanation", successChance: 0.40, scoreOnSuccess: 13, successMsg: "They didn't push back. Issue quietly died.", failMsg: "Colleague appealed. Now you have to explain the rejection." },
      { label: "Approve it — not your problem", successChance: 0.10, scoreOnSuccess: 5, successMsg: "Finance caught it. You're just the approver. Fine.", failMsg: "Finance traced the approval chain to you. Uncomfortable questions." },
    ],
  },

  // ── Legal scenarios ──────────────────────────────────────────────────────
  {
    id: "legal_client_lied",
    sector: "legal",
    prompt: "Your client just admitted they weren't fully honest in their earlier deposition. Court is tomorrow. You...",
    choices: [
      { label: "Review obligations under professional conduct rules immediately", successChance: 0.85, scoreOnSuccess: 24, successMsg: "Acted within ethical boundaries. Case managed properly.", failMsg: "Obligation interpretation was debated. Uncomfortable review." },
      { label: "Advise the client on the risks and document everything", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Client understood. Documentation protected you both.", failMsg: "Client went rogue anyway. You were ahead of it, thankfully." },
      { label: "Request a continuance to reassess the case", successChance: 0.60, scoreOnSuccess: 16, successMsg: "Judge granted it. Bought time to restrategise.", failMsg: "Judge denied. Back to tomorrow's timeline." },
      { label: "Proceed as planned and hope opposing counsel doesn't catch it", successChance: 0.20, scoreOnSuccess: 8, successMsg: "Opposing counsel missed it. This time.", failMsg: "Opposing counsel caught it. Case, credibility, both damaged." },
    ],
  },
  {
    id: "legal_opposing_motion",
    sector: "legal",
    prompt: "Opposing counsel filed a last-minute motion to dismiss your strongest argument. You...",
    choices: [
      { label: "File an emergency opposition with supporting case law", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Motion denied. Preparation paid off.", failMsg: "Judge found opposing argument compelling. Argument suppressed." },
      { label: "Request more time to respond properly", successChance: 0.65, scoreOnSuccess: 17, successMsg: "Extension granted. Response was strong.", failMsg: "Extension denied. You filed hastily." },
      { label: "Pivot to secondary arguments and abandon the flagged one", successChance: 0.60, scoreOnSuccess: 16, successMsg: "Secondary arguments held up. Case survived.", failMsg: "Secondary arguments were weaker. Rough day." },
      { label: "Call opposing counsel and negotiate", successChance: 0.45, scoreOnSuccess: 14, successMsg: "They agreed to a narrower motion. Win.", failMsg: "Opposing counsel used the call to fish for information." },
    ],
  },
  {
    id: "legal_billing_dispute",
    sector: "legal",
    prompt: "A client is disputing 12 hours on your invoice calling them 'unnecessary.' You...",
    choices: [
      { label: "Provide detailed time entry notes defending each hour", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Notes were detailed. Client accepted 10 of 12 hours.", failMsg: "Notes were vague. Client rejected all 12." },
      { label: "Offer to reduce 3 hours as a goodwill gesture", successChance: 0.75, scoreOnSuccess: 18, successMsg: "Client accepted. Relationship preserved.", failMsg: "Client pushed for more concessions after the gesture." },
      { label: "Escalate to the billing partner", successChance: 0.65, scoreOnSuccess: 17, successMsg: "Partner backed you up with context.", failMsg: "Partner reduced more than you expected. Firm ate the loss." },
      { label: "Stand firm — the hours were necessary", successChance: 0.55, scoreOnSuccess: 16, successMsg: "Client backed down. Respect earned.", failMsg: "Client delayed payment and complained to the bar association." },
    ],
  },
  {
    id: "legal_judge_mood",
    sector: "legal",
    prompt: "The judge appears to be in a surprisingly good mood. Your argument has a weak spot. You...",
    choices: [
      { label: "Push the argument harder while the room is receptive", successChance: 0.65, scoreOnSuccess: 18, successMsg: "Judge ruled in your favour. Rare window capitalised on.", failMsg: "Pushed too hard. Judge cooled off noticeably." },
      { label: "Stick to your prepared argument, nothing fancy", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Solid delivery. Predictable success.", failMsg: "Weak spot was noticed. Predictable failure." },
      { label: "Address the weak spot proactively before opposing counsel can", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Pre-emptive honesty impressed the judge.", failMsg: "Highlighting weakness invited more scrutiny." },
      { label: "Make a slightly provocative procedural motion while you have goodwill", successChance: 0.35, scoreOnSuccess: 13, successMsg: "Motion granted. Bold move.", failMsg: "Goodwill evaporated. Motion denied with a look." },
    ],
  },

  // ── Service scenarios ────────────────────────────────────────────────────
  {
    id: "service_table_of_14",
    sector: "service",
    prompt: "A table of 14 walks in 5 minutes before close. You...",
    choices: [
      { label: "Seat them with a smile — service is service", successChance: 0.75, scoreOnSuccess: 20, successMsg: "They were grateful and tipped extremely well.", failMsg: "They stayed 2.5 hours. Kitchen staff furious." },
      { label: "Explain you're closing but offer a simplified menu", successChance: 0.70, scoreOnSuccess: 18, successMsg: "They agreed. Efficient service. Out in 45 minutes.", failMsg: "They wanted the full menu. Conflict ensued." },
      { label: "Apologise and say you're fully booked", successChance: 0.55, scoreOnSuccess: 15, successMsg: "They left gracefully. Not all tables are worth it.", failMsg: "Half the table were regulars. One wrote a review." },
      { label: "Offer takeaway as a compromise", successChance: 0.65, scoreOnSuccess: 17, successMsg: "They were happy with takeaway. Easy resolution.", failMsg: "One person was vegan. You were out of vegan options." },
    ],
  },
  {
    id: "service_eaten_wrong_dish",
    sector: "service",
    prompt: "A customer ate the entire wrong dish and is now complaining it wasn't what they ordered. You...",
    choices: [
      { label: "Apologise sincerely and offer to remake the correct order on the house", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Customer was satisfied. Returned the following week.", failMsg: "Customer wasn't hungry anymore but still wanted the new dish wrapped up." },
      { label: "Politely note they ate the whole thing before complaining", successChance: 0.30, scoreOnSuccess: 12, successMsg: "Customer laughed it off. Honest moment.", failMsg: "Customer escalated to manager. You were technically right but still lost." },
      { label: "Give a partial discount and move on", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Fair compromise. Customer accepted.", failMsg: "Customer wanted a full refund. Negotiation stalled." },
      { label: "Blame the kitchen and send over the manager", successChance: 0.45, scoreOnSuccess: 14, successMsg: "Manager handled it well. Issue resolved.", failMsg: "Kitchen heard you. Atmosphere was tense for the rest of the shift." },
    ],
  },
  {
    id: "service_vip_yelps",
    sector: "service",
    prompt: "A VIP customer keeps narrating what they'll write in their review. They're filming you. You...",
    choices: [
      { label: "Stay completely professional and let your service speak for itself", successChance: 0.85, scoreOnSuccess: 22, successMsg: "5-star review posted. Genuine praise.", failMsg: "One thing went slightly wrong. It was the only thing reviewed." },
      { label: "Provide extra attentive service and small unexpected touches", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Review mentioned the personal touches specifically.", failMsg: "Extra attentiveness came across as overeager. Noted negatively." },
      { label: "Ask them to put the phone down per restaurant policy", successChance: 0.45, scoreOnSuccess: 15, successMsg: "They respected the policy. Filming stopped.", failMsg: "No such policy. Confrontation filmed and posted." },
      { label: "Quietly inform your supervisor so you have backup", successChance: 0.75, scoreOnSuccess: 18, successMsg: "Supervisor handled it smoothly.", failMsg: "Supervisor was also uncomfortable with cameras. Didn't help." },
    ],
  },
  {
    id: "service_kitchen_fire",
    sector: "service",
    prompt: "A small kitchen fire starts. Contained, but smoke in the dining room is noticeable. You...",
    choices: [
      { label: "Calmly inform guests, assist evacuation if needed, follow protocol", successChance: 0.90, scoreOnSuccess: 24, successMsg: "Handled textbook. Guests were calm. Resolved in 10 minutes.", failMsg: "Evacuation was slightly chaotic. One guest complained." },
      { label: "Pretend nothing is wrong and keep serving", successChance: 0.15, scoreOnSuccess: 8, successMsg: "Fire was out in 2 minutes. Guests didn't notice. Wild success.", failMsg: "Guest noticed smoke. Full panic. Do not do this." },
      { label: "Apologise, offer complimentary drinks, and monitor the situation", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Guests appreciated the comps. Incident forgiven.", failMsg: "Someone was allergic to the complimentary wine. New problem." },
      { label: "Alert the fire team immediately even if it looks contained", successChance: 0.80, scoreOnSuccess: 20, successMsg: "Fire team confirmed it was contained. Better safe.", failMsg: "Unnecessary call. Small fine for false alarm." },
    ],
  },

  // ── Trade scenarios ──────────────────────────────────────────────────────
  {
    id: "trade_wrong_parts",
    sector: "trade",
    prompt: "The wrong parts arrived for a job that starts in 2 hours. You...",
    choices: [
      { label: "Call the supplier immediately and escalate to expedited delivery", successChance: 0.70, scoreOnSuccess: 20, successMsg: "Expedited order arrived in time. Supplier paid rush fee.", failMsg: "No expedited availability. Job delayed 2 days." },
      { label: "Check if a colleague on another job has the parts you need", successChance: 0.65, scoreOnSuccess: 17, successMsg: "Found a match. Parts borrowed. Job saved.", failMsg: "Colleague needed theirs too. No luck." },
      { label: "Adapt the job to what you have and document the substitution", successChance: 0.50, scoreOnSuccess: 15, successMsg: "Client accepted the substitution. Notes protected you.", failMsg: "Substitution wasn't code-compliant. Job had to be redone." },
      { label: "Notify the client immediately and set realistic expectations", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Client rescheduled without penalty. Transparency valued.", failMsg: "Client was unhappy but accepted it. Margin reduced." },
    ],
  },
  {
    id: "trade_scope_creep",
    sector: "trade",
    prompt: "The client is adding requests mid-job without mentioning payment. You...",
    choices: [
      { label: "Note additions, complete job, present a change order at the end", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Client paid change order without issue.", failMsg: "Client disputed the extras. Said they were 'implied'." },
      { label: "Stop and address the scope change directly before continuing", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Client agreed to updated terms. Clean.", failMsg: "Client was offended. Vibe soured." },
      { label: "Do the additions for goodwill and hope for repeat business", successChance: 0.55, scoreOnSuccess: 14, successMsg: "Client referred two new jobs. Good investment.", failMsg: "No referral, no bonus. Just free work." },
      { label: "Decline the additions politely and reference the original contract", successChance: 0.70, scoreOnSuccess: 18, successMsg: "Client respected the boundary. Additions scheduled separately.", failMsg: "Client found someone else for the extras. Lost that revenue." },
    ],
  },
  {
    id: "trade_equipment_failure",
    sector: "trade",
    prompt: "Your primary tool breaks mid-job. Client is watching. You...",
    choices: [
      { label: "Use your backup tool and continue without losing composure", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Client barely noticed. Professionalism showed.", failMsg: "Backup was also degraded. Slower finish noticed." },
      { label: "Stop, explain the situation, give a revised timeline", successChance: 0.75, scoreOnSuccess: 18, successMsg: "Client appreciated honesty. No penalty.", failMsg: "Client wanted it done today. Tension." },
      { label: "Call a colleague to bring replacement equipment", successChance: 0.65, scoreOnSuccess: 17, successMsg: "Colleague arrived in 40 minutes. Job completed.", failMsg: "Colleague was on the other side of town. 2-hour delay." },
      { label: "Continue with the broken tool carefully and finish", successChance: 0.40, scoreOnSuccess: 13, successMsg: "Somehow finished. Do not recommend.", failMsg: "Tool failed completely. Worse mess. More time." },
    ],
  },
  {
    id: "freelance_scope_creep_interview",
    sector: "freelance",
    prompt: "A client asks for 'one small extra' after the quote is already approved. You...",
    choices: [
      { label: "Politely quote the extra work as a change request", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Boundary set. Client approved the extra budget.", failMsg: "Client complained, but the scope stayed clear." },
      { label: "Do it free to keep them happy", successChance: 0.45, scoreOnSuccess: 12, successMsg: "They appreciated it and tipped. Rare.", failMsg: "They asked for five more free extras." },
      { label: "Ignore the message until tomorrow", successChance: 0.25, scoreOnSuccess: 8, successMsg: "They forgot. Somehow.", failMsg: "They escalated before lunch." },
      { label: "Explain what is included and offer options", successChance: 0.85, scoreOnSuccess: 24, successMsg: "Professional and clear. Client trusted you more.", failMsg: "Client wanted magic, not options." },
    ],
  },
  {
    id: "freelance_late_invoice",
    sector: "freelance",
    prompt: "Your invoice is 12 days late and the client says accounting is 'looking into it.' You...",
    choices: [
      { label: "Pause new deliverables until payment clears", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Payment arrived within hours. Funny how that works.", failMsg: "Client grumbled, but no more free work leaked." },
      { label: "Send a calm reminder with invoice details and due date", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Accounting found it. Paid today.", failMsg: "They asked you to resend everything again." },
      { label: "Keep working because the relationship matters", successChance: 0.35, scoreOnSuccess: 10, successMsg: "Client finally paid and booked more work.", failMsg: "Now two invoices are late." },
      { label: "Threaten them publicly", successChance: 0.10, scoreOnSuccess: 5, successMsg: "They paid to make it stop.", failMsg: "They blocked you and disputed the invoice." },
    ],
  },
  {
    id: "freelance_rush_job",
    sector: "freelance",
    prompt: "A rush job lands with a huge fee, impossible deadline, and vague brief. You...",
    choices: [
      { label: "Accept only after locking scope and deposit", successChance: 0.80, scoreOnSuccess: 22, successMsg: "Clean terms. Big payday.", failMsg: "Brief was still messy, but deposit softened the pain." },
      { label: "Accept immediately before they change their mind", successChance: 0.40, scoreOnSuccess: 12, successMsg: "You pulled an all-nighter and won.", failMsg: "Scope exploded. Your calendar is ash." },
      { label: "Negotiate a smaller first milestone", successChance: 0.75, scoreOnSuccess: 20, successMsg: "Smart slice. Client agreed.", failMsg: "Client wanted everything yesterday." },
      { label: "Decline politely and refer someone else", successChance: 0.70, scoreOnSuccess: 18, successMsg: "They respected honesty and came back later.", failMsg: "Fee walked away. Peace remained." },
    ],
  },
  {
    id: "freelance_portfolio_test",
    sector: "freelance",
    prompt: "A prospect asks for unpaid test work 'to see your style.' You...",
    choices: [
      { label: "Offer a paid mini-sample instead", successChance: 0.75, scoreOnSuccess: 20, successMsg: "They agreed. Serious client confirmed.", failMsg: "They vanished. Probably for the best." },
      { label: "Send relevant portfolio examples", successChance: 0.85, scoreOnSuccess: 22, successMsg: "Portfolio did the talking. Call booked.", failMsg: "They wanted something oddly specific." },
      { label: "Do the unpaid test immediately", successChance: 0.30, scoreOnSuccess: 10, successMsg: "They hired you. Lucky break.", failMsg: "They used it and disappeared." },
      { label: "Reply with your full rate card and no context", successChance: 0.45, scoreOnSuccess: 12, successMsg: "They appreciated directness.", failMsg: "They called it too expensive without reading." },
    ],
  },
];
