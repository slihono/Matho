/**
 * Matho Central Tutor Brain (core/tutor.js) - Version 2 (English)
 * Implements Socratic Tutoring (Gemini + Wolfram Alpha) and Direct Solving (Groq + DeepSeek R1).
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// In-memory Conversation Store (grouped by sessionId)
const conversationHistory = new Map();

// Maximum messages to keep in history to avoid high token usage / cost
const MAX_HISTORY = 20;

// Socratic System Prompt (tutor mode)
const SYSTEM_PROMPT = `
You are Matho, an exceptional, patient, encouraging, and pedagogical mathematics tutor.
Your role is to guide the student using the SOCRATIC METHOD.

Fundamental Behavioral Rules:
1. NEVER GIVE THE DIRECT ANSWER to a problem. Even if the student insists.
2. Break down complex problems into simple, manageable sub-steps.
3. Ask only one guiding question at a time to lead the student to the next step of their own reasoning.
4. Gently point out logical or calculation errors, and ask the student to re-analyze that specific part.
5. Sincerely praise efforts and successful steps taken.
6. Once the student has found the correct solution on their own, proactively suggest a short similar practice problem to consolidate their understanding ("Would you like to try a similar exercise?").
7. Always remain warm, encouraging, and supportive. Respond in the same language as the user's query (e.g. French if they write in French, English if they write in English).
`;

// Direct Solver System Prompt (solve mode)
const DIRECT_PROMPT = `
You are Matho (Direct Solver Mode), a university-level mathematics expert.
Your role is to DIRECTLY, QUICKLY, and ultra-clearly provide the exact final answer to a problem, without any socratic tutoring.

Fundamental Behavioral Rules:
1. Give the exact result at the very beginning of your message (e.g., "The answer is: **x = 5**").
2. Immediately follow with a clear, concise step-by-step mathematical demonstration explaining the logic or formulas used to find the result.
3. Use Markdown and LaTeX (wrapped in $$ or $ for inline) for high readability.
4. Do not ask questions to the student; conclude directly.
5. Respond in the same language as the user's query (e.g., French if they write in French, English if they write in English).
`;

/**
 * Helper to get Gemini API Client
 */
function getGeminiClient(customApiKey) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Gemini API Key. Please configure it in your settings.");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Query Wolfram Alpha Short Answers API
 */
async function queryWolframAlpha(query) {
  const appId = process.env.WOLFRAM_APP_ID;
  if (!appId) {
    console.warn("WOLFRAM_APP_ID is not configured. Direct IA calculation only.");
    return null;
  }

  try {
    const url = `https://api.wolframalpha.com/v1/result?i=${encodeURIComponent(query)}&appid=${appId}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Wolfram Alpha returned status: ${response.status}`);
      return null;
    }
    const resultText = await response.text();
    return resultText.trim();
  } catch (error) {
    console.error("Error calling Wolfram Alpha API:", error);
    return null;
  }
}

/**
 * Math Router - Asks Gemini if the user's message requires a calculation
 * and translates it into a Wolfram Alpha compatible query.
 */
async function routeAndTranslate(message, customApiKey) {
  try {
    const genAI = getGeminiClient(customApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const routerPrompt = `
Analyze the following user message: "${message}"
Determine if this message contains a math calculation request, an equation to solve, an integral, a derivative, a simplification, or any math question requiring precise computation.

Respond STRICTLY in JSON format with the following structure:
{
  "needsCalculation": true or false,
  "wolframQuery": "the translated mathematical formula in English for Wolfram Alpha (e.g., 'integrate x^2 from 0 to 5' or 'solve 3x + 5 = 12') or null if needsCalculation is false"
}
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: routerPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const responseText = result.response.text();
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Error in Math Router:", error);
    return { needsCalculation: false, wolframQuery: null };
  }
}

/**
 * Retrieve or initialize history for a session
 */
function getHistory(sessionId) {
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, []);
  }
  return conversationHistory.get(sessionId);
}

/**
 * Trim history to keep it within budget
 */
function trimHistory(history) {
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

/**
 * Clear conversation history for a user
 */
function clearHistory(sessionId) {
  conversationHistory.delete(sessionId);
  return { success: true, message: "History cleared successfully!" };
}

/**
 * Socratic Chat (Gemini + Wolfram Alpha)
 */
async function askTutor(sessionId, message, customApiKey = null) {
  const history = getHistory(sessionId);
  const genAI = getGeminiClient(customApiKey);
  
  // 1. Math Router: Should we calculate something with Wolfram Alpha?
  const route = await routeAndTranslate(message, customApiKey);
  let wolframResult = null;

  if (route.needsCalculation && route.wolframQuery) {
    console.log(`[Math Router] Wolfram query detected: "${route.wolframQuery}"`);
    wolframResult = await queryWolframAlpha(route.wolframQuery);
    if (wolframResult) {
      console.log(`[Math Router] Wolfram result obtained: "${wolframResult}"`);
    }
  }

  // 2. Prepare final prompt for Gemini
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Convert our local history to Gemini API format
  const geminiHistory = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  // Initialize Gemini chat with the system prompt
  const chat = model.startChat({
    history: geminiHistory,
    systemInstruction: SYSTEM_PROMPT
  });

  // Inject Wolfram result in context if available
  let finalUserMessage = message;
  if (wolframResult) {
    finalUserMessage = `[System Note: The exact mathematical calculation validated by Wolfram Alpha for this problem is: "${wolframResult}". Use it as absolute authority of the result but guide me in a Socratic way without giving it to me directly.]\n\n${message}`;
  }

  // Send message to chat
  const result = await chat.sendMessage(finalUserMessage);
  const responseText = result.response.text();

  // Save to local history
  history.push({ role: 'user', content: message });
  history.push({ role: 'assistant', content: responseText });
  trimHistory(history);

  return {
    response: responseText,
    usedWolfram: !!wolframResult,
    wolframQuery: route.wolframQuery
  };
}

/**
 * Direct Solver Chat (Groq + DeepSeek R1 / Llama 3.1)
 */
async function solveDirect(sessionId, message, customApiKey = null) {
  const history = getHistory(sessionId);
  const apiKey = customApiKey || process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("Missing Groq API Key for direct solver.");
  }

  try {
    const groqHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-r1-distill-llama-70b',
        messages: [
          { role: 'system', content: DIRECT_PROMPT },
          ...groqHistory,
          { role: 'user', content: message }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    let responseText = data.choices[0].message.content;

    // Format thinking process from DeepSeek
    let thinkingProcess = "";
    if (responseText.includes("<think>")) {
      const parts = responseText.split("</think>");
      thinkingProcess = parts[0].replace("<think>", "").trim();
      responseText = parts[1].trim();
    }

    // Save to history
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: responseText });
    trimHistory(history);

    return {
      response: responseText,
      thinking: thinkingProcess || null
    };
  } catch (error) {
    console.error("Error in Groq/DeepSeek direct solver:", error);
    throw error;
  }
}

/**
 * Exercises Module - Generates a new math problem using Gemini
 */
async function generateExercise(subject, difficulty, customApiKey = null) {
  try {
    const genAI = getGeminiClient(customApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Generate a unique mathematics exercise on the topic: "${subject}" with difficulty level: "${difficulty}".
Respond in the language of the request if specified, or detect context. Write math formulas in LaTeX (e.g. $f(x) = x^2$).

Respond STRICTLY in JSON format with the following structure:
{
  "problem": "Clear statement of the exercise, using LaTeX for formulas (e.g. $f(x) = x^2$)",
  "correctAnswer": "The exact expected answer (e.g. '5', '2x + 3', '1/2')",
  "hints": ["Hint 1 to help the student if needed", "Hint 2 slightly more specific"]
}
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Error generating exercise:", error);
    throw error;
  }
}

/**
 * Exercises Module - Evaluates student answer
 */
async function checkExercise(problem, userAnswer, correctAnswer, customApiKey = null) {
  try {
    const genAI = getGeminiClient(customApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Evaluate a student's answer to a mathematics exercise.
Exercise: "${problem}"
Expected answer: "${correctAnswer}"
Student's answer: "${userAnswer}"

Determine if the answer is correct (or mathematically equivalent, e.g., if they input "0.5" instead of "1/2").
Provide a warm, constructive, pedagogical explanation of 2-3 sentences max. Respond in the language used by the student's answer or the problem.

Respond STRICTLY in JSON format with the following structure:
{
  "isCorrect": true or false,
  "explanation": "Your pedagogical feedback explaining why they are correct or where they went wrong"
}
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Error evaluating exercise:", error);
    return { isCorrect: false, explanation: "Could not evaluate the answer at this moment." };
  }
}

module.exports = {
  askTutor,
  solveDirect,
  clearHistory,
  generateExercise,
  checkExercise,
  SYSTEM_PROMPT,
  DIRECT_PROMPT
};
