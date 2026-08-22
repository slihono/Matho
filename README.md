# Math Tutor Bot

One shared tutor "brain" (`core/tutor.js`) powering three front-ends:

- `web/` — a browser chat app
- `discord/` — a Discord bot
- `telegram/` — a Telegram bot

All three call the same Claude-powered tutor, so the teaching behavior
(subjects covered, Socratic style, step-by-step explanations) is defined
in one place: `core/tutor.js`.

## 1. Install

```bash
cd math-tutor-bot
npm install
```

## 2. Get an Anthropic API key (needed for all three)

1. Go to https://console.anthropic.com and sign up / log in.
2. Go to **Settings → API Keys → Create Key**.
3. You'll need to add billing (a few dollars covers a lot of tutoring —
   Claude API pricing is pay-as-you-go, not a subscription).
4. Copy `.env.example` to `.env` and paste the key in:

```bash
cp .env.example .env
```

```
ANTHROPIC_API_KEY=sk-ant-...
```

## 3. Run the web app

```bash
npm run web
```

Open http://localhost:3000 — that's it, a working chat tutor in your browser.

## 4. Set up the Discord bot (optional)

1. Go to https://discord.com/developers/applications → **New Application**.
2. Go to the **Bot** tab → **Add Bot**.
3. Under **Privileged Gateway Intents**, turn on **Message Content Intent**
   (the bot needs this to read what students type).
4. Click **Reset Token** / **Copy** to get the bot token, and put it in `.env`:
   ```
   DISCORD_BOT_TOKEN=your-token-here
   ```
5. Go to **OAuth2 → URL Generator**, check scopes `bot`, and permissions
   `Send Messages` + `Read Message History`. Open the generated URL to
   invite the bot to your server.
6. Run it:
   ```bash
   npm run discord
   ```
7. In a server channel, message `!tutor <your question>`. In a DM to the
   bot, you can skip the prefix. Send `!tutor reset` (or just `reset` in
   DMs) to clear that user's conversation.

## 5. Set up the Telegram bot (optional)

1. In Telegram, message **@BotFather** → `/newbot` → follow the prompts.
2. BotFather gives you a token — put it in `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your-token-here
   ```
3. Run it:
   ```bash
   npm run telegram
   ```
4. Message your bot on Telegram, `/start` to begin, `/reset` to clear context.

## 6. Run all three at once

```bash
npm run all
```

(uses `concurrently`, already in `devDependencies`)

---

## Hosting it long-term (so it's not just running on your laptop)

Right now each bot runs in your terminal and stops when you close it.
For something that stays online:

**Easiest path — Railway or Render (free/cheap tiers exist):**
1. Push this folder to a GitHub repo (`git init`, commit, push).
2. On https://railway.app or https://render.com, create a new project
   from that repo.
3. Add the same environment variables from `.env` in their dashboard
   (never commit your real `.env` file — it's already useful to add a
   `.gitignore` with `.env` and `node_modules` in it).
4. For the **web app**, deploy `web/server.js` as a web service (Railway/
   Render both auto-detect `npm start`-style Node apps — set the start
   command to `node web/server.js`).
5. For **Discord** and **Telegram**, those aren't web servers — they hold
   an open connection. Deploy each as a "worker" / "background service"
   (Railway calls it a background worker) with start commands
   `node discord/bot.js` and `node telegram/bot.js` respectively. You can
   run all three as three separate services from the same repo.

**Alternative — your own PC or a VPS**, keeping it running with
[`pm2`](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start web/server.js --name tutor-web
pm2 start discord/bot.js --name tutor-discord
pm2 start telegram/bot.js --name tutor-telegram
pm2 save
pm2 startup   # follow the printed instructions to survive reboots
```

## Exercises

Two ways to practice:

- **In any chat (web, Discord, Telegram)**: the tutor now proactively offers
  a practice problem after explaining a concept ("Want to try one?"). This
  needs no extra setup — it's just part of `SYSTEM_PROMPT`.
- **Dedicated Exercises tab (web app only)**: pick a subject and difficulty,
  click "New problem", type your answer, and get instant grading with
  feedback pointing at where you went wrong, plus a running score. This uses
  two new endpoints (`/api/exercise/new`, `/api/exercise/submit`) backed by
  `generateExercise()` / `checkExercise()` in `core/tutor.js`.

## Tuning the tutor

Everything about *how* it teaches — tone, which subjects, Socratic vs.
direct-answer behavior — lives in the `SYSTEM_PROMPT` constant in
`core/tutor.js`. Edit that one file and all three bots update together.

## Notes

- Conversation history is currently kept **in memory** per process, keyed
  by browser session / Discord user id / Telegram chat id. Restarting a
  bot clears everyone's context. That's fine to start; if you want
  persistence later, swap `ConversationStore` in `core/tutor.js` for a
  small database (SQLite is the easiest next step).
- Each bot trims to the last ~20 messages per conversation to keep API
  costs and latency reasonable.
