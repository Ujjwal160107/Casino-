/**
 * Curated cross-module "what next" hints, shown as -# small text on SUCCESS
 * outputs only — never on errors, never on admin commands.
 * {p} is replaced with the prefix at render time (default "!").
 * Keys are stable slugs, not command names — outcome variants get their own key.
 */
const NEXT_STEPS: Record<string, string> = {
    balance: "Wallets can be robbed — bank it with `{p}deposit`",
    deposit: "Upgrade capacity and earn interest in `{p}bank`",
    withdraw: "Wallet cash is rob-bait — a padlock from `{p}shop` slows thieves down",
    daily: "Stack `{p}weekly`, `{p}monthly`, and `{p}vote` rewards too",
    weekly: "Don't miss `{p}daily` and `{p}vote`",
    monthly: "Keep the streak: `{p}daily` and `{p}weekly`",
    vote: "Claim `{p}daily` while you're here",
    bank: "Need credit? `{p}card issue` gets you a Fortuna Card",
    card: "Keep your score healthy — check `{p}credit`",
    credit: "Manage cards with `{p}mycards`",
    beg: "Ready for bigger scores? Try `{p}crime`",
    crime_success: "Deposit it before someone robs you — `{p}deposit`",
    crime_jailed: "Check `{p}jail`, pay `{p}bail` to get out early",
    rob_success: "Bank the loot fast — `{p}deposit`",
    jail: "Pay `{p}bail` to get out early",
    bail: "Stay clean… or don't: `{p}crime`",
    shop_buy: "`{p}equip` gear, `{p}use` consumables, `{p}iteminfo` for details",
    inventory: "`{p}use`, `{p}equip`, or `{p}iteminfo <item>`",
    market: "Rare loot comes from `{p}hunt`",
    stock_trade: "Track P/L with `{p}my-stocks`",
    mystocks: "Trade with `{p}stock buy` / `{p}stock sell`",
    properties: "Collect income with `{p}collect-rent`",
    buy_property: "Collect income with `{p}collect-rent`",
    collect_rent: "Browse more with `{p}properties`",
    casino: "New here? `{p}casinoguide` explains every game",
    cockfight: "Raise your own fighter: `{p}chicken`",
    chicken: "Ready to fight? `{p}cockfight <amount>`",
    feed: "Train it too: `{p}chicken train`",
    jobs: "Apply with `{p}apply <job>`",
    apply: "Start your first shift: `{p}work`",
    work: "Promotions live in `{p}career`; stressed? `{p}relax`",
    career: "Better jobs unlock with degrees — `{p}education`",
    relax: "Back to the grind: `{p}work`",
    education: "Enroll with `{p}enroll <degree>`, then `{p}study`",
    enroll: "Hit the books: `{p}study`",
    study: "Ready? `{p}exam`. Stressed? `{p}relax`",
    exam_pass: "Higher-tier jobs just unlocked — `{p}jobs`",
    dropout: "Re-enroll anytime: `{p}enroll <degree>`",
    start: "Take the `{p}tutorial`, then grab your `{p}daily`",
    tutorial: "Grab `{p}daily`, get a job via `{p}jobs`, or hit `{p}casinoguide`",
};

/** Returns a "-# Tip: …" line for the key, or undefined if the key has no hint. */
export function nextStepHint(key: string, prefix: string = "!"): string | undefined {
    const hint = NEXT_STEPS[key];
    return hint ? `-# Tip: ${hint.split("{p}").join(prefix)}` : undefined;
}
