/**
 * Matho Central Tutor Brain (tutor.js) - Version 6 (August 2026 Production-Ready)
 * High-performance math tutor brain.
 * Uses Google's stable Gemini 3.7 Flash (released August 2026) for Socratic tutoring and exercises.
 * Uses Groq's active GPT-OSS 120b (flagship reasoning model) for Direct Solving mode.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// In-memory conversation history
const conversationHistory = new Map();
const MAX_HISTORY = 20;

// Socratic System Prompt (tutor mode)
const SYSTEM_PROMPT = `
You are Matho, an exceptional, patient, encouraging, and highly pedagogical mathematics tutor.
Your role is to guide the student using the SOCRATIC METHOD.

Core Rules of Behavior:
1. NEVER GIVE THE DIRECT ANSWER to a problem. Even if the student explicitly asks for it.
2. Break down complex problems into simple, manageable sub-steps.
3. Ask exactly ONE guiding question at a time to lead the student to the next step of their own reasoning.
4. Gently point out logical or calculation errors, and ask the student to re-examine that specific part.
5. Sincerely praise effort and correct logical steps.
6. Once the student finds the correct solution on their own, offer a short, similar practice problem to consolidate their understanding ("Would you like to try a similar exercise?").
7. Always respond in the SAME language the user is speaking (e.g., if they ask in French, tutor them in French; if they ask in English, tutor them in English). Keep the tone warm and supportive.
`;

// Direct Solver System Prompt (solve mode)
const DIRECT_PROMPT = `
You are Matho (direct solver mode), a university-level mathematics expert.
Your role is to provide the exact final answer DIRECTLY, QUICKLY, and with ultra-clear technical demonstration, without Socratic tutoring.

Core Rules of Behavior:
1. Give the exact final result at the very beginning of your message (e.g., "The answer is: **x = 5**").
2. Immediately follow with a clear, step-by-step technical demonstration of the logic or formulas used to find this result.
3. Use Markdown and LaTeX (using $$ for block formulas or $ for inline formulas) to make it perfectly readable.
4. Do not ask questions to the student; conclude directly.
5. Always respond in the SAME language the user is speaking.
`;

/**
 * Helper to get Gemini API Client
 */
function getGeminiClient(customApiKey) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Gemini API Key. Please configure it in your Vercel Environment Variables.");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Query Wolfram Alpha Short Answers API
 */
async function queryWolframAlpha(query) {
  const appId = process.env.WOLFRAM_APP_ID;
  if (!appId) {
    console.warn("WOLFRAM_APP_ID not configured. Fallback to direct AI calculation.");
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
    console.error("Error calling Wolfram Alpha:", error);
    return null;
  }
}

/**
 * Math Router - Translates query to Wolfram Alpha
 * Uses gemini-3.7-flash (stable production model for 2026)
 */
async function routeAndTranslate(message, customApiKey) {
  try {
    const genAI = getGeminiClient(customApiKey);
    // Google AI Studio August 2026 stable GA model
    const model = genAI.getGenerativeModel({ model: "gemini-3.7-flash" });

    const routerPrompt = `
Analyze the following user message: "${message}"
Determine if this message contains a calculation request, equation to solve, integral, derivative, simplification, or any math question requiring precise computation.

Respond STRICTLY in JSON format with this structure:
{
  "needsCalculation": true or false,
  "wolframQuery": "the translated mathematical formula in English for Wolfram Alpha (e.g., 'integrate x^2 from 0 to 5' or 'solve 3x + 5 = 12') or null if needsCalculation is false"
}
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: routerPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Math Router Error:", error);
    return { needsCalculation: false, wolframQuery: null };
  }
}

function getHistory(sessionId) {
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, []);
  }
  return conversationHistory.get(sessionId);
}

function trimHistory(history) {
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

function clearHistory(sessionId) {
  conversationHistory.delete(sessionId);
  return { success: true, message: "History reset successfully." };
}

/**
 * Socratic Chat (Gemini 3.7 Flash + Wolfram Alpha)
 */
async function askTutor(sessionId, message, customApiKey = null) {
  const history = getHistory(sessionId);
  const genAI = getGeminiClient(customApiKey);
  
  const route = await routeAndTranslate(message, customApiKey);
  let wolframResult = null;

  if (route.needsCalculation && route.wolframQuery) {
    console.log(`[Math Router] Sending query to Wolfram: "${route.wolframQuery}"`);
    wolframResult = await queryWolframAlpha(route.wolframQuery);
    if (wolframResult) {
      console.log(`[Math Router] Wolfram Alpha result: "${wolframResult}"`);
    }
  }

  // Use the ultra-performant gemini-3.7-flash generally available in 2026
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.7-flash",
    systemInstruction: SYSTEM_PROMPT
  });
  
  const geminiHistory = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  const chat = model.startChat({
    history: geminiHistory
  });

  let finalUserMessage = message;
  if (wolframResult) {
    finalUserMessage = `[System Note: The exact mathematical calculation computed by Wolfram Alpha for this problem is: "${wolframResult}". Treat this as absolute authority, but guide me using the Socratic method without giving this final answer away directly.]\n\n${message}`;
  }

  const result = await chat.sendMessage(finalUserMessage);
  const responseText = result.response.text();

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
 * Direct Solver (Groq + GPT-OSS 120b flagship reasoning model)
 * Replaces the deprecated deepseek-r1-distill-llama-70b
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

    // Replaced the decommissioned model with Groq's active 120B flagship reasoning model
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
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

    let thinkingProcess = "";
    // Handle thinking blocks if present in the response
    if (responseText.includes("<think>")) {
      const parts = responseText.split("</think>");
      thinkingProcess = parts[0].replace("<think>", "").trim();
      responseText = parts[1].trim();
    }

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: responseText });
    trimHistory(history);

    // Format output beautifully if there is thinking process
    let finalResponse = responseText;
    if (thinkingProcess) {
      finalResponse = `_<details><summary>Thinking Process (GPT-OSS)</summary>${thinkingProcess.replace(/\n/g, '<br>')}</details>_\n\n${responseText}`;
    }

    return {
      response: finalResponse,
      thinking: thinkingProcess || null
    };
  } catch (error) {
    console.error("Direct Solver Error:", error);
    throw error;
  }
}

/**
 * Exercise Module - Generate Problem (Gemini 3.7 Flash)
 */
async function generateExercise(subject, difficulty, customApiKey = null) {
  try {
    const genAI = getGeminiClient(customApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.7-flash" });

    const prompt = `
Generate a unique math exercise about: "${subject}" with difficulty level: "${difficulty}".
The text should be in the same language as the topic name or in English if ambiguous.

Respond STRICTLY in JSON format with this structure:
{
  "problem": "Clear text description of the exercise, using LaTeX inside $$ or $ for formulas",
  "correctAnswer": "The exact final answer expected (e.g., '5', '2x + 3', '1/2')",
  "hints": ["Hint 1 to help the student", "Hint 2 (more specific)"]
}
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Exercise Generation Error:", error);
    throw error;
  }
}

/**
 * Exercise Module - Evaluate Answer (Gemini 3.7 Flash)
 */
async function checkExercise(problem, userAnswer, correctAnswer, customApiKey = null) {
  try {
    const genAI = getGeminiClient(customApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.7-flash" });

    const prompt = `
Evaluate a student's answer to a math exercise.
Exercise: "${problem}"
Expected answer: "${correctAnswer}"
Student answer: "${userAnswer}"

Determine if the answer is correct (or mathematically equivalent, e.g., if they input '0.5' instead of '1/2').
Provide a warm, supportive, and pedagogical feedback of 2-3 sentences.
Match the response language to the student's input language.

Respond STRICTLY in JSON format with this structure:
{
  "isCorrect": true or false,
  "explanation": "Your pedagogical feedback explaining why they are correct or where they went wrong."
}
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Evaluation Error:", error);
    return { isCorrect: false, explanation: "Could not evaluate your answer at this moment." };
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