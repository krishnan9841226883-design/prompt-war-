/**
 * ArenaFlow AI — Gemini AI Service
 *
 * Wraps the Google Gemini REST API with:
 * - Venue-specific system context
 * - GameClock-aware prompt enrichment
 * - Graceful fallback when no API key is set
 *
 * @module gemini-service
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 15_000;

// ─── System Prompt Builder ────────────────────────────────────────────────────

/**
 * Builds the system prompt with full venue + game context injected.
 * This grounds Gemini in the live venue situation.
 *
 * @param {object} context - current app state snapshot
 * @returns {string}
 */
function buildSystemPrompt(context) {
  const {
    venueName = 'MetroSphere Arena',
    sport = 'basketball',
    period = '2',
    clock = '08:42',
    scoreDiff = 6,
    surgeMultiplier = 1.0,
    surgeReason = 'Normal crowd flow',
    queueTimes = [],
    zoneDensities = [],
    accessibilityMode = false,
  } = context;

  const queueSummary = queueTimes
    .map((q) => `  - ${q.name}: ${q.waitMinutes} min wait`)
    .join('\n');

  const densitySummary = zoneDensities
    .map((z) => `  - ${z.label}: ${Math.round(z.value * 100)}% density (${z.level.label})`)
    .join('\n');

  return `You are ArenaFlow AI, an intelligent real-time venue concierge for ${venueName}.

## Current Game State
- Sport: ${sport}
- Period: ${period}
- Clock: ${clock} remaining
- Score differential: ${scoreDiff > 0 ? `Home +${scoreDiff}` : scoreDiff < 0 ? `Away +${Math.abs(scoreDiff)}` : 'Tied'}
- Crowd surge status: ${surgeReason} (${Math.round((surgeMultiplier - 1) * 100)}% above baseline)

## Live Queue Wait Times
${queueSummary || '  No queue data available'}

## Zone Crowd Densities
${densitySummary || '  No density data available'}

## User Preferences
- Accessibility mode: ${accessibilityMode ? 'ON — prioritise wheelchair-accessible routes with elevators' : 'OFF'}

## Your Role
- Answer questions about the venue, queues, routes, timing, and food/drink
- Be concise and actionable — attendees are at a live event
- Always consider the game clock when giving timing advice
- If accessibility mode is on, always suggest accessible routes
- Keep responses to 2–4 sentences unless a list is clearly better
- Use emojis sparingly for readability
- Never make up specific seat numbers or venue details you're uncertain about
- Always prioritise safety (e.g. point to first aid if relevant)`;
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

/** Simple in-memory rate limiter: max 10 requests per minute */
const rateLimit = {
  timestamps: [],
  maxPerMinute: 10,

  check() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
    if (this.timestamps.length >= this.maxPerMinute) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  },
};

// ─── Fallback Responses ───────────────────────────────────────────────────────

/**
 * Smart offline fallback responses using the current context.
 * Used when no API key is configured or the request fails.
 *
 * @param {string} userMessage
 * @param {object} context
 * @returns {string}
 */
function generateFallbackResponse(userMessage, context) {
  const msg = userMessage.toLowerCase();
  const { queueTimes = [], zoneDensities = [], surgeReason = '' } = context;

  if (msg.includes('food') || msg.includes('eat') || msg.includes('concession')) {
    const quickest = queueTimes
      .filter((q) => q.name.includes('Concession'))
      .sort((a, b) => a.waitMinutes - b.waitMinutes)[0];
    if (quickest) {
      return `🍔 Your best bet right now is **${quickest.name}** with only a ~${quickest.waitMinutes} min wait. ${surgeReason}. Head there now for the shortest queue!`;
    }
    return '🍔 Concessions North currently has the shortest lines based on crowd flow. Head there now for the quickest service!';
  }

  if (msg.includes('bathroom') || msg.includes('restroom') || msg.includes('toilet')) {
    const restroom = queueTimes.find((q) => q.name.includes('Restroom'));
    const wait = restroom?.waitMinutes ?? 2;
    return `🚻 Restrooms A (Upper) have a ~${wait} min wait right now. ${wait <= 3 ? "Good time to go!" : "It's a bit busy — try Section B restrooms for a shorter queue."}`;
  }

  if (msg.includes('exit') || msg.includes('leave') || msg.includes('out')) {
    return '🚪 For the fastest exit, use the East or West gates which have lower predicted crowd density. If the game is close to ending, consider leaving 2 minutes early to beat the post-game rush.';
  }

  if (msg.includes('time') || msg.includes('minute') || msg.includes('quick')) {
    return `⏱️ Current crowd status: ${surgeReason}. For any 5–8 minute errand, ${context.surgeMultiplier < 1.6 ? "now is a good window — queues are manageable." : "wait 4–5 minutes for the current surge to ease."}`;
  }

  if (msg.includes('accessible') || msg.includes('wheelchair') || msg.includes('elevator')) {
    return '♿ All accessible routes via the East Elevator are currently clear. The accessible restroom near Section G is closest to most seating areas. Estimated 3 min round trip.';
  }

  if (msg.includes('crowd') || msg.includes('busy') || msg.includes('queue')) {
    const busiest = zoneDensities.sort((a, b) => b.value - a.value)[0];
    return `📊 ${busiest?.label ?? 'North Concourse'} is currently the busiest area. ${surgeReason}. Use the opposite concourse for a faster experience.`;
  }

  return `🏟️ I'm here to help with venue navigation, queue times, and timing advice! Try asking: "Which concession stand is quickest right now?" or "Is now a good time for a bathroom break?"`;
}

// ─── Main Service ─────────────────────────────────────────────────────────────

/**
 * Sends a message to Gemini and returns the AI response.
 *
 * @param {string} userMessage - the user's question
 * @param {object} context     - current app state for context injection
 * @param {string[]} [history] - previous conversation turns
 * @returns {Promise<{text: string, fromFallback: boolean}>}
 */
export async function chat(userMessage, context = {}, history = []) {
  // Validate input
  const sanitizedMessage = String(userMessage).trim().slice(0, 500);
  if (!sanitizedMessage) {
    return { text: 'Please type a question!', fromFallback: true };
  }

  // Check for API key
  const apiKey = (typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY) || '';
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    // Demo mode: return intelligent fallback
    return {
      text: generateFallbackResponse(sanitizedMessage, context),
      fromFallback: true,
    };
  }

  // Rate limit check
  if (!rateLimit.check()) {
    return {
      text: '⚠️ I\'m receiving too many requests. Please wait a moment and try again.',
      fromFallback: true,
    };
  }

  const systemPrompt = buildSystemPrompt(context);
  const model = (typeof CONFIG !== 'undefined' && CONFIG.GEMINI_MODEL) || 'gemini-2.0-flash';
  const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Build conversation history for multi-turn context
  const contents = [
    ...history.slice(-6).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    {
      role: 'user',
      parts: [{ text: sanitizedMessage }],
    },
  ];

  const requestBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.9,
      maxOutputTokens: 256,
      stopSequences: [],
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errMsg = errorBody?.error?.message || `HTTP ${response.status}`;
      console.error('[GeminiService] API error:', errMsg);
      return {
        text: `⚠️ AI service error: ${errMsg}. Using local recommendations instead.\n\n${generateFallbackResponse(