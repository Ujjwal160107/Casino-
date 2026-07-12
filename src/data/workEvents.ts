import type { WorkEvent } from "../services/jobService";

export const WORK_EVENTS: WorkEvent[] = [
  // ── Existing events (kept unchanged) ──────────────────────────────────────
  {
    id: "tech_crash", sector: "tech", title: "Server Crash!",
    description: "Production database is down! What do you do?",
    choices: [
      { label: "Hotfix in Prod", style: "danger", successChance: 40, successMsg: "You saved the day! Bonus!", failMsg: "You made it worse. Much worse.", outcome: { money: 2.0, stress: 20 } },
      { label: "Follow Protocol", style: "primary", successChance: 90, successMsg: "Service restored safely.", failMsg: "It took too long.", outcome: { money: 1.0, stress: 5 } }
    ]
  },
  {
    id: "tech_bug", sector: "tech", title: "Critical Bug",
    description: "A user found a critical bug in your code.",
    choices: [
      { label: "Blame the User", style: "secondary", successChance: 10, successMsg: "They believed you!", failMsg: "HR wants a word.", outcome: { money: 0.5, stress: 30 } },
      { label: "Fix it now", style: "success", successChance: 80, successMsg: "Bug squashed.", failMsg: "You introduced 3 new bugs.", outcome: { money: 1.1, stress: 10 } }
    ]
  },
  {
    id: "med_emergency", sector: "medical", title: "Emergency!",
    description: "A patient is crashing in the ER!",
    choices: [
      { label: "CPR", style: "danger", successChance: 60, successMsg: "Patient stabilized!", failMsg: "It was too late...", outcome: { money: 1.5, stress: 25 } },
      { label: "Call Attending", style: "primary", successChance: 100, successMsg: "The senior doctor took over.", failMsg: "N/A", outcome: { money: 0.8, stress: 0 } }
    ]
  },
  {
    id: "biz_deal", sector: "business", title: "The Big Deal",
    description: "A client wants to close a risky deal.",
    choices: [
      { label: "Sign it!", style: "success", successChance: 50, successMsg: "Huge commission!", failMsg: "The company lost millions.", outcome: { money: 3.0, stress: 40 } },
      { label: "Review first", style: "secondary", successChance: 90, successMsg: "Smart move. Safe deal.", failMsg: "Client walked away.", outcome: { money: 1.0, stress: 5 } }
    ]
  },

  // ── Tech events ───────────────────────────────────────────────────────────
  {
    id: "tech_blame_game", sector: "tech", title: "The Blame Game",
    description: "The outage was blamed on your service. Slack is a warzone. You have 5 minutes before the post-mortem.",
    choices: [
      { label: "Pull logs and prove your service was fine", style: "primary", successChance: 75, successMsg: "Logs cleared you. Incident blamed on infra. Hero status.", failMsg: "Logs were ambiguous. You're still the suspect.", outcome: { money: 1.3, stress: 10 } },
      { label: "Accept partial responsibility and redirect", style: "success", successChance: 80, successMsg: "Mature response. Team respected it.", failMsg: "Took on too much. Now you own the whole fix.", outcome: { money: 1.0, stress: 8 } },
      { label: "Counter-blame the infra team loudly", style: "danger", successChance: 30, successMsg: "Infra team was actually at fault. Rare win.", failMsg: "Infra team pulled receipts. Yours were worse.", outcome: { money: 0.8, stress: 35 } }
    ]
  },
  {
    id: "tech_ai_hallucination", sector: "tech", title: "AI Lied to the Client",
    description: "The AI tool you demoed gave completely fabricated output. Client is asking follow-up questions about something that doesn't exist.",
    choices: [
      { label: "Come clean and fix it live", style: "primary", successChance: 80, successMsg: "Client appreciated honesty. Relationship intact.", failMsg: "Fixing it revealed more issues. Rough hour.", outcome: { money: 1.1, stress: 12 } },
      { label: "Stall with 'that feature is in beta'", style: "secondary", successChance: 45, successMsg: "Client accepted. You have 2 weeks to make it real.", failMsg: "Client's CTO was in the call. Asked for the beta URL.", outcome: { money: 0.9, stress: 20 } },
      { label: "Blame the demo environment", style: "danger", successChance: 35, successMsg: "Client bought it. Demo environments are unreliable.", failMsg: "Client said 'odd, it happened in prod too.'", outcome: { money: 0.7, stress: 30 } }
    ]
  },
  {
    id: "tech_zero_day", sector: "tech", title: "Zero-Day Discovered",
    description: "A security researcher found a zero-day in your system. They messaged you directly before going public.",
    choices: [
      { label: "Patch it immediately and report through proper channels", style: "success", successChance: 85, successMsg: "Fixed before disclosure. Company avoided headlines.", failMsg: "Patch introduced a regression. Harder to fix now.", outcome: { money: 1.4, stress: 15 } },
      { label: "Offer the researcher a bug bounty to buy time", style: "primary", successChance: 70, successMsg: "Researcher agreed. Bought 48 hours.", failMsg: "Researcher found no bounty program existed. Unhappy.", outcome: { money: 1.1, stress: 20 } },
      { label: "Ignore it and hope they forget", style: "danger", successChance: 10, successMsg: "They forgot somehow. This was a terrible choice.", failMsg: "It's on TechCrunch. It's Monday morning.", outcome: { money: 0.3, stress: 50 }, critical: true }
    ]
  },

  // ── Medical events ────────────────────────────────────────────────────────
  {
    id: "med_drug_shortage", sector: "medical", title: "Drug Shortage",
    description: "The medication for three patients is completely out. All need it today.",
    choices: [
      { label: "Contact nearby facilities to borrow supply", style: "primary", successChance: 70, successMsg: "Found supply two floors up. Crisis averted.", failMsg: "Nearby facilities also out. Wider shortage.", outcome: { money: 1.2, stress: 15 } },
      { label: "Use approved substitution protocol", style: "success", successChance: 85, successMsg: "Substitution worked. Protocol exists for a reason.", failMsg: "One patient had a contraindication. Escalated.", outcome: { money: 1.1, stress: 10 } },
      { label: "Escalate immediately to charge nurse and attending", style: "primary", successChance: 80, successMsg: "Leadership located supply quickly.", failMsg: "Leadership was handling a bigger emergency. Delayed.", outcome: { money: 1.0, stress: 8 } }
    ]
  },
  {
    id: "med_file_mixup", sector: "medical", title: "File Mix-Up",
    description: "You realise you have two patients' files switched. Treatment hasn't started.",
    choices: [
      { label: "Stop, fix files, flag the error in the system", style: "success", successChance: 90, successMsg: "Caught early. Transparency noted positively.", failMsg: "Flag triggered mandatory incident report. Long day.", outcome: { money: 1.2, stress: 5 } },
      { label: "Quietly fix it without reporting", style: "secondary", successChance: 55, successMsg: "Fixed before anyone noticed.", failMsg: "Audit trail caught the edit timestamp. Mandatory report anyway.", outcome: { money: 0.9, stress: 20 } },
      { label: "Inform the patient and explain the error", style: "primary", successChance: 70, successMsg: "Patient appreciated honesty. Trust maintained.", failMsg: "Patient was alarmed and requested a different provider.", outcome: { money: 1.0, stress: 12 } }
    ]
  },
  {
    id: "med_family_demands", sector: "medical", title: "Demanding Family",
    description: "Patient's family wants a specialist right now. Specialist is in surgery.",
    choices: [
      { label: "Acknowledge concern, give realistic timeline", style: "success", successChance: 80, successMsg: "Family calmed when given honest attention.", failMsg: "Timeline slipped. Family escalated to admin.", outcome: { money: 1.1, stress: 8 } },
      { label: "Have the charge nurse speak with them", style: "primary", successChance: 70, successMsg: "Charge nurse de-escalated effectively.", failMsg: "Charge nurse was unavailable. You're still on it.", outcome: { money: 1.0, stress: 12 } },
      { label: "Page the specialist anyway", style: "danger", successChance: 30, successMsg: "Specialist happened to be finishing up.", failMsg: "Interrupted surgery prep. Specialist very unhappy.", outcome: { money: 0.8, stress: 30 }, critical: true }
    ]
  },
  {
    id: "med_inspection", sector: "medical", title: "Unannounced Inspection",
    description: "A regulatory inspector just walked in. You have 30 seconds.",
    choices: [
      { label: "Continue calmly — you have nothing to hide", style: "success", successChance: 85, successMsg: "Inspector appreciated the professionalism.", failMsg: "One unlabelled bin visible. Minor flag.", outcome: { money: 1.2, stress: 5 } },
      { label: "Welcome the inspector and offer to answer questions", style: "primary", successChance: 80, successMsg: "Openness noted. Great report.", failMsg: "One question was about something you didn't know.", outcome: { money: 1.1, stress: 8 } },
      { label: "Quickly tidy and alert the charge nurse", style: "secondary", successChance: 65, successMsg: "Station looked great. Clean bill of health.", failMsg: "Rushing looked suspicious. Noted.", outcome: { money: 1.0, stress: 15 } }
    ]
  },

  // ── Business events ───────────────────────────────────────────────────────
  {
    id: "biz_budget_freeze", sector: "business", title: "Budget Freeze",
    description: "All discretionary spending is frozen effective now. You have a team lunch in 2 hours.",
    choices: [
      { label: "Cancel and communicate transparently to the team", style: "success", successChance: 85, successMsg: "Team respected transparency. Morale stayed fine.", failMsg: "Team was disappointed. One person took it personally.", outcome: { money: 1.0, stress: 5 } },
      { label: "Move it to next month", style: "primary", successChance: 65, successMsg: "Freeze lifted. Lunch happened.", failMsg: "Freeze extended indefinitely.", outcome: { money: 1.0, stress: 10 } },
      { label: "Submit under an existing approved category", style: "danger", successChance: 30, successMsg: "Finance didn't question it.", failMsg: "Finance flagged it. Audit conversation.", outcome: { money: 1.0, stress: 25 } }
    ]
  },
  {
    id: "biz_merger_rumour", sector: "business", title: "Merger Rumour",
    description: "A merger rumour is spreading on LinkedIn. Your team is asking you directly.",
    choices: [
      { label: "Be honest that you can't confirm, but will advocate for the team", style: "success", successChance: 80, successMsg: "Team appreciated the candour within limits.", failMsg: "Team took 'can't confirm' as confirmation.", outcome: { money: 1.1, stress: 10 } },
      { label: "Escalate to leadership for an official statement", style: "primary", successChance: 70, successMsg: "Statement released. Team felt informed.", failMsg: "Leadership said nothing for 5 days. Worse.", outcome: { money: 1.0, stress: 15 } },
      { label: "Deny it confidently to keep morale up", style: "danger", successChance: 35, successMsg: "Calmed them. Rumour was false anyway.", failMsg: "Merger announced next week. Your credibility: gone.", outcome: { money: 0.9, stress: 35 }, critical: true }
    ]
  },
  {
    id: "biz_client_ghost", sector: "business", title: "Ghost Client",
    description: "Biggest client hasn't responded in 3 weeks. Contract renews in 10 days.",
    choices: [
      { label: "Call them directly", style: "primary", successChance: 75, successMsg: "They were on holiday. Renewing.", failMsg: "They'd already decided not to renew.", outcome: { money: 1.3, stress: 10 } },
      { label: "Send a warm no-pressure follow-up email", style: "success", successChance: 65, successMsg: "Got response. Renewing.", failMsg: "No response. Exit clause triggered.", outcome: { money: 1.1, stress: 12 } },
      { label: "Prepare for non-renewal and diversify", style: "secondary", successChance: 80, successMsg: "They renewed AND you have new pipeline.", failMsg: "They renewed and you wasted a week.", outcome: { money: 1.0, stress: 8 } }
    ]
  },
  {
    id: "biz_presentation_disaster", sector: "business", title: "Presentation Disaster",
    description: "Your slide deck corrupted 5 minutes before presenting to investors.",
    choices: [
      { label: "Present from memory with confidence", style: "danger", successChance: 50, successMsg: "Investors were impressed by your command of the material.", failMsg: "Missed 3 key figures. Investors asked follow-ups you couldn't answer.", outcome: { money: 1.5, stress: 35 } },
      { label: "Delay 10 minutes and recover what you can", style: "primary", successChance: 70, successMsg: "Partial deck recovered. Presentation ran well.", failMsg: "Delay made investors impatient. Presentation rushed.", outcome: { money: 1.1, stress: 20 } },
      { label: "Send slides by email and use the meeting as a discussion", style: "success", successChance: 80, successMsg: "Investors preferred the open format. Great meeting.", failMsg: "Investors expected a formal presentation. Disappointed.", outcome: { money: 1.2, stress: 15 } }
    ]
  },

  // ── Legal events ──────────────────────────────────────────────────────────
  {
    id: "legal_client_lied", sector: "legal", title: "Client Wasn't Honest",
    description: "Your client just admitted they weren't fully truthful in their deposition. Court is tomorrow.",
    choices: [
      { label: "Review obligations under professional conduct rules immediately", style: "success", successChance: 85, successMsg: "Acted within ethical boundaries. Case managed.", failMsg: "Obligation interpretation was debated. Uncomfortable.", outcome: { money: 1.2, stress: 15 } },
      { label: "Advise the client on risks and document everything", style: "primary", successChance: 80, successMsg: "Client understood. Documentation protected you.", failMsg: "Client went rogue anyway. But you were protected.", outcome: { money: 1.1, stress: 20 } },
      { label: "Proceed as planned and hope opposing counsel misses it", style: "danger", successChance: 20, successMsg: "Opposing counsel missed it. For now.", failMsg: "Opposing counsel caught it. Case and credibility damaged.", outcome: { money: 0.6, stress: 50 }, critical: true }
    ]
  },
  {
    id: "legal_opposing_motion", sector: "legal", title: "Last-Minute Motion",
    description: "Opposing counsel filed a last-minute motion to dismiss your strongest argument.",
    choices: [
      { label: "File emergency opposition with supporting case law", style: "primary", successChance: 75, successMsg: "Motion denied. Preparation paid off.", failMsg: "Judge found the argument compelling. Argument suppressed.", outcome: { money: 1.3, stress: 20 } },
      { label: "Request more time to respond properly", style: "success", successChance: 65, successMsg: "Extension granted. Response was strong.", failMsg: "Extension denied. Filed hastily.", outcome: { money: 1.0, stress: 15 } },
      { label: "Pivot to secondary arguments and abandon the flagged one", style: "secondary", successChance: 60, successMsg: "Secondary arguments held up.", failMsg: "Secondary arguments were weaker.", outcome: { money: 0.9, stress: 20 } }
    ]
  },
  {
    id: "legal_billing_dispute", sector: "legal", title: "Billing Dispute",
    description: "Client is disputing 12 hours on your invoice as 'unnecessary.'",
    choices: [
      { label: "Provide detailed time entry notes defending each hour", style: "success", successChance: 80, successMsg: "Notes were thorough. Client accepted 10 of 12.", failMsg: "Notes were vague. Client rejected all 12.", outcome: { money: 1.2, stress: 10 } },
      { label: "Offer to reduce 3 hours as goodwill", style: "primary", successChance: 75, successMsg: "Client accepted. Relationship preserved.", failMsg: "Client pushed for more after the gesture.", outcome: { money: 0.85, stress: 12 } },
      { label: "Stand firm — the hours were necessary", style: "danger", successChance: 55, successMsg: "Client backed down. Respect earned.", failMsg: "Client delayed payment and complained to the bar association.", outcome: { money: 1.0, stress: 30 } }
    ]
  },
  {
    id: "legal_judge_mood", sector: "legal", title: "Rare Good Judge Day",
    description: "The judge appears to be in a surprisingly good mood. Your argument has a weak spot.",
    choices: [
      { label: "Address the weak spot proactively", style: "success", successChance: 80, successMsg: "Pre-emptive honesty impressed the judge.", failMsg: "Highlighting the weakness invited more scrutiny.", outcome: { money: 1.3, stress: 10 } },
      { label: "Push the argument harder while the room is receptive", style: "primary", successChance: 60, successMsg: "Judge ruled in your favour. Window capitalised on.", failMsg: "Pushed too hard. Judge cooled off noticeably.", outcome: { money: 1.2, stress: 20 } },
      { label: "Stick to your prepared argument, nothing fancy", style: "secondary", successChance: 75, successMsg: "Solid delivery. Predictable success.", failMsg: "Weak spot was noticed. Predictable failure.", outcome: { money: 1.0, stress: 15 } }
    ]
  },
  {
    id: "legal_evidence_leak", sector: "legal", title: "Evidence Nearly Leaked",
    description: "Sensitive evidence was almost attached to a public filing by mistake.",
    choices: [
      { label: "Retract immediately with a corrected filing", style: "success", successChance: 85, successMsg: "Corrected before anyone noticed. Crisis averted.", failMsg: "Opposing counsel had already seen the original.", outcome: { money: 1.2, stress: 10 } },
      { label: "Notify the court directly and explain", style: "primary", successChance: 75, successMsg: "Court sealed the document. Handled professionally.", failMsg: "Notification triggered a broader review.", outcome: { money: 1.1, stress: 20 } },
      { label: "Hope nobody opened the attachment yet", style: "danger", successChance: 25, successMsg: "Nobody opened it. You got extremely lucky.", failMsg: "Opposing counsel opened it immediately. Full crisis.", outcome: { money: 0.5, stress: 45 }, critical: true }
    ]
  },

  // ── Service events ────────────────────────────────────────────────────────
  {
    id: "service_health_inspector", sector: "service", title: "Unannounced Health Inspector",
    description: "A health inspector just walked in during the dinner rush.",
    choices: [
      { label: "Continue calmly — everything should be in order", style: "success", successChance: 80, successMsg: "Passed with flying colours.", failMsg: "One unlabelled container found. Minor deduction.", outcome: { money: 1.2, stress: 10 } },
      { label: "Alert the kitchen immediately", style: "primary", successChance: 70, successMsg: "Kitchen was ready. Smooth inspection.", failMsg: "Alert caused a brief chaos that the inspector noticed.", outcome: { money: 1.0, stress: 15 } },
      { label: "Offer the inspector a complimentary meal first", style: "danger", successChance: 20, successMsg: "They declined but appreciated the offer. Friendlier inspection.", failMsg: "They wrote it down as an attempted bribe. Very bad.", outcome: { money: 0.7, stress: 40 }, critical: true }
    ]
  },
  {
    id: "service_table_flip", sector: "service", title: "The Angry Customer",
    description: "A customer stood up and loudly announced their food was terrible to the entire restaurant.",
    choices: [
      { label: "Approach calmly and offer a replacement", style: "success", successChance: 80, successMsg: "Diffused. Other guests barely noticed.", failMsg: "Customer escalated anyway. More attention drawn.", outcome: { money: 1.1, stress: 15 } },
      { label: "Offer a full refund and quietly guide them out", style: "primary", successChance: 75, successMsg: "Customer left. Others resumed. Small win.", failMsg: "Customer refused to leave quietly. Manager needed.", outcome: { money: 0.9, stress: 20 } },
      { label: "Match their energy and defend the kitchen", style: "danger", successChance: 15, successMsg: "Other guests somehow sided with you. Wild.", failMsg: "Video is now on TikTok. This is your restaurant's legacy.", outcome: { money: 0.5, stress: 40 }, critical: true }
    ]
  },
  {
    id: "service_filming_complaint", sector: "service", title: "It's Going on TikTok",
    description: "A customer is filming themselves complaining about their order with 50k followers.",
    choices: [
      { label: "Stay professional and fix the issue on camera", style: "success", successChance: 85, successMsg: "Video went viral for good reasons. Free PR.", failMsg: "Fix took too long. Comment section was not kind.", outcome: { money: 1.3, stress: 12 } },
      { label: "Ask them to stop filming per policy", style: "primary", successChance: 45, successMsg: "They stopped filming. Issue resolved quietly.", failMsg: "No such policy. Now there are two videos.", outcome: { money: 0.9, stress: 25 } },
      { label: "Offer a dramatic public apology and free dessert", style: "secondary", successChance: 65, successMsg: "Crowd clapped. Went viral for good reasons.", failMsg: "Over-the-top response became a different kind of meme.", outcome: { money: 1.1, stress: 15 } }
    ]
  },
  {
    id: "service_rush_hour", sector: "service", title: "Rush Hour Chaos",
    description: "Every table in the restaurant seated at the same time. Kitchen is overwhelmed.",
    choices: [
      { label: "Prioritise tables by order time strictly", style: "success", successChance: 75, successMsg: "Managed the chaos. Tips reflected the effort.", failMsg: "Two tables waited too long. Complained to manager.", outcome: { money: 1.2, stress: 20 } },
      { label: "Alert kitchen and redistribute sections with coworkers", style: "primary", successChance: 80, successMsg: "Team effort. Smooth rush.", failMsg: "Coworker already overwhelmed. Redistribution failed.", outcome: { money: 1.2, stress: 15 } },
      { label: "Power through alone and improvise", style: "danger", successChance: 40, successMsg: "Survived on adrenaline alone.", failMsg: "Three orders came out wrong. One table asked for a manager.", outcome: { money: 0.8, stress: 35 } }
    ]
  },
  {
    id: "service_mystery_ingredient", sector: "service", title: "Mystery Ingredient",
    description: "A customer asked what's in the sauce. Nobody in the kitchen knows anymore.",
    choices: [
      { label: "Check with the head chef immediately", style: "success", successChance: 85, successMsg: "Head chef knew. Ingredient confirmed. All good.", failMsg: "Head chef wasn't there. Recipe was in a different system.", outcome: { money: 1.1, stress: 8 } },
      { label: "Offer a different dish with known ingredients", style: "primary", successChance: 80, successMsg: "Customer appreciated the transparency and the alternative.", failMsg: "Customer only wanted THAT dish. Unhappy.", outcome: { money: 0.95, stress: 10 } },
      { label: "Tell them it's a 'house secret recipe'", style: "secondary", successChance: 50, successMsg: "Customer accepted the mystique.", failMsg: "Customer had an allergy. Do not do this.", outcome: { money: 0.8, stress: 30 }, critical: true }
    ]
  },

  // ── Trade events ──────────────────────────────────────────────────────────
  {
    id: "trade_part_recall", sector: "trade", title: "Part Recall",
    description: "A critical component you already installed was just recalled for safety issues.",
    choices: [
      { label: "Contact the client immediately and schedule replacement", style: "success", successChance: 85, successMsg: "Client appreciated transparency. Replacement scheduled.", failMsg: "Client asked why you used a recalled part to begin with.", outcome: { money: 1.1, stress: 10 } },
      { label: "Check if this batch number is actually affected", style: "primary", successChance: 70, successMsg: "Batch number wasn't affected. You're clear.", failMsg: "Batch was affected. Now it's urgent.", outcome: { money: 1.0, stress: 15 } },
      { label: "Hope the client doesn't hear about the recall", style: "danger", successChance: 15, successMsg: "Client never heard about it. Lived dangerously.", failMsg: "Client read the news. Now there are liability questions.", outcome: { money: 0.6, stress: 45 }, critical: true }
    ]
  },
  {
    id: "trade_scope_creep_event", sector: "trade", title: "Scope Creep",
    description: "Client keeps adding requests mid-job without mentioning extra payment.",
    choices: [
      { label: "Note additions and present a change order at the end", style: "primary", successChance: 75, successMsg: "Client paid without issue.", failMsg: "Client disputed the extras as 'implied'.", outcome: { money: 1.3, stress: 15 } },
      { label: "Stop and address the scope change directly", style: "success", successChance: 80, successMsg: "Client agreed to updated terms.", failMsg: "Client was offended. Vibe soured.", outcome: { money: 1.2, stress: 10 } },
      { label: "Do the additions for goodwill", style: "secondary", successChance: 55, successMsg: "Client referred two new jobs. Good investment.", failMsg: "No referral. Just free work.", outcome: { money: 0.8, stress: 20 } }
    ]
  },
  {
    id: "trade_no_show", sector: "trade", title: "Subcontractor No-Show",
    description: "Key help didn't arrive. Job requires two people. Client is watching.",
    choices: [
      { label: "Call emergency replacement and delay the timeline slightly", style: "primary", successChance: 70, successMsg: "Replacement arrived. Job completed same day.", failMsg: "No replacement available. Day lost.", outcome: { money: 1.0, stress: 20 } },
      { label: "Start the parts you can do solo", style: "success", successChance: 75, successMsg: "Solo progress impressed client. Help arrived later.", failMsg: "Unsafe to continue solo. Had to stop. Client unhappy.", outcome: { money: 1.1, stress: 15 } },
      { label: "Inform client and reschedule", style: "secondary", successChance: 65, successMsg: "Client rescheduled without penalty.", failMsg: "Client asked for partial refund. Margin reduced.", outcome: { money: 0.85, stress: 12 } }
    ]
  },
  {
    id: "trade_equipment_failure_event", sector: "trade", title: "Tool Breakdown",
    description: "Primary tool stops working mid-job. Client is watching and asking questions.",
    choices: [
      { label: "Switch to backup tool and continue", style: "success", successChance: 80, successMsg: "Client barely noticed. Professionalism showed.", failMsg: "Backup was degraded too. Slower finish.", outcome: { money: 1.1, stress: 12 } },
      { label: "Call a colleague to bring replacement", style: "primary", successChance: 65, successMsg: "Replacement arrived in 40 minutes. Job done.", failMsg: "Colleague was on the other side of town. 2-hour delay.", outcome: { money: 0.9, stress: 20 } },
      { label: "Carefully continue with the broken tool", style: "danger", successChance: 40, successMsg: "Somehow finished. Do not recommend.", failMsg: "Tool fully failed. Bigger mess.", outcome: { money: 0.7, stress: 30 } }
    ]
  },
  {
    id: "trade_permit_problem", sector: "trade", title: "Permit Problem",
    description: "The permit on file is incorrect. Inspector arrives in 30 minutes.",
    choices: [
      { label: "Rush-file corrected documentation immediately", style: "primary", successChance: 65, successMsg: "Correction approved minutes before inspection.", failMsg: "Filing took too long. Inspector arrived first.", outcome: { money: 1.1, stress: 25 } },
      { label: "Pause work and contact the permit office", style: "success", successChance: 80, successMsg: "Office confirmed a correction could be filed post-inspection.", failMsg: "Office was closed. No answer.", outcome: { money: 1.0, stress: 15 } },
      { label: "Continue working and explain the situation to the inspector", style: "danger", successChance: 35, successMsg: "Inspector was understanding and gave a grace period.", failMsg: "Inspector issued a stop-work order. Very expensive.", outcome: { money: 0.5, stress: 40 }, critical: true }
    ]
  },

  // ── Freelance events ──────────────────────────────────────────────────────
  {
    id: "freelance_scope_dispute", sector: "freelance", title: "Scope Dispute",
    description: "Client says they never asked for what you just delivered. It's clearly in the brief.",
    choices: [
      { label: "Forward the original brief with the relevant section highlighted", style: "success", successChance: 85, successMsg: "Client accepted it was in the brief. Work approved.", failMsg: "Client claims the brief was 'a suggestion'.", outcome: { money: 1.2, stress: 10 } },
      { label: "Offer a partial revision as a compromise", style: "primary", successChance: 70, successMsg: "Client accepted the revision. Relationship preserved.", failMsg: "Client wanted a full redo. Unpaid.", outcome: { money: 0.85, stress: 20 } },
      { label: "Escalate to the platform dispute system", style: "secondary", successChance: 60, successMsg: "Platform sided with you. Brief was clear.", failMsg: "Dispute took 2 weeks. Client left a review anyway.", outcome: { money: 1.0, stress: 30 } }
    ]
  },
  {
    id: "freelance_late_payment", sector: "freelance", title: "Payment Chain Delay",
    description: "Client says they're waiting to be paid by someone else before paying you.",
    choices: [
      { label: "Set a firm deadline with late fees clearly stated", style: "success", successChance: 75, successMsg: "Payment arrived before deadline.", failMsg: "Client missed deadline. Late fees dispute began.", outcome: { money: 1.1, stress: 12 } },
      { label: "Wait a few days and follow up politely", style: "primary", successChance: 65, successMsg: "Payment came through. No issue.", failMsg: "Client went silent. Chasing payment mode activated.", outcome: { money: 1.0, stress: 18 } },
      { label: "Pause all further work until payment", style: "danger", successChance: 55, successMsg: "Client found a way to pay. Leverage worked.", failMsg: "Client found another freelancer. You have the rights but no money.", outcome: { money: 0.7, stress: 35 } }
    ]
  },
  {
    id: "freelance_platform_outage", sector: "freelance", title: "Platform Down",
    description: "The delivery platform you use is down. Client is waiting for a file submission.",
    choices: [
      { label: "Send via email directly with an explanation", style: "success", successChance: 85, successMsg: "Client appreciated the workaround.", failMsg: "Client's email blocked large attachments.", outcome: { money: 1.1, stress: 8 } },
      { label: "Wait for the platform to come back online", style: "secondary", successChance: 55, successMsg: "Platform was back in 20 minutes. Within deadline.", failMsg: "Platform was down for 3 hours. Missed deadline.", outcome: { money: 0.9, stress: 20 } },
      { label: "Use a file sharing service as a temp solution", style: "primary", successChance: 75, successMsg: "Client received the file. Problem solved.", failMsg: "Link expired before client downloaded.", outcome: { money: 1.0, stress: 12 } }
    ]
  },
  {
    id: "freelance_content_stolen", sector: "freelance", title: "Content Stolen",
    description: "Someone reposted your work without credit and it's getting traction.",
    choices: [
      { label: "File a DMCA takedown request", style: "success", successChance: 80, successMsg: "Content removed within 24 hours.", failMsg: "Platform's review took a week. Content spread further.", outcome: { money: 1.1, stress: 12 } },
      { label: "Comment publicly claiming your work", style: "primary", successChance: 65, successMsg: "Community sided with you. Reposter backed down.", failMsg: "Reposter claimed they had permission. Who told them?", outcome: { money: 1.0, stress: 18 } },
      { label: "Repost it yourself with context to reclaim the narrative", style: "secondary", successChance: 70, successMsg: "Original post started trending. You got the credit.", failMsg: "Reposter's version had a head start. Confusing for audience.", outcome: { money: 1.0, stress: 15 } }
    ]
  },
  {
    id: "freelance_last_minute_cancel", sector: "freelance", title: "Last-Minute Cancellation",
    description: "Client cancelled the gig one hour before delivery. Work is done.",
    choices: [
      { label: "Invoice for completed work per contract", style: "success", successChance: 80, successMsg: "Client paid the kill fee. Contract held up.", failMsg: "Client disputed the kill fee. Small claims pending.", outcome: { money: 1.0, stress: 15 } },
      { label: "Offer to sell the work to someone else", style: "primary", successChance: 55, successMsg: "Found a buyer for the work. Recovered the loss.", failMsg: "Work was too specific to resell.", outcome: { money: 0.8, stress: 20 } },
      { label: "Let it go and move to next client", style: "secondary", successChance: 70, successMsg: "Next gig was better. Good call.", failMsg: "Lost the income and the time. Rough.", outcome: { money: 0.5, stress: 25 } }
    ]
  },

  // ── Global events ─────────────────────────────────────────────────────────
  {
    id: "global_power_outage", sector: "all", title: "Power Outage",
    description: "The building lost power. Work is paused. Your unsaved progress is at risk.",
    choices: [
      { label: "Had autosave on — resume when power returns", style: "success", successChance: 85, successMsg: "Power back in 10 minutes. Nothing lost.", failMsg: "Autosave had a 3-hour gap. Some work was lost.", outcome: { money: 1.0, stress: 5 } },
      { label: "Use backup power / phone hotspot to continue", style: "primary", successChance: 70, successMsg: "Kept working through the outage. Points for dedication.", failMsg: "Backup ran out. More work lost.", outcome: { money: 1.1, stress: 15 } },
      { label: "Use the time to catch up on other tasks", style: "secondary", successChance: 75, successMsg: "Productive use of the pause. Got ahead.", failMsg: "Other tasks weren't actually due yet. Wasted effort.", outcome: { money: 1.0, stress: 10 } }
    ]
  },
  {
    id: "global_mandatory_fun", sector: "all", title: "Mandatory Fun Event",
    description: "HR announced a team building event. It's mandatory. It starts now. You have deadlines.",
    choices: [
      { label: "Fully participate and make the best of it", style: "success", successChance: 80, successMsg: "You won the trust fall. Morale points earned.", failMsg: "Activity was genuinely terrible. No redemption arc.", outcome: { money: 1.0, stress: 5 } },
      { label: "Attend but quietly keep working on your phone", style: "secondary", successChance: 55, successMsg: "Nobody noticed. Deadlines met.", failMsg: "HR noticed. You'll be giving a 'participation' talk next.", outcome: { money: 1.0, stress: 15 } },
      { label: "Get a medical exemption and work through it", style: "danger", successChance: 30, successMsg: "HR accepted it. You stayed productive.", failMsg: "HR followed up with occupational health. That's a whole thing now.", outcome: { money: 1.0, stress: 25 } }
    ]
  },
  {
    id: "global_fire_drill_event", sector: "all", title: "Fire Drill (Maybe)",
    description: "The fire alarm went off. You're in the middle of something critical.",
    choices: [
      { label: "Follow protocol immediately", style: "success", successChance: 90, successMsg: "Drill confirmed. You set a good example.", failMsg: "It was a real fire. You still got out but left something important.", outcome: { money: 1.0, stress: 5 } },
      { label: "Finish the critical task and leave", style: "danger", successChance: 25, successMsg: "It was a drill. You finished the task and saved the day.", failMsg: "It was not a drill. You're famous now. Not positively.", outcome: { money: 0.9, stress: 30 }, critical: true }
    ]
  },
  {
    id: "global_unexpected_audit", sector: "all", title: "Unexpected Audit",
    description: "All records and documentation have been requested immediately.",
    choices: [
      { label: "Everything is organised — provide all records promptly", style: "success", successChance: 85, successMsg: "Clean audit. Auditors were impressed.", failMsg: "One document was in the wrong folder. Minor flag.", outcome: { money: 1.2, stress: 8 } },
      { label: "Ask for clarification on what's actually needed", style: "primary", successChance: 75, successMsg: "Clarification narrowed scope. Manageable.", failMsg: "Clarification request was seen as evasion. Broader audit now.", outcome: { money: 1.0, stress: 15 } },
      { label: "Stall and use the time to reorganise", style: "danger", successChance: 30, successMsg: "Bought enough time. Documents in order.", failMsg: "Stall was noticed. Credibility flagged.", outcome: { money: 0.8, stress: 35 } }
    ]
  },
  {
    id: "global_rumour_spread", sector: "all", title: "Rumour Spread",
    description: "A false rumour about your performance is spreading through the office.",
    choices: [
      { label: "Address it directly with facts", style: "success", successChance: 80, successMsg: "Facts won. Rumour died.", failMsg: "Addressing it gave it more oxygen. Now everyone's talking.", outcome: { money: 1.0, stress: 10 } },
      { label: "Let your work speak for itself and ignore it", style: "primary", successChance: 70, successMsg: "Rumour faded. Strong performance noted instead.", failMsg: "Rumour reached your manager before your work did.", outcome: { money: 1.0, stress: 15 } },
      { label: "Find the source and confront them", style: "danger", successChance: 40, successMsg: "Source admitted fault and apologised.", failMsg: "Wrong person confronted. Now there are two rumours.", outcome: { money: 0.9, stress: 30 } }
    ]
  },
  {
    id: "global_vending_machine", sector: "all", title: "Vending Machine Crisis",
    description: "The vending machine ate your money and someone is watching. Your reaction will define you.",
    choices: [
      { label: "Report it to facilities calmly", style: "success", successChance: 90, successMsg: "Refund processed. You modelled mature behaviour.", failMsg: "Facilities form had 14 fields. You gave up.", outcome: { money: 1.0, stress: 2 } },
      { label: "Give it a firm but professional shake", style: "secondary", successChance: 60, successMsg: "Snack fell out. Everyone cheered.", failMsg: "Snack still stuck. The shake made a noise. People stared.", outcome: { money: 1.0, stress: 8 } },
      { label: "Declare war on the machine publicly", style: "danger", successChance: 15, successMsg: "Somehow became a moment of team bonding. Legend.", failMsg: "The CEO walked past at the exact wrong moment.", outcome: { money: 0.9, stress: 20 } }
    ]
  }
];
