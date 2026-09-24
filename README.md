# Morning Calisthenics

A self-contained, single-file 12-week bodyweight calisthenics program. No build step, no runtime dependencies — open `index.html` in a browser or host it as a static site (e.g. GitHub Pages).

## Features

- 84-day program across 4 progressive phases (Foundation → Building → Strength → Performance)
- Daily push / legs / core / pull / full-body circuits, plus mobility and recovery days
- Animated stick-figure demos and form cues for every exercise
- Per-move set logging: tap a move's circle to log it; circuit moves fill one pip per round
- The current move is always in focus — the circuit advances round-robin (every move once per round)
- A now-bar pinned to the bottom of the screen shows what you're doing, how long is left, and what's next:
  work timer → automatic set log → rest countdown → "Go" cue for the next move
- Completing every set (or tapping **Mark Done**) completes the day and points you to the next one
- Undo for any logged set; audio cues, and the screen stays awake while a timer runs (where supported)
- Respects `prefers-reduced-motion`: every state change stays visible, without the movement
- Progress (current day, completed days, logged sets) saved locally in the browser via `localStorage`

## Running it

Just open `index.html` directly, or serve the folder with any static file server:

```
npx serve .
```

## Tests

The tooling is for development only; the app itself still ships as one HTML file.

```
npm install
npm run check   # inline scripts parse + every exercise reference resolves
npm test        # Playwright: full workout flows on a mobile and a desktop viewport
```
