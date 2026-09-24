# Morning Calisthenics

**Live: https://scottyfncodes.github.io/calisthenics-program/** — open it on your phone and use *Add to Home Screen* to install it with its icon.

A self-contained, single-file 12-week bodyweight calisthenics program. No build step, no runtime dependencies.

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
- Installable: app icon + web manifest (Add to Home Screen); PNGs are rendered from `icons/icon.svg` via `node scripts/render-icons.js`
- Progress (current day, completed days, logged sets) saved locally in the browser via `localStorage`

## Running it

GitHub Pages serves `main` from the repo root, so every merge to `main` is deployed automatically. Locally, just open `index.html` directly, or serve the folder with any static file server:

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
