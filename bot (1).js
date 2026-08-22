// telegram/bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { askTutor, ConversationStore } = require('../core/tutor');

const store = new ConversationStore();
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and add it.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const MAX_TG_LEN = 3900; // stay under Telegram's 4096-char limit

function chunk(text) {
  const parts = [];
  let remaining = text;
  while (remaining.length > MAX_TG_LEN) {
    let cut = remaining.lastIndexOf('\n', MAX_TG_LEN);
    if (cut < MAX_TG_LEN * 0.5) cut = MAX_TG_LEN;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  parts.push(remaining);
  return parts;
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Hi! I'm your math tutor — Calc 1 & 2, Discrete Math, Algebra, Trigonometry, and Linear Algebra. Ask me anything, or send /reset to start a fresh conversation."
  );
});

bot.onText(/\/reset/, (msg) => {
  store.reset(msg.chat.id);
  bot.sendMessage(msg.chat.id, 'Cleared our conversation — starting fresh.');
});

bot.on('message', async (msg) => {
  const text = msg.text;
  if (!text || text.startsWith('/')) return; // /start and /reset handled above

  const key = msg.chat.id;
  store.push(key, 'user', text);

  bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const history = store.get(key);
    const reply = await askTutor(history);
    store.push(key, 'assistant', reply);

    for (const part of chunk(reply)) {
      await bot.sendMessage(msg.chat.id, part);
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, `Something went wrong: ${err.message}`);
  }
});

console.log('Telegram math tutor bot is polling...');
