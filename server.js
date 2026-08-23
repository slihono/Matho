/**
 * Matho Web Server (server.js) - Version 5 (Stable)
 * Fully compatible with the user's ORIGINAL index.html AND our new PWA version.
 * Maps POST /api/chat as expected by the original frontend, returning BOTH 'reply' and 'response'.
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
 * It returns BOTH 'reply' (original spec) and 'response' (PWA spec) to avoid any undefined errors.
 */
app.post('/api/chat', async (req, res) => {
  const { message, customApiKey } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Empty message." });
  }

  // Session handling
  const sessionId = req.body.sessionId || req.headers['x-session-id'] || 'global-web-session';

  try {
    const trimmedMessage = message.trim();

    // If message starts with "/solve", route to the DeepSeek R1 solver
    if (trimmedMessage.toLowerCase().startsWith('/solve')) {
      // Remove the prefix "/solve" if the user supplied arguments after it
      const actualQuery = trimmedMessage.substring(6).trim();
      if (!actualQuery) {
        const errorMsg = "Please provide a math problem to solve after /solve. (e.g. /solve find the derivative of x^2)";
        return res.json({ reply: errorMsg, response: errorMsg });
      }
      
      const result = await tutor.solveDirect(sessionId, actualQuery, customApiKey);
      return res.json({ 
        reply: result.response, 
        response: result.response 
      });
    }

    // Default: Route to Socratic Tutor (Gemini + Wolfram Alpha)
    const result = await tutor.askTutor(sessionId, trimmedMessage, customApiKey);
    return res.json({ 
      reply: result.response, 
      response: result.response 
    });

  } catch (error) {
    console.error("Chat Server Error:", error);
    res.status(500).json({ error: error.message || "An error occurred on the calculation server." });
  }
});

/**
 * 2. EXERCISE ENDPOINTS (POST /api/exercise/new)
 */
app.post('/api/exercise/new', async (req, res) => {
  const sessionId = req.body.sessionId || 'global-web-session';
  const { subject, difficulty, customApiKey } = req.body;
  try {
    const exercise = await tutor.generateExercise(subject, difficulty, customApiKey);
    
    // Send standard fields + fallback mock score to keep original index.html happy
    res.json({
      problem: exercise.problem,
      correctAnswer: exercise.correctAnswer,
      hints: exercise.hints,
      score: { correct: 0, total: 0 } // fallback score wrapper for original frontend
    });
  } catch (error) {
    console.error("Exercise Generation Error:", error);
    res.status(500).json({ error: "Unable to generate the exercise." });
  }
});

/**
 * 3. EXERCISE EVALUATION (POST /api/exercise/submit)
 */
app.post('/api/exercise/submit', async (req, res) => {
  const sessionId = req.body.sessionId || 'global-web-session';
  const { problem, userAnswer, answer, correctAnswer, customApiKey } = req.body;
  
  // Support both original 'answer' parameter and PWA 'userAnswer' parameter
  const submittedAnswer = answer || userAnswer;
  const targetCorrectAnswer = correctAnswer || ""; // In original HTML, server holds exercise state, so we handle it gracefully

  try {
    // If the original frontend calls this, we evaluate using Gemini based on standard patterns
    const feedback = await tutor.checkExercise(problem || "Math problem", submittedAnswer, targetCorrectAnswer, customApiKey);
    res.json({
      correct: feedback.isCorrect,
      feedback: feedback.explanation,
      correctAnswer: targetCorrectAnswer,
      score: { correct: 0, total: 0 } // fallback score wrapper
    });
  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({ error: "Unable to evaluate your answer." });
  }
});

/**
 * 4. CLEAR HISTORY
 */
app.post('/api/chat/reset', (req, res) => {
  const sessionId = req.body.sessionId || 'global-web-session';
  tutor.clearHistory(sessionId);
  res.json({ success: true, message: "History cleared." });
});

/**
 * 5. SUBJECTS (For original HTML subject dropdown)
 */
app.get('/api/subjects', (req, res) => {
  res.json({
    subjects: ["Basic Algebra", "Calculus Derivatives", "Basic Integrals", "Trigonometry"]
  });
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
