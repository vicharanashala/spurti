import { getMorningTranscript } from './transcriptProvider.js';

// High-quality fallback questions matching the hardcoded transcript
const FALLBACK_QUESTIONS = [
  {
    question: "In the Matrixs Mystic Activity, what happens if a mentor does not respond to your endorsement request within 2 hours?",
    options: [
      "The request is automatically approved to prevent learning bottlenecks.",
      "The request expires, and you lose 5% of your SPA as a penalty.",
      "The request remains pending indefinitely until the next session.",
      "The request is transferred to another mentor automatically."
    ],
    correctAnswerIndex: 1,
    explanation: "According to the activity rules, if the mentor does not respond within 2 hours, the request expires and the requesting student (learner) loses 5% of their SPA."
  },
  {
    question: "Which of the following is a forbidden endorsement pattern in Matrixs Mystic?",
    options: [
      "Approaching a new mentor immediately after being rejected by a different one.",
      "Endorsing a peer for a question that you already hold.",
      "Two peers endorsing each other for the exact same question (mutual endorsement).",
      "A mentor endorsing 10 different learners for a single question."
    ],
    correctAnswerIndex: 2,
    explanation: "Mutual endorsements are strictly not allowed. If you endorse someone for a question, they cannot endorse you back for the same question."
  },
  {
    question: "When adding vector A (2,3) and vector B (4,1) in GeoGebra, what geometric rule explains the resultant vector (6,4)?",
    options: [
      "The rotation rule, rotating vector A by the angle of vector B.",
      "The scaling rule, multiplying the lengths of both vectors.",
      "The parallelogram rule, where the resultant is the diagonal from the origin.",
      "The reflection rule, flipping vector A across the axis of vector B."
    ],
    correctAnswerIndex: 2,
    explanation: "Vector addition geometrically follows the parallelogram rule, where the resultant vector represents the diagonal of the parallelogram formed by the two vectors starting at the origin."
  },
  {
    question: "If a matrix is applied to a vector in GeoGebra and the vector rotates around the origin while keeping its length constant, what type of matrix was applied?",
    options: [
      "A scaling matrix.",
      "A rotation matrix.",
      "A reflection matrix.",
      "A projection matrix."
    ],
    correctAnswerIndex: 1,
    explanation: "A rotation matrix transforms a vector by rotating it while preserving its distance (magnitude/length) from the origin."
  },
  {
    question: "What is the penalty if an endorsement fails an audit in Matrixs Mystic?",
    options: [
      "Only the learner loses 10% SPA.",
      "Only the mentor loses 20% SPA.",
      "Both the mentor and the learner lose 20% SPA.",
      "Both parties are suspended from the activity for 2 hours."
    ],
    correctAnswerIndex: 2,
    explanation: "The rules state: 'if an endorsement fails an audit later, both the mentor and learner lose 20% SPA. So endorse responsibly.'"
  }
];

/**
 * Generates exactly 5 conceptual MCQs from the given transcript.
 * Calls Google Gemini API if a key is provided in process.env, otherwise falls back to pre-defined questions.
 * 
 * Future Integration Note:
 * This generator is decoupled from the transcript source.
 * You can modify the API URL, model name, or prompt here to switch LLMs (e.g. Claude, OpenAI, etc.).
 * Ensure the prompt specifies returning JSON matching this exact structure.
 */
export async function generateQuiz(transcript) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    console.log('ℹ️ No GEMINI_API_KEY found in env. Using high-quality static fallback questions.');
    return FALLBACK_QUESTIONS;
  }

  console.log('🤖 Generating quiz questions dynamically via Gemini API...');
  
  try {
    const prompt = `You are an expert educator. Given the transcript of a morning class session, generate exactly 5 multiple choice questions (MCQs). Focus on conceptual understanding, logic, and reasoning based on the material discussed. Avoid simple factual memorization or direct lookup.
    
Each question must have:
1. A conceptual question.
2. Exactly four options.
3. A correct answer index (0, 1, 2, or 3).
4. A clear explanation of why that option is correct.

Return the result in a JSON array matching this schema:
[
  {
    "question": "question text",
    "options": ["option 0", "option 1", "option 2", "option 3"],
    "correctAnswerIndex": 0,
    "explanation": "explanation text"
  }
]

Do not return any markdown code block formatting (like \`\`\`json). Return ONLY the raw JSON string.

Here is the transcript:
${transcript}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error('Empty response from Gemini API');
    }

    // Clean markdown formatting if present
    const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const questions = JSON.parse(cleanJson);

    if (!Array.isArray(questions) || questions.length !== 5) {
      throw new Error(`Generated questions is not an array of size 5 (size: ${questions?.length})`);
    }

    // Basic structure validation
    for (const q of questions) {
      if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correctAnswerIndex !== 'number' || !q.explanation) {
        throw new Error('Generated question does not match schema requirements');
      }
    }

    return questions;
  } catch (err) {
    console.error('❌ Failed to generate quiz dynamically. Falling back to static questions. Error:', err.message);
    return FALLBACK_QUESTIONS;
  }
}
