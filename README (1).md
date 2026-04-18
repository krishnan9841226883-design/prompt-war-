# 🏟️ ArenaFlow AI — GameClock-Aware Venue Intelligence

> *Your AI-powered game day companion that predicts crowd surges before they happen.*

## 🎯 Chosen Vertical
**Large-Scale Sporting Venues** — Improving the physical event experience for attendees at major stadiums and arenas.

---

## 💡 The Unique Idea: GameClock Intelligence

Most crowd management tools react to congestion *after* it forms. **ArenaFlow AI** predicts it *before* it happens by combining live game-state data with crowd behaviour models.

**Key Insight:** Crowd movement in sporting venues is not random — it is tightly correlated with game events:
- Quarter/half breaks → restroom/concession surges (+40–70% traffic)
- Goal/score → celebratory concession surge (+15–25% in 90 seconds)
- Last 2 minutes of a close quarter → early bathroom break surge
- Final buzzer/whistle → mass exit wave prediction

By syncing with the game clock, ArenaFlow AI pre-routes attendees **before** queues form, not after.

---

## 🗂️ Architecture & Approach

```
┌─────────────────────────────────────────────────────┐
│                  ArenaFlow AI                        │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ GameClock   │  │ Crowd Engine │  │ Gemini AI  │ │
│  │ Tracker     │→ │ (Predictor)  │→ │ Concierge  │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│         │                │                 │         │
│         └────────────────┼─────────────────┘         │
│                          ↓                           │
│              ┌───────────────────────┐               │
│              │  Google Maps Heatmap  │               │
│              │  (Live Crowd Visual)  │               │
│              └───────────────────────┘               │
└───────���─────────────────────────────────────────────┘
```

### Core Modules

| Module | Responsibility |
|--------|---------------|
| `crowd-engine.js` | Predicts crowd density per zone using game state + historical patterns |
| `gemini-service.js` | Gemini 2.0 Flash AI concierge — natural language Q&A about venue |
| `venue-map.js` | Google Maps heatmap overlay + routing |
| `app.js` | Orchestration, game clock sync, UI state management |

---

## 🚀 How It Works

1. **Game State Input** — User (or admin) sets the current game clock, score, and sport type
2. **Surge Prediction** — The Crowd Engine calculates density forecasts per venue zone for the next 5/10/15 minutes
3. **Smart Routing** — Google Maps overlay shows predicted heatmap, not just current — users see where crowds *will* be
4. **AI Concierge** — Powered by Gemini: *"I have 8 minutes before the 4th quarter — can I get food and be back in time?"*
5. **Group Sync** — Share a "squad code" so your group can coordinate meeting points with AI-optimised timing
6. **Accessibility Mode** — All routes computed with elevator/ramp alternatives, wide corridor priority

---

## 🔧 Google Services Used

| Service | Usage |
|---------|-------|
| **Google Maps JavaScript API** | Interactive venue map, crowd heatmap layer, indoor routing |
| **Google Maps Visualization Library** | Real-time + predictive crowd density heatmap |
| **Google Gemini API (gemini-2.0-flash)** | Natural language AI concierge |
| **Google Fonts** | UI typography (Inter) |
| **Google Material Icons** | Accessible UI iconography |

---

## ⚙️ Setup

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/arenaflow-ai.git
cd arenaflow-ai
```

### 2. Configure API Keys
```bash
cp .env.example .env
# Edit .env and add your keys
```

### 3. Add Your Keys to `config.js`
```javascript
// js/config.js  (do NOT commit real keys — use environment injection)
const CONFIG = {
  MAPS_API_KEY: 'YOUR_GOOGLE_MAPS_API_KEY',
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',
};
```

### 4. Serve Locally
```bash
# Any static server works
npx serve .
# or
python -m http.server 8080
```

### 5. Open in Browser
```
http://localhost:8080
```

---

## 📐 Assumptions

- Venue layout is represented as a grid of zones (configurable per stadium)
- Game state is manually updated by the user (production version would pull from a live sports API)
- Crowd density simulation uses researched behavioural models for sports venues
- API keys are injected via `js/config.js` (excluded from version control via `.gitignore`)
- The app is designed mobile-first (attendees use their phones at events)

---

## ♿ Accessibility

- Full keyboard navigation
- ARIA roles and live regions for dynamic content
- High-contrast mode toggle
- Reduced-motion support via `prefers-reduced-motion`
- Screen-reader-friendly map descriptions
- Touch targets minimum 44×44px

---

## 🧪 Testing

Open `tests/index.html` in a browser or run with any test runner that supports ES modules.

---

## 📄 License
MIT