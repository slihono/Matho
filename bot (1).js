/**
 * Matho Telegram Bot (telegram-bot.js)
 * High-performance math tutor Telegram bot featuring both Socratic and Direct Solving modes.
 */

const TelegramBot = require('node-telegram-bot-api');
const tutor = require('./tutor-v2');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.warn("TELEGRAM_BOT_TOKEN is missing in environment variables. Telegram bot will not start.");
  return;
}

// Initialize Telegram bot in polling mode
const bot = new TelegramBot(token, { polling: true });

const userExercises = new Map(); // Store current active exercise for users
const userScores = new Map(); // {chatId: {correct: 0, total: 0}}

console.log(`🤖 Matho Telegram Bot ready and listening!`);

// Help Handler (/start or /help or /aide)
bot.onText(/\/(start|help|aide)/, (msg) => {
  const chatId = msg.chat.id;

  const helpText = `
📐 *Welcome to Matho!*

I am your intelligent mathematics tutor. Here are my commands:

🧠 *Socratic Mode (Learn)*
Ask me any question directly or use \`/tutor <your question>\`. I will guide you step-by-step without giving you the raw final answer.

⚡ *Direct Solver Mode (Groq / DeepSeek R1)*
Use \`/solve <your problem>\` to immediately obtain the exact final answer and its mathematical demonstration.

📝 *Practice*
Use \`/exercise\` to generate a customized math challenge.
Use \`/answer <your answer>\` to submit your final answer (e.g. \`/answer 5\`).
Use \`/hint\` if you are stuck.

🏆 *Progression & Settings*
\`/score\` : Displays your exercise score.
\`/reset\` : Clears your session history to start a fresh topic.
`;

  bot.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
});

// Reset Session (/reset)
bot.onText(/\/reset/, (msg) => {
  const chatId = msg.chat.id;
  tutor.clearHistory(chatId);
  userExercises.delete(chatId);
  bot.sendMessage(chatId, "🧹 *History reset!* You can now ask me a new math question.", { parse_mode: 'Markdown' });
});

// Display score (/score)
bot.onText(/\/score/, (msg) => {
  const chatId = msg.chat.id;
  const score = userScores.get(chatId) || { correct: 0, total: 0 };
  bot.sendMessage(chatId, `🏆 *Your Exercise Score:* ${score.correct} / ${score.total} correct answers.`, { parse_mode: 'Markdown' });
});

// Request a new exercise (/exercise)
bot.onText(/\/(exercise|exercice)/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendChatAction(chatId, 'typing');

  try {
    const subjects = ["Basic Algebra", "Calculus Derivatives", "Basic Integrals", "Trigonometry"];
    const subject = subjects[Math.floor(Math.random() * subjects.length)];
    
    const exerciseData = await tutor.generateExercise(subject, "Medium");
    userExercises.set(chatId, exerciseData);

    const exerciseMsg = `
📝 *New Math Challenge!*
*Topic:* ${subject}

*Problem:*
${exerciseData.problem}

💡 _Need help? Type_ \`/hint\` _to get a clue!_
👉 _To answer, type_ \`/answer <your answer>\` _(e.g., \`/answer 5\`)._
*Submit your answer as clearly as possible.*
`;

    bot.sendMessage(chatId, exerciseMsg, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "⚠️ Unable to generate an exercise at this moment.");
  }
});

// Request a hint (/hint)
bot.onText(/\/(hint|indice)/, (msg) => {
  const chatId = msg.chat.id;
  const activeEx = userExercises.get(chatId);
  if (!activeEx) {
    return bot.sendMessage(chatId, "You do not have an active exercise. Use \\`/exercise\\` to generate one.");
  }
  bot.sendMessage(chatId, `💡 *Hint:* ${activeEx.hints[0]}`, { parse_mode: 'Markdown' });
});

// Submit answer (/answer)
bot.onText(/\/(answer|reponse|réponse)(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const activeEx = userExercises.get(chatId);
  const userAnswer = match[2] ? match[2].trim() : null;

  if (!activeEx) {
    return bot.sendMessage(chatId, "You do not have an active exercise. Use \\`/exercise\\` to start.");
  }
  if (!userAnswer) {
    return bot.sendMessage(chatId, "Don't forget to enter your answer! (Example: \\`/answer 5\\`)");
  }

  bot.sendChatAction(chatId, 'typing');

  try {
    const feedback = await tutor.checkExercise(activeEx.problem, userAnswer, activeEx.correctAnswer);
    
    const score = userScores.get(chatId) || { correct: 0, total: 0 };
    score.total++;
    
    let feedbackMsg = "";
    if (feedback.isCorrect) {
      score.correct++;
      userExercises.delete(chatId); // Completed successfully!
      feedbackMsg = `✅ *Challenge Completed!*\\n\\n${feedback.explanation}\\n\\n🏆 *Score:* ${score.correct} / ${score.total}`;
    } else {
      feedbackMsg = `❌ *Not quite right...*\\n\\n${feedback.explanation}\\n\\n🏆 *Score:* ${score.correct} / ${score.total}`;
    }
    
    userScores.set(chatId, score);
    bot.sendMessage(chatId, feedbackMsg, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "⚠️ An error occurred during evaluation.");
  }
});

// Direct solver with DeepSeek R1 (/solve)
bot.onText(/\/solve(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const problem = match[1] ? match[1].trim() : null;

  if (!problem) {
    return bot.sendMessage(chatId, "Please provide your problem to solve directly! (Example: \\`/solve find x for 3x + 1 = 10\\`)");
  }

  bot.sendChatAction(chatId, 'typing');

  try {
    const result = await tutor.solveDirect(chatId, problem);
    
    let reply = `⚡ *Direct Solution (DeepSeek R1):*\\n\\n${result.response}`;
    if (result.thinking) {
      reply += `\\n\\n🧠 *Thinking Process:*\\n_${result.thinking.substring(0, 500)}..._`;
    }

    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "⚠️ An error occurred on the calculation server.");
  }
});

// General message handler (Socratic by default if not a command)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : "";

  // Ignore if it is a command (starts with /)
  if (text.startsWith('/')) return;

  bot.sendChatAction(chatId, 'typing');

  try {
    const result = await tutor.askTutor(chatId, text);
    bot.sendMessage(chatId, result.response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "⚠️ Sorry, a technical error occurred. Please verify my API keys configuration.");
  }
});
