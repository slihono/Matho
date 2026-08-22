// web/server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const {
  askTutor,
  ConversationStore,
  SUBJECTS,
  generateExercise,
  checkExercise,
  ExerciseStore,
} = require('../core/tutor');

const app = express();
const PORT = process.env.WEB_PORT || 3000;
const store = new ConversationStore();
const exerciseStore = new ExerciseStore();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// One session per browser tab, via a client-generated id.
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    store.push(sessionId, 'user', message);
    const history = store.get(sessionId);
    const reply = await askTutor(history);
    store.push(sessionId, 'assistant', reply);

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
});

app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) store.reset(sessionId);
  res.json({ ok: true });
});

app.get('/api/subjects', (req, res) => {
  res.json({ subjects: SUBJECTS });
});

app.post('/api/exercise/new', async (req, res) => {
  try {
    const { sessionId, subject, difficulty } = req.body;
    if (!sessionId || !subject || !difficulty) {
      return res.status(400).json({ error: 'sessionId, subject, and difficulty are required' });
    }
    const exercise = await generateExercise(subject, difficulty);
    exerciseStore.setPending(sessionId, { ...exercise, subject });
    res.json({ problem: exercise.problem, score: exerciseStore.getScore(sessionId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Could not generate an exercise.' });
  }
});

app.post('/api/exercise/submit', async (req, res) => {
  try {
    const { sessionId, answer } = req.body;
    if (!sessionId || !answer) {
      return res.status(400).json({ error: 'sessionId and answer are required' });
    }
    const pending = exerciseStore.getPending(sessionId);
    if (!pending) {
      return res.status(400).json({ error: 'No pending exercise — generate one first.' });
    }
    const result = await checkExercise(pending.problem, pending.answer, pending.solution, answer);
    const score = exerciseStore.recordResult(sessionId, result.correct);
    res.json({
      correct: result.correct,
      feedback: result.feedback,
      correctAnswer: pending.answer,
      solution: pending.solution,
      score,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Could not grade the exercise.' });
  }
});

app.listen(PORT, () => {
  console.log(`Math tutor web app running at http://localhost:${PORT}`);
});
