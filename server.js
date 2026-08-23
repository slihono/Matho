/**
 * Matho Web Server (server-v4.js)
 * Fully compatible with the user's ORIGINAL index.html.
 * Maps POST /api/chat as expected by the frontend, routing standard messages
 * to the Socratic Tutor and /solve messages to the DeepSeek R1 Solver.
 */

const express = require('express');
const path = require('path');
const tutor = require('./tutor'); // Will load tutor.js from the same directory

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static assets from root directory
app.use(express.static(__dirname));

// Serve index.html as fallback for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * 1. UNIFIED CHAT ENDPOINT (POST /api/chat)
 * This is the crucial endpoint your original index.html calls!
 * It automatically detects if the message contains a "/solve" command.
 */
app.post('/api/chat', async (req, res) => {
  const { message, customApiKey } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Empty message." });
  }

  // Session handling
  const sessionId = req.headers['x-session-id'] || 'global-web-session';

  try {
    const trimmedMessage = message.trim();

    // If message starts with "/solve", route to the DeepSeek R1 solver
    if (trimmedMessage.toLowerCase().startsWith('/solve')) {
      // Remove the prefix "/solve" if the user supplied arguments after it
      const actualQuery = trimmedMessage.substring(6).trim();
      if (!actualQuery) {
        return res.json({ response: "Please provide a math problem to solve after /solve. (e.g. /solve integrate x^2 from 0 to 1)" });
      }
      
      const result = await tutor.solveDirect(sessionId, actualQuery, customApiKey);
      return res.json({ response: result.response });
    }

    // Default: Route to Socratic Tutor (Gemini + Wolfram Alpha)
    const result = await tutor.askTutor(sessionId, trimmedMessage, customApiKey);
    return res.json({ response: result.response });

  } catch (error) {
    console.error("Chat Server Error:", error);
    res.status(500).json({ error: error.message || "An error occurred on the calculation server." });
  }
});

/**
 * 2. EXERCISE ENDPOINTS (POST /api/exercise/new)
 */
app.post('/api/exercise/new', async (req, res) => {
  const { subject, difficulty, customApiKey } = req.body;
  try {
    const exercise = await tutor.generateExercise(subject, difficulty, customApiKey);
    res.json(exercise);
  } catch (error) {
    console.error("Exercise Generation Error:", error);
    res.status(500).json({ error: "Unable to generate the exercise." });
  }
});

/**
 * 3. EXERCISE EVALUATION (POST /api/exercise/submit)
 */
app.post('/api/exercise/submit', async (req, res) => {
  const { problem, userAnswer, correctAnswer, customApiKey } = req.body;
  try {
    const feedback = await tutor.checkExercise(problem, userAnswer, correctAnswer, customApiKey);
    res.json(feedback);
  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({ error: "Unable to evaluate your answer." });
  }
});

/**
 * 4. CLEAR HISTORY
 */
app.post('/api/chat/reset', (req, res) => {
  const sessionId = 'global-web-session';
  tutor.clearHistory(sessionId);
  res.json({ success: true, message: "History cleared." });
});

// Start listening
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 MATHO SERVER STARTED SUCCESSFULLY!`);
  console.log(`🌐 Web Application: http://localhost:${PORT}`);
  console.log(`=========================================`);
});

// CRITICAL FOR VERCEL SERVERLESS FUNCTIONS
module.exports = app;
