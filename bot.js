// discord/bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { askTutor, ConversationStore } = require('../core/tutor');

const store = new ConversationStore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const PREFIX = '!tutor';
const MAX_DISCORD_LEN = 1900; // stay under Discord's 2000-char limit with room to spare

function chunk(text) {
  const parts = [];
  let remaining = text;
  while (remaining.length > MAX_DISCORD_LEN) {
    let cut = remaining.lastIndexOf('\n', MAX_DISCORD_LEN);
    if (cut < MAX_DISCORD_LEN * 0.5) cut = MAX_DISCORD_LEN;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  parts.push(remaining);
  return parts;
}

client.once('ready', () => {
  console.log(`Discord math tutor logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === 1; // DM channel
  const startsWithPrefix = message.content.startsWith(PREFIX);
  if (!isDM && !startsWithPrefix) return;

  const body = startsWithPrefix
    ? message.content.slice(PREFIX.length).trim()
    : message.content.trim();

  if (!body) return;

  if (body.toLowerCase() === 'reset') {
    store.reset(message.author.id);
    await message.reply("Cleared our conversation — starting fresh.");
    return;
  }

  // Use the user's id as the conversation key, so each student keeps
  // their own thread of context whether in DMs or a shared server channel.
  const key = message.author.id;
  store.push(key, 'user', body);

  await message.channel.sendTyping();

  try {
    const history = store.get(key);
    const reply = await askTutor(history);
    store.push(key, 'assistant', reply);

    for (const part of chunk(reply)) {
      await message.reply(part);
    }
  } catch (err) {
    console.error(err);
    await message.reply(`Something went wrong: ${err.message}`);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
