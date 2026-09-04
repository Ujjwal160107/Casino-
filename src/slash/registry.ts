import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    User,
} from "discord.js";

/**
 * The single source of truth for slash commands.
 *
 * Each spec names a command the router already handles, so adding one here
 * exposes an existing handler rather than creating a second implementation.
 * `name` MUST match a case label in commandRouter.ts.
 *
 * Options are declared in the order the handler reads them out of `args`, and
 * are converted straight back into that array -- so handlers keep their
 * existing parsing and there is no second input path to maintain.
 *
 * Optionals must come last. Options are serialised positionally and we stop at
 * the first absent one, so a gap would shift every argument after it.
 */

type Opt =
    | { kind: "user"; name: string; desc: string; required?: boolean }
    | { kind: "str"; name: string; desc: string; required?: boolean; choices?: string[] }
    | { kind: "int"; name: string; desc: string; required?: boolean; min?: number; max?: number };

interface Spec {
    name: string;
    desc: string;
    opts?: Opt[];
    /** Prepended to args, for router entries that are a fixed variant of another
     *  command -- e.g. `buy` is `shop buy`, `cockstore` is `shop cock`. */
    fixedArgs?: string[];
}

/** Amounts go through parseSmartAmount, which accepts "all", "max", "5k", "2m".
 *  They must stay strings -- an integer option would silently drop that. */
const amount = (desc = "Amount -- accepts all, max, or shorthand like 5k"): Opt =>
    ({ kind: "str", name: "amount", desc, required: true });

const optionalUser = (desc: string): Opt =>
    ({ kind: "user", name: "user", desc, required: false });

export const SPECS: Spec[] = [
    // --- general ---------------------------------------------------------
    { name: "ping", desc: "Check the bot's latency" },
    { name: "help", desc: "Show the command list" },
    { name: "casino", desc: "Open the casino games guide" },
    { name: "guide", desc: "Walk through the getting-started tutorial" },
    { name: "settings", desc: "Manage your reminders and notifications" },
    {
        name: "setprefix", desc: "Set the text-command prefix for this server",
        opts: [{ kind: "str", name: "prefix", desc: "The new prefix", required: true }],
    },
    { name: "start", desc: "Create your account and claim your starter kit" },
    { name: "vote", desc: "Vote for the bot and claim your reward" },
    { name: "quests", desc: "View your daily quests" },

    // --- money -----------------------------------------------------------
    { name: "balance", desc: "Check a wallet balance", opts: [optionalUser("Whose balance to check")] },
    {
        name: "bank", desc: "Manage your bank account",
        opts: [
            { kind: "str", name: "action", desc: "What to do", required: false, choices: ["deposit", "withdraw", "info", "upgrade"] },
            { kind: "str", name: "amount", desc: "Amount -- accepts all, max, or 5k", required: false },
        ],
    },
    { name: "deposit", desc: "Deposit cash into your bank", opts: [amount("How much to deposit")] },
    { name: "withdraw", desc: "Withdraw cash from your bank", opts: [amount("How much to withdraw")] },
    {
        name: "transfer", desc: "Send money to another player",
        opts: [
            { kind: "user", name: "user", desc: "Who to pay", required: true },
            amount("How much to send"),
        ],
    },
    {
        name: "ask", desc: "Ask another player for money",
        opts: [
            { kind: "user", name: "user", desc: "Who to ask", required: true },
            amount("How much to ask for"),
        ],
    },
    { name: "card", desc: "Manage your credit card" },
    { name: "my-cards", desc: "List the credit cards you own" },
    { name: "credit", desc: "Check your credit score" },

    // --- earning ---------------------------------------------------------
    { name: "work", desc: "Work a shift at your job" },
    { name: "crime", desc: "Commit a crime for a risky payout" },
    { name: "beg", desc: "Beg for spare change" },
    { name: "daily", desc: "Claim your daily reward" },
    { name: "weekly", desc: "Claim your weekly reward" },
    { name: "monthly", desc: "Claim your monthly reward" },
    { name: "rob", desc: "Attempt to rob another player", opts: [{ kind: "user", name: "user", desc: "Who to rob", required: true }] },
    { name: "heat", desc: "Check your heat level and lay low" },
    { name: "jail", desc: "Check your jail status" },
    { name: "bail", desc: "Pay your way out of jail" },

    // --- shop and items --------------------------------------------------
    {
        name: "shop", desc: "Browse the shops",
        opts: [{ kind: "str", name: "section", desc: "Which shop to open", required: false, choices: ["buy", "sell", "cock", "job", "uni", "hunt"] }],
    },
    // No fixedArgs: the router's `buy` case already calls handleShop with
    // ["buy", ...args] itself.
    { name: "buy", desc: "Buy an item from the shop", opts: [{ kind: "str", name: "item", desc: "Item to buy", required: true }] },
    { name: "inventory", desc: "View an inventory", opts: [optionalUser("Whose inventory to view")] },
    {
        name: "use", desc: "Use an item from your inventory",
        opts: [
            { kind: "str", name: "item", desc: "Item to use", required: true },
            optionalUser("Who to use it on, if the item targets someone"),
        ],
    },
    { name: "iteminfo", desc: "Look up what an item does", opts: [{ kind: "str", name: "item", desc: "Item to look up", required: true }] },
    { name: "equip", desc: "Equip an item", opts: [{ kind: "str", name: "item", desc: "Item to equip", required: true }] },
    { name: "market", desc: "Browse the black market" },

    // --- profile and ranking ---------------------------------------------
    { name: "profile", desc: "View a player profile", opts: [optionalUser("Whose profile to view")] },
    {
        name: "leaderboard", desc: "View the leaderboard",
        opts: [{ kind: "str", name: "type", desc: "What to rank by", required: false, choices: ["cash", "bank", "net", "shifts"] }],
    },

    // --- casino ----------------------------------------------------------
    { name: "bet", desc: "Place a bet on roulette", opts: [amount("How much to bet")] },
    { name: "blackjack", desc: "Play a hand of blackjack", opts: [amount("How much to bet")] },
    { name: "slots", desc: "Spin the slot machine", opts: [amount("How much to bet")] },
    {
        name: "coinflip", desc: "Flip a coin",
        opts: [
            amount("How much to bet"),
            { kind: "str", name: "side", desc: "Which side to call", required: true, choices: ["heads", "tails"] },
        ],
    },
    { name: "rr", desc: "Play russian roulette", opts: [{ kind: "str", name: "amount", desc: "How much to bet", required: false }] },
    { name: "roll", desc: "Roll the dice" },
    { name: "rouletteguide", desc: "Explain how roulette betting works" },

    // --- chickens, hunting, zoo ------------------------------------------
    { name: "cockfight", desc: "Challenge another player to a cockfight", opts: [{ kind: "user", name: "user", desc: "Who to challenge", required: true }] },
    {
        name: "chicken", desc: "Manage your chicken",
        opts: [{ kind: "str", name: "action", desc: "What to do", required: false, choices: ["info", "rename", "train", "heal"] }],
    },
    { name: "feed", desc: "Feed your chicken" },
    {
        name: "hunt", desc: "Go hunting",
        opts: [{ kind: "str", name: "action", desc: "What to do", required: false, choices: ["craft"] }],
    },
    {
        name: "zoo", desc: "Manage your zoo",
        opts: [
            { kind: "str", name: "action", desc: "What to do", required: false, choices: ["add", "feed", "remove"] },
            { kind: "str", name: "animal", desc: "Which animal", required: false },
        ],
    },

    // --- career and education --------------------------------------------
    { name: "jobs", desc: "List the jobs you can apply for" },
    { name: "apply", desc: "Apply for a job", opts: [{ kind: "str", name: "job", desc: "Job to apply for", required: true }] },
    { name: "career", desc: "View your career progress" },
    { name: "relax", desc: "Rest to recover energy" },
    { name: "education", desc: "Open the university" },
    { name: "enroll", desc: "Enroll in a degree", opts: [{ kind: "str", name: "degree", desc: "Degree to enroll in", required: true }] },
    { name: "study", desc: "Study towards your degree" },
    { name: "exam", desc: "Sit your final exam" },
    { name: "dropout", desc: "Drop out of your degree" },
    { name: "degrees", desc: "List the degrees you hold" },

    // --- stocks and property ---------------------------------------------
    { name: "stock", desc: "Open the stock market" },
    { name: "mystocks", desc: "View your stock portfolio" },
    { name: "properties", desc: "Browse properties for sale" },
    { name: "buy-property", desc: "Buy a property", opts: [{ kind: "str", name: "property", desc: "Property to buy", required: true }] },
    { name: "sell-property", desc: "Sell a property", opts: [{ kind: "str", name: "property", desc: "Property to sell", required: true }] },
    { name: "my-properties", desc: "View the properties you own" },
    { name: "collect-rent", desc: "Collect rent from your properties" },

    // --- marriage ---------------------------------------------------------
    { name: "marry", desc: "Propose to another player", opts: [{ kind: "user", name: "user", desc: "Who to propose to", required: true }] },
    { name: "divorce", desc: "End your marriage" },
    { name: "family", desc: "View your marriage and family" },
];

/** Turn a spec into the Discord command definition. */
export function buildCommand(spec: Spec): SlashCommandBuilder {
    const b = new SlashCommandBuilder().setName(spec.name).setDescription(spec.desc);
    for (const o of spec.opts ?? []) {
        if (o.kind === "user") {
            b.addUserOption((x) => x.setName(o.name).setDescription(o.desc).setRequired(!!o.required));
        } else if (o.kind === "int") {
            b.addIntegerOption((x) => {
                x.setName(o.name).setDescription(o.desc).setRequired(!!o.required);
                if (o.min !== undefined) x.setMinValue(o.min);
                if (o.max !== undefined) x.setMaxValue(o.max);
                return x;
            });
        } else {
            b.addStringOption((x) => {
                x.setName(o.name).setDescription(o.desc).setRequired(!!o.required);
                if (o.choices) x.addChoices(...o.choices.map((c) => ({ name: c, value: c })));
                return x;
            });
        }
    }
    return b;
}

/**
 * Serialise the supplied options back into the positional `args` array the
 * handler already parses, plus the users to expose via `message.mentions`.
 *
 * User options become `<@id>` in args because several handlers strip the
 * mention syntax out of `args[0]` themselves rather than reading `mentions`.
 */
export function buildArgs(
    interaction: ChatInputCommandInteraction,
    spec: Spec,
): { args: string[]; users: User[] } {
    const args: string[] = [...(spec.fixedArgs ?? [])];
    const users: User[] = [];

    for (const o of spec.opts ?? []) {
        if (o.kind === "user") {
            const u = interaction.options.getUser(o.name);
            if (!u) break;
            users.push(u);
            args.push(`<@${u.id}>`);
        } else if (o.kind === "int") {
            const v = interaction.options.getInteger(o.name);
            if (v === null) break;
            args.push(String(v));
        } else {
            const v = interaction.options.getString(o.name);
            if (v === null) break;
            args.push(v);
        }
    }

    return { args, users };
}

export const SPEC_BY_NAME = new Map(SPECS.map((s) => [s.name, s]));
