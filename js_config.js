/**
 * ArenaFlow AI — Configuration
 *
 * ⚠️  SECURITY: Never commit real API keys to version control.
 *     In production, inject these via environment variables or a backend proxy.
 *     This file is included in .gitignore as a reminder.
 *
 * To get your keys:
 *   - Google Maps: https://console.cloud.google.com/ → Maps JavaScript API
 *   - Gemini:      https://aistudio.google.com/app/apikey
 */

// eslint-disable-next-line no-unused-vars
const CONFIG = Object.freeze({
  /** Google Maps JavaScript API key */
  MAPS_API_KEY: 'YOUR_GOOGLE_MAPS_API_KEY',

  /** Google Gemini API key */
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',

  /** Gemini model to use */
  GEMINI_MODEL: 'gemini-2.0-flash',

  /** Whether to use the real Maps API (true) or the built-in SVG map (false) */
  USE_REAL_MAPS: false,

  /** Simulated venue name — replace with actual venue */
  VENUE_NAME: 'MetroSphere Arena',

  /** Venue capacity */
  VENUE_CAPACITY: 20000,

  /** Auto-refresh interval for crowd predictions (ms) */
  REFRESH_INTERVAL_MS: 30_000,

  /** Demo mode — uses simulated data instead of live APIs */
  DEMO_MODE: true,
});