# 📖 Fortuna Bot User Manual

Welcome to **Fortuna**, the ultimate economy and life simulation bot for Discord. This manual covers everything from inviting the bot to mastering the stock market.

---

## 🚀 Getting Started

### 1. Invite the Bot
To add Fortuna to your server, use the invite link:
[**Invite Fortuna**](https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands)
*(Replace `YOUR_CLIENT_ID` with the actual ID if hosting yourself)*

### 2. Initial Setup
Once added, an admin should run:
```
!setup
```
This launches the interactive wizard to configure:
- Currency Name & Emoji
- Starting Balance
- Language & Timezone

---

## ❓ Comparison & FAQ

### Frequently Asked Questions

**Q: How do I get money?**
A: Use `!daily` every 24h, `!work` (requires a job), or play games like `!blackjack` and `!slots`.

**Q: I bought an item but can't use it?**
A: Check your inventory with `!inv`. Some items are passive (like "Golden Ticket") and work automatically, while others (like "Pizza") need `!use pizza`.

**Q: How do I get a better job?**
A: Use `!education` to enroll in a degree. Higher intelligence and degrees unlock better paying jobs in `!jobs`.

**Q: My balance disappeared!**
A: Did you get robbed? Check `!balance` to see if your money is in your bank. If the server admin reset the economy, all balances are wiped.

**Q: How do I report a bug?**
A: Join our **[Support Server](https://discord.gg/sK66U3vx6S)** and open a ticket.

---

## 💰 Economy System

### 🏦 Banking & Wallet
- **`!balance`** (Aliases: `bal`, `money`)
  - Displays your current Wallet, Bank, and Net Worth.
- **`!deposit <amount | all>`** (Aliases: `dep`)
  - Move money from Wallet to Bank. Banked money is safe from robbery.
- **`!withdraw <amount | all>`** (Aliases: `with`)
  - Move money from Bank to Wallet.
- **`!transfer <@user> <amount>`** (Aliases: `give`, `pay`)
  - Send money to another user.

### 💵 Income
- **`!daily` / `!weekly` / `!monthly`**
  - Claim recurring rewards.
- **`!work`**
  - Perform a shift at your job.
- **`!crime`**
  - High risk, high reward illegal activity.
- **`!rob <@user>`**
  - Steal from another user's wallet.
- **`!collect`**
  - Collect income from Roles or Properties.

### 🛍️ Market & Items
- **`!shop`** - View the shop.
- **`!shop buy <item>`** - Purchase an item.
- **`!inventory`** - View owned items.
- **`!use <item>`** - Use a consumable.
- **`!market`** - View global Black Market.

### 📈 Stocks
- **`!stock`** - View prices.
- **`!stock buy <symbol> <amount>`** - Invest.
- **`!portfolio`** - View investments.

---

## 🎲 Casino Games

- **`!blackjack <amount>`** - Play to 21.
- **`!roulette <amount> <bet>`** - Bet and spin.
- **`!slots <amount>`** - Spin to win.
- **`!coinflip <amount> <side>`** - 50/50 chance.
- **`!cockfight <amount>`** - Pet battle.
- **`!rr <amount>`** - Russian Roulette.

---

## 🧬 Life Simulator

### 💼 Career
- **`!jobs`** - View job list.
- **`!apply <job_id>`** - Apply for a job.
- **`!work`** - Earn XP and Money.
- **`!promote`** - Check promotion eligibility.

### 🎓 Education
- **`!education`** - View degrees.
- **`!enroll <degree>`** - Start university.
- **`!study`** - Boost Intelligence.

### ❤️ Family
- **`!marry <@user>`** - Propose.
- **`!divorce`** - Split up.
- **`!family`** - View relatives.

---

## 🛡️ Admin & Moderation

### ⚙️ Configuration
- **`!setup`** - Run interactive setup.
- **`!set-prefix <prefix>`** - Change prefix.
- **`!set-currency <name> <emoji>`** - Customize currency.
- **`!set-start-money <amount>`** - Set new user balance.

### 💵 Economy Control
- **`!add-money <@user> <amount>`** - Spawn money.
- **`!remove-money <@user> <amount>`** - Remove money.
- **`!reset-economy`** - **Wipe all data**.

### 🛍️ Shop Management
- **`!add-shop-item`** - Create custom items.
- **`!manage-item <name>`** - Edit items.

---

## � Support

Need help? Found a bug? Want to suggest a feature?

**[Join our Discord Support Server](https://discord.gg/sK66U3vx6S)**
