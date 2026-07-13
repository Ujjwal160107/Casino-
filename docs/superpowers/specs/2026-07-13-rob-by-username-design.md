# Rob by Username (Cross-Server Robbery) — Design Spec

Date: 2026-07-13
Status: Approved by Ujjwal

## Goal

`!rob` works without a mention: accept a username (or raw user ID) and resolve it against Fortuna's own player database, so players can rob anyone who plays Fortuna in any server.

## Target resolution (in `src/commands/economy/rob.ts`)

Resolution order for `!rob <target>`:

1. **Mention** — `message.mentions.members?.first()` (existing behavior, unchanged).
2. **Raw user ID** — `args[0]` of 17–20 digits (after stripping `<@`, `!`, `>` remnants): look up `prisma.user.findUnique({ where: { discordId } })`.
3. **Username** — case-insensitive **exact** match on `User.username`: `findMany({ where: { username: { equals: args[0], mode: "insensitive" } } })`.
   - 0 matches → error: "No Fortuna player named **{name}**. Names must match exactly — or use their user ID."
   - 2+ matches → error: "Multiple players share that name — rob them by user ID instead."

The resolved target becomes a normalized `{ id: string; name: string }`:
- `name` = the guild member's `displayName` when the target is in this server, else the DB `username`.
- Self-rob check compares ids (unchanged). Bot check: the mention path keeps `user.bot`; ID/username paths resolve only DB players (bots don't have accounts), plus a defensive `client.users.fetch` bot check is NOT required — skip it (YAGNI).
- All downstream logic (padlock, Crocodile Hide, success roll, transaction, fines, victim DMs) already operates on the id and needs only the rename from `targetUser.id`/`targetUser.displayName` to the normalized fields. `ensureBankingUser(target.id, target.name)` replaces the member-based call — and for ID/username paths the account already exists by construction.
- If the target has no Fortuna account (possible only via the ID path), fail with the same "No Fortuna player" error rather than creating an account for them.

## Docs

- Site `dashboard/src/content/commands.ts` rob entry: usage `!rob <@user | username>`, args note that usernames work across servers.
- `dashboard/src/content/modules/crime-and-heat.ts` robbery section: one sentence that robbery is cross-server — any Fortuna player anywhere, by username.

## Verification

`npx tsc --noEmit` clean; site builds. Live smoke: rob by mention (regression), by username of a player NOT in the server (the cross-server case), by garbage name (error copy), by own username (self-rob error).
