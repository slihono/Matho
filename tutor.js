// core/tutor.js
// Shared "brain" for the math tutor bot. Web, Discord, and Telegram
// front-ends all call askTutor() from this file, so the teaching
// behavior stays identical everywhere and only needs to be tuned once.

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a patient, encouraging math tutor covering exactly these subjects:
- Calculus 1 (limits, derivatives, applications of derivatives, intro integrals)
- Calculus 2 (integration techniques, series/sequences, polar/parametric, applications)
- Discrete Math (logic, proofs, sets, combinatorics, graph theory, induction, recursion)
- Algebra (equations, functions, polynomials, exponents/logs, systems of equations)
- Trigonometry (unit circle, identities, trig equations, graphs of trig functions)
- Linear Algebra (vectors, matrices, determinants, eigenvalues/eigenvectors, vector spaces, linear transformations)

TEACHING STYLE:
- Default to a Socratic approach: don't just hand over the final answer to a homework-shaped problem. Ask a guiding question, give a hint, or walk through one step and ask the student to do the next.
- If the student explicitly asks for a full worked solution, or says they've already tried and are stuck, give the complete step-by-step solution clearly.
- Always show your work step by step — never skip algebra steps that a struggling student would stumble on.
- Check understanding periodically ("Does that step make sense?" / "Want to try the next part?").
- Keep explanations concise per turn. Long unbroken lectures lose students — prefer short exchanges over one giant wall of text.
- Use plain-text math notation (x^2, sqrt(x), integral of f(x) dx, sum from i=1 to n) rather than LaTeX, since this bot runs on Discord and Telegram where LaTeX doesn't render.
- If a student's answer is wrong, don't just say "wrong" — point at the specific step where the error likely happened.
- If asked something outside these six subjects, gently say that's outside what this tutor covers and steer back.
- Be warm and encouraging, but don't pad with empty praise — be honest when something is actually incorrect.
- Proactively offer practice: after explaining a concept, offer the student a short practice problem on it ("Want to try one?"). If they say yes, give ONE problem, wait for their attempt, then check it and explain any mistake before offering another. Don't dump multiple problems at once unless asked for a batch.`;

/**
 * Send a conversation to Claude and get the tutor's reply.
 * @param {Array<{role: 'user'|'assistant', content: string}>} history
 *   Full conversation so far, oldest first. Each front-end is responsible
 *   for keeping and passing this (Claude is stateless between calls).
 * @returns {Promise<string>} the tutor's reply text
 */
async function askTutor(history) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : "(I didn't get a text response — try again.)";
}

const SUBJECTS = [
  'Calculus 1',
  'Calculus 2',
  'Discrete Math',
  'Algebra',
  'Trigonometry',
  'Linear Algebra',
];

const EXERCISE_SYSTEM_PROMPT = `You generate a single math practice problem for a student, for one of these subjects: ${SUBJECTS.join(', ')}.
Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{"problem": "the problem statement, plain text math notation (x^2, sqrt(x), etc, no LaTeX)", "answer": "the correct final answer, as a short plain-text string", "solution": "a brief step-by-step solution, plain text"}
The problem must match the requested subject and difficulty. Keep the problem statement to 1-3 sentences.`;

const CHECK_SYSTEM_PROMPT = `You grade a student's answer to a math practice problem.
You will be given the problem, the correct answer/solution, and the student's submitted answer.
Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{"correct": true or false, "feedback": "1-3 sentences: if correct, brief confirmation; if incorrect, point at the specific step or concept where the error likely happened, without just restating the full solution unless the student got it very wrong"}
Be lenient about equivalent forms of the same correct answer (e.g. "1/2" vs "0.5", "2x" vs "x*2").`;

function extractJson(text) {
  const cleaned = text.replace(/^```json\s*|^```\s*|```\s*$/gm, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Generate one practice problem for a subject/difficulty.
 * @param {string} subject one of SUBJECTS
 * @param {string} difficulty e.g. 'easy' | 'medium' | 'hard'
 * @returns {Promise<{problem: string, answer: string, solution: string}>}
 */
async function generateExercise(subject, difficulty) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: EXERCISE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Subject: ${subject}\nDifficulty: ${difficulty}\nGenerate one problem.`,
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return extractJson(textBlock.text);
}

/**
 * Grade a student's submitted answer against the stored solution.
 * @returns {Promise<{correct: boolean, feedback: string}>}
 */
async function checkExercise(problem, correctAnswer, solution, studentAnswer) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: CHECK_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Problem: ${problem}\nCorrect answer: ${correctAnswer}\nSolution: ${solution}\nStudent's answer: ${studentAnswer}`,
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return extractJson(textBlock.text);
}

// Tracks generated-but-not-yet-answered exercises and running score,
// keyed by the same session key used for ConversationStore.
class ExerciseStore {
  constructor() {
    this.pending = new Map(); // sessionId -> {problem, answer, solution, subject}
    this.scores = new Map(); // sessionId -> {correct, total}
  }

  setPending(key, exercise) {
    this.pending.set(key, exercise);
  }

  getPending(key) {
    return this.pending.get(key);
  }

  recordResult(key, wasCorrect) {
    const score = this.scores.get(key) || { correct: 0, total: 0 };
    score.total += 1;
    if (wasCorrect) score.correct += 1;
    this.scores.set(key, score);
    return score;
  }

  getScore(key) {
    return this.scores.get(key) || { correct: 0, total: 0 };
  }
}

// Simple in-memory per-conversation history store, shared helper so
// every front-end doesn't reinvent trimming logic.
// Keyed by an arbitrary string (user id, channel id, session id, etc.)
const MAX_TURNS = 20; // keep last 20 messages (10 exchanges) per conversation

class ConversationStore {
  constructor() {
    this.conversations = new Map();
  }

  get(key) {
    if (!this.conversations.has(key)) {
      this.conversations.set(key, []);
    }
    return this.conversations.get(key);
  }

  push(key, role, content) {
    const history = this.get(key);
    history.push({ role, content });
    if (history.length > MAX_TURNS) {
      history.splice(0, history.length - MAX_TURNS);
    }
    return history;
  }

  reset(key) {
    this.conversations.set(key, []);
  }
}

module.exports = {
  askTutor,
  ConversationStore,
  SYSTEM_PROMPT,
  SUBJECTS,
  generateExercise,
  checkExercise,
  ExerciseStore,
};
