/**
 * Matho Web Server (server.js) - Version 6 (August 2026 Production-Ready)
 * Serves the PWA web client and acts as a gateway proxy for Gemini 3.7 Flash + Wolfram Alpha + Groq (GPT-OSS 120b).
 * Matches the original user index.html API calls exactly (POST /api/chat, POST /api/reset, GET /api/subjects, etc.)
 */

const express = require('express');
const path = require('path');
const tutor = require('./tutor'); // Loads tutor.js from root

// Configure environment variables (loads .env if in local dev)
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parser
app.use(express.json());

// Serve static web app assets from root
app.use(express.static(__dirname));

// Serve files specifically from root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// In-memory score store and current exercise store to check answers
const userScores = new Map(); // sessionId -> { correct, total }
const activeExercises = new Map(); // sessionId -> { problem, correctAnswer }

function getScore(sessionId) {
  if (!userScores.has(sessionId)) {
    userScores.set(sessionId, { correct: 0, total: 0 });
  }
  return userScores.get(sessionId);
}

// API Gateway Endpoints matches original index.html exactly!

// 1. Unified Chat Endpoint (POST /api/chat)
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, customApiKey } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Empty message." });
  }

  const sid = sessionId || 'global-web-session';

  try {
    const trimmedMessage = message.trim();

    // If message starts with "/solve", route to the Groq reasoning solver
    if (trimmedMessage.toLowerCase().startsWith('/solve')) {
      const actualQuery = trimmedMessage.substring(6).trim();
      if (!actualQuery) {
        return res.json({ reply: "Please provide a math problem to solve after /solve. (e.g. /solve integrate x^2 from 0 to 1)" });
      }
      
      const result = await tutor.solveDirect(sid, actualQuery, customApiKey);
      return res.json({ reply: result.response });
    }

    // Default: Route to Socratic Tutor (Gemini 3.7 Flash + Wolfram)
    const result = await tutor.askTutor(sid, trimmedMessage, customApiKey);
    return res.json({ reply: result.response });

  } catch (error) {
    console.error("Chat Server Error:", error);
    res.status(500).json({ error: error.message || "An error occurred on the calculation server." });
  }
});

// 2. Clear Session History (POST /api/reset)
app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body;
  const sid = sessionId || 'global-web-session';
  
  tutor.clearHistory(sid);
  // Reset local score and active exercise for this session
  userScores.delete(sid);
  activeExercises.delete(sid);
  
  res.json({ success: true, message: "History and score reset successfully." });
});

// 3. Get math subjects list (GET /api/subjects)
app.get('/api/subjects', (req, res) => {
  res.json({
    subjects: [
      "Calculus 1 & 2",
      "Discrete Math",
      "Algebra",
      "Trigonometry",
      "Linear Algebra"
    ]
  });
});

// 4. Generate New Exercise (POST /api/exercise/new)
app.post('/api/exercise/new', async (req, res) => {
  const { sessionId, subject, difficulty, customApiKey } = req.body;
  const sid = sessionId || 'global-web-session';
  try {
    const exercise = await tutor.generateExercise(subject, difficulty, customApiKey);
    
    // Store active exercise so we can check the answer
    activeExercises.set(sid, {
      problem: exercise.problem,
      correctAnswer: exercise.correctAnswer
    });

    res.json({
      problem: exercise.problem,
      score: getScore(sid)
    });
  } catch (error) {
    console.error("Exercise Generation Error:", error);
    res.status(500).json({ error: "Unable to generate the exercise." });
  }
});

// 5. Submit Exercise Response (POST /api/exercise/submit)
app.post('/api/exercise/submit', async (req, res) => {
  const { sessionId, answer, customApiKey } = req.body;
  const sid = sessionId || 'global-web-session';
  
  const activeEx = activeExercises.get(sid);
  if (!activeEx) {
    return res.status(400).json({ error: "No active exercise found for this session. Please generate one first." });
  }

  try {
    const evaluation = await tutor.checkExercise(activeEx.problem, answer, activeEx.correctAnswer, customApiKey);
    
    const score = getScore(sid);
    score.total++;
    if (evaluation.isCorrect) {
      score.correct++;
      activeExercises.delete(sid); // Clear so they can generate a new one
    }
    userScores.set(sid, score);

    res.json({
      correct: evaluation.isCorrect,
      feedback: evaluation.explanation,
      correctAnswer: activeEx.correctAnswer,
      score: score
    });
  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({ error: "Unable to evaluate your answer." });
  }
});

// Static assets mappings for PWA
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/service-worker.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'service-worker.js'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 MATHO SERVER STARTED SUCCESSFULLY!`);
  console.log(`🌐 Web Application: http://localhost:${PORT}`);
  console.log(`=========================================`);
});

// Export app for Vercel Serverless compatibility
module.exports = app;