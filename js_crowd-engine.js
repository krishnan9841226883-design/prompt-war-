/**
 * ArenaFlow AI — Crowd Prediction Engine
 *
 * Core innovation: GameClock Intelligence
 * Predicts crowd movement surges by combining:
 *   1. Current game state (period, clock, score differential)
 *   2. Sport-specific behavioural patterns
 *   3. Venue zone layout
 *   4. Historical event data models
 *
 * @module crowd-engine
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Density levels mapped to numeric thresholds (0–1 scale) */
export const DENSITY_LEVEL = Object.freeze({
  LOW:   { label: 'Low',    class: 'density-low',   min: 0,    max: 0.35 },
  MED:   { label: 'Medium', class: 'density-med',   min: 0.35, max: 0.65 },
  HIGH:  { label: 'High',   class: 'density-high',  min: 0.65, max: 0.85 },
  SURGE: { label: 'Surge',  class: 'density-surge', min: 0.85, max: 1.0  },
});

/** Venue zones with base traffic weights */
const ZONES = Object.freeze({
  north:           { label: 'North Stand',       base: 0.4, concourse: false },
  south:           { label: 'South Stand',       base: 0.4, concourse: false },
  east:            { label: 'East Stand',        base: 0.3, concourse: false },
  west:            { label: 'West Stand',        base: 0.35, concourse: false },
  concourse_north: { label: 'North Concourse',   base: 0.5, concourse: true },
  concourse_south: { label: 'South Concourse',   base: 0.5, concourse: true },
});

/**
 * Sport-specific surge patterns.
 * Each entry describes WHEN surges happen relative to game events.
 * Values are multipliers applied to base density.
 */
const SPORT_PATTERNS = Object.freeze({
  basketball: {
    endOfQuarter:     2.2,   // ~2 min before end of quarter
    halftime:         2.8,   // at half
    lastMinute:       1.4,   // last 60 seconds of any period
    scoring:          1.25,  // within 90s of a score
    overtime:         1.6,   // OT surge
    periodsPerGame:   4,
  },
  football: {
    endOfQuarter:     2.0,
    halftime:         3.0,   // massive halftime surge
    lastMinute:       1.3,
    scoring:          1.4,   // big celebration spikes
    overtime:         1.8,
    periodsPerGame:   4,
  },
  soccer: {
    endOfQuarter:     1.5,   // end of halves only
    halftime:         2.6,
    lastMinute:       1.2,
    scoring:          1.5,
    overtime:         1.9,
    periodsPerGame:   2,
  },
  hockey: {
    endOfQuarter:     2.0,
    halftime:         2.5,
    lastMinute:       1.3,
    scoring:          1.3,
    overtime:         2.0,
    periodsPerGame:   3,
  },
  baseball: {
    endOfQuarter:     1.8,   // between innings
    halftime:         1.6,
    lastMinute:       1.2,
    scoring:          1.1,
    overtime:         1.4,
    periodsPerGame:   9,
  },
});

// ─── Helper Utilities ─────────────────────────────────────────────────────────

/**
 * Parses a "mm:ss" clock string into total seconds remaining.
 * @param {string} clockStr - e.g. "08:42"
 * @returns {number} seconds remaining
 */
export function parseClockToSeconds(clockStr) {
  const parts = String(clockStr).split(':');
  if (parts.length !== 2) return 0;
  const mins = parseInt(parts[0], 10) || 0;
  const secs = parseInt(parts[1], 10) || 0;
  return Math.max(0, mins * 60 + secs);
}

/**
 * Formats seconds into "m:ss" display string.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatSeconds(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Returns the density level object for a given value.
 * @param {number} value - 0–1
 * @returns {object} DENSITY_LEVEL entry
 */
export function getDensityLevel(value) {
  if (value >= DENSITY_LEVEL.SURGE.min) return DENSITY_LEVEL.SURGE;
  if (value >= DENSITY_LEVEL.HIGH.min)  return DENSITY_LEVEL.HIGH;
  if (value >= DENSITY_LEVEL.MED.min)   return DENSITY_LEVEL.MED;
  return DENSITY_LEVEL.LOW;
}

/**
 * Clamps a number to [0, 1].
 * @param {number} val
 * @returns {number}
 */
const clamp01 = (val) => Math.min(1, Math.max(0, val));

/**
 * Adds controlled noise to simulate real-world variability.
 * @param {number} value - base value
 * @param {number} magnitude - noise amplitude (0–1)
 * @returns {number}
 */
const addNoise = (value, magnitude = 0.05) =>
  clamp01(value + (Math.random() * 2 - 1) * magnitude);

// ─── Core Engine ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} GameState
 * @property {'basketball'|'football'|'soccer'|'hockey'|'baseball'} sport
 * @property {number} period - current period/quarter (1-indexed)
 * @property {string} clock  - time remaining in period "mm:ss"
 * @property {number} scoreDiff - home score minus away score
 * @property {boolean} isOT - whether in overtime
 */

/**
 * @typedef {Object} ZoneDensity
 * @property {string} zone - zone key
 * @property {string} label - display label
 * @property {number} value - 0–1 density value
 * @property {number} predicted10 - predicted density in 10 minutes
 * @property {object} level - DENSITY_LEVEL entry
 * @property {object} predictedLevel - predicted DENSITY_LEVEL entry
 */

/**
 * Calculates a surge multiplier for the current game state.
 *
 * The multiplier is highest when:
 * - The clock is within 2 minutes of a period end
 * - It is halftime
 * - A score differential surge is active
 *
 * @param {GameState} gameState
 * @returns {{ multiplier: number, reason: string }}
 */
export function calculateSurgeMultiplier(gameState) {
  const pattern = SPORT_PATTERNS[gameState.sport] || SPORT_PATTERNS.basketball;
  const secsLeft = parseClockToSeconds(gameState.clock);
  const isLastPeriod = gameState.period >= pattern.periodsPerGame;

  let multiplier = 1.0;
  let reason = 'Normal crowd flow';

  // Overtime surge
  if (gameState.isOT || gameState.period > pattern.periodsPerGame) {
    multiplier = Math.max(multiplier, pattern.overtime);
    reason = '⚡ Overtime — elevated crowd activity throughout venue';
    return { multiplier, reason };
  }

  // Halftime (period 2 end, or period periodsPerGame/2 end)
  const halfPeriod = Math.ceil(pattern.periodsPerGame / 2);
  if (gameState.period === halfPeriod && secsLeft < 90) {
    multiplier = Math.max(multiplier, pattern.halftime);
    reason = '🕐 Half-time imminent — major surge to concessions & restrooms expected';
    return { multiplier, reason };
  }

  // End-of-period surge (within 2 minutes)
  if (secsLeft <= 120 && secsLeft > 0) {
    multiplier = Math.max(multiplier, pattern.endOfQuarter);
    reason = `⏰ Last ${Math.ceil(secsLeft / 60)} min of period — pre-emptive concession/restroom rush`;
  }

  // Last minute intensity
  if (secsLeft <= 60 && secsLeft > 0) {
    multiplier = Math.max(multiplier, pattern.lastMinute);
    if (Math.abs(gameState.scoreDiff) <= 5) {
      reason = '🔥 Close game & final minute — fans staying seated, corridors clearing';
      multiplier = 0.8; // fans stay put in close game finish
    }
  }

  // Post-score surge (simulated as score diff change detected)
  if (Math.abs(gameState.scoreDiff) % 3 === 0 && Math.abs(gameState.scoreDiff) > 0) {
    const scoreSurge = pattern.scoring;
    if (scoreSurge > multiplier) {
      multiplier = scoreSurge;
      reason = '🎉 Recent scoring event — short celebratory movement spike';
    }
  }

  // Last period + big lead = fans leaving early
  if (isLastPeriod && secsLeft < 180 && Math.abs(gameState.scoreDiff) > 15) {
    multiplier = Math.max(multiplier, 2.5);
    reason = '🚶 Blowout + end of game — early leavers creating exit surge';
  }

  return { multiplier, reason };
}

/**
 * Computes crowd density for every venue zone given the current game state.
 *
 * @param {GameState} gameState
 * @returns {ZoneDensity[]}
 */
export function computeZoneDensities(gameState) {
  const { multiplier } = calculateSurgeMultiplier(gameState);
  const secsLeft = parseClockToSeconds(gameState.clock);
  const pattern = SPORT_PATTERNS[gameState.sport] || SPORT_PATTERNS.basketball;

  return Object.entries(ZONES).map(([zoneKey, zoneConfig]) => {
    // Concourses get the full multiplier; stands get a partial inverse
    // (when everyone rushes the concourse, stands partially empty)
    let densityMultiplier = zoneConfig.concourse
      ? multiplier
      : 1 + (1 - multiplier) * 0.3;

    // Period transition: concourses spike hard
    if (secsLeft < 60 && zoneConfig.concourse) {
      densityMultiplier = Math.max(densityMultiplier, pattern.halftime * 0.9);
    }

    const currentValue = addNoise(
      clamp01(zoneConfig.base * densityMultiplier),
      0.04
    );

    // Predicted: assume surge will resolve ~10min later
    const predictedMultiplierDecay = zoneConfig.concourse ? 0.55 : 1.1;
    const predicted10Value = addNoise(
      clamp01(zoneConfig.base * predictedMultiplierDecay),
      0.03
    );

    return {
      zone:           zoneKey,
      label:          zoneConfig.label,
      value:          currentValue,
      predicted10:    predicted10Value,
      level:          getDensityLevel(currentValue),
      predictedLevel: getDensityLevel(predicted10Value),
    };
  });
}

/**
 * Generates the surge timeline: predicted crowd events for the next 30 minutes.
 *
 * @param {GameState} gameState
 * @returns {Array<{timeLabel:string, desc:string, level:string, minutesFromNow:number}>}
 */
export function generateSurgeTimeline(gameState) {
  const events = [];
  const pattern = SPORT_PATTERNS[gameState.sport] || SPORT_PATTERNS.basketball;
  const secsLeft = parseClockToSeconds(gameState.clock);

  // End-of-current-period surge
  if (secsLeft > 90) {
    const minsToEndOfPeriod = Math.ceil(secsLeft / 60);
    events.push({
      minutesFromNow: minsToEndOfPeriod,
      timeLabel: `~${minsToEndOfPeriod} min`,
      desc: `End of Q${gameState.period} — concourse surge expected (+${Math.round((pattern.endOfQuarter - 1) * 100)}% traffic)`,
      level: 'high',
    });
  } else {
    events.push({
      minutesFromNow: 0,
      timeLabel: 'Now',
      desc: 'Period ending — surge active. Head to your seat now or wait 5 min.',
      level: 'surge',
    });
  }

  // Halftime (if applicable)
  const halfPeriod = Math.ceil(pattern.periodsPerGame / 2);
  if (gameState.period <= halfPeriod) {
    const periodsToHalf = halfPeriod - gameState.period;
    const approxMins = periodsToHalf * 12 + Math.ceil(secsLeft / 60);
    if (approxMins < 35) {
      events.push({
        minutesFromNow: approxMins,
        timeLabel: `~${approxMins} min`,
        desc: `Half-time break — biggest surge of the game (+${Math.round((pattern.halftime - 1) * 100)}% traffic). Plan early.`,
        level: 'surge',
      });
    }
  }

  // Low-traffic recovery window (after each surge, ~5 min later)
  events.push({
    minutesFromNow: (events[0]?.minutesFromNow ?? 0) + 6,
    timeLabel: `+${(events[0]?.minutesFromNow ?? 0) + 6} min`,
    desc: '✅ Recovery window — queues return to normal. Good time for food/restrooms.',
    level: 'low',
  });

  // End of game
  const periodsLeft = pattern.periodsPerGame - gameState.period;
  const approxGameEnd = periodsLeft * 14 + Math.ceil(secsLeft / 60);
  if (approxGameEnd < 50) {
    events.push({
      minutesFromNow: approxGameEnd,
      timeLabel: `~${approxGameEnd} min`,
      desc: `Final whistle — mass exit. If possible, leave 2 min early via East/West exits.`,
      level: 'high',
    });
  }

  return events.sort((a, b) => a.minutesFromNow - b.minutesFromNow);
}

/**
 * Generates queue wait time estimates for venue facilities.
 *
 * @param {GameState} gameState
 * @returns {Array<{id:string, name:string, icon:string, location:string, waitMinutes:number}>}
 */
export function computeQueueTimes(gameState) {
  const { multiplier } = calculateSurgeMultiplier(gameState);

  const facilities = [
    { id: 'concessions_n',  name: 'Concessions North', icon: '🍔', location: 'North Concourse', baseWait: 4 },
    { id: 'concessions_ne', name: 'Concessions NE',    icon: '🍺', location: 'North Concourse', baseWait: 3 },
    { id: 'concessions_s',  name: 'Concessions South', icon: '🌮', location: 'South Concourse', baseWait: 5 },
    { id: 'restroom_upper', name: 'Restrooms Upper',   icon: '🚻', location: 'Section A',       baseWait: 2 },
    { id: 'restroom_lower', name: 'Restrooms Lower',   icon: '🚻', location: 'Section B',       baseWait: 2 },
    { id: 'merch',          name: 'Merchandise',       icon: '👕', location: 'Main Concourse',  baseWait: 6 },
    { id: 'first_aid',      name: 'First Aid',         icon: '🏥', location: 'East Entrance',   baseWait: 0 },
  ];

  return facilities.map((f) => {
    const raw = Math.round(f.baseWait * multiplier + (Math.random() * 2 - 1));
    const waitMinutes = Math.max(0, raw);
    return {
      ...f,
      waitMinutes,
      level: waitMinutes <= 3 ? 'low' : waitMinutes <= 8 ? 'med' : 'high',
    };
  });
}

/**
 * Generates AI-style smart recommendations based on game state + densities.
 *
 * @param {GameState} gameState
 * @param {ZoneDensity[]} densities
 * @returns {Array<{icon:string, text:string}>}
 */
export function generateRecommendations(gameState, densities) {
  const recs = [];
  const { multiplier, reason } = calculateSurgeMultiplier(gameState);
  const secsLeft = parseClockToSeconds(gameState.clock);

  // Primary surge recommendation
  recs.push({ icon: '📡', text: reason });

  // Find least crowded concourse
  const concourses = densities.filter((d) => d.zone.startsWith('concourse'));
  const quietest = concourses.reduce((a, b) => (a.value < b.value ? a : b), concourses[0]);
  if (quietest) {
    recs.push({
      icon: '🍔',
      text: `${quietest.label} is currently the least congested — best for food/drink runs right now`,
    });
  }

  // Timing advice
  if (secsLeft > 120 && multiplier < 1.5) {
    recs.push({
      icon: '✅',
      text: `Good window: ${Math.floor(secsLeft / 60)} minutes left in period — low queues, safe to head out`,
    });
  } else if (multiplier >= 2.0) {
    recs.push({
      icon: '⚠️',
      text: 'High congestion period — consider waiting 5–8 minutes for queues to clear',
    });
  }

  // Accessibility tip
  recs.push({
    icon: '♿',
    text: 'Accessibility routes via East elevator are currently clear — estimated 2 min to any concourse',
  });

  // Exit strategy
  const { period } = gameState;
  const pattern = SPORT_PATTERNS[gameState.sport] || SPORT_PATTERNS.basketball;
  if (period === pattern.periodsPerGame && secsLeft < 300) {
    recs.push({
      icon: '🚪',
      text: 'Final period: consider exiting via West Gate 2 min early to avoid post-game crush (~15 min saving)',
    });
  }

  return recs;
}

/**
 * Generates meeting point suggestions for squads.
 *
 * @param {GameState} gameState
 * @param {ZoneDensity[]} densities
 * @returns {Array<{name:string, detail:string, score:number}>}
 */
export function suggestMeetingPoints(gameState, densities) {
  const { multiplier } = calculateSurgeMultiplier(gameState);

  const candidates = [
    {
      name: 'Fountain Plaza (Main Entrance)',
      detail: 'Spacious, well-lit, accessible — best in low/medium crowd',
      baseScore: multiplier < 1.8 ? 95 : 60,
    },
    {
      name: 'East Concourse Pillar 12',
      detail: 'Permanent landmark, easy to describe to others',
      baseScore: multiplier < 2.0 ? 85 : 55,
    },
    {
      name: 'Merch Store North Entrance',
      detail: 'Distinctive location, covered — good in all conditions',
      baseScore: 78,
    },
    {
      name: 'Section G Entry Gate',
      detail: 'Near accessible restrooms and first aid',
      baseScore: 72,
    },
  ];

  return candidates
    .map((c) => ({
      ...c,
      score: Math.min(100, c.baseScore + Math.round(Math.random() * 5)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}