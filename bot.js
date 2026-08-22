/**
 * Matho Discord Bot (bot.js)
 * High-performance math tutor Discord bot featuring both Socratic and Direct Solving modes.
 */

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const tutor = require('./tutor-v2');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

const PREFIX = '!';
const userExercises = new Map(); // Store current active exercise for users
const userScores = new Map(); // {userId: {correct: 0, total: 0}}

client.once('ready', () => {
  console.log(`🤖 Matho Discord Bot connected as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  const text = message.content.trim();
  const userId = message.author.id;
  const isDM = !message.guild;

  // Determine if it is a command (starts with ! or / or is a DM)
  const hasPrefix = text.startsWith('!') || text.startsWith('/');
  if (!hasPrefix && !isDM) return; // In a server, a prefix is required

  // Clean the command to extract name and arguments
  let commandText = text;
  if (hasPrefix) {
    commandText = text.substring(1); // Remove ! or /
  }

  const parts = commandText.split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  try {
    // ---- COMMAND: RESET ----
    if (command === 'reset' || text.toLowerCase() === 'reset') {
      tutor.clearHistory(userId);
      userExercises.delete(userId);
      return message.reply("🧹 **Conversation history reset!** You can ask me a new question now.");
    }

    // ---- COMMAND: HELP ----
    if (command === 'help' || command === 'aide') {
      const embed = new EmbedBuilder()
        .setColor('#3b82f6')
        .setTitle('📐 Matho — User Guide')
        .setDescription('I am your intelligent mathematics tutor. Here is how to use me:')
        .addFields(
          { name: '🧠 Socratic Mode (Learn)', value: '`!tutor <your question>`\nI will help you understand the problem yourself without giving the direct answer.' },
          { name: '⚡ Direct Solver Mode (Groq / R1)', value: '`!solve <your problem>`\nI will directly give you the exact final result and the technical explanation.' },
          { name: '📝 Practice', value: '`!exercise` : Generates a customized math exercise.' },
          { name: '🏆 Progression', value: '`!score` : Displays your current exercise score.' },
          { name: '🔄 Reset', value: '`!reset` : Clears your history to start a new topic.' }
        )
        .setFooter({ text: 'Matho Bot — Powered by Gemini & DeepSeek R1' });

      return message.reply({ embeds: [embed] });
    }

    // ---- COMMAND: SCORE ----
    if (command === 'score') {
      const score = userScores.get(userId) || { correct: 0, total: 0 };
      return message.reply(`🏆 **Your Exercise Score:** ${score.correct} / ${score.total} correct answers.`);
    }

    // ---- COMMAND: EXERCISE ----
    if (command === 'exercise' || command === 'exercice') {
      await message.channel.sendTyping();
      // Choose a random subject and difficulty
      const subjects = ["Basic Algebra", "Calculus Derivatives", "Basic Integrals", "Trigonometry"];
      const subject = subjects[Math.floor(Math.random() * subjects.length)];
      
      const exerciseData = await tutor.generateExercise(subject, "Medium");
      userExercises.set(userId, exerciseData);

      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle(`📝 New Math Challenge!`)
        .setDescription(`**Topic:** ${subject}\n\n**Problem:**\n${exerciseData.problem}`)
        .addFields({ name: '💡 Hints', value: 'To get a hint, type `!hint`! To submit your answer, type `!answer <your answer>`' })
        .setFooter({ text: 'Submit your answer as clearly as possible.' });

      return message.reply({ embeds: [embed] });
    }

    // ---- COMMAND: HINT ----
    if (command === 'hint' || command === 'indice') {
      const activeEx = userExercises.get(userId);
      if (!activeEx) {
        return message.reply("You do not have an active exercise at the moment. Type `!exercise` to generate one!");
      }
      return message.reply(`💡 **Hint:** ${activeEx.hints[0]}`);
    }

    // ---- COMMAND: ANSWER ----
    if (command === 'answer' || command === 'reponse' || command === 'réponse') {
      const activeEx = userExercises.get(userId);
      if (!activeEx) {
        return message.reply("You do not have an active exercise at the moment. Type `!exercise` to start.");
      }
      if (!args) {
        return message.reply("Don't forget to enter your answer! (Example: `!answer 5`) ");
      }

      await message.channel.sendTyping();
      const feedback = await tutor.checkExercise(activeEx.problem, args, activeEx.correctAnswer);
      
      // Update score
      const score = userScores.get(userId) || { correct: 0, total: 0 };
      score.total++;
      if (feedback.isCorrect) {
        score.correct++;
        userExercises.delete(userId); // Successfully completed, remove it
      }
      userScores.set(userId, score);

      const embed = new EmbedBuilder()
        .setColor(feedback.isCorrect ? '#10b981' : '#f43f5e')
        .setTitle(feedback.isCorrect ? '✅ Challenge Completed!' : '❌ Not quite right...')
        .setDescription(feedback.explanation)
        .addFields({ name: '📊 Your Current Score', value: `${score.correct} / ${score.total}` });

      return message.reply({ embeds: [embed] });
    }

    // ---- COMMAND: SOLVE DIRECT (DeepSeek R1) ----
    if (command === 'solve') {
      if (!args) {
        return message.reply("Please provide a problem to solve. (Example: `!solve find the derivative of x^2 + 5x`) ");
      }

      await message.channel.sendTyping();
      const result = await tutor.solveDirect(userId, args);

      const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle('⚡ Direct Solution (DeepSeek R1)')
        .setDescription(result.response);

      if (result.thinking) {
        // Truncate the thinking process if it exceeds Discord's embed field limits
        const thinkingTruncated = result.thinking.length > 1000 
          ? result.thinking.substring(0, 990) + '...' 
          : result.thinking;
        embed.addFields({ name: '🧠 Logical Thinking Process', value: `*${thinkingTruncated}*` });
      }

      return message.reply({ embeds: [embed] });
    }

    // ---- COMMAND: TUTOR SOCRATIC (Gemini + Wolfram) ----
    if (command === 'tutor' || isDM) {
      const query = command === 'tutor' ? args : text;
      if (!query) {
        return message.reply("Please ask me your math question! (Example: `!tutor explain fractions to me`) ");
      }

      await message.channel.sendTyping();
      const result = await tutor.askTutor(userId, query);

      return message.reply(result.response);
    }

  } catch (error) {
    console.error("Error occurred in Discord bot:", error);
    return message.reply("⚠️ Sorry, an error occurred while executing this command.");
  }
});

// Bot authentication using environment Token
if (process.env.DISCORD_BOT_TOKEN) {
  client.login(process.env.DISCORD_BOT_TOKEN).catch(e => {
    console.error("Discord bot authentication error (incorrect or expired Token):", e.message);
  });
} else {
  console.warn("DISCORD_BOT_TOKEN is missing in environment variables. Discord bot will not start.");
}
