# Casino Bot

A professional, feature-rich economy and gambling bot built with TypeScript, Discord.js, and Prisma. This bot offers a comprehensive financial system, interactive casino games, and an advanced hierarchical permission system for granular server control.

## Overview

This project provides a complete ecosystem for Discord servers looking to engage members through economy and gaming. It features a per-server economy (money is not shared globally), customizable shops, dynamic jobs, and a robust banking system with loans and credit scores.

## Key Features

### Economy System
- **Banking**: Deposit and withdraw funds. Earn interest on deposits.
- **Credit System**: Dynamic credit scores affect loan eligibility and interest rates.
- **Loans**: Automated loan system with repayment tracking and penalties for defaults.
- **Shop & Inventory**: Server admins can create custom shop items. Users can buy, sell, and trade items.
- **Marketplace**: User-to-user black market for selling rare items.
- **Jobs**: Dynamic income commands (work, crime, etc.) with configurable payouts and cooldowns.

### Casino Games
- **Blackjack**: Classic card game with hit, stand, and double down mechanics.
- **Roulette**: Bet on colors, numbers, or odd/even.
- **Slots**: Visual slot machine with customizable winning combinations.
- **Coinflip**: Simple high-stakes betting.
- **Loaded Dice of Ruin**: A persistent once-daily relic with escalating rewards and shatter risk.

### Administration & Permissions
- **Hierarchical System**: Multilayered permissions (Admin > User Permissions > Channel Overrides).
- **Casino Channels**: Whitelist specific channels for bot interaction.
- **Audit Logging**: Detailed logs for all administrative actions, bans, and configuration changes.
- **Dynamic Configuration**: Configure interest rates, starting balances, and taxes directly from Discord.

## Installation

### Prerequisites
- Node.js (v18 or higher)
- MongoDB Database (Local or Atlas)
- Discord Bot Token

### Setup Steps
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Generate Prisma Client:
    ```bash
    npx prisma generate
    ```
4.  Configure the environment variables (see Configuration).
5.  Start the bot:
    ```bash
    npm run dev
    ```

## Configuration

Create a `.env` file in the root directory with the following variables:

```ini
DATABASE_URL="mongodb+srv://..."
DISCORD_TOKEN="your_discord_bot_token"
CLIENT_ID="your_discord_client_id"
```

## 📚 Documentation

For a complete guide on how to use the bot, including a user manual, admin guide, and privacy policy, please read [DOCUMENTATION.md](DOCUMENTATION.md).

## Command Usage

### General
- `!help` - View available commands.
- `!balance`, `!profile` - Check financial status.
- `!work`, `!crime` - Earn money.

### Games
- `!blackjack <amount>`
- `!bet <amount> <choice>` (Roulette)
- `!slots <amount>`
- `!roll` (requires Loaded Dice of Ruin)

### Permissions (Admin Only)
- `!set casino channel add #channel` - Restrict bot to channels.
- `!channel override enable <command>` - Enable commands in specific channels.
- `!perms allow user @user <command>` - Grant specific command access.

## Development

- **Build**: `npm run build`
- **Dev**: `npm run dev`
- **Lint**: `npm run lint`
- **Validate shop application emojis**: `npm run validate:shop-emojis`
- **Upload missing shop application emojis**: `npm run sync:shop-emojis`

The emoji sync uses `DISCORD_TOKEN` (or `TOKEN`/`BOT_TOKEN`) from the environment. It only manages application emojis prefixed with `shop_`. Pass `--replace` to refresh existing images or `--prune` to remove stale managed emojis after a successful sync.

## Architecture

- **Language**: TypeScript
- **Framework**: Discord.js
- **Database**: MongoDB (via Prisma ORM)
- **Design Pattern**: Service-based architecture with modular command handlers.
