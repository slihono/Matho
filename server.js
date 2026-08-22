/**
 * Matho Web Server (server.js)
 * Serves the PWA web client and acts as a gateway proxy for Gemini + Wolfram Alpha + Groq.
 */

const express = require('express');
const path = require('path');
const tutor = require('./tutor-v2');

// Configure environment variables (loads .env if in local dev)
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parser
app.use(express.json());

// Serve static web app assets from root
app.use(express.static(__dirname));

// Serve files specifically from the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/service-worker.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'service-worker.js'));
});

// API Gateway Endpoints

// 1. Socratic Tutor (Gemini + Wolfram Alpha)
app.post('/api/chat/tutor', async (req, res) => {
  const { message, customApiKey } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Empty message." });
  }

  // Identify user session
  const sessionId = req.headers['x-session-id'] || 'global-web-tutor-session';

  try {
    const result = await tutor.askTutor(sessionId, message, customApiKey);
    res.json(result);
  } catch (error) {
    console.error("Socratic Error:", error);
    res.status(500).json({ error: error.message || "An error occurred during the call." });
  }
});

// 2. Direct Solver (Groq + DeepSeek R1)
app.post('/api/chat/solve', async (req, res) => {
  const { message, customApiKey } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Empty message." });
  }

  const sessionId = req.headers['x-session-id'] || 'global-web-solve-session';

  try {
    const result = await tutor.solveDirect(sessionId, message, customApiKey);
    res.json(result);
  } catch (error) {
    console.error("Direct Solve Error:", error);
    res.status(500).json({ error: error.message || "An error occurred on the resolution API." });
  }
});

// 3. Reset Session History
app.post('/api/chat/reset', (req, res) => {
  const tutorSession = 'global-web-tutor-session';
  const solveSession = 'global-web-solve-session';
  
  tutor.clearHistory(tutorSession);
  tutor.clearHistory(solveSession);
  
  res.json({ success: true, message: "History reset successfully." });
});

// 4. Generate New Exercise
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

// 5. Submit Exercise Response
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

// Start listening
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 MATHO SERVER STARTED SUCCESSFULLY!`);
  console.log(`🌐 Web Application: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
